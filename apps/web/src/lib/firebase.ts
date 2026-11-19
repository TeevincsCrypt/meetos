/**
 * Firebase initialisation: Auth, Firestore (offline cache), App Check,
 * Remote Config and Firebase AI Logic.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, type AppCheck } from 'firebase/app-check';
import { fetchAndActivate, getRemoteConfig, getValue, type RemoteConfig } from 'firebase/remote-config';
import { getAI, GoogleAIBackend, AgentPlatformBackend, type AI } from 'firebase/ai';
import { aiBackend, appCheckDebug, firebaseConfig, isFirebaseConfigured, recaptchaSiteKey, useEmulators } from './config';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  ai: AI;
  appCheck: AppCheck | null;
  remoteConfig: RemoteConfig | null;
}

let services: FirebaseServices | null = null;

export const REMOTE_CONFIG_DEFAULTS = {
  /** Cloud model used by hybrid (on-device first) extraction. This is the Firebase JS SDK's hybrid default. */
  ai_cloud_model: 'gemini-3.5-flash-lite',
  /** Cloud model used for cross-meeting reasoning (memory Q&A, prep briefs). */
  ai_reasoning_model: 'gemini-3.5-flash-lite',
  /** Max transcript characters per on-device chunk. */
  ai_chunk_chars: 2800,
  /** Default inference preference for new users. */
  ai_default_mode: 'prefer_on_device',
} as const;

export function getFirebase(): FirebaseServices {
  if (services) return services;
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured. See docs/SETUP.md.');

  const app = initializeApp(firebaseConfig);

  // App Check must be initialised before other services make requests.
  let appCheck: AppCheck | null = null;
  if (!useEmulators && recaptchaSiteKey) {
    if (appCheckDebug && appCheckDebug !== 'false') {
      // Documented debug provider for local development: the SDK logs a debug
      // token you register in the Firebase console. Never ship this enabled.
      (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
        appCheckDebug === 'true' ? true : appCheckDebug;
    }
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  const auth = getAuth(app);
  let db: Firestore;
  try {
    db = initializeFirestore(app, {
      localCache: useEmulators ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch {
    db = initializeFirestore(app, { localCache: memoryLocalCache(), ignoreUndefinedProperties: true });
  }

  if (useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }

  const ai = getAI(app, {
    backend: aiBackend === 'agentplatform' ? new AgentPlatformBackend() : new GoogleAIBackend(),
  });

  let remoteConfig: RemoteConfig | null = null;
  if (!useEmulators) {
    try {
      remoteConfig = getRemoteConfig(app);
      remoteConfig.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
      remoteConfig.defaultConfig = { ...REMOTE_CONFIG_DEFAULTS };
      void fetchAndActivate(remoteConfig).catch(() => undefined);
    } catch {
      remoteConfig = null;
    }
  }

  services = { app, auth, db, ai, appCheck, remoteConfig };
  return services;
}

export function rcString(key: keyof typeof REMOTE_CONFIG_DEFAULTS): string {
  const rc = services?.remoteConfig;
  if (rc) {
    const v = getValue(rc, key).asString();
    if (v) return v;
  }
  return String(REMOTE_CONFIG_DEFAULTS[key]);
}

export function rcNumber(key: keyof typeof REMOTE_CONFIG_DEFAULTS): number {
  const n = Number(rcString(key));
  return Number.isFinite(n) && n > 0 ? n : Number(REMOTE_CONFIG_DEFAULTS[key]);
}
