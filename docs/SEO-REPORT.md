# SEO, AEO & GEO report — 3aash Ya Wa7sh (عاش يا وحش)

Date: 15 November 2026 · Site: https://ahmedamrousy.com/3aash-ya-wa7sh/

---

## 1. Executive summary

**Condition before:** a fast, accessible, well-built site that search engines and AI tools could barely read.

- **Almost all text was added by JavaScript.** The HTML shipped with empty `data-i18n` elements. Google renders JavaScript, so it saw the Arabic text late. AI crawlers (GPTBot, ClaudeBot, PerplexityBot and others) mostly do **not** run JavaScript, so they saw a near-empty page. On the home page that meant a logo, the H1 and some headings.
- **English had no address of its own.** It existed only after a click on the language button, so it could never be indexed.
- **Missing on every page:**
  - no sitemap, canonical URLs, hreflang, Open Graph or share image;
  - no structured data;
  - no web manifest and no 404 page.
- **No content answered beginners' questions.** Nothing addressed "how do I start", "first 5K", "when is the Luxor Marathon".
- **The events lived only behind the API,** so no individual race was indexable.

**Most important improvements:**

1. **Every public page is now prerendered.** It ships its full Arabic text in the HTML. The English twins (`en.html`, `events-en.html`, `privacy-en.html`) ship full English text. A browser check showed the static text matches exactly what JavaScript shows, with 0 mismatches on all 6 pages.
2. **Bilingual metadata is in place:** canonical, reciprocal hreflang (ar / en / x-default), Open Graph, Twitter cards, a 1200×630 share image, a web manifest, app icons and a 404 page.
3. **JSON-LD structured data** covers:
   - Organization, WebSite, and a Person that shares the same @id as the main site's Person;
   - FAQPage, Article, BreadcrumbList, CollectionPage with an ItemList;
   - SportsEvent, on **20 static event pages**, each in Arabic and English.
4. **Two complete bilingual guides** answer the target beginner questions.
5. **A new "What is 3aash Ya Wa7sh?" section** with quotable facts, plus `llms.txt`, a hero call-to-action, and a sitemap of 50 URLs.
6. **One script keeps it all up to date:** `tools/build-seo.js`. The weekly events task now runs it every week, so new events get pages and finished ones are removed.

**Remaining limitations** (details in section 13):
- Google's Rich Results Test can only run after you publish.
- Font loading still causes a small layout shift on the article and event pages.
- The founder's title is "Dr." here and "Eng." on ahmedamrousy.com. That decision is yours.

---

## 2. Initial audit findings

### Critical
| # | Finding | Evidence |
|---|---|---|
| C1 | Content was injected by JS, so non-JS crawlers saw empty pages | `index.html` had 116 `data-i18n` keys, most empty in the HTML |
| C2 | English was not indexable: no URL, no hreflang | The language toggle swapped text in place only |
| C3 | No sitemap for the project | `ahmedamrousy.com/sitemap.xml` listed only the main site; `/3aash-ya-wa7sh/robots.txt` → 404 (robots only works at the domain root anyway) |
| C4 | No canonical, OG or structured data on any page | — |

### Medium
| # | Finding |
|---|---|
| M1 | Weak titles and descriptions. The home title was "عاش يا وحش — سجّل معانا"; the privacy description was 4 words; the privacy `<title>` was replaced at runtime by just "سياسة الخصوصية". |
| M2 | Events were not crawlable: there were no per-event URLs. |
| M3 | The home page CTA ("يلا نبدأ") was only at the very bottom, below 10 FAQs. |
| M4 | Developer files are public and crawlable: `apps-script/Code.gs`, `README.md`, `docs/` (all return 200). |
| M5 | The homepage had a layout shift (CLS 0.218 on the live site in Lighthouse), caused by text arriving after load. |
| M6 | No content answered the question-style searches the audience makes. |

