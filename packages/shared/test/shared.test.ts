import { describe, expect, it } from 'vitest';
import {
  MemoryIndex,
  SAMPLE_KICKOFF,
  SAMPLE_SYNC,
  buildMemoryCorpus,
  chunkExtractionSchema,
  chunkTranscript,
  computeDailyBrief,
  computeExecutionMetrics,
  computePrepContext,
  detectSpeakers,
  groundQuote,
  importTranscriptFile,
  isOverdue,
  matchExistingCommitment,
  mergeChunks,
  parseModelJson,
  parseTranscript,
  processChunk,
  resolveDeadline,
  resolveOwner,
  ruleBasedAgenda,
  selectCandidates,
  validateChunkOutput,
  type Commitment,
  type Meeting,
} from '../src';

const DAY = 86_400_000;
// Wednesday 2026-11-04 10:00 local
const MEETING_DATE = new Date(2026, 10, 4, 10, 0).getTime();

function commitment(over: Partial<Commitment>): Commitment {
  return {
    id: 'c1',
    workspaceId: 'w',
    description: 'Finish the landing page',
    ownerName: 'Daniel Okafor',
    ownerKey: 'daniel okafor',
    deadline: null,
    deadlineText: null,
    originalDeadline: null,
    deadlineChangeCount: 0,
    priority: 'medium',
    status: 'open',
    originMeetingId: 'm1',
    originMeetingTitle: 'Kickoff',
    relatedMeetingIds: [],
    meetingIds: ['m1'],
    evidence: [],
    projectId: null,
    createdAt: MEETING_DATE,
    updatedAt: MEETING_DATE,
    completedAt: null,
    completion: null,
    pendingCompletion: null,
    lastMentionedAt: null,
    mentionCount: 0,
    origin: 'ai',
    inferenceSource: 'on_device',
    editedByUser: false,
    createdBy: 'u',
    ...over,
  };
}

function meeting(over: Partial<Meeting>): Meeting {
  return {
    id: 'm1',
    workspaceId: 'w',
    title: 'Kickoff',
    description: '',
    projectId: null,
    participants: [],
    scheduledAt: null,
    startedAt: MEETING_DATE,
    endedAt: null,
    status: 'analyzed',
    archived: false,
    transcriptSource: 'paste',
    transcriptChars: 0,
    summary: '',
    topics: [],
    discussionPoints: [],
    risks: [],
    followUps: [],
    analysis: null,
    agenda: null,
    agendaUpdatedAt: null,
    isSample: false,
    createdAt: MEETING_DATE,
    updatedAt: MEETING_DATE,
    createdBy: 'u',
    ...over,
  };
}

describe('transcript parsing', () => {
  it('detects speakers including timestamps and full names', () => {
    const lines = parseTranscript('[00:01:02] Maya Chen: Hello\nDaniel: Hi there\njust words');
    expect(lines.map((l) => l.speaker)).toEqual(['Maya Chen', 'Daniel', null]);
    expect(detectSpeakers(SAMPLE_KICKOFF.transcript)).toEqual(['Maya Chen', 'Daniel Okafor', 'Leo Martins', 'Priya Raman']);
  });

  it('imports WebVTT with voice tags', () => {
    const vtt = `WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.000\n<v Maya Chen>Let's start.</v>\n\n00:00:04.000 --> 00:00:06.000\n<v Daniel>I'll finish it Friday.`;
    expect(importTranscriptFile('call.vtt', vtt)).toBe("Maya Chen: Let's start.\nDaniel: I'll finish it Friday.");
  });

  it('imports SRT', () => {
    const srt = `1\n00:00:01,000 --> 00:00:02,000\nHello team\n\n2\n00:00:02,000 --> 00:00:04,000\nLet's begin`;
    expect(importTranscriptFile('x.srt', srt)).toBe('Hello team\nLet\'s begin');
  });

  it('chunks within the size bound and covers every line', () => {
    const long = Array.from({ length: 200 }, (_, i) => `Speaker ${i % 3}: line number ${i} with some words in it.`).join('\n');
    const chunks = chunkTranscript(long, { maxChars: 800, overlapLines: 1 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(800);
    expect(chunks[0]?.startLine).toBe(0);
    expect(chunks.at(-1)?.endLine).toBe(199);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i]!.startLine).toBe(chunks[i - 1]!.endLine);
  });

  it('splits a single huge unpunctuated line', () => {
    const chunks = chunkTranscript('word '.repeat(2000), { maxChars: 500 });
    expect(chunks.every((c) => c.text.length <= 500)).toBe(true);
  });
});

