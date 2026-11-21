/**
 * MEETOS hybrid inference layer on top of Firebase AI Logic.
 *
 * - Extraction tasks (short, bounded transcript chunks) use
 *   `InferenceMode.PREFER_ON_DEVICE` (or `ONLY_ON_DEVICE` if the user has
 *   disabled cloud processing), with a JSON-schema `responseConstraint` for
 *   Chrome's built-in model and `responseJsonSchema` for the cloud model.
 * - Cross-meeting reasoning (memory Q&A, prep briefs) uses
 *   `InferenceMode.PREFER_IN_CLOUD`, which the SDK falls back to on-device for
 *   when the cloud is unreachable.
 *
 * The reported source of every result comes from the SDK's
 * `response.inferenceSource`. We add exactly one thing of our own: when an
 * on-device result fails validation (or the on-device call throws) and cloud
 * processing is allowed, we retry with a cloud-only model and report that as
 * "cloud_fallback".
 */
import {
  AIError,
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type GenerativeModel,
  type HybridParams,
} from 'firebase/ai';
import type { InferenceSourceLabel } from '@meetos/shared';
import type { z } from 'zod';
import { getFirebase, rcString } from '../firebase';
import { recaptchaSiteKey } from '../config';
import { parseModelJson } from '@meetos/shared';

// ---------------------------------------------------------------- preferences

export type AiPreference = 'prefer_on_device' | 'on_device_only' | 'cloud_only';

const PREF_KEY = 'meetos-ai-preference';

export function getAiPreference(): AiPreference {
  try {
    const v = localStorage.getItem(PREF_KEY);
    if (v === 'prefer_on_device' || v === 'on_device_only' || v === 'cloud_only') return v;
  } catch {
    /* storage unavailable */
  }
  const d = rcString('ai_default_mode');
  return d === 'on_device_only' || d === 'cloud_only' ? d : 'prefer_on_device';
}

export function setAiPreference(p: AiPreference) {
  try {
    localStorage.setItem(PREF_KEY, p);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new CustomEvent('meetos-ai-preference', { detail: p }));
}

export const cloudAllowed = (p: AiPreference = getAiPreference()) => p !== 'on_device_only';

// ---------------------------------------------------------------- capability

/** Chrome Prompt API availability values, plus 'unsupported' when the API doesn't exist. */
export type OnDeviceAvailability = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

const LANG_OPTIONS = {
  expectedInputs: [{ type: 'text' as const, languages: ['en'] }],
  expectedOutputs: [{ type: 'text' as const, languages: ['en'] }],
};

interface LanguageModelStatic {
  availability(options?: unknown): Promise<string>;
}

function languageModelApi(): LanguageModelStatic | null {
  const lm = (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  return lm && typeof lm.availability === 'function' ? lm : null;
}

export async function checkOnDeviceAvailability(): Promise<OnDeviceAvailability> {
  const lm = languageModelApi();
  if (!lm) return 'unsupported';
  try {
    const a = await lm.availability(LANG_OPTIONS);
    if (a === 'available' || a === 'downloadable' || a === 'downloading' || a === 'unavailable') return a;
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export function describeAvailability(a: OnDeviceAvailability): string {
  switch (a) {
    case 'available':
      return 'On-device model ready';
    case 'downloadable':
      return 'On-device model can be downloaded';
    case 'downloading':
      return 'On-device model downloading';
    case 'unavailable':
      return 'On-device model not supported on this device';
    default:
      return 'This browser has no built-in AI model';
  }
}

// ---------------------------------------------------------------- models

export interface StructuredTask<T> {
  /** Cache key for the model instance (one per response schema). */
  name: string;
  prompt: string;
  jsonSchema: object;
  schema: z.ZodType<T>;
  /** 'extract' = on-device first; 'reason' = cloud first. */
  kind: 'extract' | 'reason';
}

export interface AiResult<T> {
  data: T;
  source: InferenceSourceLabel;
  /** Human-readable reason, e.g. why the cloud was used. */
  detail: string;
  model: string;
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiUnavailableError';
  }
}

const modelCache = new Map<string, GenerativeModel>();

function buildModel(task: Pick<StructuredTask<unknown>, 'name' | 'jsonSchema' | 'kind'>, mode: HybridParams['mode']) {
  const cloudModel = task.kind === 'reason' ? rcString('ai_reasoning_model') : rcString('ai_cloud_model');
  const key = `${task.name}:${mode}:${cloudModel}`;
  const cached = modelCache.get(key);
  if (cached) return { model: cached, cloudModel };
  const { ai } = getFirebase();
  const model = getGenerativeModel(ai, {
    mode,
    onDeviceParams: {
      createOptions: LANG_OPTIONS,
      promptOptions: { responseConstraint: task.jsonSchema },
    },
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: task.jsonSchema as Record<string, unknown>,
      },
    },
  });
  modelCache.set(key, model);
  return { model, cloudModel };
}

/** The server's own reason, without the long request URL, so problems can be diagnosed. */
function serverReason(msg: string): string {
  const m = /\[(\d{3})[^\]]*\]\s*(.*)$/s.exec(msg);
  const text = (m ? `${m[1]}: ${m[2]}` : msg).replace(/\s+/g, ' ').trim();
  return text.length > 220 ? `${text.slice(0, 217)}…` : text;
}

