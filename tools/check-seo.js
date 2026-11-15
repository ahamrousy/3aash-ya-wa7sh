/* check-seo.js — sanity checks on the files build-seo.js makes.
       node tools/check-seo.js        → prints problems, exits 1 if any. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const BASE = 'https://ahmedamrousy.com/3aash-ya-wa7sh/';
const problems = [], seen = { types: {} };
const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const fileOf = (u) => u.replace(BASE, '') || 'index.html';
if (/script\.google|login|tracker|coach|reset|change-password|checkin/.test(sm)) problems.push('sitemap lists a private page or the API');
locs.forEach((u) => {
  const f = fileOf(u), full = path.join(ROOT, f);
  if (!fs.existsSync(full)) return problems.push('sitemap → missing file ' + f);
  const h = fs.readFileSync(full, 'utf8');
  const canon = (h.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  if (canon !== u) problems.push(f + ': canonical ' + canon + ' ≠ ' + u);
  if (/noindex/.test(h)) problems.push(f + ': noindex but in sitemap');
  const alts = [...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)];
  if (alts.length !== 3) problems.push(f + ': expected 3 hreflang links');
  alts.forEach(([, lang, href]) => {
    if (!locs.includes(href)) problems.push(f + ': hreflang ' + lang + ' → ' + href + ' not in sitemap');
    else if (lang !== 'x-default') {
      const back = fs.readFileSync(path.join(ROOT, fileOf(href)), 'utf8');
      if (!back.includes('hreflang="' + (lang === 'ar' ? 'en' : 'ar') + '"') || !back.includes('href="' + u + '"') && href !== u) problems.push(f + ': hreflang not reciprocal with ' + href);
    }
  });
  const lang = (h.match(/<html lang="([a-z]+)"/) || [])[1];
  const self = alts.find((a) => a[2] === u);
  if (!self || self[1] !== lang && !(self[1] === 'x-default')) { const s2 = alts.filter((a) => a[2] === u).map((a) => a[1]); if (!s2.includes(lang)) problems.push(f + ': html lang ' + lang + ' ≠ its hreflang ' + s2); }
  if (!/<title>[^<]{10,}|<title data-i18n-doc="[^"]+">[^<]{10,}/.test(h)) problems.push(f + ': title missing/short');
  const desc = (h.match(/<meta name="description"[^>]*content="([^"]*)"/) || [])[1] || '';
  if (desc.length < 50) problems.push(f + ': description short');
  if ((h.match(/<h1[\s>]/g) || []).length !== 1) problems.push(f + ': needs exactly one h1');
  [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].forEach((m) => {
    let j; try { j = JSON.parse(m[1]); } catch (e) { return problems.push(f + ': JSON-LD does not parse'); }
    (j['@graph'] || [j]).forEach((n) => {
      seen.types[n['@type']] = (seen.types[n['@type']] || 0) + 1;
      if (n['@type'] === 'SportsEvent') {
        ['name', 'startDate', 'location', 'eventStatus', 'eventAttendanceMode'].forEach((k) => { if (!n[k]) problems.push(f + ': SportsEvent missing ' + k); });
        if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})?$/.test(n.startDate)) problems.push(f + ': bad startDate ' + n.startDate);
        if (n.offers && !/^[A-Z]{3}$/.test(n.offers.priceCurrency)) problems.push(f + ': bad currency');
      }
      if (n['@type'] === 'FAQPage') n.mainEntity.forEach((q) => {
        if (!h.includes(q.name.replace(/&/g, '&amp;').slice(0, 20)) && !h.includes(q.name.slice(0, 20))) problems.push(f + ': FAQ question not visible: ' + q.name);
      });
    });
  });
  [...h.matchAll(/(?:href|src)="([^"#:?]+\.(?:html|css|js|png|webmanifest))[^"]*"/g)].forEach(([, rel]) => {
    if (rel.startsWith('/')) return;
    if (!fs.existsSync(path.join(path.dirname(full), rel))) problems.push(f + ': broken link ' + rel);
  });
});
['login.html', 'change-password.html', 'reset.html', 'tracker.html', 'coach.html', 'checkin.html', '404.html'].forEach((f) => {
  if (!/<meta name="robots" content="noindex/.test(fs.readFileSync(path.join(ROOT, f), 'utf8'))) problems.push(f + ' is not noindex');
});
console.log(locs.length + ' URLs in sitemap; JSON-LD types: ' + JSON.stringify(seen.types));
if (problems.length) { console.log('PROBLEMS:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('OK');
