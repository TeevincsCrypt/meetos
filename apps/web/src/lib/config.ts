/** Build-time configuration from Vite env vars. No secrets live here: Firebase web config is public by design. */
const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
};

export const useEmulators = env.VITE_USE_EMULATORS === 'true';
export const aiBackend: 'googleai' | 'agentplatform' = env.VITE_AI_BACKEND === 'agentplatform' ? 'agentplatform' : 'googleai';
const enterpriseKey = (env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY as string | undefined)?.trim() || null;
const v3Key = (env.VITE_RECAPTCHA_V3_SITE_KEY as string | undefined)?.trim() || null;
/**
 * App Check provider for this build. reCAPTCHA Enterprise wins if both keys are set;
 * classic reCAPTCHA v3 is deprecated for App Check and kept only for projects that already registered one.
 */
export const appCheckProvider: 'recaptcha-enterprise' | 'recaptcha-v3' | null = enterpriseKey
  ? 'recaptcha-enterprise'
  : v3Key
    ? 'recaptcha-v3'
    : null;
export const appCheckSiteKey = enterpriseKey ?? v3Key;
export const appCheckProviderLabel = appCheckProvider === 'recaptcha-enterprise' ? 'reCAPTCHA Enterprise' : 'reCAPTCHA v3';
export const appCheckDebug = (env.VITE_APPCHECK_DEBUG as string | undefined) ?? 'false';

export const missingConfigKeys = (['apiKey', 'authDomain', 'projectId', 'appId'] as const).filter((k) => !firebaseConfig[k]);

/** The environment variable that provides each config key (what the person must set). */
export const ENV_NAME: Record<(typeof missingConfigKeys)[number], string> = {
  apiKey: 'VITE_FIREBASE_API_KEY',
  authDomain: 'VITE_FIREBASE_AUTH_DOMAIN',
  projectId: 'VITE_FIREBASE_PROJECT_ID',
  appId: 'VITE_FIREBASE_APP_ID',
};
export const missingEnvVars = missingConfigKeys.map((k) => ENV_NAME[k]);
export const isFirebaseConfigured = missingConfigKeys.length === 0;
