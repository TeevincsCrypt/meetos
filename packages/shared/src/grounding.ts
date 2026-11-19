/**
 * Grounding: every AI-extracted item must be backed by text that really
 * exists in the transcript. Model output that can't be grounded is dropped,
 * owners must be people who actually appear in the meeting, and deadlines are
 * resolved deterministically from the phrase that was actually spoken.
 */
import * as chrono from 'chrono-node';
import { containment, containsWord, normalize } from './text';
import { parseTranscript } from './transcript';

export interface GroundedQuote {
  quote: string;
  speaker: string | null;
  exact: boolean;
}

const MIN_FUZZY_CONTAINMENT = 0.75;

/**
 * Verify that `quote` appears in `source`. Returns the verified quote (for
 * fuzzy matches, the actual transcript line replaces the model's paraphrase)
 * or `null` if the quote cannot be found.
 */
export function groundQuote(quote: string | null | undefined, source: string): GroundedQuote | null {
  if (!quote) return null;
  const nq = normalize(quote);
  if (nq.length < 4) return null;
  const lines = parseTranscript(source);

  for (const line of lines) {
    if (normalize(line.raw).includes(nq) || normalize(line.text).includes(nq)) {
      return { quote: quote.trim().replace(/^["']|["']$/g, ''), speaker: line.speaker, exact: true };
    }
  }
  // Quote spanning several lines.
  if (normalize(source).includes(nq)) {
    const first = lines.find((l) => nq.startsWith(normalize(l.text).slice(0, 20)));
    return { quote: quote.trim(), speaker: first?.speaker ?? null, exact: true };
  }
  // Fuzzy: the model paraphrased slightly. Accept only if almost all content
  // words come from one transcript line, and use that line verbatim.
  let best: { score: number; text: string; speaker: string | null } | null = null;
  for (const line of lines) {
    const score = containment(quote, line.text);
    if (!best || score > best.score) best = { score, text: line.text, speaker: line.speaker };
  }
  if (best && best.score >= MIN_FUZZY_CONTAINMENT) {
    return { quote: best.text, speaker: best.speaker, exact: false };
  }
  return null;
}

const SELF_REFERENCES = new Set(['i', 'me', 'myself', 'speaker']);

/**
 * Resolve the owner of a commitment. Accepts the model's answer only if the
 * person is a known participant/speaker or is literally named in the source
 * text. "I"/"me" resolves to the speaker of the evidence line.
 */
export function resolveOwner(
  owner: string | null | undefined,
  opts: { knownNames: string[]; source: string; evidenceSpeaker: string | null },
): string | null {
  const raw = (owner ?? '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (['unknown', 'unassigned', 'none', 'n/a', 'null', 'team', 'everyone', 'we', 'us'].includes(lower)) {
    return null;
  }
  if (SELF_REFERENCES.has(lower)) return opts.evidenceSpeaker;

  const known = opts.knownNames.filter(Boolean);
  const exact = known.find((n) => n.toLowerCase() === lower);
  if (exact) return exact;
  // First-name match against a full known name ("Maya" -> "Maya Chen"), only if unique.
  const firstMatches = known.filter((n) => n.toLowerCase().split(/\s+/)[0] === lower.split(/\s+/)[0]);
  if (firstMatches.length === 1 && firstMatches[0]) return firstMatches[0];
  // Named in the transcript text itself.
  if (containsWord(opts.source, raw)) return raw;
  return null;
}

export interface ResolvedDeadline {
  at: number | null;
  text: string | null;
}

/**
 * Resolve a spoken deadline phrase ("before Friday", "by end of month") to a
 * date relative to the meeting date. The phrase must appear in the source
 * text, otherwise the deadline is discarded rather than invented.
 */
export function resolveDeadline(
  deadlineText: string | null | undefined,
  opts: { reference: number; source: string },
): ResolvedDeadline {
  const text = (deadlineText ?? '').trim();
  if (!text || ['none', 'null', 'n/a', 'unknown', 'no deadline'].includes(text.toLowerCase())) {
    return { at: null, text: null };
  }
  if (!normalize(opts.source).includes(normalize(text)) && containment(text, opts.source) < 0.99) {
    return { at: null, text: null };
  }
  const ref = new Date(opts.reference);
  let parsed: Date | null;
  try {
    parsed = chrono.parseDate(text, ref, { forwardDate: true });
  } catch {
    parsed = null;
  }
  if (!parsed) {
    const lower = text.toLowerCase();
    if (/end of (the )?week/.test(lower)) {
      parsed = new Date(ref);
      parsed.setDate(ref.getDate() + ((5 - ref.getDay() + 7) % 7));
    } else if (/end of (the )?month/.test(lower)) {
      parsed = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    } else if (/end of (the )?day|\beod\b|tonight/.test(lower)) {
      parsed = new Date(ref);
    }
  }
  if (!parsed) return { at: null, text };
  // Deadlines are due at the end of the stated day.
  const d = new Date(parsed);
  d.setHours(23, 59, 0, 0);
  return { at: d.getTime(), text };
}
