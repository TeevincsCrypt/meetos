# Setup checklist

Everything below happens in the [Firebase console](https://console.firebase.google.com) unless
stated otherwise. Nothing in this repository contains credentials; you supply them locally.

## 1. Create the Firebase project

1. **Add project** → name it (e.g. `meetos`). Google Analytics is optional.
2. Upgrade to **Blaze** only if you plan to use the Vertex AI ("Agent Platform") backend.
   The default Gemini Developer API backend works on the free Spark plan.

## 2. Web app config

1. Project settings → **General** → *Your apps* → **Add app → Web** (`</>`).
2. Copy the config values into `apps/web/.env.local` (copy from `apps/web/.env.example`):

```bash
cp apps/web/.env.example apps/web/.env.local
```

   Fill `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
   `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
   (Firebase web config is not secret, but `.env.local` is git-ignored anyway.)

## 3. Authentication

1. **Build → Authentication → Get started**.
2. *Sign-in method* → enable **Email/Password** and **Google** (set a support email).
3. *Settings → Authorized domains* → add your deployed domain (localhost is there by default).

## 4. Cloud Firestore

1. **Build → Firestore Database → Create database** (production mode, pick a region).
2. Deploy the rules and indexes from this repo:

```bash
npx firebase login
```

```bash
npx firebase use --add
```

```bash
npx firebase deploy --only firestore:rules,firestore:indexes
```

## 5. Firebase AI Logic

1. **Build → AI Logic → Get started**.
2. Choose **Gemini Developer API** (default in this app: `VITE_AI_BACKEND=googleai`).
   If you choose Vertex AI instead, set `VITE_AI_BACKEND=agentplatform`.
3. The console enables the required APIs and creates an API key restriction for you.

Models are configurable without a release through **Remote Config** (step 7). Defaults:
`gemini-3.5-flash-lite` (the Firebase JS SDK's default hybrid cloud model).

## 6. App Check (required if you enforce it for AI Logic)

**Web — option 1, reCAPTCHA v3 (simplest, no Google Cloud console):**

1. Go to <https://www.google.com/recaptcha/admin/create>. Label `meetos`, type
   **Score based (v3)**, domains: your deployed domain (e.g. `usemeetos.vercel.app`) and
   `localhost`. Pick your Firebase project's Google Cloud project if asked. Submit.
2. You get a **site key** and a **secret key**.
3. Firebase console → **App Check → Apps** → your web app → **reCAPTCHA** → paste the
   **secret key** → Save.
4. Put the **site key** in `VITE_RECAPTCHA_V3_SITE_KEY` (`.env.local` and/or Vercel).

**Web — option 2, reCAPTCHA Enterprise:**

1. Google Cloud console → *Security → reCAPTCHA* → create a **website** key for your domains.
2. Firebase console → **App Check → Apps** → your web app → **reCAPTCHA Enterprise** → paste the key.
3. Put the key in `apps/web/.env.local` as `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`.

**Both options:**

4. Local development: set `VITE_APPCHECK_DEBUG=true`, open the app, copy the debug token printed
   in the browser console, and add it under **App Check → Apps → ⋮ → Manage debug tokens**.
   Never commit a debug token.
5. When everything works, **App Check → APIs → Firebase AI Logic → Enforce**.

**Android:** debug builds use the debug provider (copy the token from logcat tag
`DebugAppCheckProvider` and register it as above); release builds use **Play Integrity**
(register the app's SHA-256 in App Check).

## 7. Remote Config (optional)

Create parameters to override defaults without redeploying:

| Key | Default | Meaning |
|---|---|---|
| `ai_cloud_model` | `gemini-3.5-flash-lite` | Cloud model for extraction (hybrid fallback) |
| `ai_reasoning_model` | `gemini-3.5-flash-lite` | Cloud model for Memory and Prepare |
| `ai_chunk_chars` | `2800` (web) / `2400` (Android) | Max transcript characters per chunk |
| `ai_default_mode` | `prefer_on_device` | Default AI preference for new users |

## 8. On-device AI (web)

The web on-device path uses Chrome's built-in Prompt API (`LanguageModel`) through Firebase AI
Logic. It requires a recent **desktop Chrome** on hardware that meets Chrome's built-in AI
requirements. In MEETOS: **Settings → AI & privacy → This device** shows the real availability
and offers **Download on-device model** when Chrome reports it as downloadable. On other
browsers MEETOS uses the cloud and labels results "In the cloud".

## 9. Run and deploy the web app

Run locally:

```bash
pnpm install
```

```bash
pnpm dev
```

### Deploy on Vercel (recommended for testing)

`vercel.json` (repo root) already contains the build settings, the single-page-app fallback
(so links like `/app/meetings/123` work on refresh) and security headers, including the
microphone permission that live capture needs.

1. **Import the repo:** vercel.com → **Add New… → Project** → import your GitHub repository.
2. **Root Directory:** leave it as the repository root (`./`). The root `vercel.json` builds
   `apps/web` and serves `apps/web/dist`. (If you prefer to set Root Directory to `apps/web`,
   that works too — `apps/web/vercel.json` is used instead; keep "Include files outside the
   root directory in the Build Step" enabled.)
3. **Environment variables** (Settings → Environment Variables, for Production and Preview):

   | Name | Value |
   |---|---|
   | `VITE_FIREBASE_API_KEY` | from Firebase web app config |
   | `VITE_FIREBASE_AUTH_DOMAIN` | e.g. `your-project.firebaseapp.com` |
   | `VITE_FIREBASE_PROJECT_ID` | your project ID |
   | `VITE_FIREBASE_STORAGE_BUCKET` | from config |
   | `VITE_FIREBASE_MESSAGING_SENDER_ID` | from config |
   | `VITE_FIREBASE_APP_ID` | from config |
   | `VITE_AI_BACKEND` | `googleai` |
   | `VITE_RECAPTCHA_V3_SITE_KEY` | App Check site key, reCAPTCHA v3 (§6) |
   | `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | instead of the above, if you use reCAPTCHA Enterprise (§6) |

   Do **not** set `VITE_APPCHECK_DEBUG` on Vercel. These values are compiled into the
   build, so redeploy after changing them.
4. **Deploy.** You get a URL like `https://meetos-xyz.vercel.app`.
5. **Authorize the domain in Firebase:** Authentication → Settings → **Authorized domains**
   → add `meetos-xyz.vercel.app` (without `https://`). Without this, Google sign-in fails
   with `auth/unauthorized-domain`.
6. **App Check:** add the same domain to your reCAPTCHA key (google.com/recaptcha/admin for
   v3, or Google Cloud console → Security → reCAPTCHA for Enterprise).

Vercel preview deployments get a new domain each time, and each one would need steps 5–6.
Give judges your fixed production URL (`*.vercel.app` or a custom domain).

If the build fails with a pnpm version error, add the environment variable
`ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the pnpm version pinned in `package.json`.

### Alternative: Firebase Hosting

`firebase.json` is also configured for Firebase Hosting:

```bash
pnpm build && npx firebase deploy --only hosting
```

## 10. Android app

1. Firebase console → **Add app → Android**, package `com.meetos.android`, add your debug SHA-1.
2. Download `google-services.json` to `apps/android/app/` (git-ignored).
3. For Google sign-in, copy the **Web client ID** (Authentication → Sign-in method → Google →
   Web SDK configuration) into `~/.gradle/gradle.properties`:
   `MEETOS_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com`
4. Open `apps/android` in Android Studio and run, or:

```bash
cd apps/android && ./gradlew :app:assembleDebug
```

On-device inference on Android needs a device supported by ML Kit GenAI / Gemini Nano; others
use the cloud model. Check **Settings → This device** in the app.

## 11. Inviting teammates

Owners/admins invite by email in **Settings → Members**. The invitee signs in with that email
(email/password accounts must verify their email first) and joins from the onboarding screen.
MEETOS does not send email itself — tell your teammate they've been invited.
