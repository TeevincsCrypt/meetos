/** Small, dependency-free text utilities used for grounding, linking and search. */

const STOPWORDS = new Set(
  (
    'a an the and or but if then so to of in on at by for with from as is are was were be been being ' +
    'it its this that these those i me my we our us you your he she they them their his her ' +
    'will would shall should can could may might must do does did done have has had not no yes ' +
    'just about into over under up down out off than too very also there here what which who whom ' +
    'when where why how all any each few more most other some such only own same s t ll re ve d m ' +
    'okay ok yeah um uh like going gonna get got let lets'
  ).split(/\s+/),
);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stem(word: string): string {
  if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith('es')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Content tokens: normalised, stopwords removed, lightly stemmed. */
export function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokens(text));
}

export function jaccard(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Fraction of `needle` tokens that appear in `haystack`. */
export function containment(needle: string, haystack: string): number {
  const N = tokenSet(needle);
  if (N.size === 0) return 0;
  const H = tokenSet(haystack);
  let hit = 0;
  for (const t of N) if (H.has(t)) hit++;
  return hit / N.size;
}

/** Combined similarity used for de-duplication of short statements. */
export function similarity(a: string, b: string): number {
  return Math.max(jaccard(a, b), 0.85 * Math.min(containment(a, b), containment(b, a)));
}

/**
 * Similarity for short task descriptions: a shorter description fully
 * contained in a longer one ("Finish the landing page" vs "Finish landing page
 * incl. signup form") counts as the same task. Callers must also require the
 * same owner.
 */
export function taskSimilarity(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (Math.min(A.size, B.size) < 2) return jaccard(a, b);
  return Math.max(jaccard(a, b), 0.8 * Math.max(containment(a, b), containment(b, a)));
}

export function personKey(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = normalize(name);
  return n.length ? n : null;
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}

export function uniqueBy<T>(items: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, case-insensitive check. */
export function containsWord(haystack: string, word: string): boolean {
  if (!word.trim()) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(word.trim())}($|[^\\p{L}\\p{N}])`, 'iu').test(haystack);
}
