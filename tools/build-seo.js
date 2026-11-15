/* =============================================================================
   build-seo.js — the search-engine files, made from the site's own sources.
   -----------------------------------------------------------------------------
       node tools/build-seo.js            (run from anywhere; needs Node only)

   There is still no build step to publish the site: this writes plain files
   that are committed like any other. Re-run it after changing i18n.js, the
   public pages, an article, or docs/events/*.json. It is safe to run twice.

   What it does
   1. Fills every data-i18n element of the public pages (index, events,
      privacy) with its Arabic text, so search engines and AI crawlers that
      do not run JavaScript still read the page. common.js then swaps the
      language exactly as before.
   2. Writes the English twins en.html, events-en.html, privacy-en.html —
      the same page with English text, lang="en" dir="ltr".
   3. Refreshes the block between <!-- SEO:START --> and <!-- SEO:END --> on
      every public page and article: canonical, hreflang, Open Graph,
      Twitter card and JSON-LD (Organization, WebSite, FAQPage, …).
   4. Writes one page per upcoming event in events/ (Arabic + English) from
      docs/events/*.json, with SportsEvent JSON-LD, and the list of them on
      the events page. Past, cancelled or thinly-described events get none.
   5. Writes sitemap.xml and llms.txt.

   Facts come only from i18n.js, config.js and the event files — nothing is
   invented here. Missing event details are shown as "not published yet".
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://ahmedamrousy.com/3aash-ya-wa7sh/';
const OG_IMAGE = { url: BASE + 'assets/og-image.png', w: 1200, h: 630 };
const LOGO = { url: BASE + 'assets/logo.png', w: 960, h: 553 };
const PERSON_ID = 'https://ahmedamrousy.com/#ahmed-amrousy';

const rd = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const wr = (f, s) => {
  const full = path.join(ROOT, f);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const before = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  if (before !== s) fs.writeFileSync(full, s);
  return before !== s;
};
const win = {};
vm.runInNewContext(rd('i18n.js'), { window: win });
vm.runInNewContext(rd('config.js'), { window: win });
const I18N = win.I18N;
const CFG = win.AYW_CONFIG;
const t = (lang, key) => (I18N[lang] && I18N[lang][key] !== undefined ? I18N[lang][key] : I18N.ar[key]);
const V = (rd('index.html').match(/styles\.css\?v=(\d+)/) || [0, '1'])[1];
const today = new Date().toISOString().slice(0, 10);
const changed = [];

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => esc(s).replace(/"/g, '&quot;');
const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const ld = (obj) => '<script type="application/ld+json">\n' + JSON.stringify(obj, null, 1).replace(/<\//g, '<\\/') + '\n</script>';

/* The date a file's content last changed: today if it has unsaved edits. */
function fileDate(f) {
  try {
    const dirty = cp.execFileSync('git', ['status', '--porcelain', '--', f], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (dirty) return today;
    return cp.execFileSync('git', ['log', '-1', '--format=%cs', '--', f], { cwd: ROOT, encoding: 'utf8' }).trim() || today;
  } catch (e) { return today; }
}
const maxDate = (...d) => d.filter(Boolean).sort().pop();

/* ------------------------------------------------------------ the pages */
const PAGES = {
  home:    { ar: 'index.html',   en: 'en.html',          title: 'meta.title', desc: 'meta.desc' },
  events:  { ar: 'events.html',  en: 'events-en.html',   title: 'ev.doc',     desc: 'ev.meta' },
  privacy: { ar: 'privacy.html', en: 'privacy-en.html',  title: 'pp.doc',     desc: 'pp.meta' }
};
const ARTICLES = {
  start: { ar: 'start-exercising.html', en: 'start-exercising-en.html', published: '2026-11-15' },
  fivek: { ar: 'first-5k.html',         en: 'first-5k-en.html',         published: '2026-11-15' }
};
/* Links that have an English twin. Everything else (login, assets…) is the same file. */
const EN_HREF = {};
Object.values(PAGES).concat(Object.values(ARTICLES)).forEach((p) => { EN_HREF[p.ar] = p.en; });
const url = (f) => BASE + (f === 'index.html' ? '' : f);

/* ------------------------------------------------ prerendering the text */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function findClose(html, tag, from) {
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi');
  re.lastIndex = from;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (!depth) return m.index;
  }
  throw new Error('no closing </' + tag + '> after ' + html.slice(from - 80, from));
}
function fillContent(html, dataAttr, valueFor) {
  const re = new RegExp('<([a-zA-Z][a-zA-Z0-9]*)\\b[^>]*?\\s' + dataAttr + '="([^"]+)"[^>]*>', 'g');
  let out = '', last = 0, m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase();
    if (VOID.has(tag)) continue;
    const openEnd = m.index + m[0].length;
    const close = findClose(html, tag, openEnd);
    out += html.slice(last, openEnd) + valueFor(m[2]);
    last = close;
    re.lastIndex = close;
  }
  return out + html.slice(last);
}
function fillAttr(html, dataAttr, target, valueFor) {
  return html.replace(new RegExp('<[a-zA-Z][^>]*\\s' + dataAttr + '="([^"]+)"[^>]*>', 'g'), (tag, key) => {
    const v = attr(valueFor(key));
    const has = new RegExp('\\s' + target + '="[^"]*"');
    if (has.test(tag)) return tag.replace(has, ' ' + target + '="' + v + '"');
    return tag.replace(new RegExp('\\s' + dataAttr + '="'), ' ' + target + '="' + v + '" ' + dataAttr + '="');
  });
}
function prerender(html, lang) {
  const tx = (k) => t(lang, k);
  html = html.replace(/<html\b[^>]*>/, '<html lang="' + lang + '" dir="' + I18N.dir[lang] + '">');
  html = fillContent(html, 'data-i18n', (k) => esc(tx(k)));
  html = fillContent(html, 'data-i18n-html', (k) => tx(k));
  html = fillAttr(html, 'data-i18n-ph', 'placeholder', tx);
  html = fillAttr(html, 'data-i18n-aria', 'aria-label', tx);
  html = fillAttr(html, 'data-i18n-title', 'title', tx);
  html = fillAttr(html, 'data-i18n-alt', 'alt', tx);
  html = html.replace(/(<title data-i18n-doc="([^"]+)">)[\s\S]*?(<\/title>)/, (a, o, k, c) => o + esc(tx(k)) + c);
  html = html.replace(/<meta name="description" data-i18n-doc="([^"]+)" content="[^"]*">/,
    (a, k) => '<meta name="description" data-i18n-doc="' + k + '" content="' + attr(tx(k)) + '">');
  return html;
}
function altLangLink(lang, href) {
  return lang === 'ar'
    ? '<a href="' + href + '" hreflang="en" lang="en" data-alt-lang>English</a>'
    : '<a href="' + href + '" hreflang="ar" lang="ar" data-alt-lang>العربية</a>';
}
function toEnglishLinks(html, arFile) {
  html = html.replace(/href="([a-z0-9-]+\.html)(#[^"]*)?"/g, (a, f, hash) => 'href="' + (EN_HREF[f] || f) + (hash || '') + '"');
  return html.replace(/<a [^>]*data-alt-lang[^>]*>[^<]*<\/a>/g, altLangLink('en', arFile));
}

