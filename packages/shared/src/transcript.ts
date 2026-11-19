/**
 * Transcript parsing, import and chunking.
 *
 * Chunking is deliberately conservative: Chrome's built-in model (used by
 * Firebase AI Logic's on-device path on web) and Gemini Nano on Android have
 * small context windows, so we keep each chunk well under the limit after the
 * instruction prompt and JSON schema are added.
 */

export const MAX_TRANSCRIPT_CHARS = 400_000;
/** ~700 tokens of transcript per chunk; the prompt + schema add ~900 more. */
export const DEFAULT_CHUNK_CHARS = 2_800;

export interface TranscriptLine {
  index: number;
  speaker: string | null;
  text: string;
  raw: string;
}

export interface TranscriptChunk {
  index: number;
  text: string;
  startLine: number;
  endLine: number;
}

const SPEAKER_RE =
  /^\s*(?:\[?\(?\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d+)?\)?\]?\s*[-–]?\s*)?([A-Z][\p{L}.'-]*(?:\s+[A-Z][\p{L}.'-]*){0,3}|Speaker\s*\d+)\s*(?:\(\s*[^)]{0,30}\))?\s*:\s+(.+)$/u;

export function normalizeTranscript(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00A0]/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseLine(raw: string, index: number): TranscriptLine {
  const m = SPEAKER_RE.exec(raw);
  if (m && m[1] && m[2]) {
    return { index, speaker: m[1].trim(), text: m[2].trim(), raw };
  }
  return { index, speaker: null, text: raw.trim(), raw };
}

export function parseTranscript(text: string): TranscriptLine[] {
  return normalizeTranscript(text)
    .split('\n')
    .map((raw, i) => parseLine(raw, i))
    .filter((l) => l.text.length > 0);
}

/** Speaker labels as they literally appear in the transcript, in order of appearance. */
export function detectSpeakers(text: string): string[] {
  const seen = new Map<string, string>();
  for (const line of parseTranscript(text)) {
    if (!line.speaker) continue;
    const key = line.speaker.toLowerCase();
    if (!seen.has(key)) seen.set(key, line.speaker);
  }
  return [...seen.values()];
}

/**
 * Convert WebVTT / SRT subtitle files into "Speaker: text" lines.
 * Plain text is returned unchanged (normalised).
 */
export function importTranscriptFile(fileName: string, content: string): string {
  const lower = fileName.toLowerCase();
  const isVtt = lower.endsWith('.vtt') || content.trimStart().startsWith('WEBVTT');
  const isSrt = lower.endsWith('.srt');
  if (!isVtt && !isSrt) return normalizeTranscript(content);

  const out: string[] = [];
  let last = '';
  for (const rawLine of normalizeTranscript(content).split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('WEBVTT') || line.startsWith('NOTE') || line.startsWith('STYLE')) continue;
    if (/^\d+$/.test(line)) continue; // SRT cue number
    if (/-->/.test(line)) continue; // timing line
    let text = line;
    const voice = /^<v(?:\.[^\s>]+)?\s+([^>]+)>(.*)$/.exec(text);
    if (voice && voice[1] && voice[2] !== undefined) {
      text = `${voice[1].trim()}: ${voice[2]}`;
    }
    text = text.replace(/<\/?[^>]+>/g, '').trim();
    if (!text || text === last) continue;
    out.push(text);
    last = text;
  }
  return out.join('\n');
}

function splitLongText(text: string, max: number): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const parts: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      parts.push(cur.trim());
      cur = '';
    }
    if (s.length > max) {
      for (let i = 0; i < s.length; i += max) parts.push(s.slice(i, i + max).trim());
      continue;
    }
    cur += s;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/**
 * Split a transcript into bounded chunks on line boundaries, carrying
 * `overlapLines` lines of context into the next chunk so that commitments
 * spanning a turn boundary are not lost.
 */
export function chunkTranscript(
  text: string,
  opts: { maxChars?: number; overlapLines?: number } = {},
): TranscriptChunk[] {
  const maxChars = Math.max(400, opts.maxChars ?? DEFAULT_CHUNK_CHARS);
  const overlap = Math.max(0, opts.overlapLines ?? 1);
  const rawLines = normalizeTranscript(text).split('\n').filter((l) => l.trim());

  // Expand over-long single lines (e.g. unpunctuated speech-recognition output).
  const lines: string[] = [];
  for (const l of rawLines) {
    if (l.length <= maxChars) lines.push(l);
    else lines.push(...splitLongText(l, maxChars));
  }

  const chunks: TranscriptChunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = start;
    let size = 0;
    while (end < lines.length && (size + (lines[end]?.length ?? 0) + 1 <= maxChars || end === start)) {
      size += (lines[end]?.length ?? 0) + 1;
      end++;
    }
    chunks.push({
      index: chunks.length,
      text: lines.slice(start, end).join('\n'),
      startLine: start,
      endLine: end - 1,
    });
    if (end >= lines.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks;
}

/** Find which line of `source` best contains `quote` and return its speaker. */
export function speakerForQuote(source: string, quote: string): string | null {
  const q = quote.toLowerCase().slice(0, 60);
  for (const line of parseTranscript(source)) {
    if (line.raw.toLowerCase().includes(q)) return line.speaker;
  }
  return null;
}