describe('grounding', () => {
  const src = SAMPLE_KICKOFF.transcript;

  it('accepts exact quotes and reports the speaker', () => {
    const g = groundQuote("I'll finish the landing page before Friday.", src);
    expect(g?.exact).toBe(true);
    expect(g?.speaker).toBe('Daniel Okafor');
  });

  it('replaces light paraphrases with the real transcript line', () => {
    const g = groundQuote('I will send the final onboarding mockups to Daniel by Wednesday', src);
    expect(g?.exact).toBe(false);
    expect(g?.quote).toContain("I'll send the final onboarding mockups");
  });

  it('rejects quotes that are not in the transcript', () => {
    expect(groundQuote('We agreed to hire three new engineers next quarter.', src)).toBeNull();
  });

  it('resolves owners only to real people', () => {
    const known = ['Maya Chen', 'Daniel Okafor'];
    expect(resolveOwner('Daniel', { knownNames: known, source: src, evidenceSpeaker: null })).toBe('Daniel Okafor');
    expect(resolveOwner('I', { knownNames: known, source: src, evidenceSpeaker: 'Maya Chen' })).toBe('Maya Chen');
    expect(resolveOwner('Leo Martins', { knownNames: known, source: src, evidenceSpeaker: null })).toBe('Leo Martins');
    expect(resolveOwner('Jessica', { knownNames: known, source: src, evidenceSpeaker: null })).toBeNull();
    expect(resolveOwner('', { knownNames: known, source: src, evidenceSpeaker: null })).toBeNull();
    expect(resolveOwner('team', { knownNames: known, source: src, evidenceSpeaker: null })).toBeNull();
  });

  it('resolves spoken deadlines relative to the meeting date', () => {
    const fri = resolveDeadline('before Friday', { reference: MEETING_DATE, source: src });
    expect(new Date(fri.at!).getDay()).toBe(5);
    expect(fri.at! - MEETING_DATE).toBeLessThan(7 * DAY);
    const tue = resolveDeadline('by next Tuesday', { reference: MEETING_DATE, source: src });
    expect(new Date(tue.at!).getDay()).toBe(2);
    expect(tue.at!).toBeGreaterThan(MEETING_DATE);
  });

  it('discards deadlines that were never spoken', () => {
    expect(resolveDeadline('December 31', { reference: MEETING_DATE, source: src })).toEqual({ at: null, text: null });
  });
});

describe('schema validation', () => {
  it('parses fenced JSON and tolerates missing / invalid fields', () => {
    const parsed = parseModelJson('Here you go:\n```json\n{"summary":"x","commitments":[{"description":"Do it","owner":"","deadline":"","evidence":"e","priority":"urgent"}, 42]}\n```');
    const out = chunkExtractionSchema.parse(parsed);
    expect(out.commitments).toHaveLength(1);
    expect(out.commitments[0]?.priority).toBe('medium');
    expect(out.decisions).toEqual([]);
  });

  it('throws for non-JSON', () => {
    expect(() => validateChunkOutput('I cannot help with that')).toThrow();
  });
});