/* --------------------------------------------------------------- JSON-LD */
function entities(lang) {
  return [
    { '@type': 'Organization', '@id': BASE + '#org', name: '3aash Ya Wa7sh', alternateName: 'عاش يا وحش', url: BASE,
      logo: { '@type': 'ImageObject', url: LOGO.url, width: LOGO.w, height: LOGO.h },
      description: t(lang, 'about.p1'), founder: { '@id': PERSON_ID },
      areaServed: { '@type': 'Country', name: 'Egypt' }, sameAs: [CFG.instagramUrl] },
    /* Same @id as the Person on ahmedamrousy.com, so both sites describe one person. */
    { '@type': 'Person', '@id': PERSON_ID, name: 'Ahmed Amrousy', alternateName: 'أحمد عمروسي',
      jobTitle: lang === 'ar' ? 'مهندس' : 'Engineer', description: t(lang, 'team.founder.body'),
      url: 'https://ahmedamrousy.com/about/', sameAs: ['https://www.linkedin.com/in/ahmed-amrousy/'] },
    { '@type': 'WebSite', '@id': BASE + '#website', name: '3aash Ya Wa7sh', alternateName: 'عاش يا وحش', url: BASE,
      inLanguage: ['ar', 'en'], description: t(lang, 'meta.desc'), publisher: { '@id': BASE + '#org' } }
  ];
}
function webPage(type, lang, file, title, desc, extra) {
  return Object.assign({ '@type': type, '@id': url(file) + '#page', url: url(file), name: title, description: desc,
    inLanguage: lang, isPartOf: { '@id': BASE + '#website' }, about: { '@id': BASE + '#org' },
    primaryImageOfPage: { '@type': 'ImageObject', url: OG_IMAGE.url } }, extra || {});
}
function faqLd(pairs, lang, file) {
  return { '@type': 'FAQPage', '@id': url(file) + '#faq', inLanguage: lang,
    mainEntity: pairs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
}
function crumbs(items) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, u], i) => ({ '@type': 'ListItem', position: i + 1, name, item: u })) };
}

