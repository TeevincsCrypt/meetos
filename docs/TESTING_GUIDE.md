# Testing guide — every feature, step by step

Use this to check the live site (`https://usemeetos.vercel.app`) before recording the demo or
submitting. Each step says what to do and what you should see (✅). If something doesn't match,
take a screenshot of the whole screen and note the step number.

**You need:** desktop Chrome, your Google account, and a second email address you can open
(for the invite tests). About 60–90 minutes for everything; sections 1–7 (about 30 minutes) cover
what the judges will see.

**Test data (all fictional):**

| File | What it is |
|---|---|
| [`DEMO_TRANSCRIPTS.md`](DEMO_TRANSCRIPTS.md) | Meetings 1 and 2: kickoff (16 Nov) and weekly sync (23 Nov) |
| [`test-data/website-relaunch-readiness-review.txt`](test-data/website-relaunch-readiness-review.txt) | Meeting 3: a long 6-person meeting (24 Nov) for the **Upload file** test |

To download the .txt from GitHub: open the file on github.com → **Download raw file** (the
download icon at the top right of the file).

---

## 0. Before you start

1. Open the site, sign in, go to **Settings → AI & privacy**.
2. **App Check** card → **Test App Check**.
   ✅ Green: "App Check works".
3. **Where AI runs** → choose **Hybrid — on-device first (recommended)**.
4. **This device** card: note what it says (e.g. "not supported on this device" or "ready").
   This decides whether results say **On this device** or **In the cloud** — both are correct as
   long as they match.

---

## 1. Accounts and sign-in

1. Sign out (avatar menu, top right) → sign in again with **Google**.
   ✅ You land in your workspace.
2. In a **private/incognito window**, open the site → **Create an account** with your second
   email and a password.
   ✅ A banner asks you to verify your email. Open the email, click the link, reload.
   ✅ The banner disappears.
3. Sign out of that account. On the sign-in page, type the email and click **Forgot password**.
   ✅ A message says a reset email was sent; the email arrives.
4. Keep the incognito window — you'll use the second account in section 10.

## 2. Workspace basics

1. **Settings → Workspace**: rename the workspace, **Save**.
   ✅ The new name shows in the workspace switcher (top bar).
2. **Settings → Projects → New project**: name it `Website relaunch`, pick a colour, **Create**.
   ✅ It appears in the list.
3. **Settings → Profile**: switch **Dark** theme on, then back to **Light**.
   ✅ The whole app changes colour; text stays readable.
4. Press **Ctrl+K** (Cmd+K on Mac).
   ✅ The search box opens. Press Esc to close.

## 3. Meetings: three ways to add one

### 3a. Paste — meeting 1
1. **New meeting → Paste transcript**.
2. Title `Website relaunch kickoff`, Date & time **16 Nov 2026, 10:00**, Project
   `Website relaunch`.
3. Paste meeting 1 from `DEMO_TRANSCRIPTS.md`.
   ✅ A hint lists 4 speakers who aren't participants yet → click **Add as participants**.
4. **Save meeting**.
   ✅ The meeting page opens with an **Analyse this meeting** panel.

### 3b. Paste — meeting 2
Same steps with meeting 2: title `Website relaunch weekly sync`, **23 Nov 2026, 10:00**, same
project. Don't analyse yet.

### 3c. Upload file — meeting 3 (the long one)
1. **New meeting → Upload file** → choose `website-relaunch-readiness-review.txt`.
2. Title `Website relaunch launch readiness review`, **24 Nov 2026, 15:00**, same project.
   ✅ The transcript fills in; **Add as participants** offers 6 people (Ada, Priya, Marcus,
   Grace, Sam, Tunde). Add them.
3. **Save meeting**. Don't analyse yet.

### 3d. Schedule only
1. **New meeting → Schedule only**: title `Website relaunch check-in`, **1 Dec 2026, 10:00**,
   same project, participants Ada Mensah and Tunde Bello → **Schedule meeting**.
   ✅ It shows as upcoming (no transcript). You'll use it in section 8.

### 3e. Live capture (consent)
1. **New meeting → Record now**, title `Mic test` → **Continue to recording**.
   ✅ A **Consent required** step appears; **Start recording** is disabled until you tick the
   consent box.
2. Tick consent → **Start recording** → allow the microphone → say a couple of sentences.
   ✅ A recording indicator is visible; your words appear in **Live transcript**.
   Try **Pause** and **Resume**.
3. **End & save**. ✅ The meeting page opens with your transcript. You'll delete it in 3g.

### 3f. List, search and filters
1. **Meetings**: ✅ all meetings are listed, newest first.
2. Search `bakery`. ✅ Only the relaunch meetings match.
3. Filter by project `Website relaunch`. ✅ Only those meetings.

