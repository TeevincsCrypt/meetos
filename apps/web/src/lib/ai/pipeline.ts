/**
 * Meeting analysis pipeline.
 *
 *  1. chunk the transcript (bounded for on-device context limits)
 *  2. per chunk: retrieve earlier open commitments it may refer to
 *  3. per chunk: hybrid inference (on-device first) with a JSON schema
 *  4. validate + ground every item against the chunk text
 *  5. merge chunks, de-duplicate, link restated commitments
 *  6. (multi-chunk) merge part summaries
 *  7. persist: meeting results, new commitments/decisions/questions,
 *     and timeline events on earlier commitments (the Commitment Graph)
 */
import {
  chunkExtractionJsonSchema,
  chunkExtractionSchema,
  chunkTranscript,
  detectSpeakers,
  mergeChunks,
  meetingSummaryJsonSchema,
  meetingSummarySchema,
  processChunk,
  selectCandidates,
  buildChunkPrompt,
  buildSummaryMergePrompt,
  similarity,
  type AnalysisRun,
  type Commitment,
  type Decision,
  type Evidence,
  type InferenceSourceLabel,
  type Meeting,
  type MergedAnalysis,
  type ProcessedChunk,
  type Question,
} from '@meetos/shared';
import { arrayUnion, collection, getDocs, increment, query, serverTimestamp, where, writeBatch, type WriteBatch } from 'firebase/firestore';
import { rcNumber, rcString } from '../firebase';
import { getAiPreference, runStructured, type AiPreference } from './hybrid';
import { BatchWriter, db, ts, wsCol, wsItem } from '@/data/db';
import { addEvent, commitmentRef, stageCommitment } from '@/data/commitments';
import { stageDecision, stageQuestion } from '@/data/decisions';
import { logActivity, type Actor } from '@/data/activity';

export interface ChunkStatus {
  index: number;
  state: 'pending' | 'running' | 'done' | 'failed';
  source: InferenceSourceLabel | null;
  detail: string;
  chars: number;
}

export interface AnalysisProgress {
  stage: 'chunking' | 'analyzing' | 'summarizing' | 'saving' | 'done';
  chunks: ChunkStatus[];
  message: string;
}

export interface AnalysisOutcome {
  run: AnalysisRun;
  merged: MergedAnalysis;
  summary: string;
  discussionPoints: string[];
  summarySource: InferenceSourceLabel | null;
  created: { commitments: number; decisions: number; questions: number; linked: number };
}