/* ------------------------------------------------------------ head block */
function headBlock(o) {
  const L = [
    '<!-- SEO:START (made by tools/build-seo.js — edit the sources and re-run it, not this block) -->',
    '<link rel="canonical" href="' + o.canonical + '">',
    '<link rel="alternate" hreflang="ar" href="' + o.arUrl + '">',
    '<link rel="alternate" hreflang="en" href="' + o.enUrl + '">',
    '<link rel="alternate" hreflang="x-default" href="' + o.arUrl + '">',
    '<link rel="manifest" href="' + (o.prefix || '') + 'site.webmanifest">',
    '<meta property="og:site_name" content="' + (o.lang === 'ar' ? 'عاش يا وحش' : '3aash Ya Wa7sh') + '">',
    '<meta property="og:type" content="' + (o.ogType || 'website') + '">',
    '<meta property="og:title" content="' + attr(o.title) + '">',
    '<meta property="og:description" content="' + attr(o.desc) + '">',
    '<meta property="og:url" content="' + o.canonical + '">',
    '<meta property="og:image" content="' + OG_IMAGE.url + '">',
    '<meta property="og:image:width" content="' + OG_IMAGE.w + '">',
    '<meta property="og:image:height" content="' + OG_IMAGE.h + '">',
    '<meta property="og:image:alt" content="' + attr(t(o.lang, 'brand.logo.alt')) + '">',
    '<meta property="og:locale" content="' + (o.lang === 'ar' ? 'ar_EG' : 'en_US') + '">',
    '<meta property="og:locale:alternate" content="' + (o.lang === 'ar' ? 'en_US' : 'ar_EG') + '">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="' + attr(o.title) + '">',
    '<meta name="twitter:description" content="' + attr(o.desc) + '">',
    '<meta name="twitter:image" content="' + OG_IMAGE.url + '">',
    ld({ '@context': 'https://schema.org', '@graph': entities(o.lang).concat(o.graph || []) }),
    '<!-- SEO:END -->'
  ];
  return L.join('\n');
}
function setHead(html, block) {
  if (/<!-- SEO:START[\s\S]*?<!-- SEO:END -->/.test(html)) return html.replace(/<!-- SEO:START[\s\S]*?<!-- SEO:END -->/, () => block);
  return html.replace('</head>', block + '\n</head>');
}
function setBlock(html, name, inner) {
  const re = new RegExp('<!-- ' + name + ':START -->[\\s\\S]*?<!-- ' + name + ':END -->');
  return html.replace(re, () => '<!-- ' + name + ':START -->' + inner + '<!-- ' + name + ':END -->');
}

/* ---------------------------------------------------------------- events */
const COUNTRY = { 'Egypt': ['EG', 'مصر'], 'United Arab Emirates': ['AE', 'الإمارات'], 'Saudi Arabia': ['SA', 'السعودية'],
  'Qatar': ['QA', 'قطر'], 'Kuwait': ['KW', 'الكويت'], 'Oman': ['OM', 'عُمان'], 'Bahrain': ['BH', 'البحرين'],
  'Jordan': ['JO', 'الأردن'], 'Morocco': ['MA', 'المغرب'], 'Turkey': ['TR', 'تركيا'] };
const CITY_AR = { 'Cairo': 'القاهرة', 'Giza': 'الجيزة', 'El Gouna': 'الجونة', 'Sharm El Sheikh': 'شرم الشيخ', 'Luxor': 'الأقصر',
  'Alexandria': 'الإسكندرية', 'Hurghada': 'الغردقة', 'Dahab': 'دهب', 'Dubai': 'دبي', 'Abu Dhabi': 'أبوظبي', 'Doha': 'الدوحة',
  'Riyadh': 'الرياض', 'Jeddah': 'جدة', 'Ras Al Khaimah': 'رأس الخيمة', 'Muscat': 'مسقط', 'Kuwait City': 'الكويت', 'Manama': 'المنامة' };
const pick = (v, lang) => (v && typeof v === 'object' ? (v[lang] || v.ar || v.en || '') : (v == null ? '' : String(v)));
const day = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? String(s).slice(0, 10) : '');

