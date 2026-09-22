# Test checklist — عاش يا وحش

Walk this before you put the link in the Instagram bio, and again after any
change to `Code.gs` or `SCHEMA`.

Test rows are real rows. Give the test people obviously fake names
(`TEST — ignore`) and delete them from the sheet when you are done.

---

## A. Before you start

- [ ] `config.js` → `endpoint` is the real `/exec` URL, not the placeholder
- [ ] `config.js` → `contactWhatsapp` and `contactEmail` are addresses you actually read
- [ ] `Code.gs` → `COACH_EMAIL` is your address
- [ ] Opening the `/exec` URL in a browser shows `{"ok":true,…,"ready":true}`
- [ ] The sheet has three tabs: `Submissions`, `Checkins`, `Dashboard`
- [ ] `Submissions` row 1 is frozen, bold, and the `status` column is a dropdown

---

## B. The happy path — an adult, in Arabic

- [ ] The page opens in Arabic, right-to-left, with no sideways scrolling
- [ ] "يلا نبدأ" moves to step 1 of 6, and the progress bar is at 1/6
- [ ] Step 1 accepts `01012345678`; the leading zero is dropped on the way out
- [ ] Every "التالي" advances and the progress bar follows
- [ ] Step 6 will not advance until both required consents are ticked
- [ ] The review screen lists every answer you gave, grouped by step
- [ ] "تعديل" on a group jumps back to that step with the answers still there
- [ ] Submit shows a participant ID shaped `AYW-2026-0001`
- [ ] "انسخ الرقم" copies it and the button confirms
- [ ] **In the sheet:** one new row, `status` = `New`, `is_minor` = `FALSE`,
      `needs_medical_clearance` = `FALSE`, `bmi` and `waist_to_height` filled in
- [ ] **In your inbox:** an email with the ID, the name and the summary

---

## C. A minor

- [ ] Enter an age under 18 on step 3 → the guardian panel appears immediately
- [ ] Leaving it empty and pressing "التالي" blocks, with the message on all
      three guardian fields
- [ ] Filling in the name, number and the consent tick lets you continue
- [ ] **In the sheet:** `is_minor` = `TRUE`, guardian name and phone present
- [ ] The email says "UNDER 18 — guardian consent on file"

---

## D. A PAR-Q "yes"

- [ ] Answer "أيوه" to any health question → the calm "خد بالك — ومتقلقش" note
      appears on the spot
- [ ] It does **not** stop you submitting
- [ ] The same note is repeated at the top of the review screen
- [ ] **In the sheet:** `needs_medical_clearance` = `TRUE`
- [ ] The email subject starts with `[clearance]`
- [ ] Answering "لأ" to everything makes the note disappear again

---

## E. Each objective, and its follow-up questions

Tick each objective on its own, check its panel appears and its questions are
required, then untick it and check the panel disappears.

- [ ] **أخس وزن** → target weight (optional) and a timeframe (required)
- [ ] **أبدأ رياضة جديدة** → sport, target, and "جربتها قبل كده؟"
  - [ ] Choosing **جري** offers 5 / 10 / 21.1 / 42.2 km
  - [ ] Choosing **سباحة** offers 30 min / 1 km / 3 km — the list changes with the sport
  - [ ] Choosing **عجل**, **ترايثلون** or **حديد** gives a free-text target instead
  - [ ] Choosing **رياضة تانية** asks you to name it
- [ ] **أحسّن وقتي** → sport, distance, current time, target time
  - [ ] A target time **slower than** the current time is refused, with a
        message saying why
  - [ ] A target time faster than it is accepted
  - [ ] Race name and date are optional
- [ ] **ألاقي ناس زيي** → at least one choice required; picking "حاجة تانية"
      asks you to describe it
- [ ] All four at once: every panel shows, and the review lists all of them
- [ ] Unticking an objective removes its answers from the review **and** from
      the row written to the sheet

---

## F. Step 4 and 5 details

- [ ] Ticking "مش بعمل أي رياضة دلوقتي" hides the sports list entirely
- [ ] Picking two sports creates two detail rows, each with sessions/week and
      session length
- [ ] The sheet's `activity_details` reads like `running=3x/week,60min; gym=2x/week,45min`
- [ ] The days of the week start on Saturday
- [ ] "متاح عندك إيه؟" requires at least one choice, and "ولا حاجة من دول" counts

---

## G. Validation messages

Each one should say what to do, not just that something is wrong.