describe('processChunk + merge', () => {
  const known = SAMPLE_KICKOFF.participants;
  const modelOutput = {
    summary: 'The team planned the beta launch.',
    topics: [{ name: 'Beta timing', evidence: 'Are we still comfortable launching the beta two weeks from Monday?' }],
    decisions: [
      {
        title: 'Beta launches to waitlist first',
        description: 'Beta launches two weeks from Monday to the waitlist, not publicly.',
        evidence: "the beta launches two weeks from Monday, and it goes to the waitlist first, not a public launch",
        certainty: 'explicit',
        madeBy: ['Maya', 'Priya Raman', 'Daniel Okafor', 'The CEO'],
        alternatives: ['Public launch'],
      },
      { title: 'Hire a designer', description: 'invented', evidence: 'We will hire a designer', certainty: 'explicit', madeBy: [], alternatives: [] },
    ],
    commitments: [
      { description: 'Finish the landing page', owner: 'Daniel', deadline: 'before Friday', evidence: "I'll finish the landing page before Friday.", priority: 'high' },
      { description: 'Finish landing page incl. signup form', owner: 'Daniel Okafor', deadline: '', evidence: "I'll finish the landing page before Friday.", priority: 'medium' },
      { description: 'Chase payment provider for API keys', owner: 'I', deadline: 'tomorrow', evidence: "I'll chase the payment provider for the API keys tomorrow.", priority: 'medium' },
      { description: 'Write the press release', owner: 'Leo', deadline: 'June 1', evidence: 'Leo will write the press release by June 1', priority: 'low' },
    ],
    questions: [{ text: 'Do we need SOC 2 before the Northwind pilot?', askedBy: 'Maya', evidence: 'Do we need SOC 2 before the enterprise pilot with Northwind' }],
    risks: [{ description: 'No production API keys', kind: 'blocker', evidence: "we still don't have production API keys from the payment provider" }],
    followUps: ['Ask Northwind security team about SOC 2'],
    updates: [{ ref: 'C9', kind: 'mention', evidence: 'x', newDeadline: '' }],
  };

  const processed = processChunk(chunkExtractionSchema.parse(modelOutput), {
    chunkText: SAMPLE_KICKOFF.transcript,
    knownNames: known,
    meetingDate: MEETING_DATE,
    refMap: new Map(),
    source: 'on_device',
  });

  it('keeps grounded items and drops invented ones', () => {
    expect(processed.decisions).toHaveLength(1);
    expect(processed.decisions[0]?.madeBy).toEqual(['Maya Chen', 'Priya Raman', 'Daniel Okafor']);
    expect(processed.commitments.map((c) => c.description)).not.toContain('Write the press release');
    // invented decision + invented commitment + unresolvable ref
    expect(processed.discarded).toBe(3);
  });

  it('resolves "I" to the speaker of the evidence', () => {
    const chase = processed.commitments.find((c) => c.description.startsWith('Chase'));
    expect(chase?.ownerName).toBe('Maya Chen');
    expect(chase?.deadline).toBeGreaterThan(MEETING_DATE);
  });

  it('merges duplicates across chunks', () => {
    const merged = mergeChunks([processed, processed]);
    expect(merged.commitments.filter((c) => c.description.includes('landing page'))).toHaveLength(1);
    const landing = merged.commitments.find((c) => c.description.includes('landing page'));
    expect(landing?.priority).toBe('high');
    expect(landing?.deadlineText).toBe('before Friday');
    expect(merged.decisions).toHaveLength(1);
    expect(merged.questions).toHaveLength(1);
  });

  it('turns a restated existing commitment into an update instead of a duplicate', () => {
    const existing = [commitment({ id: 'existing-1', originMeetingId: 'other' })];
    const merged = mergeChunks([processed], existing);
    expect(merged.commitments.find((c) => c.description.includes('landing page'))).toBeUndefined();
    expect(merged.updates.some((u) => u.commitmentId === 'existing-1')).toBe(true);
  });
});

describe('commitment graph linking', () => {
  const open = [
    commitment({ id: 'landing', description: 'Finish the landing page', ownerName: 'Daniel Okafor' }),
    commitment({ id: 'mockups', description: 'Send final onboarding mockups to Daniel', ownerName: 'Priya Raman' }),
    commitment({ id: 'email', description: 'Draft the waitlist announcement email', ownerName: 'Leo Martins' }),
    commitment({ id: 'unrelated', description: 'Renew office lease', ownerName: 'Sam Lee' }),
  ];

  it('retrieves earlier commitments discussed in the follow-up meeting', () => {
    const { candidates, refMap } = selectCandidates(SAMPLE_SYNC.transcript, open, { excludeMeetingId: 'sync' });
    const ids = [...refMap.values()];
    expect(ids).toEqual(expect.arrayContaining(['landing', 'mockups', 'email']));
    expect(ids).not.toContain('unrelated');
    expect(candidates[0]?.ref).toBe('C1');
  });

  it('resolves model updates against refs and parses new deadlines', () => {
    const { refMap } = selectCandidates(SAMPLE_SYNC.transcript, open);
    const landingRef = [...refMap.entries()].find(([, id]) => id === 'landing')![0];
    const out = processChunk(
      chunkExtractionSchema.parse({
        updates: [
          { ref: landingRef, kind: 'deadline_change', evidence: "I'll have it finished by next Wednesday instead.", newDeadline: 'by next Wednesday' },
        ],
      }),
      { chunkText: SAMPLE_SYNC.transcript, knownNames: [], meetingDate: MEETING_DATE + 7 * DAY, refMap, source: 'in_cloud' },
    );
    expect(out.updates).toHaveLength(1);
    expect(out.updates[0]?.commitmentId).toBe('landing');
    expect(new Date(out.updates[0]!.newDeadline!).getDay()).toBe(3);
  });

  it('matches only same-owner, similar commitments', () => {
    expect(matchExistingCommitment({ description: 'finish the landing page', ownerName: 'Daniel' }, open)).toBe('landing');
    expect(matchExistingCommitment({ description: 'finish the landing page', ownerName: 'Priya Raman' }, open)).toBeNull();
  });
});

