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
   │ checkin.html· weekly log     │ ───────► │  · validates everything    │
   │ privacy.html                 │   JSON   │  · makes the AYW-… ID      │
   │ app.js / checkin.js          │ ◄─────── │  · computes BMI + ratio    │
   │ i18n.js  · all the words     │  {ok,id} │  · writes one sheet row    │
   │ config.js· the endpoint URL  │          │  · emails the founder      │
   └──────────────────────────────┘          └────────────────────────────┘
```

* **No build step.** Plain HTML, CSS and JavaScript. What is in the repository is
  what runs.
* **Nothing secret in this repository.** The only thing the browser knows is the
  Apps Script URL in `config.js`. That URL accepts submissions; it never hands
  data back out.
* **The browser is never trusted.** Every field is re-validated, re-typed and
  trimmed inside `Code.gs` before it is written.
* **No analytics, no pixels, no third-party scripts** — the only external request
  is to Google Fonts for the Arabic typefaces.

### The files

| File | What it is |
|---|---|
| `index.html` | The welcome/privacy screen, the six-step form, the review and confirmation screens |
| `checkin.html` | Phase 2 — the weekly progress check-in |
| `privacy.html` | The full privacy policy |
| `styles.css` | All the styling. Light and dark, RTL and LTR, from one set of tokens |
| `config.js` | **The file you edit to go live.** Endpoint URL, contact details, wording of the response time |
| `i18n.js` | **Every word on the site**, Arabic and English side by side |
| `common.js` | Shared plumbing: language switching, translation lookup, the one function that posts to Apps Script |
| `app.js` | The intake form. The `SCHEMA` near the top defines every question |
| `checkin.js` | The weekly check-in page |
| `apps-script/Code.gs` | The back end. Paste this into Apps Script |
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
<link rel="stylesheet" href="styles.css?v=3">
```

Whenever you change `styles.css`, `config.js`, `i18n.js` or any other `.js`
file, change that number to the next one (`?v=4`, …) in **all three** HTML
files — `index.html`, `privacy.html`, `checkin.html`. Find-and-replace
`?v=3` → `?v=4` does it in one go.

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
5. Open `checkin.html`, enter that ID plus the same WhatsApp number, and log a
   week. A row appears in `Checkins`.
6. On the `Dashboard` tab, pick your ID from the dropdown in **B1** and watch the
   numbers and the chart fill in.

`TEST-CHECKLIST.md` has the full list — adult, minor, PAR-Q "yes", each
objective, both languages, on a phone, and with the network turned off.

### Running it on your own machine

Any static file server will do. From the project folder:

```bash
python -m http.server 5178
```

Then open <http://127.0.0.1:5178/>. Opening `index.html` directly from the file
system also works, but `localhost` is closer to the real thing.

---

## Phase 2 — progress tracking

Already built and shipped alongside Phase 1:

* `checkin.html` asks for the participant ID **and** the WhatsApp number used at
  sign-up. Both have to match the same row before anything is accepted.
* The page **only sends**. It never asks the server for stored data and never
  displays anything back, so it cannot be used to look anyone up.
* Entries go to the `Checkins` tab: weight, waist, sessions completed, best
  effort of the week, energy 1–5, notes.
* The `Dashboard` tab is the team's view: pick a participant in **B1** and you
  get start vs. latest weight and waist, the change in each, check-ins logged,
  sessions completed against sessions planned, adherence %, average energy,
  sparklines for each trend, and a weight/waist line chart.
* There is deliberately **no staff login page** on the public website. The
  team's view is the sheet.

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
  the POST body.
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
| Arabic text shows in a fallback font | The Google Fonts `<link>` was removed or the device is offline; the site stays readable but loses the Naskh headings |

---

## Credits

Built for Dr. Ahmed Amrousy — triathlete, marathoner, half-Ironman finisher —
and for everyone who decides that today is the day they start.

عاش يا وحش.
