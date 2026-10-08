/* =============================================================================
   plan-view.js — draws a program: progress header, week tabs, session cards.
   -----------------------------------------------------------------------------
   Shared by tracker.html (the participant) and coach.html (the preview before
   publishing), so the coach sees exactly what the participant will see.
   Every piece of plan text is set with textContent, never innerHTML.
   ========================================================================== */

window.AYW = window.AYW || {};
window.AYW.PlanView = (function () {
  'use strict';

  var A = window.AYW;
  var el = A.el, t = A.t;

  var DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  /* One small line icon per session type. */
  var ICONS = {
    run:      '<path d="M13 4.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0"/><path d="M7 21l3-6 3 2v5"/><path d="M6 12l3-4 4 1 3 4 3 1"/><path d="M10 15l1-6"/>',
    walk:     '<path d="M11 4.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0"/><path d="M9 21l2-6 3 2 1 4"/><path d="M8 12l2-4h3l2 4 2 1"/>',
    swim:     '<path d="M3 17c2 0 2 1.5 4.5 1.5S10 17 12 17s2 1.5 4.5 1.5S19 17 21 17"/><path d="M15 6.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0"/><path d="M5 13l5-4 3 2 3-1"/>',
    bike:     '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7"/><path d="M10 9l2 7"/><path d="M14 6h2"/>',
    strength: '<path d="M4 9v6M7 7v10M17 7v10M20 9v6"/><path d="M7 12h10"/>',
    mobility: '<circle cx="12" cy="5" r="1.5"/><path d="M12 7v6"/><path d="M5 10l7 2 7-2"/><path d="M8 21l4-8 4 8"/>',
    cross:    '<path d="M4 12h4l2-5 4 10 2-5h4"/>',
    rest:     '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    other:    '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'
  };

  function icon(type) {
    var span = el('span', { class: 'sess__icon', 'aria-hidden': 'true' });
    span.innerHTML = '<svg viewBox="0 0 24 24" focusable="false">' + (ICONS[type] || ICONS.other) + '</svg>';
    return span;
  }

  /** A {ar, en} text in the page language, falling back to Arabic. */
  function txt(bi) {
    if (!bi) return '';
    if (typeof bi === 'string') return bi;
    return (A.getLang() === 'en' && bi.en) ? bi.en : (bi.ar || bi.en || '');
  }

  function weekdayOf(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); }

  function fmtDate(iso) {
    try {
      return new Date(iso + 'T12:00:00Z').toLocaleDateString(A.getLang() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB',
        { day: 'numeric', month: 'short', timeZone: 'UTC' });
    } catch (e) { return iso; }
  }

  /** "Saturday · 12 Oct" when the plan has a start date, else just the weekday. */
  function dayLabel(s, plan) {
    var name = t('opt.days.' + DAY_KEYS[weekdayOf(s.date)]);
    return plan.start_date ? name + ' · ' + fmtDate(s.date) : name;
  }

  function targets(s) {
    var out = [];
    if (s.target_duration_min) out.push(t('pv.min', { n: s.target_duration_min }));
    if (s.target_distance_km) out.push(t('pv.km', { n: s.target_distance_km }));
    if (s.target_intensity) out.push(t('pv.int.' + s.target_intensity));
    if (s.target_reps) out.push(String(s.target_reps));
    return out;
  }

  function pill(status) {
    var st = status || 'todo';
    return el('span', { class: 'pill pill--' + st }, t('pv.st.' + st));
  }

  /**
   * One session card. Loggable cards are buttons; rest days are a calm,
   * plain card. opts.onOpen(session) makes cards tappable.
   */
  function card(s, plan, log, opts) {
    var isRest = s.type === 'rest';
    var today = opts.today && s.date === opts.today;
    var cls = 'sess sess--' + s.type + (isRest ? ' sess--rest' : '') + (today ? ' is-today' : '');
    var body = el('span', { class: 'sess__body' }, [
      el('span', { class: 'sess__day' }, [dayLabel(s, plan), today ? el('span', { class: 'sess__today' }, t('pv.today')) : null]),
      el('span', { class: 'sess__title' }, txt(s.title) || t('pv.type.' + s.type)),
      txt(s.details) ? el('span', { class: 'sess__details' }, txt(s.details)) : null,
      targets(s).length ? el('span', { class: 'sess__targets' },
        targets(s).map(function (x) { return el('span', { class: 'sess__tgt' }, x); })) : null,
      log && log.note ? el('span', { class: 'sess__note' }, log.note) : null
    ]);
    var kids = [icon(s.type), body, isRest ? el('span', { class: 'pill pill--rest' }, t('pv.st.rest')) : pill(log && log.status)];

    if (isRest || !opts.onOpen) {
      return el('div', { class: cls, 'data-session': s.session_id, 'data-status': (log && log.status) || 'todo' }, kids);
    }
    return el('button', {
      type: 'button', class: cls, 'data-session': s.session_id, 'data-status': (log && log.status) || 'todo',
      'aria-label': t('pv.open', { title: txt(s.title) || t('pv.type.' + s.type), day: dayLabel(s, plan) }),
      on: { click: function () { opts.onOpen(s); } }
    }, kids);
  }

  /** The four numbers at the top. No body scores, ever. */
  function header(stats) {
    function tile(value, label) {
      return el('div', { class: 'stat' }, [el('span', { class: 'stat__v' }, String(value)), el('span', { class: 'stat__k' }, label)]);
    }
    if (!stats.started) {
      return el('div', { class: 'stats stats--wait' }, [
        el('p', { class: 'stats__start' }, t('pv.starts', { date: fmtDate(stats.start) }))
      ]);
    }
    return el('div', { class: 'stats' }, [
      tile(t('pv.week.of', { n: stats.current_week, total: stats.weeks }), t('pv.week')),
      tile(stats.done + ' / ' + stats.planned_to_date, t('pv.done.of')),
      tile(stats.adherence === null ? '—' : stats.adherence + '%', t('pv.adherence')),
      tile(stats.streak, t('pv.streak'))
    ]);
  }

  /**
   * Draw the whole program into `host`.
   *   plan   — publicPlan_ shape (by_week) from the server
   *   logs   — {session_id: log}
   *   opts   — {week, today, onOpen, onWeek}
   */
  function render(host, plan, logs, stats, opts) {
    opts = opts || {};
    host.innerHTML = '';
    var week = Math.min(Math.max(opts.week || 1, 1), plan.weeks);

    if (stats) host.appendChild(header(stats));

    var tabs = el('div', { class: 'wtabs', role: 'tablist', 'aria-label': t('pv.weeks') });
    plan.by_week.forEach(function (w) {
      var counted = w.sessions.filter(function (s) { return s.type !== 'rest'; });
      var done = counted.filter(function (s) { return logs[s.session_id] && logs[s.session_id].status === 'done'; }).length;
      var selected = w.week === week;
      tabs.appendChild(el('button', {
        type: 'button', role: 'tab', class: 'wtab' + (selected ? ' is-on' : '') +
          (counted.length && done === counted.length ? ' is-full' : ''),
        id: 'wtab-' + w.week, 'aria-selected': selected ? 'true' : 'false', 'aria-controls': 'wpanel',
        tabindex: selected ? '0' : '-1',
        on: { click: function () { if (opts.onWeek) opts.onWeek(w.week); } }
      }, [el('span', { class: 'wtab__n' }, t('pv.week.n', { n: w.week })),
          counted.length ? el('span', { class: 'wtab__c' }, done + '/' + counted.length) : null]));
    });
    /* Arrow keys move between week tabs, as tab lists should. */
    tabs.addEventListener('keydown', function (e) {
      var rtl = document.documentElement.dir === 'rtl';
      var step = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0;
      if (!step || !opts.onWeek) return;
      e.preventDefault();
      var next = Math.min(Math.max(week + step, 1), plan.weeks);
      opts.onWeek(next, true);
    });
    host.appendChild(tabs);

    var panel = el('div', { class: 'wpanel', id: 'wpanel', role: 'tabpanel', 'aria-labelledby': 'wtab-' + week });
    var wk = plan.by_week[week - 1];
    if (!wk || !wk.sessions.length) panel.appendChild(el('p', { class: 'note' }, t('pv.week.empty')));
    else wk.sessions.forEach(function (s) { panel.appendChild(card(s, plan, logs[s.session_id], opts)); });
    host.appendChild(panel);

    var on = document.getElementById('wtab-' + week);
    if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (e) { /* old browsers */ } }
    return { focusTab: function () { var b = document.getElementById('wtab-' + week); if (b) b.focus(); } };
  }

  return { render: render, txt: txt, dayLabel: dayLabel, fmtDate: fmtDate, icon: icon, pill: pill, targets: targets };
})();