### Low
| # | Finding |
|---|---|
| L1 | No web manifest or large icons. |
| L2 | The 404 fell back to the main site's page. |
| L3 | **Entity naming is inconsistent between the two sites.** ahmedamrousy.com describes "عاش يا وحش" as a podcast and uses "Eng."; this site calls it an initiative and uses "Dr.". |

### Checked and fine
- `https://ahamrousy.github.io/3aash-ya-wa7sh/` → **301** to the custom domain. ✔
- Private pages (login, change-password, reset, tracker, coach, checkin) are all `noindex`. ✔
- Accessibility basics are fine: skip link, labels, focus, contrast, RTL and LTR. Lighthouse Accessibility was 100. ✔
- The site has no trackers or cookies. ✔

---

## 3. Implementation log

**New files**
| File | What / why |
|---|---|
| `tools/build-seo.js` | Generator. It makes the prerendered text, the English twins, the head SEO block, event pages, the event list, the sitemap and llms.txt. Node only; no dependencies, no build step at deploy. |
| `tools/check-seo.js` | Checks the sitemap and every page against it: canonicals, reciprocal hreflang, titles and descriptions, a single H1, JSON-LD parses, FAQ answers are visible, links aren't broken, private pages are noindex. |
| `en.html`, `events-en.html`, `privacy-en.html` | English twins, generated. Don't edit by hand. |
| `start-exercising.html` / `-en.html` | Guide 1 (AR / EN). |
| `first-5k.html` / `-en.html` | Guide 2 (AR / EN). |
| `events/<event_id>.html` and `events/<event_id>-en.html` | 40 generated event pages. |
| `sitemap.xml` | 50 public URLs with hreflang alternates and real lastmod dates (git dates, or the event's `last_verified`). |
| `llms.txt` | A plain summary for AI systems. |
| `site.webmanifest`, `assets/icon-192.png`, `assets/icon-512.png` | Manifest and app icons. |
| `assets/og-image.png` | 1200×630 share image: the logo plus the English name and a short tagline. |
| `404.html` | Bilingual, `noindex`, absolute links (it's served at any missing path). |
| `docs/SEO-REPORT.md` | This report. |

**Changed files**
| File | Change |
|---|---|
| `index.html` | Prerendered Arabic and a head SEO block. Added a hero CTA button, the "What is 3aash Ya Wa7sh?" section with 5 quotable facts, a "Start here" section linking both guides, and an English link in the footer. |
| `events.html` | Prerendered, head block, and an "Event pages" list of crawlable links to the 20 event pages. English link in the footer. |
| `privacy.html` | Prerendered, head block, a proper title key (`pp.doc`), a description (`pp.meta`), and a footer nav. |
| `i18n.js` | 18 new keys per language (812 / 812 in sync). Better `meta.title`, `meta.desc`, `ev.doc`, `ev.meta`. |
| `common.js` | `initLang()`: with no saved choice, the page's own `lang` is used, so the English URLs open in English. A saved choice still wins, as before. |
| `app.js` | The new top "Let's start" button opens the form, the same as the bottom one. |
| `styles.css` | Section 20: about, guides, event list, articles, event pages, badges. Dark mode comes from the existing tokens. |
| All HTML | Cache-buster `?v=11` → `?v=12`. |
| ahmedamrousy.com repo: `src/pages/robots.txt.ts` | Adds `Sitemap: …/3aash-ya-wa7sh/sitemap.xml`. Disallows `/3aash-ya-wa7sh/apps-script/`, `/docs/`, `/tools/` and `*.md` in every crawler group, because a crawler obeys only its own group. |
| ahmedamrousy.com repo: `src/pages/llms.txt.ts` | States that Ahmed founded the free 3aash Ya Wa7sh initiative, with a link to its llms.txt. |
| Weekly scheduled task | Now runs `build-seo.js` and `check-seo.js` every week and commits the event pages, sitemap and llms.txt. |

---

## 4. Technical SEO

- **Language architecture: one URL per language, in the same folder.**
  - Arabic: `index.html` (served as `/3aash-ya-wa7sh/`), `events.html`, `privacy.html`.
  - English: `en.html`, `events-en.html`, `privacy-en.html`.
  - Same-folder twins were chosen over `/en/` because every relative link (CSS, JS, login, assets) keeps working with no path rewriting. They were chosen over `?lang=en` because query URLs need a JS-set canonical and are fragile to share.
  - The language button still swaps in place, so a half-filled form is never lost. A footer link goes to the other language's URL.
- **Prerendering:** `build-seo.js` writes exactly the text `common.js` would set, so there is no flash and no duplicate content. Verified: 0 differences between the static and runtime text on all 6 pages.
- **Canonical:** every public page points to itself on `https://ahmedamrousy.com/3aash-ya-wa7sh/`, and the Arabic home uses the folder URL.
- **Hreflang:** `ar`, `en` and `x-default` (→ Arabic) on every page, reciprocal, matching the sitemap. Checked by `check-seo.js`.
- **robots.txt:** it must sit at the domain root, so it's served by the ahmedamrousy.com repo (see section 3). Private app pages stay **crawlable but `noindex`**. Blocking them would stop Google from seeing the noindex.
- **Sitemap:** public, canonical, indexable pages only. No login, tracker, coach, reset or check-in pages, no API and no redirects.
- **Metadata:**
  - unique titles and descriptions per page and language;
  - Open Graph (title, description, type, url, image + size + alt, locale ar_EG / en_US + alternate, site_name);
  - Twitter `summary_large_image`.
- **Assets:** manifest, 192/512 icons, the existing favicon and apple-touch-icon, `theme-color`.
- **404 page:** bilingual and noindex.

## 5. Structured data

| Type | Where | Notes |
|---|---|---|
| Organization | Every public page | Arabic and English names, logo, description, founder, `areaServed` Egypt, `sameAs` Instagram |
| Person | Every public page | Same `@id` as ahmedamrousy.com (`#ahmed-amrousy`), so both sites describe one person. `jobTitle` "Engineer". **No honorific**, because the two sites disagree (see section 13). He is not described as a coach. |
| WebSite | Every public page | `inLanguage` ar and en |
| WebPage / CollectionPage | Each page | The events page carries an ItemList of the event pages |
| FAQPage | Home (10 Q&As) and both guides (5 and 6 Q&As) | Matches the visible `<details>` content exactly (checked) |
| Article | The guides | Author and publisher = the organisation (no person is claimed as author) |
| BreadcrumbList | Guides and event pages | — |
| SportsEvent | 20 events × 2 languages | Fields listed below |

**SportsEvent fields:**
- name, description, startDate (with the time zone offset when a start time exists, e.g. `2027-01-08T07:00:00+02:00`), endDate;
- eventStatus, OfflineEventAttendanceMode, Place + PostalAddress (ISO country code);
- organizer, sport;
- Offer only when a price **and** currency **and** link exist. Nothing is assumed free.

**Validation:**
- `check-seo.js`: all 50 pages pass, and every JSON-LD block parses.
- **validator.schema.org** (code-snippet mode) on the Luxor Marathon event-page graph: **0 errors, 0 warnings**. The snippet I sent was a trimmed copy with shortened descriptions plus a sample Article and FAQPage entry, not the full page.
- **Not yet run:** Google Rich Results Test. It needs the live URL, so run it after publishing (section 12).
- **Note:** since 2023 Google shows FAQ rich results only for well-known government and health sites. The FAQ markup still helps search engines and AI understand the page, but don't expect FAQ snippets.

**Which events get a page:**
- the start date exists and the event hasn't ended;
- status verified, partial or postponed;
- an Arabic **and** English description;
- an official site or registration link.

Partial events show a "details not confirmed" badge. The **Register** button appears only when the event is verified, registration is open, and there's an https link. The pages of finished events are deleted at the next build. Burj2Burj was skipped because it has no official link.

## 6. AEO (answer-engine) work

Each answer leads with the key fact in about 40–60 words, sits in a visible FAQ, and is marked up as FAQPage.

| Question | Where answered |
|---|---|
| ازاي أبدأ رياضة؟ / إزاي أبدأ أتمرن وأنا مش متعود؟ | start-exercising (answer box + FAQ) |
| إيه أفضل برنامج تمارين للمبتدئين؟ | start-exercising |
| هل ينفع أبدأ رياضة وأنا وزني زائد؟ | start-exercising |
| كام مرة في الأسبوع؟ / هحس بنتيجة إمتى؟ | start-exercising |
| أبدأ الجري منين؟ | first-5k |
| إزاي أستعد لأول سباق 5K؟ | first-5k |
| إزاي أختار تحدي رياضي مناسب؟ | first-5k |
| إيه السباقات المتاحة في مصر؟ | first-5k, plus the events page and its list |
| إمتى ماراثون الأقصر؟ | first-5k (8 Jan 2027, per the organiser on 11 Nov 2026), plus the event page |
| فين أقدر أسجل في نص ماراثون الأهرامات؟ | first-5k (The TriFactory; 5K on 11 Dec, 10K and 21K on 12 Dec 2026), plus the event page |

The English pages answer the same questions in English.

**Kinds of statement in the guides:**
- **Verified facts:** the WHO activity guideline (cited and linked), and race dates with the date they were checked.
- **General guidance,** labelled as such, with medical caveats ("ask your doctor first", plus stop signs).

## 7. GEO (generative-engine) work

- **Entity:** the same names everywhere: **عاش يا وحش / 3aash Ya Wa7sh**. A one-sentence definition opens the About section, the Organization description and llms.txt.
- **The About section ("يعني إيه عاش يا وحش؟")** covers who, what, where, for whom, why and how. It says plainly that the founder is an engineer and endurance athlete, **not a coach**, and that programs are written by professional coaches.
- **Five quotable facts** appear as a visible list in both languages and are repeated in llms.txt. Each matches what the site actually does.
- **`llms.txt`** (`/3aash-ya-wa7sh/llms.txt`): description, facts, main pages, guides, upcoming events with links. It also states that the initiative does not organise races or sell tickets. It is linked from the main site's llms.txt. llms.txt is a convention, not a standard, and there is **no guarantee** any AI system reads it.
- **Author signals:** the Person entity is shared with ahmedamrousy.com. The guides are attributed to "the 3aash Ya Wa7sh team", and nobody is credited with qualifications they don't have.

## 8. Keyword map

There are no search-volume figures here: none were measured, and I won't invent them. Priority is a judgement from intent and fit.

| Keyword | Lang | Intent | Funnel | Page | Priority |
|---|---|---|---|---|---|
| ازاي أبدأ رياضة | AR | Informational | Top | start-exercising.html | High |
| عايز أبدأ أتمرن | AR | Informational | Top | start-exercising.html | High |
| تمارين للمبتدئين / برنامج تمارين للمبتدئين | AR | Info / commercial-investigation | Top–mid | start-exercising.html → home form | High |
| عايز أخس | AR | Informational | Top | home (form) + start-exercising (future: a dedicated article, see plan #6) | Medium |
| بداية الجري / جري للمبتدئين | AR | Informational | Top | first-5k.html | High |
| برنامج 5 كيلو | AR | Informational | Mid | first-5k.html | High |
| سباقات جري في مصر | AR | Informational / local | Mid | events.html | High |
| ماراثون مصر | AR | Navigational / info | Mid | events.html | Medium |
| ماراثون الأقصر | AR | Navigational | Bottom | events/egyptian-luxor-marathon-2027.html | Medium |
| نصف ماراثون الأهرامات | AR | Navigational | Bottom | events/marakez-pyramids-half-marathon-2026.html | Medium |
| تحديات رياضية في مصر | AR | Informational | Mid | events.html | Medium |
| سباقات جري في الخليج | AR | Informational | Mid | events.html | Medium |
| how to start exercising | EN | Informational | Top | start-exercising-en.html | High |
| beginner fitness program Egypt | EN | Commercial investigation | Mid | en.html | High |
| running for beginners Egypt / first 5K training plan | EN | Informational | Top–mid | first-5k-en.html | High |
| running races in Egypt / marathons in Egypt | EN | Info / local | Mid | events-en.html | High |
| Luxor Marathon | EN | Navigational | Bottom | events/egyptian-luxor-marathon-2027-en.html | Medium |
| Pyramids Half Marathon | EN | Navigational | Bottom | events/marakez-pyramids-half-marathon-2026-en.html | Medium |
| sports events / fitness challenges Egypt | EN | Informational | Mid | events-en.html | Medium |

**Avoiding cannibalisation:**
- The home page targets the **initiative** ("free program from coaches").
- The guides target **how-to** queries.
- events.html targets **lists**; event pages target **one named race**.

Once Search Console has data, swap the priorities for real impressions.

## 9. Content strategy

**Published, complete and bilingual:**
1. `start-exercising.html` — "إزاي تبدأ رياضة من الصفر؟ خطة أول 4 أسابيع للمبتدئين" / "How to start exercising from zero".
2. `first-5k.html` — "أول 5 كيلو: برنامج جري للمبتدئين في 8 أسابيع + أول سباق في مصر" / "Your first 5K".

**Proposed next** (each with an AR and EN twin; schema = Article + FAQPage + BreadcrumbList):

| # | Suggested URL | Primary keyword | Secondary keywords | Intent / audience | Title | Meta description | H1 | Outline | Internal links |
|---|---|---|---|---|---|---|---|---|---|
| 3 | first-race-day.html | إزاي تستعد لأول سباق جري | يوم السباق، تجهيز السباق | Info; runners 2–8 weeks from their first race | يوم أول سباق: تعمل إيه قبله وأثناءه وبعده | قايمة بسيطة لأسبوع السباق ويومه: الأكل، النوم، اللبس، الإحماء، وإزاي ما تبدأش بسرعة. | يوم أول سباق | taper week; night before; race morning; pacing; after; FAQ | first-5k, events |
| 4 | races-in-egypt.html | سباقات جري في مصر | ماراثون مصر، سباقات 5 كيلو | Info / local; beginners choosing a race | دليل سباقات الجري في مصر للمبتدئين | السباقات الأساسية في مصر على مدار السنة، المسافات، وإزاي تختار — ولينك لكل صفحة سباق. | سباقات الجري في مصر | by season; by city; distances; how to register safely; links to event pages | events, first-5k |
| 5 | gulf-races.html | سباقات جري في الخليج | دبي، أبوظبي، الرياض، الدوحة | Info; Gulf residents | سباقات وتحديات رياضية في الخليج | جري، عجل، وسباقات موانع في الإمارات والسعودية وقطر — بالتواريخ واللينكات الرسمية. | فعاليات رياضية في الخليج | per country; beginner picks; heat and season | events |
| 6 | lose-weight-start.html | عايز أخس أبدأ منين | رياضة للتخسيس | Info; weight-motivated beginners | عايز تخس؟ ابدأ بالحركة صح | ليه الحركة المنتظمة مع الأكل المتوازن أهم من أي نظام سريع، وإزاي تبدأ بأمان. | عايز أخس — أبدأ منين؟ | realistic expectations; activity + food; safety; when to see a doctor | start-exercising, home form |
| 7 | home-workout.html | تمارين في البيت للمبتدئين | من غير أدوات | Info | تمارين في البيت للمبتدئين من غير أدوات | 6 تمارين بوزن الجسم وخطة 3 أيام في الأسبوع. | تمارين البيت | moves with form cues; plan; progressions | start-exercising |
| 8 | walking-plan.html | المشي للمبتدئين | المشي السريع | Info | برنامج مشي للمبتدئين | إزاي تستخدم المشي كبداية: السرعة، المدة، والزيادة كل أسبوع. | برنامج مشي | talk test; weekly build; heat; shoes | start-exercising, first-5k |
| 9 | choose-challenge.html | إزاي أختار تحدي رياضي | سباحة، عجل، ترايثلون للمبتدئين | Info | إزاي تختار أول تحدّي رياضي ليك | جري ولا سباحة ولا عجل ولا سباق موانع؟ مقارنة بسيطة على قد وقتك ولياقتك. | اختار تحدّيك | comparison table; time to prepare; cost notes; links to categories | events |
| 10 | first-triathlon.html | ترايثلون للمبتدئين | سبرنت ترايثلون | Info | أول ترايثلون: تبدأ منين؟ | المسافات، المعدّات الأساسية، وخطة تحضير عامة. | أول ترايثلون | distances; kit; 12-week outline; safety in open water | events (IRONSTAR pages) |

Draft English equivalents of the same titles, for example "How to Train for Your First 5K in Egypt" and "Running Events in Egypt: a Beginner's Guide".

**To publish a new article:**
1. Copy one of the existing guide files and keep its header and footer.
2. Add it to `ARTICLES` in `tools/build-seo.js`.
3. Run the script.
4. Link to it from home → "Start here".

## 10. Performance and accessibility

These Lighthouse scores were measured, mobile emulation, Lighthouse 12 on this computer:

| Page | Perf | A11y | Best pr. | SEO | LCP | CLS |
|---|---|---|---|---|---|---|
| **Before** — live home (GitHub Pages) | 73 | 100 | 100 | 100 | 3.8 s | **0.218** |
| After — home (local dev server) | 68 | 100 | 100 | 100 | 5.6 s | **0** |
| After — en.html (local) | 83 | 100 | 100 | 100 | 4.1 s | 0.001 |
| After — first-5k.html (local) | 80 | 100 | 100 | 100 | 2.2 s | 0.275 |
| After — an event page (local) | 93 | 100 | 100 | 100 | 1.9 s | 0.13 |

**How to read this:**
- The "after" runs used the local test server, which has no compression and no CDN, so its Performance and LCP numbers **are not comparable** with the live "before". Re-run on the live URL after publishing.
- What is comparable is **CLS on the home page: 0.218 → 0.** The layout jump is gone because the text now arrives with the HTML.
- **Still to fix:** CLS on the article and event pages comes from the web font swapping in. Possible fixes:
  - `display=optional` for the fonts (the first visit shows the fallback font);
  - a size-adjusted fallback `@font-face`.

  I left the typography unchanged.
- No real-user Core Web Vitals data exists yet. Search Console will show it after enough traffic.

## 11. Regression testing (actually run)

**Back-end and data checks:**
- Back-end test suite: **272 passed, 0 failed**.
- `tools/check-seo.js`: **OK**. That covers 50 URLs, canonicals, reciprocal hreflang, JSON-LD parse, visible FAQs, no broken relative links, and private pages noindex.
- `build-seo.js` run twice: the second run reported "nothing changed", so the output is stable.

**In the browser (local server with the real Code.gs):**
- Every `data-i18n` element on all 6 public pages matches the runtime text. Arabic pages are rtl/ar and English pages are ltr/en.
- `en.html` → the top "Let's start" button opens step 1 in English.
- `events-en.html` → 21 event cards load from the API, and the 20 static links point to the `-en` pages.
- No console errors.
- At phone width (375 px): no sideways scroll on the home page or the guide.
- An event page renders in Arabic.

**The main site's type check** (`npm run check` in ahmedamrousy.com) passes with 0 errors after the robots and llms changes.

**Not tested by me in this round:**
- The login, tracker and coach flows end to end. Their files changed only in the `?v=12` cache-buster, and `common.js` changed only in how it picks the starting language.
- Real devices.
- Dark mode by eye. It uses the existing colour tokens.

## 12. Owner action checklist (simple steps)

1. **Publish 3aash Ya Wa7sh:** open GitHub Desktop → repository **3aash-ya-wa7sh** → **Push origin**.
2. **Publish the main site's robots and llms change:** in GitHub Desktop, switch the repository to **ahamrousy.github.io** → **Push origin**. Its automatic deploy runs the checks and publishes.
3. **Google Search Console** (https://search.google.com/search-console):
   1. Your domain is probably already verified for ahmedamrousy.com (there is a Google verification file in the main site). If not, add the property and follow the steps.
   2. Go to **Sitemaps** → add `https://ahmedamrousy.com/3aash-ya-wa7sh/sitemap.xml` → **Submit**.
   3. **URL Inspection:** paste the home URL, then `…/en.html` and `…/events.html`, and click **Request indexing** for each.
4. **Rich Results Test** (https://search.google.com/test/rich-results): test `…/events/egyptian-luxor-marathon-2027.html` and the home page, and send me any warnings.
5. **Bing Webmaster Tools** (https://www.bing.com/webmasters): sign in → **Import from Google Search Console** (the easiest route) → submit the same sitemap.
6. **Instagram @3aashyawa7sh:**
   - set the bio link to `https://ahmedamrousy.com/3aash-ya-wa7sh/`;
   - use the same name, "عاش يا وحش | 3aash Ya Wa7sh", and the same one-line description as the site.
7. **Decide the founder title.** This site says "د. / Dr."; ahmedamrousy.com says "Eng." and "DBA candidate". Tell me which is correct and I'll make both sites match. I left the honorific out of the structured data until then.
8. **Decide how ahmedamrousy.com describes 3aash Ya Wa7sh.** It calls it a podcast; this site calls it a community initiative. I added the initiative there. Confirm whether the podcast is part of it.
9. **Read the two guides.** Check they match the coaches' approach, and ask a coach to review the plans if you can.
10. **After 2–4 weeks,** look at Search Console → **Pages** (what's indexed) and **Performance** (real searches). Send me the queries and I'll adjust the keyword map.
11. **Optional authority building:**
    - ask the race organisers you list (Egyptian Marathon, The TriFactory, IRONSTAR) and running clubs whether they would link to "Find Your Challenge";
    - share each new guide on Instagram with the link;
    - get mentioned in Egyptian running and fitness groups and local media.

    Only genuine links count; never buy links.
12. **Google Business Profile: don't create one for now.** The initiative has no address the public can visit and no in-person service area. A listing with a fake address breaks Google's rules and can get suspended. Reconsider only if you open a real place, such as a weekly group run at a fixed venue that you staff.

## 13. Remaining issues

- **Rich Results Test, live Lighthouse and live checks** all need publishing first (section 12).
- **Font-swap CLS** on the article and event pages (section 10).
- **Founder honorific and podcast-vs-initiative wording** need your decision (items 7–8 above).
- **The guides name races with dates.** After 12 Dec 2026 (Pyramids) and 8 Jan 2027 (Luxor), update that paragraph and the FAQ, or ask me to. The event pages themselves disappear automatically once an event has finished.
- **The app pages still swap language in place.** For example, `login.html` has no separate English URL. That is fine because they are `noindex`.
- **The developer files** (`apps-script/`, `docs/`, `tools/`, `*.md`) are still published by GitHub Pages. They are only *blocked from crawling* once the main site's robots.txt is deployed. They contain no secrets.
- **llms.txt does not guarantee AI citations.** Neither does structured data guarantee rich results.

---

**How to keep this up to date:**
1. Change text in `i18n.js` or the public pages, add an article, or add an events file.
2. Run `node tools/build-seo.js` then `node tools/check-seo.js`.
3. Commit.

The weekly events task already does steps 2 and 3 for events.
