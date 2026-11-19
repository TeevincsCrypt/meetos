/**
 * Structured-output contracts for MEETOS AI tasks.
 *
 * Each task has:
 *  - a JSON Schema, passed to Firebase AI Logic as `responseConstraint`
 *    (on-device, Chrome Prompt API) and `responseJsonSchema` (cloud Gemini);
 *  - a Zod schema that validates and normalises whatever comes back.
 *
 * The JSON Schemas are kept intentionally flat and small: the on-device
 * model is small, and every extra field costs output tokens.
 * Unknown values are represented as "" (not null) because small models follow
 * that convention more reliably than nullable unions.
 */
import { z } from 'zod';

const str = z
  .string()
  .catch('')
  .transform((s) => s.trim());
const strArr = z
  .array(z.string())
  .catch([])
  .transform((a) => a.map((s) => s.trim()).filter(Boolean));

function arr<T extends z.ZodType>(item: T, max: number) {
  // Drop invalid entries instead of failing the whole chunk.
  return z
    .array(z.unknown())
    .catch([])
    .transform((items) =>
      items
        .map((i) => item.safeParse(i))
        .filter((r) => r.success)
        .map((r) => r.data as z.output<T>)
        .slice(0, max),
    );
}

// ---------------------------------------------------------------- chunk extraction

export const chunkExtractionJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One or two sentences summarising this excerpt.' },
    topics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Short topic label, 1-4 words.' },
          evidence: { type: 'string', description: 'Exact quote from the excerpt.' },
        },
        required: ['name', 'evidence'],
      },
    },
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          evidence: { type: 'string', description: 'Exact quote showing the decision.' },
          certainty: { type: 'string', enum: ['explicit', 'tentative'] },
          madeBy: { type: 'array', items: { type: 'string' } },
          alternatives: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'description', 'evidence', 'certainty', 'madeBy', 'alternatives'],
      },
    },
    commitments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'What the person promised to do.' },
          owner: { type: 'string', description: 'Name of the person who committed, or "".' },
          deadline: { type: 'string', description: 'Deadline words exactly as spoken, or "".' },
          evidence: { type: 'string', description: 'Exact quote of the promise.' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['description', 'owner', 'deadline', 'evidence', 'priority'],
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          askedBy: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['text', 'askedBy', 'evidence'],
      },
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          kind: { type: 'string', enum: ['risk', 'blocker'] },
          evidence: { type: 'string' },
        },
        required: ['description', 'kind', 'evidence'],
      },
    },
    followUps: { type: 'array', items: { type: 'string' } },
    updates: {
      type: 'array',
      description: 'References in this excerpt to the EARLIER commitments listed in the prompt.',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'The earlier commitment id, e.g. "C2".' },
          kind: {
            type: 'string',
            enum: ['progress', 'blocker', 'completion_claim', 'deadline_change', 'mention'],
          },
          evidence: { type: 'string' },
          newDeadline: { type: 'string', description: 'New deadline words if changed, else "".' },
        },
        required: ['ref', 'kind', 'evidence', 'newDeadline'],
      },
    },
  },
  required: ['summary', 'topics', 'decisions', 'commitments', 'questions', 'risks', 'followUps', 'updates'],
} as const;

const priority = z.enum(['low', 'medium', 'high']).catch('medium');

export const chunkExtractionSchema = z.object({
  summary: str,
  topics: arr(z.object({ name: str, evidence: str }), 8),
  decisions: arr(
    z.object({
      title: str,
      description: str,
      evidence: str,
      certainty: z.enum(['explicit', 'tentative']).catch('tentative'),
      madeBy: strArr,
      alternatives: strArr,
    }),
    10,
  ),
  commitments: arr(
    z.object({
      description: str,
      owner: str,
      deadline: str,
      evidence: str,
      priority,
    }),
    15,
  ),
  questions: arr(z.object({ text: str, askedBy: str, evidence: str }), 10),
  risks: arr(z.object({ description: str, kind: z.enum(['risk', 'blocker']).catch('risk'), evidence: str }), 10),
  followUps: strArr.transform((a) => a.slice(0, 8)),
  updates: arr(
    z.object({
      ref: str,
      kind: z.enum(['progress', 'blocker', 'completion_claim', 'deadline_change', 'mention']).catch('mention'),
      evidence: str,
      newDeadline: str,
    }),
    15,
  ),
});
export type ChunkExtraction = z.output<typeof chunkExtractionSchema>;

// ---------------------------------------------------------------- summary merge

export const meetingSummaryJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'A 3-5 sentence summary of the whole meeting.' },
    discussionPoints: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'discussionPoints'],
} as const;

export const meetingSummarySchema = z.object({
  summary: str,
  discussionPoints: strArr.transform((a) => a.slice(0, 8)),
});
export type MeetingSummaryOutput = z.output<typeof meetingSummarySchema>;

// ---------------------------------------------------------------- memory answer

export const memoryAnswerJsonSchema = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: 'false if the sources do not answer the question.' },
    answer: { type: 'string', description: 'Answer using only the sources. Cite like [S1].' },
    citations: { type: 'array', items: { type: 'string' }, description: 'Source ids used, e.g. "S1".' },
  },
  required: ['found', 'answer', 'citations'],
} as const;

export const memoryAnswerSchema = z.object({
  found: z.boolean().catch(false),
  answer: str,
  citations: strArr,
});
export type MemoryAnswerOutput = z.output<typeof memoryAnswerSchema>;

// ---------------------------------------------------------------- meeting prep

export const prepBriefJsonSchema = {
  type: 'object',
  properties: {
    overview: { type: 'string', description: 'Two or three sentences on where things stand.' },
    agenda: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          minutes: { type: 'integer' },
          refs: { type: 'array', items: { type: 'string' }, description: 'Source ids, e.g. "C1", "D2", "Q1".' },
        },
        required: ['title', 'detail', 'minutes', 'refs'],
      },
    },
    followUpTopics: { type: 'array', items: { type: 'string' } },
  },
  required: ['overview', 'agenda', 'followUpTopics'],
} as const;

export const prepBriefSchema = z.object({
  overview: str,
  agenda: arr(
    z.object({
      title: str,
      detail: str,
      minutes: z.number().int().min(1).max(120).nullable().catch(null),
      refs: strArr,
    }),
    10,
  ),
  followUpTopics: strArr.transform((a) => a.slice(0, 8)),
});
export type PrepBriefOutput = z.output<typeof prepBriefSchema>;

// ---------------------------------------------------------------- daily brief narrative

export const briefNarrativeJsonSchema = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One sentence: the single most important thing today.' },
    bullets: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'bullets'],
} as const;

export const briefNarrativeSchema = z.object({
  headline: str,
  bullets: strArr.transform((a) => a.slice(0, 6)),
});
export type BriefNarrativeOutput = z.output<typeof briefNarrativeSchema>;

/**
 * Parse model text as JSON. Tolerates code fences and leading prose, which
 * small models occasionally emit even with a response constraint.
 */
export function parseModelJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      /* fall through */
    }
  }
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error('Model response was not valid JSON.');
}