function friendlyError(e: unknown): string {
  if (e instanceof AIError) {
    const msg = e.message || String(e.code);
    if (/app.?check/i.test(msg)) {
      const why = recaptchaSiteKey
        ? 'This site sent an App Check token but it was not accepted. Check that this domain is allowed on the reCAPTCHA key and that the key is registered for the web app in Firebase App Check.'
        : 'App Check is enforced for Firebase AI Logic, but this build has no reCAPTCHA key (VITE_RECAPTCHA_ENTERPRISE_SITE_KEY), so no App Check token was sent.';
      return `Firebase AI Logic rejected the request (App Check). ${why} Server said: ${serverReason(msg)}`;
    }
    if (/api.?not.?enabled|has not been used|disabled/i.test(msg))
      return 'Firebase AI Logic is not enabled for this Firebase project. See docs/SETUP.md.';
    if (/quota|rate/i.test(msg)) return 'The AI quota for this project was exceeded. Try again shortly.';
    if (/failed to fetch|networkerror|network error/i.test(msg)) return 'The cloud model could not be reached (network error).';
    return serverReason(msg);
  }
  return e instanceof Error ? e.message : String(e);
}

function validate<T>(text: string, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(parseModelJson(text));
  if (!parsed.success) throw new Error('Response did not match the expected structure.');
  return parsed.data;
}

/**
 * Run a structured task with honest source reporting.
 */
export async function runStructured<T>(task: StructuredTask<T>, pref: AiPreference = getAiPreference()): Promise<AiResult<T>> {
  const availability = await checkOnDeviceAvailability();
  const allowCloud = cloudAllowed(pref);

  if (!allowCloud && availability === 'unsupported') {
    // Important: with no LanguageModel API the SDK would silently use the cloud
    // even in ONLY_ON_DEVICE mode, so we must stop here ourselves.
    throw new AiUnavailableError(
      'On-device AI is not available in this browser and cloud processing is turned off. Enable cloud processing in Settings → AI & privacy, or use Chrome with built-in AI.',
    );
  }
  if (!allowCloud && availability !== 'available') {
    throw new AiUnavailableError(`${describeAvailability(availability)}. Cloud processing is turned off, so this can't run yet.`);
  }

  let mode: HybridParams['mode'];
  if (!allowCloud) mode = InferenceMode.ONLY_ON_DEVICE;
  else if (pref === 'cloud_only') mode = InferenceMode.ONLY_IN_CLOUD;
  else mode = task.kind === 'reason' ? InferenceMode.PREFER_IN_CLOUD : InferenceMode.PREFER_ON_DEVICE;

  const { model, cloudModel } = buildModel(task, mode);
  let firstError: unknown = null;
  try {
    const result = await model.generateContent(task.prompt);
    const source: InferenceSourceLabel = result.response.inferenceSource === InferenceSource.ON_DEVICE ? 'on_device' : 'in_cloud';
    const text = result.response.text();
    try {
      const data = validate(text, task.schema);
      return {
        data,
        source,
        model: source === 'on_device' ? 'Chrome built-in model' : cloudModel,
        detail:
          source === 'on_device'
            ? 'Processed on this device'
            : pref === 'cloud_only'
              ? 'Processed in the cloud (your preference)'
              : task.kind === 'reason'
                ? 'Processed in the cloud (cross-meeting task)'
                : `Processed in the cloud — ${describeAvailability(availability).toLowerCase()}`,
      };
    } catch (e) {
      if (source !== 'on_device' || !allowCloud) throw e;
      firstError = e;
    }
  } catch (e) {
    if (firstError === null) {
      // The call itself failed. Only an on-device failure can be retried in the cloud.
      const onDeviceAttempted = mode !== InferenceMode.ONLY_IN_CLOUD && availability === 'available';
      if (!onDeviceAttempted || !allowCloud || mode === InferenceMode.PREFER_IN_CLOUD) {
        throw new Error(friendlyError(e), { cause: e });
      }
      firstError = e;
    }
  }

  // Cloud fallback after an on-device failure.
  const { model: cloud, cloudModel: cm } = buildModel(task, InferenceMode.ONLY_IN_CLOUD);
  try {
    const result = await cloud.generateContent(task.prompt);
    const data = validate(result.response.text(), task.schema);
    return {
      data,
      source: 'cloud_fallback',
      model: cm,
      detail: `Cloud fallback used — on-device attempt failed: ${friendlyError(firstError)}`,
    };
  } catch (e) {
    throw new Error(`On-device attempt failed (${friendlyError(firstError)}) and cloud fallback failed (${friendlyError(e)}).`, { cause: e });
  }
}

/**
 * Prepare (and if needed download) the on-device model. Must be called from a
 * user gesture (click), as required by Chrome's Prompt API.
 */
export async function prepareOnDeviceModel(onProgress: (fraction: number) => void): Promise<OnDeviceAvailability> {
  const { ai } = getFirebase();
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: { createOptions: LANG_OPTIONS },
    inCloudParams: { model: rcString('ai_cloud_model') },
  });
  await model.initializeDeviceModel(onProgress);
  return checkOnDeviceAvailability();
}