- [ ] Empty name → "الخانة دي مطلوبة."
- [ ] A one-letter name → "اكتب اسمك بالكامل"
- [ ] `0123` as a WhatsApp number → the message shows the right shape
- [ ] A non-Egyptian country code accepts 6–14 digits
- [ ] `name@` as an email → the message shows the right shape
- [ ] Age `7` or `120` → "اكتب رقم بين 12 و 90."
- [ ] Weight `10` → "اكتب رقم بين 30 و 250."
- [ ] `00:00:00` as a time → "الوقت لازم يكون أكبر من صفر."
- [ ] `00:75:00` → the minutes/seconds message
- [ ] Every message disappears as soon as you fix the field

---

## H. English

- [ ] The toggle switches the whole page instantly, including labels, chips,
      option names, buttons, errors and the page title
- [ ] Direction flips to left-to-right and the layout mirrors cleanly
- [ ] **Answers you already gave are still there** after the switch
- [ ] Switching mid-form keeps you on the same step
- [ ] The choice survives a reload, and `privacy.html` and `checkin.html` open in
      the same language
- [ ] **In the sheet:** `language_used` is `en`

---

## I. On a phone

Use a real phone if you can; the browser's device mode is a second best.

- [ ] Nothing scrolls sideways on any step, in either language
- [ ] Every button and chip is comfortable to hit with a thumb
- [ ] Number fields (age, weight, height, waist, times) open the **numeric**
      keypad, not the letter keyboard
- [ ] The WhatsApp field opens the phone keypad
- [ ] The date field opens the native date picker
- [ ] The four objective cards stack one per row and stay readable
- [ ] The "how do I measure my waist" tip opens and closes
- [ ] The whole thing takes about five minutes

---

## J. Interruption and network failure

- [ ] Fill in three steps, close the tab, reopen the site → you land back where
      you were with your answers intact
- [ ] Turn off the network, then submit → a clear "الاستمارة مبعتتش" message,
      **the answers are still on screen**, and "حاول تاني" is offered
- [ ] Turn the network back on and press "حاول تاني" → it goes through
- [ ] **In the sheet:** exactly one row, not two
- [ ] After a successful submit, reopening the site starts fresh (the draft is
      cleared)
- [ ] In a private/incognito window with storage blocked, the form still works —
      it just does not remember a draft

---

## K. Spam protection

- [ ] Submitting within a few seconds of opening the page is refused with
      "الاستمارة اتبعتت بسرعة شديدة"
- [ ] With the browser console: `document.getElementById('hp-website').value='x'`
      then submitting → refused, nothing is written

---

## L. Accessibility

- [ ] Tab through a whole step: every control is reachable and the focus outline
      is clearly visible, in light **and** dark mode
- [ ] The "تخطَّ للمحتوى" link appears on the first Tab press
- [ ] Space/Enter operate chips, cards and checkboxes
- [ ] With a screen reader (VoiceOver, TalkBack or NVDA): each field announces
      its label, its hint, and its error when one appears
- [ ] Pressing "التالي" with errors announces how many fields need fixing and
      moves focus to the first one
- [ ] Switch the device to dark mode → the whole site follows, and text stays
      easy to read
- [ ] Switch the device to "reduce motion" → nothing slides or animates

---

## M. Privacy promises

- [ ] No URL on any page ever contains a name, a number or an answer
- [ ] Browser dev tools → Network: the only external requests are Google Fonts
      and the one POST to Apps Script. No analytics, no pixels
- [ ] `privacy.html` opens in both languages and its contact details are the
      real ones from `config.js`
- [ ] The Google Sheet's Share list contains **only** the coach

---

## N. The weekly check-in (Phase 2)

- [ ] A correct ID **and** the matching WhatsApp number → accepted, and a row
      appears in `Checkins`
- [ ] The correct ID with a **different** number → refused, with the "راجع
      الاتنين" message
- [ ] An ID that does not exist → the same refusal
- [ ] A malformed ID like `hello` → the "شكله مش مظبوط" message
- [ ] The page never shows any stored data back, not even on success
- [ ] Log three weeks, then open `Dashboard`, pick the ID in **B1**:
  - [ ] name, status and objectives fill in
  - [ ] start vs. latest weight and waist, and the change in each
  - [ ] check-ins logged, sessions completed, sessions planned, adherence %
  - [ ] the sparklines draw
  - [ ] the weight/waist chart draws

---

## O. Before you announce it

- [ ] Delete every test row from `Submissions` and `Checkins`
- [ ] Reset the counters if you want to start at 0001: in Apps Script,
      **Project Settings → Script Properties**, delete `seq_<year>`
- [ ] Submit one last real-looking form and keep it, so the sheet is not empty
- [ ] Open the live GitHub Pages URL on someone else's phone and try it there
