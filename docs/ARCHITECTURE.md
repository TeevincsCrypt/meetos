# Architecture

```
meetos/
├─ apps/web/            Vite + React SPA (Firebase Hosting)
│  ├─ src/lib/          firebase init (Auth, Firestore, App Check, Remote Config, AI Logic)
│  │  └─ ai/            hybrid.ts (model routing + source reporting), pipeline.ts, memory.ts
│  ├─ src/data/         Firestore repositories (meetings, commitments, decisions, workspaces…)
│  ├─ src/state/        auth + workspace providers (realtime listeners)
│  ├─ src/pages/        screens
│  └─ e2e/              Playwright tests (+ LanguageModel test double)
├─ apps/android/        Kotlin + Compose app
│  ├─ app/src/main/java/com/meetos/android/{ui,data,ai,analysis,auth,speech}
│  └─ verify/           plain-JVM build that compiles/tests the analysis core
├─ packages/shared/     domain types, transcript chunking, grounding, linking, retrieval, metrics, samples
└─ firebase/            firestore.rules, firestore.indexes.json, rules tests
```

**Why a Vite SPA instead of Next.js:** every screen is behind authentication and all AI
inference must run in the browser (that's where Chrome's on-device model lives), so server
rendering adds no value. A static SPA deploys directly to Firebase Hosting.

## Firestore data model

```
users/{uid}                                  profile, lastWorkspaceId
workspaces/{wid}                             name, ownerId, roles{uid:role}, memberIds[], isDemo
  members/{uid}                              displayName, email, role mirror
  invites/{email}                            role, invitedBy
  projects/{pid}
  meetings/{mid}                             title, participants[], status, summary, topics[], risks[],
                                             followUps[], analysis{chunk sources…}, agenda[]
    content/transcript                       text, source   (kept out of list queries)
    segments/{n}                             live-capture segments, saved incrementally
  commitments/{cid}                          description, ownerName/ownerKey, deadline, originalDeadline,
                                             deadlineChangeCount, status, priority, originMeetingId,
                                             relatedMeetingIds[], meetingIds[], evidence[], pendingCompletion,
                                             completion{method:'user_confirmed', confirmedBy}, inferenceSource
    events/{eid}                             append-only timeline (created, mentioned, deadline_changed,
                                             completion_suggested, completion_confirmed, note…)
  decisions/{did}                            title, participants[], evidence[], alternatives[], status,
                                             relatedDecisionIds[], supersedes/supersededBy, confirmedBy
  questions/{qid}
  activity/{aid}                             append-only activity log
```

The **Commitment Graph** is relational: commitment → origin meeting, → related meetings
(`meetingIds` supports `array-contains` queries), → timeline events that each cite a meeting
and a transcript quote; decisions link to related/superseded decisions.

## Security rules highlights (`firebase/firestore.rules`)

- Only members (`roles[uid]` on the workspace) can read or write anything in a workspace.
- Only the owner changes roles; `roles` and `memberIds` must stay in sync.
- Invitees join with exactly the invited role, and only with a verified email.
- `status: completed` requires `completion.method == 'user_confirmed'` and `confirmedBy == request.auth.uid`.
- Decision confirmation can only be recorded in your own name.
- Timeline events and activity are append-only.
- 26 rules tests in `firebase/test/rules.test.ts`.

## Realtime + offline

- Web: Firestore persistent multi-tab cache; realtime listeners for the active workspace;
  cursor pagination on the Meetings list.
- Android: Firestore's built-in offline cache plus a Room cache of meeting/commitment lists
  shown while reconnecting.
- Workspace listeners ignore documents with pending local writes so subcollection listeners
  only start after the server has committed the workspace (otherwise rules would reject them).