function loadEvents() {
  const dir = path.join(ROOT, 'docs', 'events');
  let order = [];
  try { order = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).files || []; } catch (e) { /* none */ }
  const files = fs.readdirSync(dir).filter((f) => /\.json$/.test(f) && f !== 'manifest.json')
    .sort((a, b) => (order.indexOf(a) - order.indexOf(b)) || a.localeCompare(b));
  const byId = {};
  files.forEach((f) => {
    let list = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!Array.isArray(list)) list = list.events || [];
    list.forEach((e) => { if (e && e.event_id) byId[e.event_id] = e; });   // later files win
  });
  return Object.values(byId);
}
function eventIsPublishable(e) {
  const end = day(e.end_date) || day(e.start_date);
  if (!day(e.start_date) || !end || end < today) return false;
  if (!/^[a-z0-9-]{3,64}$/.test(e.event_id)) return false;
  if (!['verified', 'partial', 'postponed'].includes(e.verification_status)) return false;
  if (!pick(e.description, 'ar') || !pick(e.description, 'en')) return false;
  return Boolean(e.official_website || e.registration_url);
}
function fmtDate(d, lang) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB',
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(d + 'T00:00:00Z'));
}
function tzOffset(dateIso, tz) {
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date(dateIso + 'T12:00:00Z')).find((x) => x.type === 'timeZoneName').value;
    const m = p.match(/GMT([+-]\d{2}):?(\d{2})?/);
    return m ? m[1] + ':' + (m[2] || '00') : (p === 'GMT' ? '+00:00' : '');
  } catch (e) { return ''; }
}
function isoStart(e) {
  const d = day(e.start_date);
  if (/^\d{2}:\d{2}$/.test(e.start_time || '') && e.timezone) {
    const off = tzOffset(d, e.timezone);
    if (off) return d + 'T' + e.start_time + ':00' + off;
  }
  return d;
}
const EVT = {
  ar: { when: 'التاريخ', where: 'المكان', sport: 'الرياضة', dist: 'المسافات / الفئات', price: 'السعر', org: 'المنظّم',
    reg: 'التسجيل', level: 'المستوى', age: 'أقل سن', fit: 'محتاج لياقة قد إيه؟', equip: 'المعدّات', deadline: 'آخر ميعاد للتسجيل',
    unknown: 'لسه ما اتنشرش', free: 'ببلاش', from: 'من', to: 'لـ',
    regs: { open: 'مفتوح', closed: 'مقفول', soon: 'هيفتح قريب', unknown: 'مش متأكدين — راجع موقع المنظّم' },
    begYes: 'مناسب للمبتدئين', begNo: 'مش مناسب كأول تجربة',
    register: 'سجّل من الموقع الرسمي', site: 'موقع المنظّم', all: 'كل الفعاليات', home: 'عاش يا وحش',
    verified: (d) => 'التفاصيل دي اتراجعت على صفحة المنظّم الرسمية يوم ' + fmtDate(d, 'ar') + '.',
    partial: 'فيه تفاصيل لسه المنظّم ما أكّدهاش — راجع موقعه قبل ما تخطط.',
    postponed: 'المنظّم أعلن إن الفعالية اتأجلت — تابع موقعه للميعاد الجديد.',
    source: 'المصدر', check: 'عاش يا وحش مش المنظّم ومش بتبيع تذاكر. اتأكد دايماً من التفاصيل والسعر على موقع المنظّم قبل ما تدفع، ولو عندك أي مشكلة صحية خد رأي دكتورك الأول.',
    ctaH: 'عايز تستعد للتحدّي ده؟', ctaP: 'املا استمارة عاش يا وحش، ومدربين محترفين يكتبولك برنامج على قد مستواك — ببلاش.', ctaB: 'يلا نبدأ',
    titleSfx: ' — التاريخ والتسجيل | عاش يا وحش' },
  en: { when: 'Date', where: 'Place', sport: 'Sport', dist: 'Distances / categories', price: 'Price', org: 'Organiser',
    reg: 'Registration', level: 'Level', age: 'Minimum age', fit: 'Fitness needed', equip: 'Equipment', deadline: 'Registration deadline',
    unknown: 'Not published yet', free: 'Free', from: 'from', to: 'to',
    regs: { open: 'Open', closed: 'Closed', soon: 'Opening soon', unknown: 'Not confirmed — check the organiser’s site' },
    begYes: 'Beginner-friendly', begNo: 'Not suited to a first event',
    register: 'Register on the official site', site: 'Organiser’s website', all: 'All events', home: '3aash Ya Wa7sh',
    verified: (d) => 'These details were checked on the organiser’s official page on ' + fmtDate(d, 'en') + '.',
    partial: 'Some details are not confirmed by the organiser yet — check their site before you plan.',
    postponed: 'The organiser has postponed this event — follow their site for the new date.',
    source: 'Source', check: '3aash Ya Wa7sh is not the organiser and does not sell tickets. Always confirm the details and price on the organiser’s site before paying, and if you have a health condition, ask your doctor first.',
    ctaH: 'Want to get ready for this?', ctaP: 'Fill in the 3aash Ya Wa7sh form and professional coaches will write a program for your level — free.', ctaB: 'Let’s start',
    titleSfx: ' — date and registration | 3aash Ya Wa7sh' }
};
function placeText(e, lang) {
  const c = COUNTRY[e.country];
  const city = lang === 'ar' ? (CITY_AR[e.city] || e.city) : e.city;
  const country = lang === 'ar' && c ? c[1] : e.country;
  return [e.venue, city, country].filter(Boolean).join(lang === 'ar' ? '، ' : ', ');
}
function priceText(e, lang) {
  const L = EVT[lang];
  let s;
  if (e.price_from === 0 && !e.price_to) s = L.free;
  else if (e.price_from != null && e.currency) {
    s = L.from + ' ' + e.price_from + (e.price_to && e.price_to !== e.price_from ? ' ' + L.to + ' ' + e.price_to : '') + ' ' + e.currency;
  } else s = L.unknown;
  const note = pick(e.price_note, lang);
  return note ? s + ' — ' + note : s;
}
const evFile = (e, lang) => 'events/' + e.event_id + (lang === 'en' ? '-en' : '') + '.html';
const canRegister = (e) => e.verification_status === 'verified' && e.registration_status === 'open' && /^https:\/\//.test(e.registration_url || '');

