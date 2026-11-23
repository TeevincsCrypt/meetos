/**
 * App Check diagnostics. The App Check SDK only reports an HTTP status when the
 * token exchange fails, so we keep the server's own error message (never a token)
 * from the most recent failed exchange, and explain the likely cause in plain words.
 */
import { getToken } from 'firebase/app-check';
import { appCheckProvider, appCheckProviderLabel, appCheckSiteKey, firebaseConfig } from './config';
import { getFirebase } from './firebase';

const APP_CHECK_HOST = 'https://content-firebaseappcheck.googleapis.com/';

interface ExchangeFailure {
  status: number;
  message: string;
}

let lastExchangeFailure: ExchangeFailure | null = null;
let installed = false;

/** Records the status and error message of failed App Check exchanges. Call once, before App Check starts. */
export function installAppCheckProbe() {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const response = await original(input, init);
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith(APP_CHECK_HOST)) {
        if (response.ok) {
          lastExchangeFailure = null;
        } else {
          const body = (await response.clone().json().catch(() => null)) as { error?: { message?: string } } | null;
          lastExchangeFailure = { status: response.status, message: body?.error?.message ?? response.statusText };
        }
      }
    } catch {
      /* diagnostics must never break a request */
    }
    return response;
  };
}

export interface AppCheckDiagnosis {
  ok: boolean;
  /** Short headline. */
  title: string;
  /** What to check, in plain words. */
  steps: string[];
  /** Technical detail for support (error code, HTTP status, server message). */
  technical: string | null;
  /** Public identifiers to compare with the Firebase console. */
  facts: { label: string; value: string }[];
}

function mask(key: string) {
  return key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : key;
}

export async function diagnoseAppCheck(): Promise<AppCheckDiagnosis> {
  const facts = [
    { label: 'Provider in this build', value: appCheckProvider ? appCheckProviderLabel : 'none' },
    { label: 'Site key in this build', value: appCheckSiteKey ? mask(appCheckSiteKey) : 'none' },
    { label: 'Firebase web app ID', value: firebaseConfig.appId ?? 'unknown' },
    { label: 'This domain', value: window.location.hostname },
  ];
  const { appCheck } = getFirebase();
  if (!appCheck) {
    return {
      ok: false,
      title: 'App Check is not set up in this build',
      steps: ['Add VITE_RECAPTCHA_ENTERPRISE_SITE_KEY in Vercel (Settings → Environment Variables) and redeploy.'],
      technical: null,
      facts,
    };
  }
  try {
    await getToken(appCheck, false);
    return {
      ok: true,
      title: 'App Check works: this site received a valid token',
      steps: [],
      technical: null,
      facts,
    };
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    const message = e instanceof Error ? e.message : String(e);
    const status = lastExchangeFailure?.status ?? Number(/(\d{3})/.exec(message)?.[1] ?? 0);
    const server = lastExchangeFailure ? `${lastExchangeFailure.status}: ${lastExchangeFailure.message}` : null;
    const technical = [code, server ?? message].filter(Boolean).join(' · ');
    const host = window.location.hostname;

    if (code.includes('recaptcha-error')) {
      return {
        ok: false,
        title: 'reCAPTCHA could not create a token on this domain',
        steps: [
          `Open your reCAPTCHA key in Google Cloud and check its domain list contains ${host} (no https://).`,
          'Check the key is a Website key, score-based (no checkbox challenge).',
          appCheckProvider === 'recaptcha-enterprise'
            ? 'Check the key was created in Google Cloud (reCAPTCHA / Fraud Defense), not as a classic v3 key.'
            : 'This build uses a classic v3 key. Create an Enterprise key instead and set VITE_RECAPTCHA_ENTERPRISE_SITE_KEY.',
        ],
        technical,
        facts,
      };
    }
    if (status === 403) {
      return {
        ok: false,
        title: 'Firebase App Check refused this site',
        steps: [
          `Firebase console → App Check → Apps: the web app with ID ${firebaseConfig.appId ?? '(above)'} must be registered with ${appCheckProviderLabel}.`,
          'The key registered there must be exactly the same key ID as in Vercel (compare the first and last characters above).',
          'The reCAPTCHA key must have been created in this same Firebase project.',
          'After fixing, reload this page and test again (App Check waits a while before retrying after a refusal; a reload resets that).',
        ],
        technical,
        facts,
      };
    }
    if (status === 400) {
      return {
        ok: false,
        title: 'Firebase App Check rejected the reCAPTCHA token',
        steps: [
          'The key registered in Firebase App Check does not match the key this site uses, or it is registered under a different provider.',
          `In Firebase → App Check → Apps, re-register the web app with ${appCheckProviderLabel} and the same key ID as in Vercel.`,
        ],
        technical,
        facts,
      };
    }
    return {
      ok: false,
      title: 'App Check could not get a token',
      steps: ['Reload this page and test again. If it still fails, send the technical detail below.'],
      technical,
      facts,
    };
  }
}
