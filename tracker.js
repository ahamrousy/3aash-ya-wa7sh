/* =============================================================================
   tracker.js — the participant's own program, session log and check-in.
   -----------------------------------------------------------------------------
   Everything shown here comes from one `me` call, which the server scopes to
   the logged-in participant. Saving a session is optimistic: the card changes
   at once, and goes back (with a "try again") if the server says no.
   No BMI, waist-to-height or any body score is ever shown.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.AYW, PV = A.PlanView;
  var $ = A.$, $$ = A.$$, el = A.el, t = A.t;

  var state = { me: null, logs: {}, stats: null, week: 1, open: null, view: null };
  var ciSending = false, toastTimer = null, retryFn = null;

  /* ---------------------------------------------------------------------------
     Loading
  --------------------------------------------------------------------------- */
  function load() {
    $('#trk-error').hidden = true;
    $('#trk-loading').hidden = false;
    A.call('me')
      .then(function (res) {
        state.me = res;
        state.logs = {};
        (res.logs || []).forEach(function (l) { state.logs[l.session_id] = l; });
        state.stats = res.stats;
        state.week = res.stats && res.stats.current_week ? res.stats.current_week : 1;
        $('#trk-loading').hidden = true;
        $('#trk-app').hidden = false;
        render();
        prefillSessions();
      })
      .catch(function (err) {
        var code = err && err.code;
        if (code === 'session_expired' || code === 'forbidden' || code === 'password_change_required') return;
        $('#trk-loading').hidden = true;
        $('#trk-error-body').textContent = A.apiMessage(code);
        $('#trk-error').hidden = false;
      });
  }

  /* ---------------------------------------------------------------------------
     Drawing
  --------------------------------------------------------------------------- */
  function render() {
    var me = state.me;
    if (!me) return;
    $('#trk-hello').textContent = t('trk.hello', { name: me.name || '' });
    var plan = me.plan;
    $('#trk-wait').hidden = !!plan;
    $('#trk-plan').hidden = !plan;
    $('#trk-title').textContent = plan ? PV.txt(plan.title) : '';
    $('#trk-title').hidden = !plan;
    if (plan) {
      var note = PV.txt(plan.coach_note);
      $('#trk-note').hidden = !note;
      $('#trk-note-body').textContent = note;
      renderPlan();
    }
    renderTrend();
  }

  function renderPlan(focusTab) {
    /* Redrawing replaces the cards; keep keyboard focus on the same one. */
    var had = document.activeElement && document.activeElement.getAttribute &&
              document.activeElement.getAttribute('data-session');
    state.view = PV.render($('#trk-view'), state.me.plan, state.logs, state.stats, {
      week: state.week, today: state.me.today, onOpen: openSheet,
      onWeek: function (n, focus) { state.week = n; renderPlan(focus); }
    });
    if (focusTab && state.view) state.view.focusTab();
    else if (had) { var c = $('[data-session="' + had + '"]'); if (c) c.focus(); }
  }

  /* A simple line for the person's own weight or waist. No labels that judge. */
  function renderTrend() {
    var cis = (state.me && state.me.checkins) || [];
    var shown = drawTrend($('#trk-trend-weight'), cis, 'weight_kg', 'trk.trend.weight', 'pv.kg')
              | drawTrend($('#trk-trend-waist'), cis, 'waist_cm', 'trk.trend.waist', 'pv.cm');
    $('#trk-trend').hidden = !shown;
  }

  function drawTrend(fig, cis, key, labelKey, unitKey) {
    fig.innerHTML = '';
    var pts = cis.filter(function (c) { return typeof c[key] === 'number'; });
    if (pts.length < 2) { fig.hidden = true; return 0; }
    fig.hidden = false;
    var W = 320, H = 110, P = 14;
    var vals = pts.map(function (p) { return p[key]; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    var x = function (i) { return P + i * (W - 2 * P) / (pts.length - 1); };
    var y = function (v) { return H - P - (v - lo) * (H - 2 * P) / (hi - lo); };
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'trend__svg');
    svg.setAttribute('role', 'img');
    var line = document.createElementNS(NS, 'polyline');
    line.setAttribute('points', pts.map(function (p, i) { return x(i).toFixed(1) + ',' + y(p[key]).toFixed(1); }).join(' '));
    line.setAttribute('class', 'trend__line');
    svg.appendChild(line);
    pts.forEach(function (p, i) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', x(i).toFixed(1)); c.setAttribute('cy', y(p[key]).toFixed(1)); c.setAttribute('r', '3.5');
      c.setAttribute('class', 'trend__dot');
      svg.appendChild(c);
    });
    var first = pts[0], last = pts[pts.length - 1];
    var unit = t(unitKey);
    svg.setAttribute('aria-label', t(labelKey) + ': ' + first[key] + ' ' + unit + ' → ' + last[key] + ' ' + unit);
    fig.appendChild(svg);
    fig.appendChild(el('figcaption', { class: 'trend__cap' }, [
      el('span', { class: 'trend__k' }, t(labelKey)),
      el('span', { class: 'trend__v', dir: 'ltr' }, first[key] + ' → ' + last[key] + ' ' + unit)
    ]));
    return 1;
  }

  /* ---------------------------------------------------------------------------
     The bottom sheet for one session
  --------------------------------------------------------------------------- */
  function buildEffort() {
    var host = $('#lg-effort');
    for (var n = 1; n <= 10; n++) {
      host.appendChild(el('input', { type: 'radio', name: 'effort', id: 'ef-' + n, value: String(n), class: 'scale__input' }));
      host.appendChild(el('label', { class: 'scale__btn', for: 'ef-' + n }, String(n)));
    }
  }

  function noteCount() {
    $('#lg-note-count').textContent = t('common.chars_left', { n: 300 - $('#lg-note').value.length });
  }

  function openSheet(s) {
    state.open = s;
    var log = state.logs[s.session_id] || {};
    $('#sheet-day').textContent = PV.dayLabel(s, state.me.plan);
    $('#sheet-title').textContent = PV.txt(s.title) || t('pv.type.' + s.type);
    $('#sheet-tgt').textContent = PV.targets(s).join(' · ');
    $$('#sheet-form input[name="status"]').forEach(function (i) { i.checked = i.value === log.status; });
    $$('#lg-effort input').forEach(function (i) { i.checked = Number(i.value) === log.effort_1_10; });
    $('#lg-min').value = log.actual_duration_min == null ? '' : log.actual_duration_min;
    $('#lg-km').value = log.actual_distance_km == null ? '' : log.actual_distance_km;
    $('#lg-note').value = log.note || '';
    noteCount();
    ['status', 'actual_duration_min', 'actual_distance_km'].forEach(function (f) { A.fieldError(f, '', $('#sheet')); });
    var d = $('#sheet');
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    var first = $('#sheet-form input[name="status"]:checked') || $('#st-done');
    first.focus();
  }

  function closeSheet() {
    var d = $('#sheet');
    if (d.close && d.open) d.close(); else d.removeAttribute('open');
    var id = state.open && state.open.session_id;
    state.open = null;
    var card = id && $('[data-session="' + id + '"]');
    if (card) card.focus();
  }

  function num(v) { return parseFloat(A.toAsciiDigits(v).replace(',', '.')); }

  function onSave(ev) {
    ev.preventDefault();
    var s = state.open;
    if (!s) return;
    var status = (($$('#sheet-form input[name="status"]').filter(function (i) { return i.checked; })[0]) || {}).value;
    var mins = A.toAsciiDigits($('#lg-min').value.trim());
    var km = A.toAsciiDigits($('#lg-km').value.trim());
    var bad = false;
    A.fieldError('status', status ? '' : t('err.pick_one'), $('#sheet'));
    if (!status) bad = true;
    A.fieldError('actual_duration_min', '', $('#sheet'));
    if (mins && !(/^\d{1,3}$/.test(mins) && num(mins) <= 600)) { A.fieldError('actual_duration_min', t('err.range', { min: 0, max: 600 }), $('#sheet')); bad = true; }
    A.fieldError('actual_distance_km', '', $('#sheet'));
    if (km && !(num(km) >= 0 && num(km) <= 500)) { A.fieldError('actual_distance_km', t('err.range', { min: 0, max: 500 }), $('#sheet')); bad = true; }
    if (bad) return;

    var effort = (($$('#lg-effort input').filter(function (i) { return i.checked; })[0]) || {}).value || '';
    var payload = {
      session_id: s.session_id, status: status, actual_duration_min: mins, actual_distance_km: km,
      effort_1_10: effort, note: $('#lg-note').value.trim(), submission_token: A.uuid()
    };
    closeSheet();
    save(payload);
  }

  /* Optimistic: paint the card now, confirm with the server, undo on failure. */
  function save(payload) {
    var id = payload.session_id;
    var before = state.logs[id];
    state.logs[id] = {
      session_id: id, status: payload.status, note: payload.note,
      actual_duration_min: payload.actual_duration_min === '' ? null : num(payload.actual_duration_min),
      actual_distance_km: payload.actual_distance_km === '' ? null : num(payload.actual_distance_km),
      effort_1_10: payload.effort_1_10 === '' ? null : Number(payload.effort_1_10)
    };
    renderPlan();
    markSaving(id, true);
    A.call('log_session', payload)
      .then(function (res) {
        if (res.log) state.logs[id] = res.log;
        state.stats = res.stats;
        renderPlan();
        toast(t('trk.log.saved'));
        prefillSessions();
      })
      .catch(function (err) {
        if (before) state.logs[id] = before; else delete state.logs[id];
        renderPlan();
        toast(t('trk.log.failed') + ' ' + A.apiMessage(err && err.code), function () { save(payload); });
      });
  }

  function markSaving(id, on) {
    var card = $('[data-session="' + id + '"]');
    if (card) card.classList.toggle('is-saving', on);
  }

  function toast(msg, retry) {
    clearTimeout(toastTimer);
    retryFn = retry || null;
    $('#toast-msg').textContent = msg;
    $('#toast-retry').hidden = !retry;
    $('#toast').hidden = false;
    if (!retry) toastTimer = setTimeout(function () { $('#toast').hidden = true; }, 3500);
  }

  /* ---------------------------------------------------------------------------
     Weekly check-in — the same fields as before, now tied to the login
  --------------------------------------------------------------------------- */
  function buildEnergy() {
    var host = $('#ci-energy');
    [1, 2, 3, 4, 5].forEach(function (n) {
      host.appendChild(el('input', { type: 'radio', name: 'energy', id: 'ci-energy-' + n, value: String(n), class: 'scale__input' }));
      host.appendChild(el('label', { class: 'scale__btn', for: 'ci-energy-' + n }, String(n)));
    });
  }

  /* Suggest "sessions done this week" from what they already logged. */
  function prefillSessions() {
    var box = $('#ci-sessions');
    if (box.dataset.touched || !state.me || !state.me.plan || !state.stats) return;
    var wk = state.me.plan.by_week[(state.stats.current_week || 1) - 1];
    if (!wk) return;
    var n = wk.sessions.filter(function (s) {
      var l = state.logs[s.session_id];
      return l && (l.status === 'done' || l.status === 'partial');
    }).length;
    box.value = String(n);
  }

  function ciValidate(d) {
    var bad = [];
    A.fieldError('weight_kg', '');
    if (!d.weight_kg) { A.fieldError('weight_kg', t('err.required')); bad.push('weight_kg'); }
    else if (!(num(d.weight_kg) >= 30 && num(d.weight_kg) <= 250)) { A.fieldError('weight_kg', t('err.range', { min: 30, max: 250 })); bad.push('weight_kg'); }
    A.fieldError('waist_cm', '');
    if (d.waist_cm && !(num(d.waist_cm) >= 50 && num(d.waist_cm) <= 200)) { A.fieldError('waist_cm', t('err.range', { min: 50, max: 200 })); bad.push('waist_cm'); }
    A.fieldError('sessions_done', '');
    if (d.sessions_done === '') { A.fieldError('sessions_done', t('err.required')); bad.push('sessions_done'); }
    else if (!/^\d{1,2}$/.test(d.sessions_done) || num(d.sessions_done) > 30) { A.fieldError('sessions_done', t('err.range', { min: 0, max: 30 })); bad.push('sessions_done'); }
    A.fieldError('energy', '');
    if (!d.energy) { A.fieldError('energy', t('err.pick_one')); bad.push('energy'); }
    return bad;
  }

  function ciSending_(on) {
    ciSending = on;
    $('#ci-submit').disabled = on;
    $('#ci-submit').textContent = t(on ? 'ci.sending' : 'ci.submit');
  }

  function onCheckin(ev) {
    ev.preventDefault();
    if (ciSending) return;
    $('#ci-error').hidden = true;
    $('#ci-done').hidden = true;
    var d = {
      weight_kg: A.toAsciiDigits($('#ci-weight').value.trim()),
      waist_cm: A.toAsciiDigits($('#ci-waist').value.trim()),
      sessions_done: A.toAsciiDigits($('#ci-sessions').value.trim()),
      best_effort: $('#ci-best').value.trim(),
      energy: (($$('#ci-energy input').filter(function (i) { return i.checked; })[0]) || {}).value || '',
      notes: $('#ci-notes').value.trim(),
      language_used: A.getLang(),
      submission_token: A.uuid()
    };
    var bad = ciValidate(d);
    if (bad.length) {
      var wrap = $('[data-field="' + bad[0] + '"]');
      var ctrl = wrap && $('input, textarea', wrap);
      if (ctrl) ctrl.focus();
      return;
    }
    ciSending_(true);
    A.call('checkin', d)
      .then(function (res) {
        ciSending_(false);
        state.me.checkins = res.checkins || state.me.checkins;
        $('#checkin').reset();
        delete $('#ci-sessions').dataset.touched;
        prefillSessions();
        renderTrend();
        $('#ci-done').hidden = false;
        $('#ci-done').focus();
      })
      .catch(function (err) {
        ciSending_(false);
        $('#ci-error-body').textContent = A.apiMessage(err && err.code);
        $('#ci-error').hidden = false;
      });
  }

  /* ---------------------------------------------------------------------------
     Start-up
  --------------------------------------------------------------------------- */
  function logout() {
    var s = A.session.get();
    A.session.clear();
    var go = function () { window.location.replace('login.html'); };
    if (s) A.post({ type: 'logout', session: s.token }).then(go, go); else go();
  }

  function init() {
    var s = A.session.get();
    if (!s) { window.location.replace('login.html'); return; }
    if (s.scope !== 'full') { window.location.replace('change-password.html'); return; }

    buildEffort();
    buildEnergy();
    A.initPage();
    document.addEventListener('ayw:lang', function () {
      render();
      ciSending_(ciSending);
      noteCount();
    });

    $('#trk-logout').addEventListener('click', logout);
    $('#trk-retry').addEventListener('click', load);
    $('#sheet-form').addEventListener('submit', onSave);
    $('#sheet-cancel').addEventListener('click', closeSheet);
    $('#sheet').addEventListener('cancel', function (e) { e.preventDefault(); closeSheet(); });
    /* A tap on the dimmed backdrop closes the sheet. */
    $('#sheet').addEventListener('click', function (e) { if (e.target === this) closeSheet(); });
    $('#lg-note').addEventListener('input', noteCount);
    $('#checkin').addEventListener('submit', onCheckin);
    $('#ci-sessions').addEventListener('input', function () { this.dataset.touched = '1'; });
    $('#toast-retry').addEventListener('click', function () {
      $('#toast').hidden = true;
      if (retryFn) retryFn();
    });

    load();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