function eventLd(e, lang, file) {
  const c = COUNTRY[e.country];
  const ev = { '@type': 'SportsEvent', '@id': url(file) + '#event', name: pick(e.title, lang), description: pick(e.description, lang),
    url: url(file), inLanguage: lang, startDate: isoStart(e),
    eventStatus: 'https://schema.org/' + (e.verification_status === 'postponed' ? 'EventPostponed' : 'EventScheduled'),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: e.venue || e.city,
      address: Object.assign({ '@type': 'PostalAddress', addressLocality: e.city }, c ? { addressCountry: c[0] } : {}) } };
  if (day(e.end_date)) ev.endDate = day(e.end_date);
  if (e.sport) ev.sport = e.sport;
  if (e.organizer) ev.organizer = Object.assign({ '@type': 'Organization', name: e.organizer }, e.official_website ? { url: e.official_website } : {});
  const offerUrl = e.registration_url || e.official_website;
  if (e.price_from != null && e.currency && /^[A-Z]{3}$/.test(e.currency) && offerUrl) {
    ev.offers = Object.assign({ '@type': 'Offer', price: e.price_from, priceCurrency: e.currency, url: offerUrl },
      e.registration_status === 'open' ? { availability: 'https://schema.org/InStock' } : {});
  }
  return ev;
}
function siteHeader(lang, prefix, altHref) {
  const home = prefix + (lang === 'ar' ? 'index.html' : 'en.html');
  const evs = prefix + (lang === 'ar' ? 'events.html' : 'events-en.html');
  return `<a class="skip" href="#main">${esc(t(lang, 'skip.link'))}</a>

<header class="site-header">
  <div class="wrap site-header__in">
    <a class="brand" href="${home}">
      <img class="brand__logo" src="${prefix}assets/logo-sm.png" width="360" height="207" alt="${attr(t(lang, 'brand.name'))}">
      <small class="brand__tag">${esc(t(lang, 'brand.tagline'))}</small>
    </a>
    <a class="hdr-link hdr-link--ev" href="${evs}">${esc(t(lang, 'nav.events'))}</a>
    <a class="hdr-link" href="${prefix}login.html">${esc(t(lang, 'nav.login'))}</a>
    <a class="lang" href="${altHref}" hreflang="${lang === 'ar' ? 'en' : 'ar'}" lang="${lang === 'ar' ? 'en' : 'ar'}">${lang === 'ar' ? 'English' : 'العربية'}</a>
  </div>
</header>`;
}
function siteFooter(lang, prefix, altHref) {
  const p = (f) => prefix + (lang === 'ar' ? f : EN_HREF[f]);
  return `<footer class="site-footer">
  <div class="wrap">
    <nav class="site-footer__nav" aria-label="footer">
      <a href="${p('index.html')}">${esc(t(lang, 'pp.back'))}</a>
      <a href="${p('events.html')}">${esc(t(lang, 'nav.events'))}</a>
      <a href="${p('privacy.html')}">${esc(t(lang, 'footer.privacy'))}</a>
      <a href="${CFG.instagramUrl}" rel="noopener">${esc(t(lang, 'footer.ig'))}</a>
      ${altLangLink(lang, altHref)}
    </nav>
    <p class="site-footer__note">${esc(t(lang, 'footer.made'))}</p>
    <p class="site-footer__rights">© ${today.slice(0, 4)} ${esc(t(lang, 'footer.rights'))}</p>
  </div>
</footer>`;
}
function headCommon(lang, prefix, title, desc) {
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${I18N.dir[lang]}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(desc)}">
<meta name="theme-color" content="#394F9F">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="index, follow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Noto+Naskh+Arabic:wght@600;700&family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="${prefix}styles.css?v=${V}">
<link rel="icon" type="image/png" sizes="64x64" href="${prefix}assets/favicon-64.png">
<link rel="apple-touch-icon" href="${prefix}assets/apple-touch-icon.png">
</head>`;
}
function eventPage(e, lang) {
  const L = EVT[lang], file = evFile(e, lang), other = lang === 'ar' ? 'en' : 'ar';
  const title = pick(e.title, lang), desc = pick(e.description, lang);
  const evsFile = lang === 'ar' ? 'events.html' : 'events-en.html', homeFile = lang === 'ar' ? 'index.html' : 'en.html';
  const when = fmtDate(day(e.start_date), lang) + (day(e.end_date) && day(e.end_date) !== day(e.start_date) ? ' – ' + fmtDate(day(e.end_date), lang) : '')
    + (e.start_time ? ' · ' + e.start_time : '');
  const rows = [[L.when, when], [L.where, placeText(e, lang)],
    [L.sport, (t(lang, 'ev.cat.' + e.category) || '').split(' (')[0] + (e.sport ? ' — ' + e.sport : '')],
    [L.dist, pick(e.distances, lang)], [L.price, priceText(e, lang)], [L.org, e.organizer],
    [L.reg, L.regs[e.registration_status] || L.regs.unknown],
    [L.deadline, day(e.registration_deadline) ? fmtDate(day(e.registration_deadline), lang) : ''],
    [L.level, e.beginner_friendly === 'yes' ? L.begYes : e.beginner_friendly === 'no' ? L.begNo : ''],
    [L.age, e.minimum_age ? String(e.minimum_age) : ''], [L.fit, pick(e.fitness_requirements, lang)], [L.equip, pick(e.equipment, lang)]]
    .filter((r) => r[1]);
  const note = e.verification_status === 'verified' && day(e.last_verified) ? L.verified(day(e.last_verified))
    : e.verification_status === 'postponed' ? L.postponed : L.partial;
  const graph = [webPage('WebPage', lang, file, title + L.titleSfx, desc, { mainEntity: { '@id': url(file) + '#event' } }),
    eventLd(e, lang, file), crumbs([[L.home, url(homeFile)], [t(lang, 'nav.events'), url(evsFile)], [title, url(file)]])];
  const head = headCommon(lang, '../', title + L.titleSfx, desc).replace('</head>', headBlock({ lang, canonical: url(file),
    arUrl: url(evFile(e, 'ar')), enUrl: url(evFile(e, 'en')), title: title + L.titleSfx, desc, prefix: '../', graph }) + '\n</head>');
  const altHref = e.event_id + (other === 'en' ? '-en' : '') + '.html';
  return `${head}
