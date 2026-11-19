/**
 * Workspace memory Q&A: retrieve -> (optionally) answer with citations.
 */
import {
  buildMemoryAnswerPrompt,
  buildMemoryCorpus,
  hitsToSources,
  isActive,
  isOverdue,
  memoryAnswerJsonSchema,
  memoryAnswerSchema,
  MemoryIndex,
  type Commitment,
  type Decision,
  type InferenceSourceLabel,
  type Meeting,
  type MemoryDoc,
  type MemoryHit,
  type Question,
} from '@meetos/shared';
import { getTranscript } from '@/data/meetings';
import { runStructured } from './hybrid';

const DAY = 86_400_000;
const transcriptCache = new Map<string, string>();

export async function loadTranscripts(wid: string, meetings: Meeting[], max = 40): Promise<Record<string, string>> {
  const targets = meetings.filter((m) => !m.archived && m.transcriptChars > 0).slice(0, max);
  const out: Record<string, string> = {};
  await Promise.all(
    targets.map(async (m) => {
      const key = `${wid}:${m.id}:${m.updatedAt}`;
      let t = transcriptCache.get(key);
      if (t === undefined) {
        t = await getTranscript(wid, m.id).catch(() => '');
        transcriptCache.set(key, t);
      }
      if (t) out[m.id] = t;
    }),
  );
  return out;
}

export interface MemoryData {
  meetings: Meeting[];
  commitments: Commitment[];
  decisions: Decision[];
  questions: Question[];
}

/**
 * Structured questions ("what's outstanding", "what changed", "last week")
 * aren't answered well by keyword retrieval alone, so we pin the records
 * that directly answer them.
 */
function pinnedDocs(q: string, data: MemoryData, all: MemoryDoc[]): MemoryDoc[] {
  const lower = q.toLowerCase();
  const byId = new Map(all.map((d) => [d.id, d]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((d): d is MemoryDoc => !!d);
  const now = Date.now();
  const pins: MemoryDoc[] = [];
  if (/outstanding|still open|open commitments|not done|pending|unfinished|overdue/.test(lower)) {
    pins.push(...pick(data.commitments.filter(isActive).sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity)).slice(0, 12).map((c) => `commitment:${c.id}`)));
  }
  if (/follow ?up|followup|should we/.test(lower)) {
    pins.push(...pick(data.commitments.filter((c) => isOverdue(c) || c.status === 'blocked' || c.pendingCompletion).slice(0, 8).map((c) => `commitment:${c.id}`)));
    pins.push(...pick(data.questions.filter((x) => x.status === 'open').slice(0, 6).map((x) => `question:${x.id}`)));
  }
  if (/chang|supersed|revers|revis/.test(lower)) {
    pins.push(...pick(data.decisions.filter((d) => d.status === 'superseded' || d.supersedes || d.status === 'reversed').map((d) => `decision:${d.id}`)));
    pins.push(...pick(data.commitments.filter((c) => c.deadlineChangeCount > 0).slice(0, 6).map((c) => `commitment:${c.id}`)));
  }
  if (/last week|this week|recent|lately/.test(lower)) {
    const from = now - (lower.includes('last week') ? 14 : 7) * DAY;
    const recent = data.meetings.filter((m) => (m.startedAt ?? m.createdAt) >= from);
    pins.push(...pick(recent.map((m) => `meeting:${m.id}`)));
    pins.push(...pick(data.commitments.filter((c) => c.createdAt >= from).slice(0, 10).map((c) => `commitment:${c.id}`)));
    pins.push(...pick(data.decisions.filter((d) => d.decidedAt >= from).slice(0, 8).map((d) => `decision:${d.id}`)));
  }
  return pins;
}

export interface MemoryAnswer {
  question: string;
  found: boolean;
  answer: string;
  sources: ReturnType<typeof hitsToSources>;
  cited: Set<string>;
  source: InferenceSourceLabel | null;
  detail: string;
  /** true when we answered "not found" without calling the model */
  noRetrieval: boolean;
}

export async function askMemory(wid: string, question: string, data: MemoryData): Promise<MemoryAnswer> {
  const transcripts = await loadTranscripts(wid, data.meetings);
  const corpus = buildMemoryCorpus({ ...data, transcripts });
  const index = new MemoryIndex(corpus);
  const hits = index.search(question, 10);
  const pins = pinnedDocs(question, data, corpus);
  const merged: MemoryHit[] = [];
  const seen = new Set<string>();
  for (const h of [...pins.map((doc) => ({ doc, score: Infinity })), ...hits]) {
    if (seen.has(h.doc.id)) continue;
    seen.add(h.doc.id);
    merged.push(h);
  }
  const top = merged.slice(0, 14);
  const sources = hitsToSources(top);

  if (sources.length === 0) {
    return {
      question,
      found: false,
      answer: "I couldn't find anything about this in your workspace's meetings, decisions or commitments.",
      sources: [],
      cited: new Set(),
      source: null,
      detail: 'No relevant records were retrieved, so no AI model was called.',
      noRetrieval: true,
    };
  }

  const r = await runStructured({
    name: 'memory-answer',
    kind: 'reason',
    jsonSchema: memoryAnswerJsonSchema,
    schema: memoryAnswerSchema,
    prompt: buildMemoryAnswerPrompt(question, sources, new Date().toDateString()),
  });

  const valid = new Set(sources.map((s) => s.id));
  const inline = [...r.data.answer.matchAll(/\[(S\d+)\]/g)].map((m) => m[1] as string);
  const cited = new Set([...r.data.citations, ...inline].filter((c) => valid.has(c)));
  // An answer that claims to have found something but cites nothing verifiable is not shown as found.
  const found = r.data.found && cited.size > 0;
  return {
    question,
    found,
    answer: r.data.answer || (found ? '' : 'The retrieved records do not answer this question.'),
    sources,
    cited,
    source: r.source,
    detail: r.detail,
    noRetrieval: false,
  };
}