export async function analyzeMeeting(args: {
  wid: string;
  actor: Actor;
  meeting: Meeting;
  transcript: string;
  commitments: Commitment[];
  decisions: Decision[];
  onProgress: (p: AnalysisProgress) => void;
  preference?: AiPreference;
}): Promise<AnalysisOutcome> {
  const { wid, actor, meeting, transcript } = args;
  const pref = args.preference ?? getAiPreference();
  const meetingDate = meeting.startedAt ?? meeting.scheduledAt ?? meeting.createdAt;
  const startedAt = Date.now();

  if (!transcript.trim()) throw new Error('This meeting has no transcript to analyse yet.');

  const chunks = chunkTranscript(transcript, { maxChars: rcNumber('ai_chunk_chars') });
  const status: ChunkStatus[] = chunks.map((c) => ({ index: c.index, state: 'pending', source: null, detail: '', chars: c.text.length }));
  const emit = (stage: AnalysisProgress['stage'], message: string) => args.onProgress({ stage, message, chunks: status.map((s) => ({ ...s })) });
  emit('chunking', `Split into ${chunks.length} part${chunks.length === 1 ? '' : 's'}`);

  await patchMeetingStatus(wid, meeting.id, 'analyzing');

  const knownNames = [...new Set([...meeting.participants.map((p) => p.name), ...detectSpeakers(transcript)])];
  const earlierOpen = args.commitments.filter(
    (c) => c.originMeetingId !== meeting.id && (c.status === 'open' || c.status === 'in_progress' || c.status === 'blocked'),
  );

  const processed: ProcessedChunk[] = [];
  let failures = 0;
  let lastError = '';
  for (const chunk of chunks) {
    const st = status[chunk.index] as ChunkStatus;
    st.state = 'running';
    emit('analyzing', `Analysing part ${chunk.index + 1} of ${chunks.length}`);
    const { candidates, refMap } = selectCandidates(chunk.text, earlierOpen, { k: 6 });
    try {
      const result = await runStructured(
        {
          name: 'chunk-extraction',
          kind: 'extract',
          jsonSchema: chunkExtractionJsonSchema,
          schema: chunkExtractionSchema,
          prompt: buildChunkPrompt(chunk.text, {
            meetingTitle: meeting.title,
            meetingDate: new Date(meetingDate).toDateString(),
            participants: knownNames,
            chunkIndex: chunk.index,
            chunkCount: chunks.length,
            candidates,
          }),
        },
        pref,
      );
      processed.push(
        processChunk(result.data, { chunkText: chunk.text, knownNames, meetingDate, refMap, source: result.source }),
      );
      st.state = 'done';
      st.source = result.source;
      st.detail = result.detail;
    } catch (e) {
      failures++;
      lastError = e instanceof Error ? e.message : String(e);
      st.state = 'failed';
      st.detail = lastError;
      // Same root cause will fail every chunk (e.g. AI disabled); stop early.
      if (failures === 1 && processed.length === 0 && chunks.length > 1 && /not enabled|turned off|App Check|not available/i.test(lastError)) {
        for (const s of status) if (s.state === 'pending') { s.state = 'failed'; s.detail = 'Skipped'; }
        break;
      }
    }
    emit('analyzing', `Analysed ${processed.length} of ${chunks.length}`);
  }

  if (processed.length === 0) {
    const run = buildRun();
    await patchMeetingAnalysis(wid, meeting.id, { analysis: run, status: 'analysis_failed' });
    await logActivity(wid, actor, 'analysis_failed', `analysis of "${meeting.title}" failed`, { meetingId: meeting.id });
    throw new Error(lastError || 'Analysis failed.');
  }

  const merged = mergeChunks(processed, earlierOpen);

  // Whole-meeting summary.
  let summary = merged.partSummaries[0] ?? '';
  let discussionPoints: string[] = [];
  let summarySource: InferenceSourceLabel | null = processed[0]?.source ?? null;
  if (merged.partSummaries.length > 1) {
    emit('summarizing', 'Combining part summaries');
    try {
      const r = await runStructured(
        {
          name: 'meeting-summary',
          kind: 'extract',
          jsonSchema: meetingSummaryJsonSchema,
          schema: meetingSummarySchema,
          prompt: buildSummaryMergePrompt(meeting.title, merged.partSummaries, merged.topics.map((t) => t.name)),
        },
        pref,
      );
      summary = r.data.summary || merged.partSummaries.join(' ');
      discussionPoints = r.data.discussionPoints;
      summarySource = r.source;
    } catch {
      summary = merged.partSummaries.join(' ');
      discussionPoints = [];
    }
  }

  emit('saving', 'Saving results to your workspace');
  const run = buildRun();
  const created = await persistAnalysis({ wid, actor, meeting, merged, run, summary, discussionPoints, decisions: args.decisions, commitments: args.commitments });
  emit('done', 'Analysis complete');
  return { run, merged, summary, discussionPoints, summarySource, created };

  function buildRun(): AnalysisRun {
    const done = status.filter((s) => s.state === 'done');
    return {
      status: processed.length === 0 ? 'failed' : failures > 0 ? 'partial' : 'succeeded',
      startedAt,
      finishedAt: Date.now(),
      chunkCount: chunks.length,
      chunksOnDevice: done.filter((s) => s.source === 'on_device').length,
      chunksInCloud: done.filter((s) => s.source === 'in_cloud').length,
      chunksCloudFallback: done.filter((s) => s.source === 'cloud_fallback').length,
      chunksFailed: failures,
      discardedUngrounded: processed.reduce((n, p) => n + p.discarded, 0),
      inferenceMode: pref,
      cloudModel: done.some((s) => s.source !== 'on_device') ? rcString('ai_cloud_model') : null,
      error: failures ? lastError : null,
    };
  }
}

