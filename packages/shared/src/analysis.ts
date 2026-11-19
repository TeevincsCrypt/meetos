/**
 * Deterministic post-processing for AI extraction results.
 *
 *   raw model JSON -> validate (zod) -> ground evidence -> resolve owners and
 *   deadlines -> resolve commitment refs -> merge chunks -> de-duplicate
 *
 * Nothing here calls a model, so it is fully unit-tested and shared by the web
 * app (and mirrored by the Android app).
 */
import { groundQuote, resolveDeadline, resolveOwner, type GroundedQuote } from './grounding';
import { chunkExtractionSchema, parseModelJson, type ChunkExtraction } from './schemas';
import { containment, normalize, similarity, taskSimilarity, uniqueBy } from './text';
import { matchExistingCommitment } from './linking';
import type { Commitment, InferenceSourceLabel, Priority, Topic } from './types';

export interface ExtractedDecision {
  title: string;
  description: string;
  evidence: GroundedQuote;
  certainty: 'explicit' | 'tentative';
  madeBy: string[];
  alternatives: string[];
  source: InferenceSourceLabel;
}

export interface ExtractedCommitment {
  description: string;
  ownerName: string | null;
  deadline: number | null;
  deadlineText: string | null;
  priority: Priority;
  evidence: GroundedQuote;
  source: InferenceSourceLabel;
}

export interface ExtractedQuestion {
  text: string;
  askedBy: string | null;
  evidence: GroundedQuote;
  source: InferenceSourceLabel;
}

export interface ExtractedRisk {
  description: string;
  kind: 'risk' | 'blocker';
  evidence: GroundedQuote;
}

export type UpdateKind = 'progress' | 'blocker' | 'completion_claim' | 'deadline_change' | 'mention';

export interface ExtractedUpdate {
  commitmentId: string;
  kind: UpdateKind;
  evidence: GroundedQuote;
  newDeadline: number | null;
  newDeadlineText: string | null;
  source: InferenceSourceLabel;
}

export interface ProcessedChunk {
  summary: string;
  topics: Topic[];
  decisions: ExtractedDecision[];
  commitments: ExtractedCommitment[];
  questions: ExtractedQuestion[];
  risks: ExtractedRisk[];
  followUps: string[];
  updates: ExtractedUpdate[];
  discarded: number;
  source: InferenceSourceLabel;
}

export interface ChunkContext {
  chunkText: string;
  knownNames: string[];
  meetingDate: number;
  refMap: Map<string, string>;
  source: InferenceSourceLabel;
}

/** Validate raw model text into a ChunkExtraction (throws if not JSON at all). */
export function validateChunkOutput(text: string): ChunkExtraction {
  const json = parseModelJson(text);
  const parsed = chunkExtractionSchema.safeParse(json);
  if (!parsed.success) throw new Error('Model response did not match the extraction schema.');
  return parsed.data;
}

export function processChunk(raw: ChunkExtraction, ctx: ChunkContext): ProcessedChunk {
  let discarded = 0;
  const ground = (q: string) => {
    const g = groundQuote(q, ctx.chunkText);
    if (!g) discarded++;
    return g;
  };

  const topics: Topic[] = [];
  for (const t of raw.topics) {
    if (!t.name) continue;
    const g = groundQuote(t.evidence, ctx.chunkText);
    // Topics are low-stakes labels; keep them if the label itself is grounded in the text.
    if (g || containment(t.name, ctx.chunkText) >= 0.5) topics.push({ name: t.name, evidence: g?.quote ?? '' });
  }

  const decisions: ExtractedDecision[] = [];
  for (const d of raw.decisions) {
    if (!d.title) continue;
    const g = ground(d.evidence);
    if (!g) continue;
    decisions.push({
      title: d.title,
      description: d.description || d.title,
      evidence: g,
      certainty: d.certainty,
      madeBy: d.madeBy
        .map((n) => resolveOwner(n, { knownNames: ctx.knownNames, source: ctx.chunkText, evidenceSpeaker: g.speaker }))
        .filter((n): n is string => !!n),
      alternatives: d.alternatives,
      source: ctx.source,
    });
  }

  const commitments: ExtractedCommitment[] = [];
  for (const c of raw.commitments) {
    if (!c.description) continue;
    const g = ground(c.evidence);
    if (!g) continue;
    const ownerName = resolveOwner(c.owner, {
      knownNames: ctx.knownNames,
      source: ctx.chunkText,
      evidenceSpeaker: g.speaker,
    });
    const dl = resolveDeadline(c.deadline, { reference: ctx.meetingDate, source: ctx.chunkText });
    commitments.push({
      description: c.description,
      ownerName,
      deadline: dl.at,
      deadlineText: dl.text,
      priority: c.priority,
      evidence: g,
      source: ctx.source,
    });
  }

  const questions: ExtractedQuestion[] = [];
  for (const q of raw.questions) {
    if (!q.text) continue;
    const g = ground(q.evidence);
    if (!g) continue;
    questions.push({
      text: q.text,
      askedBy:
        resolveOwner(q.askedBy, { knownNames: ctx.knownNames, source: ctx.chunkText, evidenceSpeaker: g.speaker }) ??
        g.speaker,
      evidence: g,
      source: ctx.source,
    });
  }

  const risks: ExtractedRisk[] = [];
  for (const r of raw.risks) {
    if (!r.description) continue;
    const g = ground(r.evidence);
    if (!g) continue;
    risks.push({ description: r.description, kind: r.kind, evidence: g });
  }

  const updates: ExtractedUpdate[] = [];
  for (const u of raw.updates) {
    const commitmentId = ctx.refMap.get(u.ref.trim().toUpperCase());
    if (!commitmentId) {
      discarded++;
      continue;
    }
    const g = ground(u.evidence);
    if (!g) continue;
    const dl =
      u.kind === 'deadline_change'
        ? resolveDeadline(u.newDeadline, { reference: ctx.meetingDate, source: ctx.chunkText })
        : { at: null, text: null };
    updates.push({
      commitmentId,
      kind: u.kind === 'deadline_change' && !dl.at ? 'mention' : u.kind,
      evidence: g,
      newDeadline: dl.at,
      newDeadlineText: dl.text,
      source: ctx.source,
    });
  }

  return {
    summary: raw.summary,
    topics,
    decisions,
    commitments,
    questions,
    risks,
    followUps: raw.followUps,
    updates,
    discarded,
    source: ctx.source,
  };
}

