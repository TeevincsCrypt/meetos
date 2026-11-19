# Hybrid AI in MEETOS

MEETOS uses **Firebase AI Logic** as its only AI runtime, on both platforms. This document
describes exactly which inference mode each task uses, how the reported source is obtained,
and how model output is validated before anything is saved.

The APIs below were taken from the SDK sources and type declarations themselves
(`firebase@13.4.0` for web; `firebase-ai 18.2.0` / `firebase-ai-ondevice 16.0.0-beta08` for Android).

## Task routing

| Task | Input size | Web mode | Android mode | Why |
|---|---|---|---|---|
| Transcript extraction (per chunk) | ≤ ~2,800 chars | `InferenceMode.PREFER_ON_DEVICE` | `InferenceMode.PREFER_ON_DEVICE` | Short, private, structured — ideal for the local model |
| Multi-chunk summary merge | small | `PREFER_ON_DEVICE` | — (summaries joined) | Small text-only task |
| Daily Brief wording | small | `PREFER_ON_DEVICE` | — | Rephrases deterministic facts |
| Memory Q&A | retrieved excerpts | `PREFER_IN_CLOUD` | `PREFER_IN_CLOUD` | Cross-meeting reasoning; SDK falls back on-device when offline |
| Prepare-for-meeting brief | workspace facts | `PREFER_IN_CLOUD` | — | Needs broader reasoning |
| User chose "On-device only" | — | `ONLY_ON_DEVICE` | `ONLY_ON_DEVICE` | Nothing sent to a cloud model |
| User chose "Cloud only" | — | `ONLY_IN_CLOUD` | `ONLY_IN_CLOUD` | e.g. unsupported device |

## Web implementation (`apps/web/src/lib/ai/hybrid.ts`)

```ts
getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: {
    createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] },
    promptOptions: { responseConstraint: jsonSchema },        // Chrome Prompt API structured output
  },
  inCloudParams: {
    model: 'gemini-3.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: jsonSchema },
  },
});
```

- **Reported source:** `result.response.inferenceSource` (`'on_device' | 'in_cloud'`).
- **Capability check:** `LanguageModel.availability()` → `unavailable | downloadable | downloading | available`.
- **Model download:** `model.initializeDeviceModel(onProgress)` — called only from a click,
  as Chrome requires a user gesture.
- **Important SDK behaviour we guard against:** if `window.LanguageModel` doesn't exist, the
  SDK creates no on-device adapter and routes *every* mode — including `ONLY_ON_DEVICE` — to the
  cloud. When the user has chosen "On-device only", MEETOS therefore refuses to call the SDK at
  all on such browsers (covered by an e2e test asserting zero cloud requests).
- **On-device prompts ignore `systemInstruction`** on web (the adapter forwards only `contents`),
  so instructions are embedded in the user prompt.
- **Cloud fallback after on-device failure:** if the on-device call throws, or its output fails
  validation, MEETOS retries once with an `ONLY_IN_CLOUD` model and labels the result
  **"Cloud fallback"** with the reason. This is the only label MEETOS adds itself.

## Android implementation (`apps/android/.../ai/HybridAi.kt`)

```kotlin
Firebase.ai(backend = GenerativeBackend.googleAI()).generativeModel(
    modelName = "gemini-3.5-flash-lite",
    generationConfig = generationConfig { responseMimeType = "application/json" },
    onDeviceConfig = OnDeviceConfig(mode = InferenceMode.PREFER_ON_DEVICE, maxOutputTokens = 1024, temperature = 0.2f),
)
```

- **Reported source:** `GenerateContentResponse.inferenceSource` (`InferenceSource.ON_DEVICE / IN_CLOUD`).
- **Status / download:** `model.onDeviceExtension?.checkStatus()` and `.download()` (Flow of `DownloadStatus`).
- `PREFER_ON_DEVICE` on Android falls back to the cloud model when the on-device model throws;
  the response then reports `IN_CLOUD`, which is what MEETOS shows.
- On-device structured output on Android requires KSP `@Generable` classes; MEETOS instead
  constrains the format in the prompt and validates strictly on the client (same contract as web).
- Android on-device inference is **experimental** and only available on supported devices.

## Validation and grounding (shared by both platforms)

Implemented in `packages/shared` (TypeScript) and `apps/android/.../analysis` (Kotlin port):

1. **Chunking** — transcripts are split on line boundaries into bounded chunks with one line of
   overlap, so each prompt fits the small on-device context window.
2. **Commitment Graph retrieval** — before each chunk is analysed, earlier open commitments the
   chunk plausibly mentions are retrieved lexically (no AI) and given to the model as `C1…Cn`.
   Updates referencing refs the model made up are discarded.
3. **Schema validation** — lenient parsing (tolerates code fences), strict field validation;
   invalid entries are dropped individually rather than failing the chunk.
4. **Evidence grounding** — every decision, commitment, question, risk and update must quote
   the transcript. Exact matches are kept; light paraphrases are replaced by the real
   transcript line; anything else is discarded and counted.
5. **Owners** — accepted only if the person is a participant, a speaker, or literally named in
   the chunk; "I" resolves to the speaker of the evidence line.
6. **Deadlines** — resolved deterministically from the spoken phrase relative to the meeting
   date (chrono-node on web; a java.time parser on Android). Phrases not in the transcript are dropped.
7. **Merging** — duplicates across chunks are merged; a "new" commitment that restates an
   existing open one by the same person becomes an update on the existing commitment.
8. **Completion** — a "completion_claim" only sets `pendingCompletion`; a person must confirm.
   Firestore rules reject `status: completed` without `completion.confirmedBy == request.auth.uid`.

## Privacy

- Transcripts are stored only in the user's workspace (Firestore), readable only by members.
- Audio is never stored. Live transcription is done by the browser's / phone's speech service.
- On-device extraction keeps transcript chunks on the device for analysis.
- Cloud processing sends chunks (≤ ~3,000 chars) or, for Memory/Prepare, only retrieved excerpts.
- Users can disable cloud processing entirely (Settings → AI & privacy).