### 3g. Edit, archive, delete
1. Open `Mic test` → **⋯ (More actions) → Edit details** → change the title → **Save**. ✅ Updated.
2. **⋯ → Archive**. ✅ It moves to the **Archived** tab of Meetings.
3. Open it from Archived → **⋯ → Delete meeting…** → confirm. ✅ It's gone.

## 4. AI analysis

### 4a. Meeting 1
1. Open `Website relaunch kickoff` → **Analyse**.
   ✅ "Analysed 1 of 1", then **Done**. The result shows where it ran (**On this device**,
   **In the cloud**, or **Cloud fallback**) — it must match section 0.
2. Check the tabs:
   - **Summary**: a short summary of the kickoff.
   - **Decisions** (2): photo-led homepage, *agreed by Grace Kim, Tunde Bello, Sam Ortiz*;
     launch date December 4.
   - **Commitments** (about 5): Grace homepage design → **Fri 20 Nov**; Tunde ordering page →
     **Wed 25 Nov**; Sam newsletter → **Thu 26 Nov**; Ada menu prices → **Tue 17 Nov**;
     Ada check gift cards with the owner.
   - **Questions**: gift cards at launch; who takes the menu photos.
   - **Transcript**: click a commitment's evidence → ✅ it points at the exact line.
3. If the panel says some items were **discarded** because evidence wasn't found, that's the
   grounding check working (nothing un-quoted is saved).

### 4b. Meeting 2 (Commitment Graph)
1. Open `Website relaunch weekly sync` → **Analyse**.
   ✅ **Commitments** tab has **Earlier commitments discussed here**:
   - Homepage design — **says done** (needs confirmation)
   - Ordering page — **blocked** (no menu prices), deadline moved to **Fri 27 Nov**
   - Menu prices — mentioned again (overdue)
   - Newsletter — progress, on track
2. **Decisions** tab: ✅ "launch December 9" and "gift cards wait until January".

### 4c. Meeting 3 (long, 5 parts)
1. Open `Website relaunch launch readiness review` → **Analyse**.
   ✅ Progress shows **5 parts**, each with its own status and source label.
2. ✅ Expect roughly:
   - **Decisions**: pay at pickup under $50 / online above; allergens are a launch requirement;
     seasonal switch after launch; 10% launch discount for the first week; gift cards move to
     **February**.
   - **New commitments** with dates, e.g. Priya sends documents (**Wed 25 Nov**), Marcus payment
     integration (**Thu 3 Dec**), Tunde + Marcus checkout test (**Fri 4 Dec**), Grace menu photos
     (**Sat 28 Nov**), Priya allergen list (**Fri 27 Nov**), Grace allergen icons (**Thu 26 Nov**),
     Sam flyer (**Tue 1 Dec**), Sam countdown posts (**Wed 2 Dec**), Marcus discount code
     (**Mon 7 Dec**), Marcus uptime monitoring (**Sat 5 Dec**), Grace button contrast
     (**Wed 25 Nov**), Tunde pickup slot limit (**Fri 27 Nov**).
   - **Earlier commitments**: menu prices **says done**; newsletter date update **says done**;
     ordering page progress; menu photos **deadline moved** (Thursday → Saturday).
   - **Questions**: cookie banner; who answers contact-form emails.
   - **Risks & blockers**: payment verification; domain transfer.
3. Things that should **not** appear as commitments:
   - Sam's "I could maybe look at them sometimes" (not a promise).
   - Anything for Jordan at the print shop (not in the meeting).
   - The cinnamon roll chat.

The AI chooses what to extract, so details can differ — but every saved item must quote the
transcript, owners must be real participants, and dates must come from spoken words.

### 4d. Re-analyse keeps your edits
1. In meeting 1, open a commitment and change its title (section 5, step 4) → go back to the
   meeting → **Re-analyse**.
   ✅ Your edited commitment keeps your title; untouched AI items are refreshed.

## 5. Commitments

1. **Commitments** page: ✅ all commitments with owner, deadline, status, priority.
2. Filters: **Everyone → Grace Kim**; then project; then search `menu`. ✅ The list narrows.
3. Open **Ordering page** (Tunde).
   ✅ **Commitment Graph** shows the origin meeting and later meetings in order.
   ✅ **Timeline** shows Created → Blocker → Deadline moved (→ Progress), each with a quote.
4. **Edit** → change priority to High → **Save changes**. ✅ Saved; the timeline records it.
5. **Add note** → type a progress note → save. ✅ It appears on the timeline.
6. Open **Homepage design** → ✅ "A later meeting says this is done. Confirm?" → confirm it
   (**Confirm completed**).
   ✅ Status **Completed — Confirmed by you**. The AI never marks anything done by itself.
