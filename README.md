# عاش يا وحش — participant intake site

A bilingual (Arabic RTL / English LTR) intake form for the **عاش يا وحش** initiative.
Participants fill in six short steps; the submission lands as one row in a Google
Sheet that only Dr. Ahmed Amrousy (founder) owns, and he gets an email. Programs
are designed and followed up by the team's professional coaches.

**Tagline:** ناس مننا مكملة في التغيير للأحسن
**Instagram:** [@3aashyawa7sh](https://instagram.com/3aashyawa7sh)

---

## How it is put together

```
   Browser (GitHub Pages, static)            Google (private to the founder)
   ┌──────────────────────────────┐          ┌────────────────────────────┐
   │ index.html  · the 6 steps    │  POST    │ Apps Script Web App        │
   │ login / change-password /    │ ───────► │  · validates everything    │
   │   reset · participant login  │   JSON   │  · makes the AYW-… ID      │
   │ tracker.html · own program   │ ◄─────── │  · accounts, sessions      │
   │ coach.html   · coach console │  {ok,…}  │  · plans, logs, check-ins  │
   │ i18n.js · config.js · …      │          │  · emails the founder      │
   └──────────────────────────────┘          └────────────────────────────┘
```

* **No build step.** Plain HTML, CSS and JavaScript. What is in the repository is
  what runs.
* **Nothing secret in this repository.** The only thing the browser knows is the
  Apps Script URL in `config.js`. It hands data back only to a signed-in
  participant (their own data) or to the signed-in coach.
* **The browser is never trusted.** Every field is re-validated, re-typed and
  trimmed inside `Code.gs` before it is written.
* **No analytics, no pixels, no third-party scripts** — the only external request
  is to Google Fonts for the Arabic typefaces.

### The files

| File | What it is |
|---|---|
| `index.html` | The welcome/privacy screen, the six-step form, the review and confirmation screens |
| `login.html` · `change-password.html` · `reset.html` | Participant login, the forced first-login password change, and coach-made reset links |
| `tracker.html` | The participant's own program, session log and weekly check-in |
| `coach.html` | The coach console (not linked from any public page) |
| `checkin.html` | Old check-in link — now just sends people to `login.html` |
| `privacy.html` | The full privacy policy |
| `styles.css` | All the styling. Light and dark, RTL and LTR, from one set of tokens |
| `config.js` | **The file you edit to go live.** Endpoint URL, contact details, wording of the response time |
| `i18n.js` | **Every word on the site**, Arabic and English side by side |
| `common.js` | Shared plumbing: language switching, translation lookup, the one function that posts to Apps Script |
| `app.js` | The intake form. The `SCHEMA` near the top defines every question |
| `login.js` · `change-password.js` · `reset.js` · `tracker.js` · `coach.js` | One script per page above |
| `plan-view.js` | Draws a program (used by the tracker and by the coach's preview) |
| `apps-script/Code.gs` | The back end. Paste this into Apps Script |
| `apps-script/tests/` | Offline tests and a local test server (developer tools, never deployed) |
| `TEST-CHECKLIST.md` | What to walk through before telling people about the link |

---

## Part 1 — set up the Google Sheet and the Apps Script

Do this first: the website has nowhere to send anything until it is done.

1. **Make the sheet.** Go to <https://sheets.new> while signed in as the founder.
   Name it something like `عاش يا وحش — participants`.
   **Do not share it with anyone.** It stays private; that is the whole promise
   made to participants.

2. **Open the script editor.** In that sheet: **Extensions → Apps Script**.

3. **Paste the code.** Delete whatever is in `Code.gs`, then paste the entire
   contents of `apps-script/Code.gs` from this repository. Save (Ctrl/Cmd + S).

4. **Set your email.** At the top of the file:

   ```js
   var COACH_EMAIL = 'coach@example.com';   // ← change to your address
   ```

   Nothing else needs changing.

5. **Run `setup()` once.** Pick `setup` from the function dropdown at the top of
   the editor and press **Run**. Google will ask you to authorise the script —
   this is your own script acting on your own sheet, so approve it. (You will see
   a "Google hasn't verified this app" screen: **Advanced → Go to … (unsafe)**.
   That warning is about unverified *publishers*, not about the code.)

   When it finishes, the sheet has three tabs: `Submissions`, `Checkins`,
   `Dashboard` — with frozen headers, a status dropdown and the charts.

6. **Deploy as a Web App.**
   **Deploy → New deployment → ⚙ → Web app**, then:

   | Setting | Value |
   |---|---|
   | Description | `AYW intake v1` |
   | **Execute as** | **Me** (your account) |
   | **Who has access** | **Anyone** |

   Press **Deploy** and copy the **Web app URL**. It looks like
   `https://script.google.com/macros/s/AKfycb…/exec`.

   > "Anyone" means anyone can *send* a form. It does not give anyone access to
   > your sheet — the script decides what it writes, and it never reads anything
   > back out.

7. **Check it is alive.** Paste that URL into a browser tab. You should see
   `{"ok":true,"service":"3aash-ya-wa7sh","ready":true}`.

8. **Paste it into the site.** Open `config.js` and replace the placeholder:

   ```js
   endpoint: 'https://script.google.com/macros/s/AKfycb…/exec',
   ```

   While you are in there, set `contactWhatsapp` and `contactEmail` — those are
   published on the privacy page so people can ask for their data to be deleted.

### Whenever you change `Code.gs` later

Use **Deploy → Manage deployments → ✏ edit → Version: New version → Deploy**.
That keeps the same URL. Creating a *new deployment* gives you a *new* URL and
the site will stop working until you update `config.js`.

---

## Part 2 — publish the website on GitHub Pages

1. Create a public repository on GitHub (for example `3aash-ya-wa7sh`).
2. Push these files to it:

   ```bash
   git init
   git add .
   git commit -m "Intake site for عاش يا وحش"
   git branch -M main
   git remote add origin https://github.com/<your-username>/3aash-ya-wa7sh.git
   git push -u origin main
   ```

3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, branch `main`, folder `/ (root)`. Save.
4. A minute later the site is at
   `https://<your-username>.github.io/3aash-ya-wa7sh/`.
5. Put that link in the Instagram bio.

`.nojekyll` is already in the repository so GitHub serves the files as they are.

---

## Changing things later

### After ANY change to a .css or .js file — bump the version

GitHub Pages tells browsers to keep files for 10 minutes. Without a version
number, a visitor can get your new page with the old stylesheet, which looks
broken. So each HTML file loads its CSS and JS like this:

```html
<link rel="stylesheet" href="styles.css?v=4">
```

Whenever you change `styles.css`, `config.js`, `i18n.js` or any other `.js`
file, change that number to the next one (`?v=5`, …) in **every** HTML
file. Find-and-replace `?v=4` → `?v=5` across the folder does it in one go.

### The words

**Everything** the visitor reads is in `i18n.js`, as two lists with the same
keys — `ar` first, `en` second. Find the line, change the text between the
quotes, commit. For example:

```js
'intro.cta' : 'يلا نبدأ',        // in the ar block
'intro.cta' : "Let's start",     // in the en block
```

If you add a key to one language, add it to the other. Anything missing falls
back to the Arabic text, and a key that does not exist at all shows up on the
page as its own name — so mistakes are visible rather than silent.

### The logo

The files in `assets/` were cut from the original artwork: the white background
was removed from the outside only (the white letters inside the blue shape are
untouched), so the logo sits cleanly on both the light and the dark theme.

| File | Used for |
|---|---|
| `assets/logo.png` (960 px wide) | The big logo at the top of the welcome screen |
| `assets/logo-sm.png` (360 px wide) | The header on every page |
| `assets/apple-touch-icon.png`, `assets/favicon-64.png` | Browser tab and phone home-screen icons |

To swap the logo, replace these files with new ones of the same names. Keep the
background transparent.

### The colours and the look

All of it comes from the top of `styles.css`, and the colours are sampled from
the logo itself:

```css
:root {
  --accent: #394F9F;   /* logo blue — buttons, chips, progress bar */
  --sun:    #F6EA34;   /* logo yellow — offset shadows, step numbers */
  --plum:   #44153E;   /* logo outline — headings */
  --font-head: "Noto Naskh Arabic", …;
  --font-body: "Noto Sans Arabic", …;
}
```

Change `--accent` and the buttons, chips, progress bar, cards and highlights all
follow. Never put text in `--sun` yellow on a light background — it cannot be
read; the yellow is only for shapes and shadows.

### Animation

All movement lives in section 14 of `styles.css`. It is switched off
automatically for anyone whose phone is set to "reduce motion" — they get the
same page, perfectly still. To remove one effect, delete its line there. There is a second, shorter block further down under
`@media (prefers-color-scheme: dark)` for the dark theme — pick a *lighter*
version of your accent there so it stays readable on a dark background.

If you change the fonts, remember to change the Google Fonts `<link>` in the
three HTML files as well, and only pick families that actually cover Arabic.

### The questions

`app.js` has a `SCHEMA` array near the top. Each entry is one question:

```js
{ name: 'city', type: 'text', label: 'f.city.label', ph: 'f.city.ph', maxLength: 60 }
```

Add an entry and it appears in the form, in the review screen and in the data
sent to the sheet automatically. Two things have to follow it:

1. Add its `label` (and `hint`/`ph`) text to **both** language blocks in `i18n.js`.
2. Add the field name to `HEADERS` **and** to `SPEC` in `apps-script/Code.gs`,
   then re-run `setup()`. A field the script does not know about is dropped.

### The response-time promise on the confirmation screen

`config.js` → `responseTime`. Written in both languages, shown exactly as typed.

---

## Testing it end to end

1. Open the published site (or run it locally — see below).
2. Fill in the form as yourself and submit.
3. You should see a participant ID in the shape `AYW-2026-0001`.
4. Within a minute: a new row in `Submissions`, and an email in your inbox.
5. The confirmation screen shows your username (your number) and the first
   password. Log in, change the password, and you land on the tracker's
   waiting screen. Log a weekly check-in there: a row appears in `Checkins`.
6. Open `coach.html`, log in as the coach, open yourself, paste a plan and
   publish it. Back on the tracker the program appears.

`TEST-CHECKLIST.md` has the full list — adult, minor, PAR-Q "yes", each
objective, both languages, on a phone, and with the network turned off.

### Running it on your own machine

To try every page with the real `Code.gs` behind it, but nothing touching
Google, run the local test server from the project folder (needs Node.js):

```bash
node apps-script/tests/dev-server.js
```

Then open <http://localhost:8787/>. It keeps everything in memory and starts
with made-up test data: participant `+201099999999` / `Default#0000`, coach
`coach@dev.local` / `Coach#Dev2026`. The offline tests run with:

```bash
node apps-script/tests/run-tests.js
```

---

## Phase 2 — progress tracking

* Weekly check-ins go to the `Checkins` tab: weight, waist, sessions completed,
  best effort of the week, energy 1–5, notes. Since Phase 3 they are sent from
  inside the participant's tracker, so who sent them comes from the login.
* The `Dashboard` tab is the team's view: pick a participant in **B1** and you
  get start vs. latest weight and waist, the change in each, check-ins logged,
  sessions completed against sessions planned, adherence %, average energy,
  sparklines for each trend, and a weight/waist line chart.

---

## Phase 3 — accounts, the program tracker and the coach console

What it adds:

* **Every participant gets an account.** Username = their WhatsApp number as
  `+201001240186`; first password = the `DEFAULT_PASSWORD` Script Property
  (`12345678`). That password only works until they change it — which they are
  forced to do at first login — and for 14 days at most.
* **The tracker** (`tracker.html`) shows "your coach is preparing your program"
  until a plan is published, then the plan week by week. They tick each session
  done / partly / skipped, with optional minutes, km, effort and a note, and do
  the weekly check-in there.
* **The coach console** (`coach.html`) — this replaces the old "no staff login"
  rule. It is safe because: the coach account lives only in Script Properties
  (hashed, never in the sheet or this repo); every coach action is checked on
  the server, not in the browser; the page is not linked from anywhere public
  and asks search engines not to index it; wrong passwords lock it; a coach
  session lasts 12 hours.
* **The system never writes a plan.** The coach copies a brief (the intake,
  without name or contact details) into a Claude chat, pastes the JSON plan it
  returns, checks the preview, and publishes. A participant who answered "yes"
  to a health question cannot get a plan until "clearance received" is ticked.

New tabs (made by `setup()`): `Users` (protected, password columns hidden),
`Sessions`, `ResetTokens`, `Plans`, `PlanSessions`, `SessionLogs`, `AuthLog`,
and `Progress` (one row per participant, refreshed whenever the console loads).
Plans can also be typed into `Plans` + `PlanSessions` by hand: plain Arabic
text works anywhere a title or detail goes.

### Script Properties (Project Settings → Script properties)

| Property | Set by | What it is |
|---|---|---|
| `DEFAULT_PASSWORD` | you | `12345678` — the first password every account gets |
| `COACH_EMAIL` | you | where the "new submission" email goes |
| `PEPPER` | `setup()` | a secret mixed into every password hash. **Never change or delete it** — every password would stop working |
| `COACH_USERNAME`, `COACH_HASH` | the menu **Set coach password…** | the coach login |
| `SITE_URL` | optional | only if the site moves from `https://ahamrousy.github.io/3aash-ya-wa7sh/` |

None of these ever go in this repository.

### Turning it on (once)

1. Paste the new `Code.gs`, save, and set the Script Properties above.
2. Run **setup** (or the menu **Set up / repair this sheet**). It builds the new
   tabs and repairs any phone numbers that show `#ERROR!`.
3. Menu → **Set coach password…**.
4. Menu → **Create accounts for existing participants** (safe to run twice;
   duplicate or broken numbers are listed under Executions).
5. Redeploy: **Deploy → Manage deployments → ✏ edit → Version: New version →
   Deploy**, so the URL stays the same.
6. Push the website (all files) to GitHub.

Other menu items: **Create / Delete test participant** (`AYW-9999-0001`,
username `+201099999999`), **Delete a participant…** (for deletion requests:
removes the person from every tab), **Unlock the coach login**, and **Time the
password hashing**.

---

## Privacy and the law

* Data lives in one private Google Sheet owned by the founder. Only the
  3aash Ya Wa7sh team — the founder and the coaches working on a participant's
  program — sees it. If you share the sheet with a coach, the privacy text
  already says so; if you share it with anyone else, update the privacy text first.
* It is used only to design a program and follow progress. It is never sold,
  shared or published.
* Written with Egypt's Personal Data Protection Law No. 151 of 2020 in mind:
  explicit consent (two required tick boxes), purpose limitation, and the right
  to correction and deletion — the route for that is on `privacy.html`.
* Under-18s cannot submit without a guardian's name, number and explicit
  consent. The form blocks it and so does the server.
* BMI and waist-to-height are computed **server-side, for the coaching team only**. The
  participant is never shown a score or a label about their body.
* Personal data never appears in a URL or a query string: everything travels in
  the POST body. The login token is kept in the browser's local storage and sent
  only in the POST body; a reset link carries its one-time code after `#`, which
  browsers never send to a server, and the page wipes it from the address bar.
* Passwords are stored only as salted, peppered, repeated SHA-256 hashes.
  Session and reset codes are stored only as hashes too.
* There are no analytics, no trackers and no advertising pixels on any page.

### Spam protection (no CAPTCHA)

1. A hidden `website` field that people never see. If it arrives filled in, the
   submission is dropped.
2. A minimum time on the page — 20 seconds by default, set in `config.js` and
   again in `Code.gs`. Both are checked server-side.
3. A one-time token per submission, so a retry after a dropped connection
   updates nothing and creates no second row.

---

## Troubleshooting

| What you see | What it usually is |
|---|---|
| "الموقع لسه مش متوصّل بالسيرفر" / "not connected to its server yet" | `config.js` still has the placeholder endpoint |
| The form says it could not send, every time | The deployment's **Who has access** is not **Anyone**, or you copied the `/dev` URL instead of `/exec` |
| Submissions work but no email | `COACH_EMAIL` is still `coach@example.com`, or you are over the Gmail daily quota. Run **عاش يا وحش → Send me a test email** from the sheet menu |
| A new row has empty cells you expected to be filled | That field is not in `HEADERS`/`SPEC` in `Code.gs`, so the script dropped it. Add it and re-run `setup()` |
| Two rows for one person | They submitted twice deliberately — a retry of the *same* submission is de-duplicated by its token |
| The dashboard is empty | Nothing is picked in cell **B1**, or that participant has no check-ins yet |
| Phone numbers show `#ERROR!` | Old rows saved before the fix. Run **Set up / repair this sheet** once |
| "Locked" for a participant | Five wrong passwords: it unlocks itself after 15 minutes, or press **Unlock account** in the console |
| The coach login says locked | Wait 15 minutes, or run **Unlock the coach login** from the sheet menu |
| Someone forgot their password | Console → their page → **Password reset link** → Copy, and send it to them |
| Arabic text shows in a fallback font | The Google Fonts `<link>` was removed or the device is offline; the site stays readable but loses the Naskh headings |

---

## Credits

Built for Dr. Ahmed Amrousy — triathlete, marathoner, half-Ironman finisher —
and for everyone who decides that today is the day they start.

عاش يا وحش.
