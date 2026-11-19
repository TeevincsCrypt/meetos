/**
 * Prompt builders. Instructions are embedded in the user prompt rather than
 * sent as a system instruction because the Firebase AI Logic web on-device
 * path forwards only `contents` to Chrome's Prompt API.
 */

export interface CandidateRef {
  ref: string;
  description: string;
  ownerName: string | null;
  deadlineText: string | null;
}

export interface ChunkPromptContext {
  meetingTitle: string;
  meetingDate: string;
  participants: string[];
  chunkIndex: number;
  chunkCount: number;
  candidates: CandidateRef[];
}

const RULES = `Rules:
- Use ONLY what is said in the excerpt. Never invent people, dates, decisions or tasks.
- "evidence" must be copied word-for-word from the excerpt (one sentence is enough).
- A commitment is a promise by a specific person to do something ("I'll...", "I will...", "X will...", "Can you... / Yes").
- "owner" is the person who promised. Use "" if unclear. Use the name as written in the excerpt.
- "deadline" is the deadline words exactly as spoken (e.g. "before Friday"). Use "" if none was stated.
- A decision is something the group agreed or settled. Use certainty "tentative" if it was not clearly agreed.
- "madeBy" lists only people the excerpt shows agreeing or approving. Leave empty if unclear.
- Questions are open questions left unanswered in the excerpt.
- Return empty arrays when nothing applies. Keep text short.`;

export function buildChunkPrompt(chunk: string, ctx: ChunkPromptContext): string {
  const earlier =
    ctx.candidates.length === 0
      ? ''
      : `\nEARLIER commitments from previous meetings (only reference them in "updates" if this excerpt clearly talks about them):\n` +
        ctx.candidates
          .map(
            (c) =>
              `${c.ref}: ${c.description}${c.ownerName ? ` (owner: ${c.ownerName})` : ''}${
                c.deadlineText ? ` (due: ${c.deadlineText})` : ''
              }`,
          )
          .join('\n') +
        `\nupdates.kind: "progress" (work reported), "blocker" (it is stuck), "completion_claim" (someone says it is done), "deadline_change" (new date agreed), "mention" (just discussed).\n`;

  return `You extract structured information from a meeting transcript excerpt.
Meeting: "${ctx.meetingTitle}" on ${ctx.meetingDate}.${
    ctx.participants.length ? ` Participants: ${ctx.participants.join(', ')}.` : ''
  }
This is part ${ctx.chunkIndex + 1} of ${ctx.chunkCount}.
${RULES}
${earlier}
TRANSCRIPT EXCERPT:
"""
${chunk}
"""
Respond with JSON only.`;
}

export function buildSummaryMergePrompt(meetingTitle: string, partSummaries: string[], topics: string[]): string {
  return `You write meeting summaries. Below are summaries of consecutive parts of the meeting "${meetingTitle}".
Combine them into one 3-5 sentence summary and up to 6 short discussion points.
Use only the information given. Do not add facts.

${partSummaries.map((s, i) => `Part ${i + 1}: ${s}`).join('\n')}
${topics.length ? `Topics: ${topics.join(', ')}` : ''}
Respond with JSON only.`;
}

export interface MemorySource {
  id: string;
  label: string;
  text: string;
}

export function buildMemoryAnswerPrompt(question: string, sources: MemorySource[], today: string): string {
  return `You are MEETOS, a team's meeting memory. Answer the question using ONLY the sources below.
Today is ${today}.
- Cite every claim with source ids in square brackets, e.g. [S1].
- If the sources do not contain the answer, set "found" to false and say what is missing. Do not guess.
- Never invent meetings, people, decisions, dates or outcomes.
- Be concise: at most 6 sentences or a short list.

SOURCES:
${sources.map((s) => `[${s.id}] (${s.label}) ${s.text}`).join('\n')}

QUESTION: ${question}
Respond with JSON only.`;
}

export function buildPrepPrompt(meetingTitle: string, contextBlock: string, today: string): string {
  return `You help a team prepare for their next meeting "${meetingTitle}". Today is ${today}.
Using ONLY the workspace facts below, write a short overview and a suggested agenda (3-7 items).
- Prioritise overdue and blocked commitments, decisions needing confirmation, and unresolved questions.
- Each agenda item's "refs" must list the ids of the facts it is based on (e.g. "C1", "D2", "Q3", "M1").
- Do not invent facts, people or dates.

WORKSPACE FACTS:
${contextBlock}
Respond with JSON only.`;
}

export function buildBriefPrompt(factsBlock: string, today: string): string {
  return `You write a short daily brief for a team based ONLY on these facts from their workspace. Today is ${today}.
Write a one-sentence headline about the most important thing, and 2-5 short bullets about what needs attention.
Do not add any facts that are not listed. Mention people and dates exactly as given.

FACTS:
${factsBlock}
Respond with JSON only.`;
}
