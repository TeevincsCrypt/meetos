# Devpost submission draft

Copy each section into the matching Devpost field. Edit anything that doesn't match what you
actually tested — especially the "Platforms" line and the Gemini Nano 4 wording.

- **Live app:** https://usemeetos.vercel.app
- **Code:** https://github.com/TeevincsCrypt/meetos (public, Apache-2.0)
- **Video:** _your YouTube link (public or unlisted, 3 minutes or less)_

---

## Tagline

Meetings shouldn't end with notes. They should end with work getting done.

## Inspiration

Most meeting tools stop at a summary. The real problem starts after the call: who promised what,
by when, and did it actually happen? Those promises get lost between meetings, and the same
blockers come up week after week. We wanted a tool that remembers every commitment and follows it
across meetings, without ever pretending something is done when it isn't.

## What it does

Meetos turns meeting transcripts into decisions, commitments, owners and deadlines, then follows
each commitment across later meetings.

- **Capture:** live transcription in the browser (with an explicit consent step and a visible
  recording indicator), or paste/upload a transcript (.txt, .md, .vtt, .srt).
- **AI analysis with evidence:** every decision, commitment and question must quote the
  transcript. Meetos checks that the quote really exists, assigns owners only to people who were
  in the meeting, and turns deadlines only from words that were actually spoken ("by Friday"
  becomes a real date). Anything it can't back up is discarded, and the app says how many.
- **Commitment Graph:** when a later meeting mentions an earlier promise, Meetos links it:
  progress, blockers, moved deadlines and "it's done" claims appear on the commitment's timeline
  with quotes. The AI never marks a task complete; a person confirms it (enforced in Firestore
  security rules, not only in the UI).
- **Decision memory:** who agreed, what alternatives were discussed, and when a later decision
  replaced an earlier one.
- **Memory Q&A:** ask "What happened to the launch date?" and get an answer built only from your
  workspace's records, with citations. If nothing relevant exists, it says so without calling a
  model.
- **Prepare for a meeting:** outstanding and overdue commitments, blockers, open questions and an
  AI-suggested (or rule-based) agenda.
- **Execution monitor and Daily Brief:** completion rate, overdue, blocked and repeatedly
  postponed commitments, computed from real records.
- **Teams:** workspaces with owner/admin/member roles and email invites.

## How we used Firebase AI Logic (hybrid inference)

- **Web:** `getGenerativeModel` with `InferenceMode.PREFER_ON_DEVICE` for transcript extraction.
  In Chrome with built-in AI, extraction runs on the device (Gemini Nano through Chrome's Prompt
  API) with a JSON-schema `responseConstraint`; otherwise it runs in the cloud with
  `responseJsonSchema`. Cross-meeting tasks (Memory, Prepare) use `PREFER_IN_CLOUD`.
- **Android:** `OnDeviceConfig(mode = PREFER_ON_DEVICE, modelOption = OnDeviceModelOption.PREVIEW)`,
  which selects Gemini Nano 4 through ML Kit's Prompt API on supported phones, with automatic
  cloud fallback.
- **Honest labels:** every result shows where it actually ran ("On this device", "In the cloud" or
  "Cloud fallback"), taken from the SDK's `inferenceSource`, plus the on-device model name the
  device reports on Android.
- **Long transcripts** are split into parts that fit the on-device context window, each analysed
  separately and merged.
- **Privacy setting:** users can choose "On-device only" (nothing is sent to a cloud model) or
  "Cloud only".
- **Also used:** App Check (reCAPTCHA Enterprise on web, Play Integrity on Android), Firebase
  Authentication (Google and email), Cloud Firestore with role-based security rules, and Remote
  Config for model names and settings.

## How we built it

- Web: React 19, TypeScript, Vite, Tailwind CSS; deployed on Vercel.
- Android: Kotlin, Jetpack Compose, Room offline cache, Firebase Android SDK.
- A shared TypeScript package holds the grounding, chunking, linking and metrics logic; the
  Android app has a Kotlin port with its own tests.
- Tests: unit tests for the shared logic, Firestore security-rules tests against the emulator,
  end-to-end browser tests (Playwright) and Android unit tests, all run in GitHub Actions.

## Challenges we ran into

- **Making on-device output trustworthy.** Small models sometimes invent owners, dates or quotes,
  so we built a grounding layer that verifies every item against the transcript before saving it.
- **Context limits on-device.** We split transcripts into parts and merge the results, while still
  linking items to earlier meetings.
- **Never faking completion.** "It's done" in a meeting is only a claim; a person has to confirm
  it, and the database rules enforce that.

## Accomplishments we're proud of

- Every AI result says where it truly ran, and nothing is saved without evidence.
- Commitments are followed across meetings automatically, including moved deadlines and blockers.
- One Firebase backend shared by the web app and a native Android app.

## What we learned

Hybrid AI works best when the app is honest about it: route each task to the right place, show
the user what actually happened, and validate output instead of trusting it.

## What's next

- Calendar integration to prepare automatically before each meeting.
- Speaker detection for live capture.
- Notifications when a commitment is about to slip.

## Built with

firebase-ai-logic, gemini, gemini-nano, firebase-app-check, firebase-authentication,
cloud-firestore, firebase-remote-config, react, typescript, vite, tailwindcss, kotlin,
jetpack-compose, ml-kit, vercel

---

## Testing instructions (for the judges)

1. Open **https://usemeetos.vercel.app** in desktop Chrome and click **Get started**.
2. Sign in with Google, or create an account with email and password.
3. On the setup screen, click **Create demo workspace**. It adds clearly labelled fictional sample
   meetings.
4. Open **Meetings → Beta launch planning (sample)** and click **Analyse**. Each part shows where
   it ran: "On this device" (Chrome with built-in AI) or "In the cloud".
5. Open **Beta launch weekly sync (sample)** and click **Analyse**. Then open **Commitments →
   Finish the landing page** to see the Commitment Graph (origin, follow-up, moved deadline, with
   quotes).
6. Open a commitment that a later meeting says is done and confirm it. The AI never completes tasks
   on its own.
7. **Memory:** ask "What did we decide about beta pricing?"; ask about something that was never
   discussed to see it answer "not found" without calling a model.
8. **Settings → AI & privacy:** switch between Hybrid, On-device only and Cloud only.

More test data: `docs/DEMO_TRANSCRIPTS.md` and `docs/test-data/` in the repository.
Full setup for running it yourself: `docs/SETUP.md`. Android build: `apps/android/README.md`.

On-device inference needs supported hardware: desktop Chrome with built-in AI for the web, and a
phone with Gemini Nano 4 support for Android. On other devices the app uses the cloud and labels
the result "In the cloud".
