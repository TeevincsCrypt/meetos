# Status

_Last updated: 2026-11-20._

## Verified in this repository (commands actually run)

| Check | Result |
|---|---|
| `pnpm test` — shared logic (Vitest) | 25 / 25 passing |
| `pnpm test:rules` — Firestore rules on the emulator | 26 / 26 passing |
| `pnpm test:e2e` — Playwright, Auth + Firestore emulators, real Firebase AI Logic SDK with a `LanguageModel` test double | 15 / 15 passing |
| `pnpm typecheck`, `pnpm lint` | clean |
| `pnpm build` — production web build | succeeds |
| `apps/android/verify` — Kotlin analysis core on the JVM | 8 / 8 passing |
| Android `assembleDebug` + `testDebugUnitTest` (GitHub Actions, Kotlin 2.4.21, AGP 8.13) | passing |
| Web app deployed on Vercel with a real Firebase project (sign-in verified by the owner) | live |
| Visual review at 1360px and 390px (light + dark), no horizontal overflow | done |

The e2e suite covers: sign-up, workspace creation, transcript import, on-device extraction with
the JSON-schema `responseConstraint`, grounding discarding a hallucinated item, persistence after
reload, owners/deadlines/evidence, cross-meeting linking (deadline change, completion claim),
user-confirmed completion, Memory with `PREFER_IN_CLOUD` → on-device fallback and citations,
"not found" without AI, Execution metrics, Prepare + saved agenda, the live-capture consent gate,
cross-workspace isolation, cloud failure with retry, and "on-device only" making zero cloud calls.

## Not verified here (and why)

| Item | Reason | What to do |
|---|---|---|
| Real cloud Gemini responses | Not yet exercised end-to-end on the live site | Analyse a sample meeting on the deployed app |
| Real Chrome built-in model output quality | Headless test browser has no on-device model | Use a supported desktop Chrome |
| Android app on a device | The APK compiles in CI but hasn't been run on a phone | Install from Android Studio with your `google-services.json` |
| Android on-device inference | Needs a physical device supported by ML Kit GenAI | Check Settings → This device in the app |
| Google sign-in | Needs OAuth configuration in your project | `docs/SETUP.md` §3 and §10 |
| App Check enforcement | Needs reCAPTCHA Enterprise key / Play Integrity registration | `docs/SETUP.md` §6 |

## Known limitations

- Memory/search covers the 300 most recent meetings and 40 most recent transcripts per query.
- Speech recognition cannot tell voices apart; the user taps the current speaker during live capture.
- MEETOS does not send invitation emails.
- Android has the core flow (auth, dashboard + daily brief, meetings, transcript input, live
  capture, hybrid analysis, commitment graph, decisions, memory, settings); workspace
  administration, Prepare and Execution are web-only.
