# MEETOS for Android

Native Kotlin + Jetpack Compose app that shares the web app's Firebase project,
Firestore data model and security rules.

| Layer | Where |
|---|---|
| UI (Compose, Material 3) | `ui/`, `ui/screens/` |
| ViewModel | `ui/AppViewModel.kt` |
| Repository / Firebase data layer | `data/MeetosRepository.kt`, `data/Mappers.kt` |
| Local cache (Room) | `data/local/CacheDatabase.kt` |
| Hybrid AI service (Firebase AI Logic) | `ai/HybridAi.kt`, `ai/AnalysisPipeline.kt` |
| Pure analysis core (grounding, chunking, linking) | `analysis/` |
| Speech capture | `speech/SpeechCapture.kt` |
| Auth (email/password, Google via Credential Manager) | `auth/AuthRepository.kt` |

## Hybrid inference

`HybridAi` creates models with
`Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(modelName, generationConfig, onDeviceConfig = OnDeviceConfig(mode = …))`
from `com.google.firebase:firebase-ai` + `com.google.firebase:firebase-ai-ondevice`:

- transcript extraction → `InferenceMode.PREFER_ON_DEVICE` (Gemini Nano via ML Kit GenAI; SDK falls back to cloud)
- memory answers → `InferenceMode.PREFER_IN_CLOUD`
- user can force `ONLY_ON_DEVICE` or `ONLY_IN_CLOUD` in Settings

The label shown on every result comes from `GenerateContentResponse.inferenceSource`.
On-device status/download uses `GenerativeModel.onDeviceExtension` (`checkStatus()`, `download()`).
On-device inference on Android is **experimental and device-dependent**.

## Build

1. Install Android Studio (or the Android SDK, API 36) and JDK 17+.
2. Firebase Console → add an Android app with package `com.meetos.android`, download
   `google-services.json` into `apps/android/app/` (git-ignored).
3. For Google sign-in, add your SHA-1 to the Firebase Android app and put the **web** OAuth
   client ID in `~/.gradle/gradle.properties`: `MEETOS_WEB_CLIENT_ID=…apps.googleusercontent.com`.
4. App Check: debug builds use the debug provider — run once, copy the debug token from logcat
   (`DebugAppCheckProvider`) into Firebase Console → App Check → Manage debug tokens.
   Release builds use Play Integrity.
5. `./gradlew :app:assembleDebug` (or Run in Android Studio).

## Tests

- `cd apps/android && ./gradlew :app:testDebugUnitTest` — JVM unit tests (needs the Android SDK).
- `cd apps/android/verify && gradle test` — compiles and tests the pure-Kotlin analysis core on a plain JVM
  (no Android SDK required). This is what CI-less environments can run.