export interface MergedAnalysis {
  partSummaries: string[];
  topics: Topic[];
  decisions: ExtractedDecision[];
  commitments: ExtractedCommitment[];
  /** New commitments that restate an existing open commitment become updates instead. */
  updates: ExtractedUpdate[];
  questions: ExtractedQuestion[];
  risks: ExtractedRisk[];
  followUps: string[];
  discarded: number;
}

function dedupe<T>(items: T[], text: (t: T) => string, threshold: number, prefer: (a: T, b: T) => T): T[] {
  const out: T[] = [];
  for (const item of items) {
    const i = out.findIndex((o) => similarity(text(o), text(item)) >= threshold);
    if (i === -1) out.push(item);
    else out[i] = prefer(out[i] as T, item);
  }
  return out;
}

const UPDATE_RANK: Record<UpdateKind, number> = {
  completion_claim: 5,
  deadline_change: 4,
  blocker: 3,
  progress: 2,
  mention: 1,
};

export function mergeChunks(
  chunks: ProcessedChunk[],
  existingOpen: Pick<Commitment, 'id' | 'description' | 'ownerName' | 'deadlineText' | 'status' | 'originMeetingId'>[] = [],
): MergedAnalysis {
  const all = <K extends keyof ProcessedChunk>(k: K) => chunks.flatMap((c) => c[k] as unknown as unknown[]);

  const topics = dedupe(all('topics') as Topic[], (t) => t.name, 0.6, (a) => a);
  const decisions = dedupe(
    all('decisions') as ExtractedDecision[],
    (d) => `${d.title} ${d.description}`,
    0.55,
    (a, b) => (a.certainty === 'explicit' || b.certainty !== 'explicit' ? a : b),
  );

  const rawCommitments = all('commitments') as ExtractedCommitment[];
  const commitments: ExtractedCommitment[] = [];
  for (const c of rawCommitments) {
    const i = commitments.findIndex((o) => {
      const sameOwner = !o.ownerName || !c.ownerName || normalize(o.ownerName) === normalize(c.ownerName);
      const sameEvidence = normalize(o.evidence.quote) === normalize(c.evidence.quote);
      return sameOwner && (sameEvidence || taskSimilarity(o.description, c.description) >= 0.6);
    });
    if (i === -1) {
      commitments.push(c);
    } else {
      const o = commitments[i] as ExtractedCommitment;
      commitments[i] = {
        ...o,
        ownerName: o.ownerName ?? c.ownerName,
        deadline: o.deadline ?? c.deadline,
        deadlineText: o.deadlineText ?? c.deadlineText,
        priority: o.priority === 'high' || c.priority === 'high' ? 'high' : o.priority,
      };
    }
  }

  const updates = [...(all('updates') as ExtractedUpdate[])];
  const fresh: ExtractedCommitment[] = [];
  for (const c of commitments) {
    const match = matchExistingCommitment(c, existingOpen);
    if (match) {
      updates.push({
        commitmentId: match,
        kind: c.deadline ? 'deadline_change' : 'mention',
        evidence: c.evidence,
        newDeadline: c.deadline,
        newDeadlineText: c.deadlineText,
        source: c.source,
      });
    } else {
      fresh.push(c);
    }
  }
  // Keep the strongest update per (commitment, kind), and drop deadline changes to the same date.
  const byKey = new Map<string, ExtractedUpdate>();
  for (const u of updates) {
    const key = `${u.commitmentId}:${u.kind}`;
    const prev = byKey.get(key);
    if (!prev || UPDATE_RANK[u.kind] > UPDATE_RANK[prev.kind]) byKey.set(key, u);
  }

  return {
    partSummaries: chunks.map((c) => c.summary).filter(Boolean),
    topics: topics.slice(0, 12),
    decisions,
    commitments: fresh,
    updates: [...byKey.values()],
    questions: dedupe(all('questions') as ExtractedQuestion[], (q) => q.text, 0.6, (a) => a),
    risks: dedupe(all('risks') as ExtractedRisk[], (r) => r.description, 0.6, (a) => a),
    followUps: uniqueBy(all('followUps') as string[], (f) => normalize(f)).slice(0, 10),
    discarded: chunks.reduce((n, c) => n + c.discarded, 0),
  };
}
