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
export const recaptchaSiteKey = (env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY as string | undefined) || null;
export const appCheckDebug = (env.VITE_APPCHECK_DEBUG as string | undefined) ?? 'false';

export const missingConfigKeys = (['apiKey', 'authDomain', 'projectId', 'appId'] as const).filter((k) => !firebaseConfig[k]);
export const isFirebaseConfigured = missingConfigKeys.length === 0;
