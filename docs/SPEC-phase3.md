# 3aash Ya Wa7sh — Accounts, Program Tracker & Coach Console: Build Spec for Claude Code

Oct 5, 2026 · @Ahmed Amrousy

## 1. Mission for Claude Code

Add participant accounts, a personal program tracker and a coach console to the existing site at `https://ahamrousy.github.io/3aash-ya-wa7sh/` (repo `ahamrousy/3aash-ya-wa7sh`), without breaking the six-step intake form.

How to use this doc: paste it into Claude Code from the repo root, or save it as `docs/SPEC-phase3.md` and tell Claude Code to read it. Before writing code, Claude Code must:

1. Read `README.md`, `apps-script/Code.gs`, `app.js`, `checkin.js`, `common.js`, `config.js`, `i18n.js`, `styles.css` in full.
2. Reply with a short implementation plan and a list of any conflicts it found between this spec and the code. Wait for approval.
3. Work on a branch `phase-3-accounts`, one commit per build step (section 10), and stop after each step for me to test.

The outcome in one line: a person registers, gets a login (mobile number + default password 12345678), is forced to set a new password, and sees "your coach is preparing your program" until I publish a plan; then they tick off sessions, and I see every participant's progress in a coach console.

The coach (me) stays in the loop: the system never generates a plan automatically. I write each plan (with Claude's help in a separate chat), paste it into the coach console, review it and publish it.

## 2. Current system (as analysed on 5 Oct 2026)

The site is a static, no-build GitHub Pages front end that POSTs JSON to one Google Apps Script Web App, which writes to a private Google Sheet. Keep this stack: no new server, database, framework, npm build or paid service.

| Part | What it does today | Keep / change |
| --- | --- | --- |
| `index.html` + `app.js` | Six-step bilingual intake (contact, objective, body, activity, availability, PAR-Q + consent), review screen, confirmation with `AYW-YYYY-NNNN` ID | Keep. Add account details to the confirmation screen |
| `checkin.html` + `checkin.js` | Weekly check-in (weight, waist, sessions, best effort, energy, notes); identity = participant ID + WhatsApp; send-only | Fold into the tracker (logged-in). Keep the old URL as a redirect to `login.html` |
| `common.js` | i18n, safe storage, `AYW.post()` using `text/plain` to avoid CORS preflight | Keep. Add a session helper (section 7) |
| `config.js` | Endpoint URL, contact details, timings | Add new settings only; no secrets |
| `i18n.js` | Every string, Arabic + English | Add all new strings here, both languages |
| `apps-script/Code.gs` | `doPost` routes `type: 'intake'` / `'checkin'`; honeypot + min-time spam gates; `LockService`; token de-dupe; formula-injection guard `clean_()`; coach email via `MailApp`; tabs `Submissions`, `Checkins`, `Dashboard` | Extend with the actions in section 6; keep every existing guard |
| `privacy.html`, `README.md`, `TEST-CHECKLIST.md` | Policy (Egypt PDPL 151/2020), setup guide, tests | Update (section 9) |

Design rules the current code follows and the new code must follow too:

- Arabic first, RTL, `dir` switched by `AYW.setLang`; fonts Noto Naskh Arabic (headings) and Noto Sans Arabic; brand colour `#394F9F`; light and dark themes from the tokens in `styles.css`; respect `prefers-reduced-motion`.
- Personal data never in a URL or query string; everything travels in the POST body.
- The browser is never trusted: every value is re-validated and passed through `clean_()` in `Code.gs`.
- BMI and waist-to-height are coach-only; never shown to the participant.
- No analytics, trackers or third-party scripts beyond Google Fonts.
- After any `.js`/`.css` change, bump the `?v=` cache-buster on every page (currently `v=3`, go to `v=4`).

One README line changes meaning: it says there is "deliberately no staff login page". Phase 3 adds one (the coach console). Update that line and explain why it is safe (section 4).

## 3. User journeys

Two roles: the participant (one account per mobile number) and the coach (me; one admin account, more coaches later).

### Participant

1. Fills the intake form as today. On submit, the server creates the account in the same transaction as the `Submissions` row.
2. The confirmation screen shows their participant ID, their username (the mobile number in `+20XXXXXXXXXX` form), the default password `12345678`, and a "Go to my tracker" button.
3. First login on `login.html`: username + `12345678`. The server accepts it only while `must_change_password = TRUE`, then forces `change-password.html` before anything else loads.
4. Until I publish a plan, `tracker.html` shows a friendly waiting state: "your coach is reviewing your data and preparing your program", with the expected response time from `config.js`.
5. After I publish: the tracker shows the program by week, each session as a card (title, type, details, targets). For each session they mark Done / Partly done / Skipped, and optionally log actual duration or distance, effort 1–10 and a note.
6. A progress header shows: current week of total, sessions done of sessions planned so far, adherence %, and a streak. A weekly check-in form (the current check-in fields) sits in the tracker, pre-identified by the session, no ID typing.
7. Forgot password: a link on the login page opens WhatsApp to the coach number with a prefilled request. The participant cannot reset by themselves (no SMS service).

### Coach

1. Logs in on `coach.html` with the admin account (separate from participants).
2. Sees a participant list: name, ID, objective, joined date, status (Awaiting plan · Active · Paused · Completed), last activity, adherence %, flags (needs medical clearance, under 18).
3. Opens a participant: full intake (including BMI and waist-to-height), check-in history with weight and waist trend, and the program grid with every session's status and log.
4. "Copy brief for Claude": copies the participant's intake summary plus the plan format in section 8 to the clipboard. I paste it into a Claude chat, get back plan JSON, and paste that into "Import plan".
5. Import plan validates the JSON, shows a preview exactly as the participant will see it, then Publish. If the participant is flagged for medical clearance, Publish is blocked until I tick "Clearance received".
6. After publish: a "Notify on WhatsApp" button opens `wa.me` with a prefilled Arabic message to the participant.
7. Edit a published plan: import a new version; logs on sessions whose `session_id` still exists are kept.
8. Reset password: generates a one-time link, valid 48 hours, and opens WhatsApp with it prefilled (and a Copy button). Also: change status, add coach notes, unlock a locked account.

## 4. Accounts and security rules

Every account starts with the same default password, `12345678`, so the rules below force a change at first login and keep the default short-lived. Usernames and passwords use Latin characters only: no Arabic letters or digits in either.

### Username

- Username = the intake WhatsApp number in E.164, digits only after the `+`, no spaces. Egypt: `+20` followed by 10 digits, e.g. `+201001240186`. Other countries keep their own code, e.g. `+9665XXXXXXXX`.
- Normalise everywhere with one shared function (front end and `Code.gs`): convert Arabic-Indic digits typed on an Arabic keyboard (٠–٩) to 0–9, strip spaces and dashes, drop a leading `0` after `+20` (`+20 01001240186` → `+201001240186`), accept `00` as `+`. The stored username is always ASCII.
- The login screen uses the same country-code selector + number field as the intake form, defaulting to `+20`. Both credential fields are `dir="ltr"`, even on the Arabic page.
- One account per number. If an intake arrives with a number that already has an account, reject it with `phone_exists` and show: "this number is already registered — log in, or contact the coach on WhatsApp".

### Default password

- Every new account (from intake or from the migration) gets the default password `12345678`, stored hashed like any other password. It is never stored in plain text.
- Keep the value in the Script Property `DEFAULT_PASSWORD` (set to `12345678`) rather than hard-coding it, so it can be changed later without a code change.
- The confirmation screen and the coach's welcome WhatsApp say: username = your mobile number, password = `12345678`, and you will be asked to change it.
- The default works only while `must_change_password = TRUE` and for 14 days after the account is created. After that, login returns `initial_expired` and tells them to ask the coach for a reset link.
- Known risk: the default is the same for everyone, so anyone who knows a registered number could sign in before its owner does. Mitigations: forced change on first login, the 14-day expiry, lockout, and a "default password still active" flag on each participant in the coach console so I can nudge them.

### First-login change

- A login with `must_change_password = TRUE` returns a restricted session that can only call `change_password`.
- New password: 8–64 characters, printable ASCII only (A–Z, a–z, 0–9 and symbols). Reject Arabic or any other non-ASCII character with a clear message, in the browser and again in `Code.gs`. It must not be `12345678` and must not contain the phone digits. Ask for it twice. Show/hide toggle. Fields use `dir="ltr"`, `autocapitalize="off"`, `spellcheck="false"`.
- On success: `must_change_password = FALSE`, `password_changed_at` set, all other sessions for that user revoked, a full session issued.

### Reset link (coach-initiated)

- Coach clicks Reset → server creates a random 32-byte token, stores only its SHA-256 hash with a 48-hour expiry, and returns the link `https://ahamrousy.github.io/3aash-ya-wa7sh/reset.html#t=<token>`.
- The token goes in the URL fragment (`#`), never the query string, so it is not sent to any server log. `reset.html` reads it, removes it from the address bar with `history.replaceState`, and POSTs it.
- The link is single-use. Using it sets a new password (same rules) and revokes all sessions. A new reset revokes older unused links.

### Passwords, sessions, lockout

- Store passwords as salted, iterated SHA-256 via `Utilities.computeDigest`: 16-byte random salt per user, 5,000 iterations, plus a pepper kept in Script Properties (`PEPPER`), never in the sheet or repo. Store `algo`, `iterations`, `salt`, `hash` so the cost can be raised later. Compare in constant time.
- Sessions: random 32-byte token returned to the browser and kept in `localStorage` (`ayw.session`); the server stores only its hash. Lifetime 30 days for participants, 12 hours for the coach, sliding on use. Logout revokes it. Cache valid sessions in `CacheService` for 10 minutes to keep calls fast.
- The token travels in the POST body (`session` field), never in a URL.
- Lockout: 5 failed logins on one username → locked 15 minutes; 20 failures in a day → locked until the coach unlocks. Log every login, failure, reset and password change to `AuthLog` (no passwords, no tokens).
- Errors never reveal whether a username exists: wrong number and wrong password both return `bad_credentials`.

### Coach account

- One admin account, created by running `setCoachPassword('...')` once from the Apps Script editor. Username (my email) and password hash live in Script Properties (`COACH_USERNAME`, `COACH_HASH`), never in the sheet or the repo.
- Every coach action checks `role = coach` on the server. The participant API never returns another participant's data; every participant query is scoped to the session's `participant_id`, never to an ID sent by the browser.

## 5. Data model (new Google Sheet tabs)

Add seven tabs, built by extending `setup()`. Keep `Submissions`, `Checkins` and `Dashboard` as they are; add `username` to `Checkins` only if needed. `participant_id` is the join key everywhere. Store every text value through `clean_()`.

| Tab | Columns (left to right) | Notes |
| --- | --- | --- |
| `Users` | `participant_id`, `username`, `name`, `role`, `status`, `pw_algo`, `pw_iter`, `pw_salt`, `pw_hash`, `must_change_password`, `created_at`, `initial_expires_at`, `password_changed_at`, `failed_count`, `locked_until`, `last_login_at` | `status`: `awaiting_plan` · `active` · `paused` · `completed`. New accounts store the hash of the default password with `must_change_password = TRUE`. Protect this tab (editor-only) and hide the hash columns |
| `Sessions` | `token_hash`, `participant_id`, `role`, `scope`, `created_at`, `expires_at`, `last_seen_at`, `revoked` | `scope`: `full` or `change_password_only` |
| `ResetTokens` | `token_hash`, `participant_id`, `created_by`, `created_at`, `expires_at`, `used_at` |  |
| `Plans` | `plan_id`, `participant_id`, `version`, `title`, `start_date`, `weeks`, `status`, `coach_note`, `created_at`, `published_at`, `clearance_confirmed` | `status`: `draft` · `published` · `archived`. One `published` plan per participant at a time |
| `PlanSessions` | `plan_id`, `participant_id`, `session_id`, `week`, `day`, `date`, `order`, `title`, `type`, `details`, `target_duration_min`, `target_distance_km`, `target_intensity`, `target_reps` | One row per session so I can read and edit plans in the sheet |
| `SessionLogs` | `log_id`, `participant_id`, `plan_id`, `session_id`, `status`, `actual_duration_min`, `actual_distance_km`, `effort_1_10`, `note`, `logged_at`, `updated_at` | `status`: `done` · `partial` · `skipped`. Latest row per `session_id` wins; edits update in place |
| `AuthLog` | `timestamp`, `username`, `event`, `result`, `detail` | `event`: `login`, `change_password`, `reset_created`, `reset_used`, `lockout`, `unlock` |

Plan versioning: publishing version 2 archives version 1. `session_id` values are stable strings from the plan JSON (e.g. `w1d2`), so a log for `w3d1` in v1 still appears on `w3d1` in v2. Logs whose `session_id` no longer exists stay in the sheet and show in the coach view under "from earlier plan versions".

Extend the `Dashboard` tab (or add `Dashboard2`) with: plan status, sessions planned to date, done, partial, skipped, adherence % = (done + 0.5 × partial) ÷ planned to date, last log date.

## 6. API contract (Apps Script)

All calls stay `POST` to the existing endpoint with `Content-Type: text/plain` and a JSON body; route on `body.type`. Replies are `{ok:true, ...}` or `{ok:false, error:'<code>'}`. The honeypot and minimum-time gates apply to `intake` and `checkin` only, not to auth or tracker calls (they would break normal use); auth calls rely on lockout instead.

| `type` | Who | Body | Returns |
| --- | --- | --- | --- |
| `intake` (changed) | public | as today | adds `username`; creates `Users` row in the same lock; `phone_exists` if taken |
| `login` | public | `username`, `password` | `session`, `scope`, `must_change_password`, `name`, `lang`; or `bad_credentials` · `locked` · `initial_expired` |
| `change_password` | session (either scope) | `session`, `current_password`, `new_password` | new full `session` |
| `reset_verify` | public | `token` | `ok` + first name only, or `reset_invalid` |
| `reset_complete` | public | `token`, `new_password` | `session` |
| `logout` | session | `session` | `ok` |
| `me` | participant | `session` | name, participant ID, status, start date, published plan (title, weeks, sessions grouped by week), all of their own logs, progress stats, last 12 check-ins |
| `log_session` | participant | `session`, `session_id`, `status`, optional actuals, `effort_1_10`, `note`, `submission_token` | updated log + stats |
| `checkin` (changed) | participant | `session` + current check-in fields | as today; identity taken from session, not from ID + WhatsApp |
| `coach_login` | public | `username`, `password` | coach `session` |
| `coach_list` | coach | `session`, optional filter | participant rows for the list view (section 3) |
| `coach_get` | coach | `session`, `participant_id` | full intake incl. BMI, check-ins, plan, logs, whether the default password is still active, auth status |
| `coach_brief` | coach | `session`, `participant_id` | plain-text brief for Claude (intake summary + section 8 format) |
| `coach_plan_validate` | coach | `session`, `participant_id`, `plan_json` | list of errors, or the normalised plan for preview |
| `coach_plan_publish` | coach | `session`, `participant_id`, `plan_json`, `clearance_confirmed` | `plan_id`, `version`; sets user `status = active` |
| `coach_reset_link` | coach | `session`, `participant_id` | `reset_url`, `expires_at`, `whatsapp_url` |
| `coach_update_user` | coach | `session`, `participant_id`, `status` / `coach_note` / `unlock` | updated row |

Rules for every handler:

- Resolve the session first; the participant ID comes from the session row, never from the body (except coach actions, which check `role = coach`).
- Use `LockService` on every write. Re-use the existing `submission_token` de-duplication for `log_session` and `checkin`.
- Keep reads fast: read whole ranges once per request, filter in memory, and cache session lookups. Target under 3 seconds per call.
- Apps Script returns HTTP 200 even on errors; keep reporting errors in the JSON as today.
- Keep `doGet` as a health check only. No participant data ever via GET.
- `notifyCoach_` email stays; add the participant's username to it.

## 7. Front-end pages

Plain HTML/CSS/JS in the existing style: same header, logo, language toggle, footer, tokens, fonts and component classes (`field`, `input`, `chip`, `card`, `callout`, `scale`). Mobile first (most users open from WhatsApp on a phone), 44 px tap targets, works on a 360 px screen. Every string in `i18n.js` in Egyptian Arabic and English.

| File | Purpose |
| --- | --- |
| `login.html` + `login.js` | Country code + number, password, show/hide, "Forgot password?" (opens `wa.me/<contactWhatsapp>` with a prefilled Arabic request), link to registration. Redirects to `change-password.html` or `tracker.html` |
| `change-password.html` + `.js` | Current password (on first login this is 12345678), never written to storage, new password twice, rule checklist that ticks live |
| `reset.html` + `.js` | Reads `#t=` token, verifies, greets by first name, sets new password, logs in |
| `tracker.html` + `tracker.js` | Waiting state before a plan; after: progress header, week tabs (current week open by default), session cards, log sheet, weekly check-in, logout |
| `coach.html` + `coach.js` | Coach login, participant list with search and status filter, participant detail, plan import/preview/publish, reset link, notify buttons |
| `checkin.html` | Replace with a short page that redirects to `login.html` (keeps old links working) |
| `common.js` | Add `AYW.session` (get / set / clear in `localStorage`), `AYW.call(type, body)` that adds the session token and sends to `login.html` on `session_expired`, and `AYW.normalisePhone()` |
| `index.html` / `app.js` | Confirmation screen: show ID, username, default password `12345678`, "Go to my tracker" button. Handle `phone_exists`. Add a "Log in" link in the header and footer |

Tracker details:

- Session card: day label (and date if the plan has a `start_date`), title, type icon (run, swim, bike, strength, walk, mobility, rest, other), details, targets. Status pill: not yet · done · partly · skipped.
- Tapping a card opens a bottom sheet: three status buttons, optional actual minutes and km, effort 1–10 scale, note (max 300 chars), Save. Saving is optimistic with a retry message on failure.
- Progress header: "Week 3 of 8", sessions done / planned to date, adherence %, current streak of weeks with ≥ 80% done. No body scores, no BMI.
- Weight and waist from check-ins may be shown to the participant as their own simple trend line (inline SVG, no chart library), with no labels judging the body.
- Rest days render as a calm card with no logging.

Coach console details:

- List sorted by "Awaiting plan" first, then by last activity. Red badge for medical clearance, amber for under 18.
- Detail view: intake grouped as in the form, check-in table and trend, program grid (weeks × sessions, colour by status, hover/tap for the log), coach notes.
- Plan import: a large textarea, Validate (shows errors with line hints), Preview (renders the participant tracker inside the console), Publish. "Copy brief for Claude" button above it.
- Never render participant text with `innerHTML`; use `textContent` (as `AYW.el` already does).
- `coach.html` gets `<meta name="robots" content="noindex">` and is not linked from public pages.

## 8. Plan JSON format

This is the exact format I will paste into the console. `coach_plan_validate` must accept it, reject anything else with clear messages, and the `coach_brief` text must include this format so Claude produces it directly.

```json
{
  "format": "ayw-plan-v1",
  "participant_id": "AYW-2026-0007",
  "title": { "ar": "برنامج 8 أسابيع — أول 5 كم", "en": "8 weeks — first 5 km" },
  "start_date": "2026-10-12",
  "weeks": 8,
  "coach_note": { "ar": "ابدأ هادي...", "en": "Start easy..." },
  "sessions": [
    {
      "session_id": "w1d1",
      "week": 1,
      "day": 1,
      "type": "run",
      "title": { "ar": "جري ومشي", "en": "Run-walk" },
      "details": { "ar": "8 مرات: دقيقة جري + دقيقتين مشي", "en": "8 x (1 min run + 2 min walk)" },
      "target_duration_min": 30,
      "target_distance_km": null,
      "target_intensity": "easy",
      "target_reps": null
    }
  ]
}
```

Validation rules:

- `format` = `ayw-plan-v1`; `participant_id` must match the participant being edited.
- `weeks` 1–52; `start_date` optional ISO date; if present, each session's date = start_date + (week − 1) × 7 + (day − 1).
- `session_id` unique, pattern `^w\d{1,2}d[1-7](-\d)?$` (the `-2` suffix allows two sessions on one day).
- `week` ≤ `weeks`; `day` 1–7; day 1 = the weekday of `start_date` (Saturday if there is no start date).
- `type` in `run`, `walk`, `swim`, `bike`, `strength`, `mobility`, `cross`, `rest`, `other`.
- `target_intensity` in `easy`, `moderate`, `hard`, `race`, or null.
- Titles and details: Arabic required, English optional (fall back to Arabic); max 80 / 600 chars; strip HTML.
- Max 400 sessions per plan.

## 9. Migration, privacy text and docs

### Existing participants

Add `migrateExistingParticipants()` to `Code.gs`, run once from the editor. For every `Submissions` row with no `Users` row: create the account with the default password 12345678, `status = awaiting_plan`, and a fresh 14-day expiry. Skip and list any duplicate phone numbers in the execution log for me to resolve by hand. Make it safe to run twice.

Also add `createTestParticipant()` and `deleteTestParticipant()` helpers that create and remove an `AYW-9999-0001` account across all tabs, for testing (year 9999 keeps the existing ID pattern valid and never collides with real IDs).

### Privacy policy (`privacy.html` + `i18n.js`, both languages)

Add, in the same plain tone as today:

- You now get an account. Your username is your mobile number; you choose your own password, which we store only in scrambled (hashed) form and can never read.
- We store your program and what you log against it (sessions, effort, notes, check-ins). Only the coaching team sees it.
- Your browser keeps a login token so you stay signed in; logging out deletes it. No other cookies or tracking.
- Deleting your data also deletes your account, program and logs. Add `deleteParticipant(participant_id)` to `Code.gs` that removes the person from every tab, for when someone asks.

### README and test checklist

- Replace the "no staff login page" paragraph with a Phase 3 section: what was added, the new tabs, how to run `setup()`, `setCoachPassword()`, `migrateExistingParticipants()`, and how to redeploy (Deploy → Manage deployments → edit → New version, so the URL stays the same).
- Script Properties to set: `PEPPER`, `DEFAULT_PASSWORD` (= `12345678`), `COACH_USERNAME`, `COACH_HASH` (set by the helper). Never commit them.
- Add the acceptance tests from section 10 to `TEST-CHECKLIST.md`.

## 10. Build order, acceptance tests, guardrails

Build in six steps, one commit each; stop after each for me to deploy and test.

1. Backend foundations: new tabs in `setup()`, phone normalisation, hashing, sessions, lockout, `AuthLog`, `setCoachPassword()`, migration and test helpers.
2. Auth flow: `login`, `change_password`, `logout`, `reset_verify`, `reset_complete`; `login.html`, `change-password.html`, `reset.html`; intake creates the account; confirmation screen updated.
3. Tracker read-only: `me`, waiting state, plan rendering from a plan I add by hand in the sheet.
4. Tracker logging: `log_session`, bottom sheet, progress stats, check-in inside the tracker, `checkin.html` redirect.
5. Coach console: `coach_login`, list, detail, brief, validate, preview, publish, reset link, WhatsApp buttons, status and notes.
6. Privacy, README, test checklist, `?v=4` bump on every page, final pass on Arabic RTL and dark mode.

Acceptance tests (all must pass on a phone in Arabic and English):

- [ ] New intake with `01001240186` creates username `+201001240186`; confirmation shows it and the default password 12345678.
- [ ] Same number again → `phone_exists` message; no second row anywhere.
- [ ] Login with 12345678 works; any other page is blocked until the password is changed. A number typed in Arabic-Indic digits is accepted and normalised.
- [ ] After the change, 12345678 no longer works; the new password does. A new password with any Arabic character is rejected, in the browser and on the server.
- [ ] 5 wrong passwords → locked 15 minutes; message does not reveal whether the number exists.
- [ ] Default password unused for 14 days → `initial_expired`.
- [ ] Coach reset link works once, expires after 48 hours, and is gone from the address bar after load.
- [ ] Before publish, tracker shows the waiting state. After publish, sessions appear in the right weeks and dates.
- [ ] Logging done / partial / skipped updates stats immediately and appears in the coach view and the sheet.
- [ ] Publishing plan v2 keeps logs on matching `session_id`s.
- [ ] A participant session cannot fetch another participant's data by editing the request (try changing `participant_id` in the body).
- [ ] Medical-clearance participant: Publish is blocked until "Clearance received" is ticked.
- [ ] No personal data or tokens appear in any URL query string, the browser console, or the repo.
- [ ] Old `checkin.html` link redirects to login. Existing intake still works end to end.

Do not:

- Generate or suggest plans automatically anywhere in the product.
- Add any framework, build step, external script, analytics or new paid service.
- Store plain passwords anywhere, hard-code the default password (use the `DEFAULT_PASSWORD` property), or put secrets in the repo.
- Show BMI, waist-to-height or any body score to the participant.
- Change the intake questions or the `Submissions` column order.
- Deviate from this spec silently: list every deviation and why in the step's summary.