<body>
<!-- Made by tools/build-seo.js from docs/events — do not edit by hand. -->
${siteHeader(lang, '../', altHref)}

<main id="main" class="wrap art evpage">
  <nav class="crumbs" aria-label="breadcrumb"><a href="../${homeFile}">${esc(L.home)}</a> › <a href="../${evsFile}">${esc(t(lang, 'nav.events'))}</a></nav>
  <p><span class="badge">${esc((t(lang, 'ev.cat.' + e.category) || e.category).split(' (')[0])}</span>${e.verification_status !== 'verified' ? ' <span class="badge badge--warn">' + esc(lang === 'ar' ? 'تفاصيل غير مؤكدة' : 'Details not confirmed') + '</span>' : ''}</p>
  <h1>${esc(title)}</h1>
  <p class="art__lead">${esc(desc)}</p>
  <dl class="evpage__facts">
${rows.map((r) => '    <dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('\n')}
  </dl>
  <div class="evpage__actions">
${canRegister(e) ? '    <a class="btn btn--primary btn--lg" href="' + attr(e.registration_url) + '" target="_blank" rel="noopener noreferrer">' + esc(L.register) + '</a>\n' : ''}${e.official_website ? '    <a class="btn btn--ghost" href="' + attr(e.official_website) + '" target="_blank" rel="noopener noreferrer">' + esc(L.site) + '</a>\n' : ''}  </div>
  <p class="art__meta">${esc(note)}${e.source_url ? ' <a href="' + attr(e.source_url) + '" target="_blank" rel="noopener noreferrer">' + esc(L.source) + '</a>' : ''}</p>
  <p class="care">${esc(L.check)}</p>
  <div class="art__cta">
    <h2>${esc(L.ctaH)}</h2>
    <p>${esc(L.ctaP)}</p>
    <a class="btn btn--primary" href="../${homeFile}">${esc(L.ctaB)}</a>
  </div>
  <p><a href="../${evsFile}">← ${esc(L.all)}</a></p>
</main>

${siteFooter(lang, '../', altHref)}
</body>
</html>
`;
}
function eventListHtml(events, lang) {
  return '\n    <ul class="evlist__list">\n' + events.map((e) => '      <li><a href="' + (lang === 'ar' ? evFile(e, 'ar') : evFile(e, 'en')) + '"><strong>'
    + esc(pick(e.title, lang)) + '</strong><span>' + esc(fmtDate(day(e.start_date), lang)) + ' · ' + esc(placeText(Object.assign({}, e, { venue: '' }), lang))
    + '</span></a></li>').join('\n') + '\n    </ul>\n';
}

/* ------------------------------------------------------------- articles */
function articleInfo(file) {
  const html = rd(file);
  const title = strip((html.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  const h1 = strip((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || title);
  const faq = [...html.matchAll(/<details class="faq__item"><summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
    .map((m) => [strip(m[1]), strip(m[2])]);
  return { html, title, desc: desc.replace(/&quot;/g, '"').replace(/&amp;/g, '&'), h1, faq };
}

/* ------------------------------------------------------------------ run */
const sitemap = [];
function addUrl(arFile, enFile, lastmod) {
  [arFile, enFile].forEach((f) => sitemap.push({ loc: url(f), lastmod, ar: url(arFile), en: url(enFile) }));
}
const events = loadEvents().filter(eventIsPublishable)
  .sort((a, b) => day(a.start_date).localeCompare(day(b.start_date)) || a.event_id.localeCompare(b.event_id));
const i18nDate = fileDate('i18n.js');

Object.entries(PAGES).forEach(([kind, p]) => {
  let src = rd(p.ar);
  if (kind === 'events') src = setBlock(src, 'EVLIST', eventListHtml(events, 'ar'));
  const build = (lang) => {
    const file = p[lang];
    let html = prerender(src, lang);
    if (lang === 'en') {
      html = toEnglishLinks(html, p.ar);
      if (kind === 'events') html = setBlock(html, 'EVLIST', eventListHtml(events, 'en'));
      html = html.replace('<body', '<!-- English twin of ' + p.ar + ', made by tools/build-seo.js. Edit ' + p.ar + ' / i18n.js and re-run; do not edit this file. -->\n<body');
    }
    const title = t(lang, p.title), desc = t(lang, p.desc);
    const graph = [];
    if (kind === 'home') {
      graph.push(webPage('WebPage', lang, file, title, desc, { mainEntity: { '@id': BASE + '#org' } }));
      const pairs = [];
      for (let i = 1; I18N[lang]['faq.' + i + '.q']; i++) pairs.push([t(lang, 'faq.' + i + '.q'), t(lang, 'faq.' + i + '.a')]);
      graph.push(faqLd(pairs, lang, file));
    } else if (kind === 'events') {
      graph.push(webPage('CollectionPage', lang, file, title, desc, { mainEntity: { '@type': 'ItemList', numberOfItems: events.length,
        itemListElement: events.map((e, i) => ({ '@type': 'ListItem', position: i + 1, url: url(evFile(e, lang)), name: pick(e.title, lang) })) } }));
    } else {
      graph.push(webPage('WebPage', lang, file, title, desc));
    }
    html = setHead(html, headBlock({ lang, canonical: url(file), arUrl: url(p.ar), enUrl: url(p.en), title, desc, graph }));
    if (wr(file, html)) changed.push(file);
  };
  build('ar');
  build('en');
  addUrl(p.ar, p.en, maxDate(fileDate(p.ar), i18nDate));
});

Object.values(ARTICLES).forEach((a) => {
  ['ar', 'en'].forEach((lang) => {
    const file = a[lang];
    if (!fs.existsSync(path.join(ROOT, file))) { console.warn('missing article ' + file); return; }
    const info = articleInfo(file);
    const modified = fileDate(file);
    const homeFile = lang === 'ar' ? 'index.html' : 'en.html';
    const graph = [
      webPage('WebPage', lang, file, info.title, info.desc, { mainEntity: { '@id': url(file) + '#article' } }),
      { '@type': 'Article', '@id': url(file) + '#article', headline: info.h1, description: info.desc, inLanguage: lang,
        url: url(file), image: OG_IMAGE.url, datePublished: a.published, dateModified: maxDate(a.published, modified),
        author: { '@id': BASE + '#org' }, publisher: { '@id': BASE + '#org' }, mainEntityOfPage: { '@id': url(file) + '#page' } },
      crumbs([[lang === 'ar' ? 'عاش يا وحش' : '3aash Ya Wa7sh', url(homeFile)], [info.h1, url(file)]])
    ];
    if (info.faq.length) graph.push(faqLd(info.faq, lang, file));
    const html = setHead(info.html, headBlock({ lang, canonical: url(file), arUrl: url(a.ar), enUrl: url(a.en),
      title: info.title, desc: info.desc, ogType: 'article', graph }));
    if (wr(file, html)) changed.push(file);
  });
  addUrl(a.ar, a.en, maxDate(fileDate(a.ar), fileDate(a.en)));
});

/* Event pages: write the current ones, remove the ones that no longer qualify. */
const keep = new Set();
events.forEach((e) => {
  ['ar', 'en'].forEach((lang) => {
    const f = evFile(e, lang);
    keep.add(path.basename(f));
    if (wr(f, eventPage(e, lang))) changed.push(f);
  });
  addUrl(evFile(e, 'ar'), evFile(e, 'en'), maxDate(day(e.last_verified), fileDate('docs/events')));
});
const evDir = path.join(ROOT, 'events');
if (fs.existsSync(evDir)) fs.readdirSync(evDir).filter((f) => f.endsWith('.html') && !keep.has(f)).forEach((f) => {
  fs.unlinkSync(path.join(evDir, f)); changed.push('removed events/' + f);
});

/* sitemap.xml */
const sm = ['<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
  .concat(sitemap.map((u) => ['  <url>', '    <loc>' + u.loc + '</loc>', '    <lastmod>' + u.lastmod + '</lastmod>',
    '    <xhtml:link rel="alternate" hreflang="ar" href="' + u.ar + '"/>',
    '    <xhtml:link rel="alternate" hreflang="en" href="' + u.en + '"/>',
    '    <xhtml:link rel="alternate" hreflang="x-default" href="' + u.ar + '"/>', '  </url>'].join('\n')))
  .concat(['</urlset>', '']).join('\n');
if (wr('sitemap.xml', sm)) changed.push('sitemap.xml');

/* llms.txt — a plain summary for AI systems (no guarantee anyone reads it). */
const art = Object.values(ARTICLES).filter((a) => fs.existsSync(path.join(ROOT, a.en)));
const llms = `# 3aash Ya Wa7sh (عاش يا وحش)

> ${t('en', 'about.p1')} ${t('en', 'about.p2')}

Arabic name: عاش يا وحش. English name: 3aash Ya Wa7sh. Website: ${BASE} (Arabic is the main language; every public page also has an English version).

## Key facts
${[1, 2, 3, 4, 5].map((i) => '- ' + t('en', 'about.f.' + i)).join('\n')}
- Founder: Dr. Ahmed Amrousy (أحمد عمروسي) — ${t('en', 'team.founder.body')}
- Coaching: ${t('en', 'team.coaches.body')}
- Who can join: ${t('en', 'faq.1.a')}
- Safety: ${t('en', 'pil.3.d')}
- Instagram: ${CFG.instagramUrl}
- 3aash Ya Wa7sh does not organise the races it lists and does not sell tickets; registration is always on the organiser's own website.

## Main pages
- [Home and sign-up form](${url('en.html')}): what the initiative is, how it works, common questions. Arabic: ${BASE}
- [Find Your Challenge](${url('events-en.html')}): races and sports events in Egypt and the Gulf, with dates, prices and official links. Arabic: ${url('events.html')}
- [Privacy policy](${url('privacy-en.html')}). Arabic: ${url('privacy.html')}

## Guides
${art.map((a) => { const i = articleInfo(a.en); return '- [' + i.h1 + '](' + url(a.en) + '): ' + i.desc + ' Arabic: ' + url(a.ar); }).join('\n')}

## Upcoming events listed (as of ${today})
${events.map((e) => '- [' + pick(e.title, 'en') + '](' + url(evFile(e, 'en')) + '): ' + fmtDate(day(e.start_date), 'en') + ', ' + placeText(Object.assign({}, e, { venue: '' }), 'en')).join('\n')}

## Optional
- [Sitemap](${BASE}sitemap.xml)
`;
if (wr('llms.txt', llms)) changed.push('llms.txt');

console.log('build-seo: ' + events.length + ' event pages; ' + (changed.length ? 'changed:\n  ' + changed.join('\n  ') : 'nothing changed'));
