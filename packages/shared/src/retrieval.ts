/**
 * Workspace memory retrieval (BM25). Answers in the Memory page are generated
 * only from documents retrieved here; if nothing relevant is retrieved, we
 * say so without calling a model at all.
 */
import { tokens, truncate } from './text';
import { chunkTranscript } from './transcript';
import type { Commitment, Decision, Meeting, Question } from './types';

export type MemoryDocKind = 'meeting' | 'transcript' | 'decision' | 'commitment' | 'question';

export interface MemoryDoc {
  id: string;
  kind: MemoryDocKind;
  meetingId: string | null;
  meetingTitle: string | null;
  date: number | null;
  /** id of the decision / commitment / question this doc represents */
  entityId: string | null;
  title: string;
  text: string;
}

export interface MemoryCorpusInput {
  meetings: Meeting[];
  transcripts: Record<string, string>;
  decisions: Decision[];
  commitments: Commitment[];
  questions: Question[];
}

const fmt = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : 'no date');

export function buildMemoryCorpus(input: MemoryCorpusInput): MemoryDoc[] {
  const docs: MemoryDoc[] = [];
  const meetingById = new Map(input.meetings.map((m) => [m.id, m]));
  const meetingDate = (m: Meeting) => m.startedAt ?? m.scheduledAt ?? m.createdAt;

  for (const m of input.meetings) {
    const parts = [m.title, m.description, m.summary, m.topics.map((t) => t.name).join(', '), m.discussionPoints.join('. ')];
    docs.push({
      id: `meeting:${m.id}`,
      kind: 'meeting',
      meetingId: m.id,
      meetingTitle: m.title,
      date: meetingDate(m),
      entityId: m.id,
      title: m.title,
      text: parts.filter(Boolean).join('\n'),
    });
    const transcript = input.transcripts[m.id];
    if (transcript) {
      for (const chunk of chunkTranscript(transcript, { maxChars: 700, overlapLines: 0 })) {
        docs.push({
          id: `transcript:${m.id}:${chunk.index}`,
          kind: 'transcript',
          meetingId: m.id,
          meetingTitle: m.title,
          date: meetingDate(m),
          entityId: null,
          title: `${m.title} — transcript`,
          text: chunk.text,
        });
      }
    }
  }
  for (const d of input.decisions) {
    docs.push({
      id: `decision:${d.id}`,
      kind: 'decision',
      meetingId: d.meetingId,
      meetingTitle: d.meetingTitle,
      date: d.decidedAt,
      entityId: d.id,
      title: d.title,
      text: [
        `Decision (${d.status.replace('_', ' ')}): ${d.title}. ${d.description}`,
        d.participants.length ? `Agreed by: ${d.participants.join(', ')}.` : '',
        d.alternatives.length ? `Alternatives considered: ${d.alternatives.join('; ')}.` : '',
        d.supersededBy ? 'This decision was later superseded.' : '',
        d.evidence[0] ? `Quote: "${d.evidence[0].quote}"` : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }
  for (const c of input.commitments) {
    docs.push({
      id: `commitment:${c.id}`,
      kind: 'commitment',
      meetingId: c.originMeetingId,
      meetingTitle: c.originMeetingTitle,
      date: c.createdAt,
      entityId: c.id,
      title: c.description,
      text: [
        `Commitment (${c.status.replace('_', ' ')}): ${c.description}.`,
        `Owner: ${c.ownerName ?? 'unassigned'}.`,
        `Deadline: ${c.deadline ? fmt(c.deadline) : 'none'}${c.deadlineChangeCount ? ` (changed ${c.deadlineChangeCount}x)` : ''}.`,
        c.relatedMeetingIds.length
          ? `Discussed again in: ${c.relatedMeetingIds.map((id) => meetingById.get(id)?.title ?? 'another meeting').join(', ')}.`
          : '',
        c.evidence[0] ? `Quote: "${c.evidence[0].quote}"` : '',
      ]
        .filter(Boolean)
        .join(' '),
    });
  }
  for (const q of input.questions) {
    docs.push({
      id: `question:${q.id}`,
      kind: 'question',
      meetingId: q.meetingId,
      meetingTitle: q.meetingTitle,
      date: q.createdAt,
      entityId: q.id,
      title: q.text,
      text: `Open question (${q.status}): ${q.text}${q.askedBy ? ` — asked by ${q.askedBy}` : ''}${
        q.answer ? `. Answer: ${q.answer}` : ''
      }`,
    });
  }
  return docs;
}

export interface MemoryHit {
  doc: MemoryDoc;
  score: number;
}

export class MemoryIndex {
  private readonly docTokens: string[][];
  private readonly df = new Map<string, number>();
  private readonly avgLen: number;

  constructor(public readonly docs: MemoryDoc[]) {
    this.docTokens = docs.map((d) => tokens(`${d.title} ${d.text}`));
    for (const toks of this.docTokens) {
      for (const t of new Set(toks)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgLen = this.docTokens.reduce((n, t) => n + t.length, 0) / Math.max(1, this.docTokens.length);
  }

  search(query: string, k = 8, opts: { kinds?: MemoryDocKind[] } = {}): MemoryHit[] {
    const q = [...new Set(tokens(query))];
    if (q.length === 0) return [];
    const N = this.docs.length;
    const k1 = 1.4;
    const b = 0.7;
    const hits: MemoryHit[] = [];
    this.docTokens.forEach((toks, i) => {
      const doc = this.docs[i] as MemoryDoc;
      if (opts.kinds && !opts.kinds.includes(doc.kind)) return;
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0;
      let matched = 0;
      for (const term of q) {
        const f = tf.get(term) ?? 0;
        if (!f) continue;
        matched++;
        const n = this.df.get(term) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks.length) / this.avgLen)));
      }
      if (matched === 0) return;
      // Structured records are more reliable than raw transcript text.
      if (doc.kind === 'decision' || doc.kind === 'commitment') score *= 1.25;
      hits.push({ doc, score: score * (0.5 + (0.5 * matched) / q.length) });
    });
    return hits.sort((a, b2) => b2.score - a.score).slice(0, k);
  }
}

/** Format hits as numbered sources for the answer prompt. */
export function hitsToSources(hits: MemoryHit[]) {
  return hits.map((h, i) => ({
    id: `S${i + 1}`,
    hit: h,
    label: `${h.doc.kind}, meeting "${h.doc.meetingTitle ?? 'unknown'}", ${fmt(h.doc.date)}`,
    text: truncate(h.doc.text.replace(/\s+/g, ' '), 600),
  }));
}