7. **Add commitment** (Commitments page): `Order business cards`, owner Ada Mensah, a deadline →
   save. ✅ It appears in the list.
8. Delete that test commitment (trash icon on its page) → confirm. ✅ Gone.

## 6. Decisions

1. **Decisions** page: ✅ decisions from all three meetings.
2. Open **Launch on December 4**. ✅ Marked **Superseded**, linking to **December 9**.
3. **Gift cards wait until January** → ✅ superseded by **gift cards move to February**.
4. Filter **Status → Needs confirmation** (if any) → **Confirm decision** on one. ✅ It becomes Active.
5. **Record decision** → add a manual one (e.g. `Use the Elm Street print shop`) → save. ✅ Listed.
6. Search `pickup`. ✅ The pay-at-pickup decision.

## 7. Memory (ask questions)

Ask each and check the answer cites meetings (with dates) you can click:
1. `What happened to the launch date?` ✅ Dec 4 → moved to Dec 9, with reasons.
2. `Why is the ordering page late?` ✅ Missing menu prices, then payment verification.
3. `What did we decide about gift cards?` ✅ January, then February.
4. `Who is responsible for payments?` ✅ Marcus Lee.
5. `What did we decide about the office parking?` ✅ **Not found in your workspace** and
   **No AI used** — it doesn't make things up.

## 8. Prepare for a meeting

1. **Prepare** → choose `Website relaunch check-in` (1 Dec).
   ✅ **Outstanding commitments**, **Blocked**, **Needs confirmation** and **Last time** are
   filled from your real records (Ada's and Tunde's items first).
2. **Generate**. ✅ An AI-suggested agenda (cloud label).
3. **Use the rule-based agenda instead**. ✅ An agenda built without AI.
4. Edit an item, reorder with the arrows, **Add item**, **Save agenda**. ✅ Saved; reload keeps it.

## 9. Overview, Daily Brief and Execution

1. **Overview** (dashboard): ✅ **MEETOS Daily Brief** lists overdue / due soon / blocked /
   reported-done items from your data. Click **AI summary** ✅ a short wording of those facts.
2. **Execution**: ✅ completion rate, overdue, blocked, by owner, per week; **Repeatedly
   postponed** and **Gone quiet** lists if they apply. Change the owner/project filters.
   ✅ Numbers change and match the Commitments page.

## 10. Team: invites, roles, privacy

1. **Settings → Members → Invite**: your second email, role **Member** → Invite.
   ✅ Listed as pending.
2. In the incognito window, sign in with the second (verified) account.
   ✅ The setup screen shows the invitation → join it.
   ✅ The second account sees the same meetings and commitments.
3. As the owner, change their role to **Admin**, then back. ✅ Updates.
4. As the second account, open **Settings → Data**.
   ✅ It says only the workspace owner can delete the whole workspace.
5. As the second account, **Create another workspace** → it's empty.
   ✅ The owner account can't see it (switcher doesn't list it).
6. As the owner, **Settings → Members** → the remove icon (person with a minus) next to them. ✅ The second account loses access after a reload.

## 11. AI & privacy settings

1. **Settings → AI & privacy → On-device only**. Re-analyse a meeting.
   - If this device has no built-in model: ✅ a clear message that it can't run on this device
     and nothing was sent to the cloud.
   - If it has one: ✅ results say **On this device**.
2. **Cloud only** → analyse → ✅ results say **In the cloud**.
3. Switch back to **Hybrid — on-device first (recommended)**.
4. Chrome with built-in AI only: **This device → Download on-device model** → ✅ progress, then
   "ready"; re-analyse → ✅ **On this device**.

## 12. Phone layout

Open the site on your phone (or Chrome → F12 → device toolbar):
✅ Bottom tab bar (Overview, Meetings, Commitments, Decisions, Memory); no sideways scrolling;
meeting pages, commitment timeline and settings are readable.

## 13. Clean-up (optional, destructive)

Only at the end, and only in a workspace you don't need:
**Settings → Data → Delete this workspace** → confirm. ✅ Everything in it is gone.
Don't delete the workspace you'll use for the demo video.

## 14. Android (optional)

See `apps/android/README.md`. Check: sign in, the same meetings appear, analyse a meeting
(labels show on-device or cloud), live capture asks for consent.

---

## What to send if something's wrong

- The step number (e.g. "4c.2").
- A screenshot of the whole screen, including any red/yellow message.
- For AI results: a screenshot of the meeting's **AI processing** card and the tab that looks wrong.
