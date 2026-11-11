/* =============================================================================
   events.js — "Find Your Challenge": sports events anyone can take part in.
   -----------------------------------------------------------------------------
   One `events_list` call brings every current event (a few hundred at most),
   so search, filters and sorting run in the browser and answer instantly.
   The register button appears only for an event the coach has verified with
   open registration and a working link, and it always opens the organiser's
   own page. Clicking it never means "registered" — this site cannot know.
   Event text is set with textContent only.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.AYW;
  var $ = A.$, $$ = A.$$, el = A.el, t = A.t;

  var state = { all: [], fx: null, today: '', favs: {}, open: null, loggedIn: false };

  var CATS = ['running', 'swimming', 'cycling', 'multisport', 'fitness', 'obstacle', 'hiking', 'team', 'racket',
              'combat', 'water', 'winter', 'adventure', 'dance', 'recreational', 'other'];
  var LEVELS = ['complete_beginner', 'beginner', 'amateur', 'intermediate', 'advanced', 'professional'];
  var TYPES = ['race', 'challenge', 'charity', 'fitness', 'adventure', 'festival', 'tournament'];
  var TIMES = ['early', 'morning', 'afternoon', 'evening', 'night'];
  var REG = ['open', 'soon', 'sold_out', 'closed'];
  var DEFAULT_REG = { open: true, soon: true };

  /* One line icon per category. */
  var ICONS = {
    running: '<circle cx="15" cy="4.5" r="1.6"/><path d="M7 21l3-6 3 2v5"/><path d="M6 12l3-4 4 1 3 4 3 1"/><path d="M10 15l1-6"/>',
    swimming: '<path d="M3 17c2 0 2 1.5 4.5 1.5S10 17 12 17s2 1.5 4.5 1.5S19 17 21 17"/><circle cx="16.5" cy="6.5" r="1.6"/><path d="M5 13l5-4 3 2 3-1"/>',
    cycling: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7"/><path d="M10 9l2 7"/>',
    multisport: '<circle cx="5" cy="17" r="2.5"/><circle cx="12" cy="17" r="2.5"/><circle cx="19" cy="17" r="2.5"/><path d="M5 11l7-6 7 6"/>',
    fitness: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6"/><path d="M7 12h10"/>',
    obstacle: '<path d="M3 20h18"/><path d="M6 20V9h12v11"/><path d="M6 13h12M10 9v11M14 9v11"/>',
    hiking: '<path d="M3 20l6-10 4 6 3-4 5 8z"/><path d="M14 5l2-2 2 2"/>',
    team: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16M4 12h16"/>',
    racket: '<ellipse cx="10" cy="9" rx="5" ry="6"/><path d="M13.5 13.5L20 20"/><circle cx="18" cy="6" r="1.5"/>',
    combat: '<path d="M7 11V7a2 2 0 0 1 4 0v4"/><path d="M11 9a2 2 0 0 1 4 0v3"/><path d="M15 10a2 2 0 0 1 3 1v3a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-3l-1-3 2-1 2 2"/>',
    water: '<path d="M3 15c2 0 2 1.5 4.5 1.5S10 15 12 15s2 1.5 4.5 1.5S19 15 21 15"/><path d="M4 12l8-8 8 8"/><path d="M12 4v11"/>',
    winter: '<path d="M12 3v18M4 7.5l16 9M20 7.5l-16 9"/>',
    adventure: '<path d="M12 3l3 6 6 1-4.5 4 1 6-5.5-3-5.5 3 1-6L3 10l6-1z"/>',
    dance: '<circle cx="12" cy="4.5" r="1.6"/><path d="M12 7v6l-4 7M12 13l4 7"/><path d="M6 10l6-2 6 3"/>',
    recreational: '<circle cx="12" cy="12" r="8"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 10h.01M15 10h.01"/>',
    other: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'
  };
  function icon(cat, cls) {
    var s = el('span', { class: cls || 'evc__icon', 'aria-hidden': 'true' });
    s.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + (ICONS[cat] || ICONS.other) + '</svg>';
    return s;
  }

  /* ---------------------------------------------------------------- helpers */
  function txt(bi) { return !bi ? '' : (A.getLang() === 'en' && bi.en) ? bi.en : (bi.ar || bi.en || ''); }
  function dayNum(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? Math.round(Date.UTC(+m[1], m[2] - 1, +m[3]) / 864e5) : NaN; }
  function isoOf(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
  function locale() { return A.getLang() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB'; }
  function fmtDate(iso, opts) {
    if (!iso) return t('ev.unknown');
    try { return new Date(iso + 'T12:00:00Z').toLocaleDateString(locale(), Object.assign({ day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }, opts || {})); }
    catch (e) { return iso; }
  }
  function dateRange(e) {
    if (!e.end_date || e.end_date === e.start_date) return fmtDate(e.start_date, { weekday: 'short' });
    return fmtDate(e.start_date, { year: undefined }) + ' – ' + fmtDate(e.end_date);
  }
  function timeOfDay(hhmm) {
    if (!hhmm) return '';
    var h = Number(hhmm.split(':')[0]);
    return h < 7 ? 'early' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
  }
  function money(n, cur) {
    try { return new Intl.NumberFormat(locale(), { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n); }
    catch (e) { return n + ' ' + (cur || ''); }
  }
  function priceText(e) {
    if (e.price_from === 0 && (e.price_to === null || e.price_to === 0)) return t('ev.free');
    if (e.price_from === null) return t('ev.price.unknown');
    var s = money(e.price_from, e.currency);
    if (e.price_to !== null && e.price_to > e.price_from) s = t('ev.price.range', { from: s, to: money(e.price_to, e.currency) });
    return s;
  }
  function daysTo(e) { return dayNum(e.start_date) - dayNum(state.today); }
  function catLabel(c) { return t('ev.cat.' + (c || 'other')); }
  /* Arabic shows the translated category; English adds the exact sport if it says more. */
  function sportLabel(e) {
    var c = catLabel(e.category);
    return A.getLang() === 'en' && e.sport && e.sport.toLowerCase() !== c.toLowerCase() ? e.sport + ' · ' + c : c;
  }
  function levelLabel(l) { return l ? t('ev.lvl.' + l) : t('ev.unknown'); }

  /* ---------------------------------------------------------------- filters */
  function fillSelect(sel, values, labelFn, anyKey) {
    var cur = sel.value;
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '' }, t(anyKey || 'ev.any')));
    values.forEach(function (v) { sel.appendChild(el('option', { value: v }, labelFn(v))); });
    if (values.indexOf(cur) !== -1) sel.value = cur;
  }

  function buildFilters() {
    var present = function (key) {
      var seen = {};
      state.all.forEach(function (e) { if (e[key]) seen[e[key]] = 1; });
      return Object.keys(seen);
    };
    /* Sports and countries come from the events themselves. */
    fillSelect($('#ev-cat'), CATS.filter(function (c) { return present('category').indexOf(c) !== -1; }), catLabel);
    fillSelect($('#ev-country'), present('country').sort(), function (v) { return v; });
    fillCities();
    fillSelect($('#ev-level'), LEVELS, levelLabel);
    fillSelect($('#ev-type'), TYPES, function (v) { return t('ev.type.' + v); });

    var tHost = $('#ev-time');
    if (!tHost.children.length) {
      TIMES.forEach(function (k) {
        tHost.appendChild(el('input', { type: 'checkbox', class: 'chip__input', id: 'tm-' + k, value: k }));
        tHost.appendChild(el('label', { class: 'chip', for: 'tm-' + k, 'data-i18n': 'ev.time.' + k }, t('ev.time.' + k)));
      });
      REG.forEach(function (k) {
        $('#ev-reg').appendChild(el('input', { type: 'checkbox', class: 'chip__input', id: 'rg-' + k, value: k, checked: !!DEFAULT_REG[k] }));
        $('#ev-reg').appendChild(el('label', { class: 'chip', for: 'rg-' + k, 'data-i18n': 'ev.reg.' + k }, t('ev.reg.' + k)));
      });
    }
    $('#ev-fxnote').textContent = state.fx ? t('ev.fx', { date: state.fx.date }) : '';
  }

  function fillCities() {
    var country = $('#ev-country').value, seen = {};
    state.all.forEach(function (e) { if (e.city && (!country || e.country === country)) seen[e.city] = 1; });
    fillSelect($('#ev-city'), Object.keys(seen).sort(), function (v) { return v; });
  }

  function checked(host) { return $$('input:checked', host).map(function (i) { return i.value; }); }

  function readFilters() {
    return {
      q: $('#ev-q').value.trim().toLowerCase(), cat: $('#ev-cat').value, country: $('#ev-country').value,
      city: $('#ev-city').value, date: $('#ev-date').value, from: $('#ev-from').value, to: $('#ev-to').value,
      level: $('#ev-level').value, price: $('#ev-price').value, pmin: $('#ev-pmin').value, pmax: $('#ev-pmax').value,
      part: $('#ev-part').value, type: $('#ev-type').value, times: checked($('#ev-time')), reg: checked($('#ev-reg')),
      sort: $('#ev-sort').value
    };
  }

  function dateWindow(f) {
    var today = dayNum(state.today);
    if (f.date === 'today') return [today, today];
    if (f.date === 'tomorrow') return [today + 1, today + 1];
    if (f.date === 'weekend') {
      /* Friday + Saturday: the weekend in Egypt and the Gulf. */
      var wd = new Date(today * 864e5).getUTCDay();
      var fri = today + ((5 - wd + 7) % 7);
      return [wd === 6 ? today : fri, wd === 6 ? today : fri + 1];
    }
    if (/^\d+$/.test(f.date)) return [today, today + Number(f.date)];
    if (f.date === 'custom') return [f.from ? dayNum(f.from) : -Infinity, f.to ? dayNum(f.to) : Infinity];
    return null;
  }

  function priceOk(e, f) {
    if (!f.price) return true;
    if (f.price === 'free') return e.price_from === 0;
    var lo, hi;
    if (f.price === 'custom') { lo = f.pmin === '' ? 0 : Number(f.pmin); hi = f.pmax === '' ? Infinity : Number(f.pmax); }
    else { var p = f.price.split('-'); lo = Number(p[0]); hi = p[1] === '' ? Infinity : Number(p[1]); }
    /* Only events with a known price in a currency we have a rate for. */
    if (e.price_usd === null) return false;
    return e.price_usd >= lo && e.price_usd <= hi;
  }

  function matches(e, f) {
    if (f.q) {
      var hay = [e.title.ar, e.title.en, e.sport, e.country, e.city, e.venue, e.organizer, e.description.ar, e.description.en,
                 catLabel(e.category)].join(' ').toLowerCase();
      if (hay.indexOf(f.q) === -1) return false;
    }
    if (f.cat && e.category !== f.cat) return false;
    if (f.country && e.country !== f.country) return false;
    if (f.city && e.city !== f.city) return false;
    var w = dateWindow(f);
    if (w) {
      var s = dayNum(e.start_date), en = dayNum(e.end_date || e.start_date);
      if (en < w[0] || s > w[1]) return false;
    }
    if (f.level && e.difficulty !== f.level) return false;
    if (!priceOk(e, f)) return false;
    if (f.part && !(e.participation_type === f.part || (f.part !== 'both' && e.participation_type === 'both'))) return false;
    if (f.type && e.event_type !== f.type) return false;
    if (f.times.length && f.times.indexOf(timeOfDay(e.start_time)) === -1) return false;
    var reg = e.verification_status === 'canceled' ? 'closed' : (e.registration_status === 'unknown' ? 'soon' : e.registration_status);
    if (f.reg.length && f.reg.indexOf(reg) === -1) return false;
    return true;
  }

  function sorted(list, how) {
    var k = list.slice();
    var price = function (e) { return e.price_usd === null ? Infinity : e.price_usd; };
    if (how === 'date_desc') k.sort(function (a, b) { return b.start_date.localeCompare(a.start_date); });
    else if (how === 'score') k.sort(function (a, b) { return b.commitment_score - a.commitment_score || a.start_date.localeCompare(b.start_date); });
    else if (how === 'price') k.sort(function (a, b) { return price(a) - price(b); });
    else if (how === 'price_desc') k.sort(function (a, b) { return (b.price_usd === null ? -1 : b.price_usd) - (a.price_usd === null ? -1 : a.price_usd); });
    else k.sort(function (a, b) { return a.start_date.localeCompare(b.start_date); });
    return k;
  }

  function activeCount(f) {
    var n = 0;
    ['q', 'cat', 'country', 'city', 'date', 'level', 'price', 'part', 'type'].forEach(function (k) { if (f[k]) n++; });
    if (f.times.length) n++;
    if (f.reg.join() !== 'open,soon') n++;
    return n;
  }

  /* ------------------------------------------------------------------ cards */
  function statusBadge(e) {
    if (e.verification_status === 'canceled') return el('span', { class: 'evb evb--closed' }, t('ev.canceled'));
    if (e.verification_status === 'postponed') return el('span', { class: 'evb evb--soon' }, t('ev.postponed'));
    var s = e.registration_status === 'unknown' ? 'soon' : e.registration_status;
    return el('span', { class: 'evb evb--' + s }, t('ev.reg.' + s));
  }

  function card(e, compact) {
    var d = daysTo(e);
    var meta = [
      el('span', { class: 'evc__date' }, dateRange(e) + (e.start_time ? ' · ' + e.start_time : '')),
      el('span', null, [e.city, e.country].filter(Boolean).join('، ')),
      e.distances ? el('span', null, e.distances) : (txt(e.duration) ? el('span', null, txt(e.duration)) : null),
      el('span', { class: 'evc__price' }, priceText(e))
    ];
    var badges = [statusBadge(e), el('span', { class: 'evb evb--lvl' }, levelLabel(e.difficulty))];
    if (e.beginner_friendly === 'yes') badges.push(el('span', { class: 'evb evb--beg' }, t('ev.beginner_ok')));
    var node = el('article', { class: 'evc' + (compact ? ' evc--compact' : '') }, [
      el('div', { class: 'evc__top' }, [icon(e.category),
        el('div', null, [el('p', { class: 'evc__sport' }, sportLabel(e)),
                         el('h3', { class: 'evc__title' }, txt(e.title))]),
        el('span', { class: 'evc__score', dir: 'ltr', title: t('ev.score.title') }, [el('b', null, String(e.commitment_score)), el('small', null, '/100')])]),
      el('div', { class: 'evc__badges' }, badges),
      el('div', { class: 'evc__meta' }, meta),
      compact ? null : el('p', { class: 'evc__desc' }, txt(e.description)),
      d >= 0 ? el('p', { class: 'evc__count' }, d === 0 ? t('ev.today') : t('ev.days', { n: d })) : null,
      el('div', { class: 'evc__actions' }, [
        el('button', { type: 'button', class: 'btn btn--ghost btn--sm', on: { click: function () { openEvent(e.event_id); } } }, t('ev.details')),
        e.can_register
          ? el('a', { class: 'btn btn--primary btn--sm', href: e.registration_url, target: '_blank', rel: 'noopener noreferrer' }, t('ev.register'))
          : null
      ])
    ]);
    return node;
  }

  function render() {
    var f = readFilters();
    $('#ev-range').hidden = f.date !== 'custom';
    $('#ev-prange').hidden = f.price !== 'custom';
    var list = sorted(state.all.filter(function (e) { return matches(e, f); }), f.sort);
    var host = $('#ev-list');
    host.innerHTML = '';
    list.forEach(function (e) { host.appendChild(card(e)); });
    $('#ev-count').textContent = t('ev.count', { n: list.length });
    $('#ev-empty').hidden = list.length > 0 || !state.all.length;
    var n = activeCount(f);
    $('#ev-fcount').textContent = n ? '(' + n + ')' : '';

    /* "Perfect for someone starting sports": beginner-level, open or soon,
       at least two weeks away, best Commitment Score first. */
    var starters = state.all.filter(function (e) {
      return (e.difficulty === 'complete_beginner' || e.difficulty === 'beginner' || e.beginner_friendly === 'yes') &&
             (e.registration_status === 'open' || e.registration_status === 'soon') &&
             e.verification_status !== 'canceled' && daysTo(e) >= 14;
    }).sort(function (a, b) { return b.commitment_score - a.commitment_score; }).slice(0, 6);
    $('#ev-starters').hidden = !starters.length;
    var sh = $('#ev-starters-list');
    sh.innerHTML = '';
    starters.forEach(function (e) { sh.appendChild(card(e, true)); });
  }

  function clearFilters() {
    ['#ev-q', '#ev-from', '#ev-to', '#ev-pmin', '#ev-pmax'].forEach(function (s) { $(s).value = ''; });
    ['#ev-cat', '#ev-country', '#ev-date', '#ev-level', '#ev-price', '#ev-part', '#ev-type'].forEach(function (s) { $(s).value = ''; });
    $('#ev-sort').value = 'date';
    fillCities();
    $$('#ev-time input').forEach(function (i) { i.checked = false; });
    $$('#ev-reg input').forEach(function (i) { i.checked = !!DEFAULT_REG[i.value]; });
    render();
  }

  /* ----------------------------------------------------------------- details */
  function fact(dl, key, value) {
    if (value === '' || value === null || value === undefined) value = t('ev.unknown');
    dl.appendChild(el('div', { class: 'c-dl__row' }, [el('dt', null, t(key)), el('dd', { dir: 'auto' }, String(value))]));
  }

  function countdown(e) {
    var d = daysTo(e);
    if (!isFinite(d)) return '';
    if (d < 0) return t('ev.started');
    if (d === 0) return t('ev.today');
    var weeks = Math.floor(d / 7);
    return t('ev.countdown', { d: d }) + (weeks >= 2 ? ' — ' + t('ev.weeks_to_train', { w: weeks }) : '');
  }

  function openEvent(id, fromHash) {
    var e = state.all.filter(function (x) { return x.event_id === id; })[0];
    if (!e) return;
    state.open = e;
    var ic = $('#ev-d-icon'); ic.innerHTML = ''; ic.appendChild(icon(e.category, 'evd__ic'));
    $('#ev-d-sport').textContent = sportLabel(e);
    $('#ev-d-title').textContent = txt(e.title);
    $('#ev-d-where').textContent = [e.venue, e.city, e.country].filter(Boolean).join('، ');
    $('#ev-d-count').textContent = countdown(e);
    var b = $('#ev-d-badges'); b.innerHTML = '';
    [statusBadge(e), el('span', { class: 'evb evb--lvl' }, levelLabel(e.difficulty)),
     e.beginner_friendly === 'yes' ? el('span', { class: 'evb evb--beg' }, t('ev.beginner_ok')) : null,
     el('span', { class: 'evb evb--ver evb--' + e.verification_status }, t('ev.ver.' + e.verification_status))]
      .forEach(function (x) { if (x) b.appendChild(x); });
    $('#ev-d-desc').textContent = txt(e.description);

    var dl = $('#ev-d-facts'); dl.innerHTML = '';
    fact(dl, 'ev.k.date', dateRange(e));
    fact(dl, 'ev.k.time', e.start_time ? e.start_time + (e.timezone ? ' (' + e.timezone + ')' : '') : '');
    fact(dl, 'ev.k.distance', e.distances);
    fact(dl, 'ev.k.duration', txt(e.duration));
    fact(dl, 'ev.k.price', priceText(e) + (txt(e.price_note) ? ' — ' + txt(e.price_note) : ''));
    fact(dl, 'ev.k.deadline', e.registration_deadline ? fmtDate(e.registration_deadline) : '');
    fact(dl, 'ev.k.part', e.participation_type ? t('ev.part.' + e.participation_type) : '');
    fact(dl, 'ev.k.type', e.event_type ? t('ev.type.' + e.event_type) : '');
    fact(dl, 'ev.k.age', e.minimum_age !== null ? t('ev.age', { n: e.minimum_age }) : '');
    fact(dl, 'ev.k.fitness', txt(e.fitness_requirements));
    fact(dl, 'ev.k.equipment', txt(e.equipment));
    fact(dl, 'ev.k.organizer', e.organizer);
    fact(dl, 'ev.k.verified', e.last_verified ? fmtDate(e.last_verified) : '');

    var sc = $('#ev-d-score'); sc.innerHTML = '';
    sc.appendChild(el('p', { class: 'evd__score-h' }, [t('ev.score.h') + ' ', el('b', null, e.commitment_score + '/100')]));
    var parts = e.score_parts || {};
    sc.appendChild(el('ul', { class: 'evd__parts' }, ['beginner', 'individual', 'prep', 'price', 'excitement', 'access']
      .filter(function (k) { return parts[k] !== undefined; })
      .map(function (k) { return el('li', null, t('ev.sp.' + k) + ': ' + parts[k]); })
      .concat(parts.cap ? [el('li', null, t('ev.sp.cap'))] : [])));
    $('#ev-d-note').textContent = e.difficulty === 'advanced' || e.difficulty === 'professional' || e.beginner_friendly === 'no'
      ? t('ev.hard_note') : t('ev.health_note');

    var reg = $('#ev-d-register');
    reg.hidden = !e.can_register;
    if (e.can_register) reg.href = e.registration_url;
    var nr = $('#ev-d-noreg');
    nr.hidden = e.can_register;
    nr.textContent = e.verification_status === 'canceled' ? t('ev.noreg.canceled')
                   : e.registration_status === 'closed' || e.registration_status === 'sold_out' ? t('ev.noreg.closed')
                   : t('ev.noreg.soon');
    var site = $('#ev-d-site');
    site.hidden = !e.official_website;
    if (e.official_website) site.href = e.official_website;
    paintFav();
    calendarLinks(e);
    $('#ev-d-msg').textContent = '';

    if (!fromHash) { try { history.replaceState(null, '', '#e=' + e.event_id); } catch (x) { /* old browsers */ } }
    var dlg = $('#ev-dlg');
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    $('#ev-d-close').focus();
  }

  function closeEvent() {
    var dlg = $('#ev-dlg');
    if (dlg.close && dlg.open) dlg.close(); else dlg.removeAttribute('open');
    state.open = null;
    try { history.replaceState(null, '', window.location.pathname); } catch (x) { /* old browsers */ }
  }

  /* --------------------------------------------------------------- calendar */
  function calTimes(e) {
    var d = e.start_date.replace(/-/g, '');
    if (!e.start_time) {
      var endDay = isoOf(dayNum(e.end_date || e.start_date) + 1).replace(/-/g, '');
      return { allDay: true, start: d, end: endDay };
    }
    var hm = e.start_time.replace(':', '') + '00';
    var endH = (Number(e.start_time.slice(0, 2)) + 3) % 24;           // 3 hours unless we know better
    var endDate = endH < Number(e.start_time.slice(0, 2)) ? isoOf(dayNum(e.start_date) + 1).replace(/-/g, '') : d;
    return { allDay: false, start: d + 'T' + hm, end: endDate + 'T' + (endH < 10 ? '0' : '') + endH + e.start_time.slice(3) + '00' };
  }

  function calendarLinks(e) {
    var c = calTimes(e), title = txt(e.title), where = [e.venue, e.city, e.country].filter(Boolean).join(', ');
    var details = (e.registration_url || e.official_website || '') + '\n— 3aash Ya Wa7sh';
    var g = 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(title) +
            '&dates=' + c.start + '/' + c.end + '&details=' + encodeURIComponent(details) + '&location=' + encodeURIComponent(where) +
            (e.timezone && !c.allDay ? '&ctz=' + encodeURIComponent(e.timezone) : '');
    $('#ev-d-gcal').href = g;
    var iso = function (s) { return s.length === 8 ? s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6) : s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8) + 'T' + s.slice(9, 11) + ':' + s.slice(11, 13) + ':00'; };
    $('#ev-d-ocal').href = 'https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=' +
      encodeURIComponent(title) + '&startdt=' + iso(c.start) + '&enddt=' + iso(c.end) + (c.allDay ? '&allday=true' : '') +
      '&location=' + encodeURIComponent(where) + '&body=' + encodeURIComponent(details);
  }

  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }

  function downloadIcs() {
    var e = state.open;
    if (!e) return;
    var c = calTimes(e);
    var tz = e.timezone && !c.allDay ? ';TZID=' + e.timezone : '';
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//3aash Ya Wa7sh//Find Your Challenge//EN', 'BEGIN:VEVENT',
      'UID:' + e.event_id + '@3aash-ya-wa7sh', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      c.allDay ? 'DTSTART;VALUE=DATE:' + c.start : 'DTSTART' + tz + ':' + c.start,
      c.allDay ? 'DTEND;VALUE=DATE:' + c.end : 'DTEND' + tz + ':' + c.end,
      'SUMMARY:' + icsEscape(txt(e.title)),
      'LOCATION:' + icsEscape([e.venue, e.city, e.country].filter(Boolean).join(', ')),
      'DESCRIPTION:' + icsEscape((e.registration_url || e.official_website || '') + '\n3aash Ya Wa7sh'),
      'END:VEVENT', 'END:VCALENDAR'];
    var blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    var a = el('a', { href: URL.createObjectURL(blob), download: e.event_id + '.ics' });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------------------------------------------------- share + saved */
  function share() {
    var e = state.open;
    if (!e) return;
    var url = window.location.href.replace(/#.*$/, '') + '#e=' + e.event_id;
    var data = { title: txt(e.title), text: t('ev.share.text', { title: txt(e.title) }), url: url };
    if (navigator.share) { navigator.share(data).catch(function () { /* dismissed */ }); return; }
    A.copyText(data.text + ' ' + url).then(function (ok) { $('#ev-d-msg').textContent = t(ok ? 'ev.copied' : 'ev.copy_fail'); });
  }

  function paintFav() {
    var b = $('#ev-d-fav'), e = state.open;
    if (!e) return;
    var saved = !!state.favs[e.event_id];
    b.textContent = saved ? t('ev.fav.saved') : t('ev.fav.save');
    b.setAttribute('aria-pressed', saved ? 'true' : 'false');
  }

  function toggleFav() {
    var e = state.open;
    if (!e) return;
    if (!state.loggedIn) { $('#ev-d-msg').textContent = t('ev.fav.login'); return; }
    A.call('fav_toggle', { event_id: e.event_id }, { onExpired: function () { state.loggedIn = false; } })
      .then(function (res) {
        if (res.saved) state.favs[e.event_id] = 1; else delete state.favs[e.event_id];
        paintFav();
        $('#ev-d-msg').textContent = t(res.saved ? 'ev.fav.added' : 'ev.fav.removed');
      })
      .catch(function (err) { $('#ev-d-msg').textContent = err && err.code === 'session_expired' ? t('ev.fav.login') : A.apiMessage(err && err.code); });
  }

  function loadFavs() {
    var s = A.session.get();
    state.loggedIn = !!(s && s.scope === 'full');
    if (!state.loggedIn) return;
    A.call('fav_list', {}, { onExpired: function () { state.loggedIn = false; } })
      .then(function (res) { (res.event_ids || []).forEach(function (id) { state.favs[id] = 1; }); paintFav(); })
      .catch(function () { /* not fatal: the page works without favourites */ });
  }

  /* ------------------------------------------------------------------- art */
  function heroArt() {
    var host = $('#ev-art');
    ['running', 'swimming', 'cycling', 'hiking', 'fitness', 'racket', 'team', 'water', 'dance'].forEach(function (c, i) {
      var s = icon(c, 'evart__i evart__i--' + (i % 3));
      s.style.setProperty('--i', i);
      host.appendChild(s);
    });
  }

  /* ------------------------------------------------------------------ start */
  function load() {
    var st = $('#ev-status');
    st.hidden = false;
    st.textContent = t('ev.loading');
    A.post({ type: 'events_list' })
      .then(function (res) {
        state.all = res.events || [];
        state.fx = res.fx || null;
        state.today = res.today;
        st.hidden = !!state.all.length;
        st.textContent = state.all.length ? '' : t('ev.none_yet');
        buildFilters();
        render();
        var m = /^#e=([a-z0-9\-]+)$/.exec(window.location.hash);
        if (m) openEvent(m[1], true);
      })
      .catch(function (err) { st.textContent = A.apiMessage(err && err.code); });
  }

  function init() {
    A.initPage();
    heroArt();
    document.addEventListener('ayw:lang', function () { buildFilters(); render(); if (state.open) openEvent(state.open.event_id, true); });

    ['#ev-q'].forEach(function (s) { $(s).addEventListener('input', render); });
    ['#ev-cat', '#ev-city', '#ev-date', '#ev-from', '#ev-to', '#ev-level', '#ev-price', '#ev-pmin', '#ev-pmax', '#ev-part', '#ev-type', '#ev-sort']
      .forEach(function (s) { $(s).addEventListener('change', render); });
    $('#ev-country').addEventListener('change', function () { fillCities(); render(); });
    $('#ev-time').addEventListener('change', render);
    $('#ev-reg').addEventListener('change', render);
    $('#ev-clear').addEventListener('click', clearFilters);
    $('#ev-empty-clear').addEventListener('click', clearFilters);
    $('#ev-d-close').addEventListener('click', closeEvent);
    $('#ev-dlg').addEventListener('cancel', function (e) { e.preventDefault(); closeEvent(); });
    $('#ev-dlg').addEventListener('click', function (e) { if (e.target === this) closeEvent(); });
    $('#ev-d-share').addEventListener('click', share);
    $('#ev-d-fav').addEventListener('click', toggleFav);
    $('#ev-d-ics').addEventListener('click', downloadIcs);
    /* On a phone the filters start folded, so the events are the first thing seen. */
    if (window.matchMedia && window.matchMedia('(max-width: 40rem)').matches) $('#ev-filters').open = false;

    loadFavs();
    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
