/**
 * Commitment Graph linking.
 *
 * Before a transcript chunk is analysed we retrieve the few earlier open
 * commitments that the chunk plausibly talks about (lexical retrieval, no AI),
 * and give them to the model with short refs (C1, C2…). The model can then
 * report updates against those refs; refs it invents are discarded because
 * they won't resolve.
 */
import type { CandidateRef } from './prompts';
import type { Commitment } from './types';
import { containment, containsWord, personKey, taskSimilarity } from './text';

export interface CandidateSelection {
  candidates: CandidateRef[];
  /** ref -> commitment id */
  refMap: Map<string, string>;
}

type LinkableCommitment = Pick<
  Commitment,
  'id' | 'description' | 'ownerName' | 'deadlineText' | 'status' | 'originMeetingId'
>;

export function scoreCandidate(chunkText: string, c: LinkableCommitment): number {
  let score = containment(c.description, chunkText);
  if (c.ownerName) {
    const first = c.ownerName.split(/\s+/)[0] ?? '';
    if (containsWord(chunkText, c.ownerName) || (first && containsWord(chunkText, first))) score += 0.15;
  }
  return score;
}

export function selectCandidates(
  chunkText: string,
  openCommitments: LinkableCommitment[],
  opts: { k?: number; minScore?: number; excludeMeetingId?: string } = {},
): CandidateSelection {
  const k = opts.k ?? 6;
  const min = opts.minScore ?? 0.34;
  const scored = openCommitments
    .filter((c) => c.originMeetingId !== opts.excludeMeetingId)
    .filter((c) => c.status === 'open' || c.status === 'in_progress' || c.status === 'blocked')
    .map((c) => ({ c, score: scoreCandidate(chunkText, c) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  const refMap = new Map<string, string>();
  const candidates: CandidateRef[] = scored.map(({ c }, i) => {
    const ref = `C${i + 1}`;
    refMap.set(ref, c.id);
    return { ref, description: c.description, ownerName: c.ownerName, deadlineText: c.deadlineText };
  });
  return { candidates, refMap };
}

/**
 * If a "new" commitment is really a restatement of an existing open one by
 * the same person, return the existing commitment id so we link instead of
 * duplicating.
 */
export function matchExistingCommitment(
  next: { description: string; ownerName: string | null },
  existing: LinkableCommitment[],
  threshold = 0.6,
): string | null {
  const nextOwner = personKey(next.ownerName);
  let best: { id: string; score: number } | null = null;
  for (const c of existing) {
    if (c.status === 'completed' || c.status === 'cancelled') continue;
    const owner = personKey(c.ownerName);
    if (nextOwner && owner && nextOwner !== owner && nextOwner.split(' ')[0] !== owner.split(' ')[0]) continue;
    const score = taskSimilarity(next.description, c.description);
    if (score >= threshold && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best?.id ?? null;
}