describe('memory retrieval', () => {
  it('finds the transcript passages about pricing', () => {
    const m1 = meeting({ id: 'm1', title: SAMPLE_KICKOFF.title });
    const m2 = meeting({ id: 'm2', title: SAMPLE_SYNC.title });
    const index = new MemoryIndex(
      buildMemoryCorpus({
        meetings: [m1, m2],
        transcripts: { m1: SAMPLE_KICKOFF.transcript, m2: SAMPLE_SYNC.transcript },
        decisions: [],
        commitments: [],
        questions: [],
      }),
    );
    const hits = index.search('what did we decide about beta pricing per seat', 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.doc.text.toLowerCase()).toContain('per seat');
    expect(index.search('zebra quantum', 3)).toEqual([]);
  });
});

describe('metrics', () => {
  const now = MEETING_DATE + 10 * DAY;
  const cs = [
    commitment({ id: 'a', status: 'completed', completedAt: MEETING_DATE + 2 * DAY }),
    commitment({ id: 'b', status: 'open', deadline: MEETING_DATE + DAY }),
    commitment({ id: 'c', status: 'blocked', deadlineChangeCount: 2, deadline: now + DAY }),
    commitment({ id: 'd', status: 'cancelled' }),
  ];

  it('computes honest rates and withholds averages with too little data', () => {
    const m = computeExecutionMetrics(cs, {}, now);
    expect(m.created).toBe(4);
    expect(m.completed).toBe(1);
    expect(m.overdue).toBe(1);
    expect(m.completionRate).toBeCloseTo(1 / 3);
    expect(m.avgDaysToComplete).toBeNull();
    expect(m.postponed.map((c) => c.id)).toEqual(['c']);
    expect(computeExecutionMetrics([], {}, now).completionRate).toBeNull();
  });

  it('flags overdue only for active commitments', () => {
    expect(isOverdue({ deadline: 1, status: 'open' }, 2)).toBe(true);
    expect(isOverdue({ deadline: 1, status: 'completed' }, 2)).toBe(false);
    expect(isOverdue({ deadline: null, status: 'open' }, 2)).toBe(false);
  });

  it('builds a daily brief and reports empty workspaces as empty', () => {
    expect(computeDailyBrief({ commitments: [], decisions: [], questions: [], meetings: [] }, now).isEmpty).toBe(true);
    const brief = computeDailyBrief({ commitments: cs, decisions: [], questions: [], meetings: [] }, now);
    expect(brief.overdue.map((c) => c.id)).toEqual(['b']);
    expect(brief.blocked.map((c) => c.id)).toEqual(['c']);
  });

  it('builds prep context and a rule-based agenda from real records', () => {
    const prev = meeting({ id: 'm1', participants: [{ name: 'Daniel Okafor' }], summary: 'Planned launch' });
    const target = meeting({ id: 'm9', status: 'scheduled', scheduledAt: now + DAY, startedAt: null, participants: [{ name: 'Daniel Okafor' }] });
    const ctx = computePrepContext(target, { meetings: [prev, target], commitments: cs, decisions: [], questions: [] }, now);
    expect(ctx.previousMeetings.map((m) => m.id)).toEqual(['m1']);
    expect(ctx.overdue.map((c) => c.id)).toEqual(['b']);
    const agenda = ruleBasedAgenda(ctx);
    expect(agenda.map((a) => a.title)).toContain('Overdue commitments');
    for (const item of agenda) for (const r of item.refs) expect(ctx.facts.has(r)).toBe(true);
  });
});