async function patchMeetingStatus(wid: string, mid: string, status: Meeting['status']) {
  const b = writeBatch(db());
  b.update(wsItem(wid, 'meetings', mid), { status, updatedAt: serverTimestamp() });
  await b.commit();
}

async function patchMeetingAnalysis(wid: string, mid: string, data: Record<string, unknown>) {
  const b = writeBatch(db());
  b.update(wsItem(wid, 'meetings', mid), { ...data, updatedAt: serverTimestamp() });
  await b.commit();
}

function evidenceOf(meeting: Meeting, q: { quote: string; speaker: string | null }): Evidence {
  return { meetingId: meeting.id, meetingTitle: meeting.title, quote: q.quote.slice(0, 1000), speaker: q.speaker };
}

const UPDATE_EVENT = {
  progress: 'progress_reported',
  blocker: 'blocker_reported',
  completion_claim: 'completion_suggested',
  deadline_change: 'deadline_changed',
  mention: 'mentioned',
} as const;

async function persistAnalysis(a: {
  wid: string;
  actor: Actor;
  meeting: Meeting;
  merged: MergedAnalysis;
  run: AnalysisRun;
  summary: string;
  discussionPoints: string[];
  decisions: Decision[];
  commitments: Commitment[];
}) {
  const { wid, actor, meeting, merged } = a;
  const writer = new BatchWriter();
  const meetingDate = meeting.startedAt ?? meeting.scheduledAt ?? meeting.createdAt;

  // Re-analysis: replace unedited AI items from this meeting. Commitments that
  // later meetings already reference are kept, as is anything a user edited.
  for (const name of ['decisions', 'questions'] as const) {
    const snap = await getDocs(query(wsCol(wid, name), where('meetingId', '==', meeting.id)));
    for (const d of snap.docs) {
      const data = d.data() as { origin: string; editedByUser: boolean };
      if (data.origin === 'ai' && !data.editedByUser) writer.run((b) => b.delete(d.ref));
    }
  }
  const prior = await getDocs(query(wsCol(wid, 'commitments'), where('originMeetingId', '==', meeting.id)));
  for (const d of prior.docs) {
    const data = d.data() as { origin: string; editedByUser: boolean; relatedMeetingIds: string[] };
    if (data.origin === 'ai' && !data.editedByUser && data.relatedMeetingIds.length === 0) {
      const events = await getDocs(collection(d.ref, 'events'));
      writer.run((b) => {
        events.docs.forEach((e) => b.delete(e.ref));
        b.delete(d.ref);
      }, events.size + 1);
    }
  }
  await writer.commit();

  const w2 = new BatchWriter();
  const stage = (fn: (b: WriteBatch) => void, ops = 2) => w2.run(fn, ops);

  for (const c of merged.commitments) {
    stage((b) =>
      stageCommitment(b, wid, actor, {
        description: c.description,
        ownerName: c.ownerName,
        deadline: c.deadline,
        deadlineText: c.deadlineText,
        priority: c.priority,
        meeting,
        evidence: [evidenceOf(meeting, c.evidence)],
        origin: 'ai',
        inferenceSource: c.source,
      }),
    );
  }

  const activeDecisions = a.decisions.filter((d) => d.meetingId !== meeting.id && d.status !== 'superseded');
  for (const d of merged.decisions) {
    const related = activeDecisions
      .map((o) => ({ o, s: similarity(`${d.title} ${d.description}`, `${o.title} ${o.description}`) }))
      .filter((x) => x.s >= 0.3)
      .sort((x, y) => y.s - x.s)
      .slice(0, 3)
      .map((x) => x.o.id);
    stage(
      (b) =>
        stageDecision(b, wid, actor, {
          title: d.title,
          description: d.description,
          meeting,
          decidedAt: meetingDate,
          participants: d.madeBy,
          evidence: [evidenceOf(meeting, d.evidence)],
          alternatives: d.alternatives,
          status: d.certainty === 'explicit' ? 'active' : 'needs_confirmation',
          relatedDecisionIds: related,
          origin: 'ai',
          inferenceSource: d.source,
        }),
      1,
    );
  }

  for (const q of merged.questions) {
    stage(
      (b) =>
        stageQuestion(b, wid, actor, {
          text: q.text,
          askedBy: q.askedBy,
          meeting,
          evidence: [evidenceOf(meeting, q.evidence)],
          origin: 'ai',
          inferenceSource: q.source,
        }),
      1,
    );
  }

  // Commitment Graph edges: updates on earlier commitments.
  const byId = new Map(a.commitments.map((c) => [c.id, c]));
  let linked = 0;
  for (const u of merged.updates) {
    const c = byId.get(u.commitmentId);
    if (!c) continue;
    linked++;
    const ref = commitmentRef(wid, c.id);
    const ev = evidenceOf(meeting, u.evidence);
    const patch: Record<string, unknown> = {
      relatedMeetingIds: arrayUnion(meeting.id),
      meetingIds: arrayUnion(meeting.id),
      evidence: arrayUnion(ev),
      lastMentionedAt: ts(meetingDate),
      mentionCount: increment(1),
      updatedAt: serverTimestamp(),
    };
    let from: string | null = null;
    let to: string | null = null;
    if (u.kind === 'completion_claim') {
      // Never complete automatically: record the claim for a person to confirm.
      patch.pendingCompletion = { evidence: ev, suggestedAt: ts(meetingDate) };
    }
    if (u.kind === 'deadline_change' && u.newDeadline && u.newDeadline !== c.deadline) {
      patch.deadline = ts(u.newDeadline);
      patch.deadlineText = u.newDeadlineText;
      patch.originalDeadline = ts(c.originalDeadline ?? c.deadline);
      if (c.deadline) patch.deadlineChangeCount = increment(1);
      from = c.deadline ? new Date(c.deadline).toISOString() : null;
      to = new Date(u.newDeadline).toISOString();
    }
    stage((b) => {
      b.update(ref, patch);
      addEvent(b, ref, {
        type: UPDATE_EVENT[u.kind],
        actor: null,
        meeting,
        quote: u.evidence.quote,
        from,
        to,
        note:
          u.kind === 'completion_claim'
            ? 'The transcript says this is done. Waiting for confirmation.'
            : u.kind === 'deadline_change' && !to
              ? null
              : null,
        origin: 'ai',
        at: meetingDate,
      });
    });
  }

  stage(
    (b) =>
      b.update(wsItem(wid, 'meetings', meeting.id), {
        summary: a.summary,
        discussionPoints: a.discussionPoints,
        topics: merged.topics,
        risks: merged.risks.map((r) => ({ description: r.description, kind: r.kind, evidence: evidenceOf(meeting, r.evidence) })),
        followUps: merged.followUps,
        analysis: a.run,
        status: 'analyzed',
        updatedAt: serverTimestamp(),
      }),
    1,
  );
  await w2.commit();

  await logActivity(
    wid,
    actor,
    'analysis_completed',
    `analysed "${meeting.title}": ${merged.commitments.length} commitments, ${merged.decisions.length} decisions, ${linked} links to earlier commitments`,
    { meetingId: meeting.id },
  );
  return { commitments: merged.commitments.length, decisions: merged.decisions.length, questions: merged.questions.length, linked };
}

export type { Question };
