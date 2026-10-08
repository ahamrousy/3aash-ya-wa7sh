/* =============================================================================
   coach.js — the coach console.
   -----------------------------------------------------------------------------
   Login, the participant list, one participant's full picture, the plan
   import (brief → paste JSON → validate → preview → publish), reset links,
   status, notes and unlock. Every action is checked again on the server
   (role = coach); this page only draws what the server sends.

   Participant text is always set with textContent — never innerHTML.
   The system never writes a plan by itself: the coach pastes it in.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.AYW, PV = A.PlanView;
  var $ = A.$, $$ = A.$$, el = A.el, t = A.t;
  var KEY = A.COACH_KEY;

  var state = { list: [], current: null, detail: null, preview: null, week: 1, previewWeek: 1, resetUrl: '' };

  /* The site's own address, so links the server builds point back here. */
  var SITE = window.location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');

  function call(type, body) {
    return A.call(type, body, { sessionKey: KEY, onExpired: showLogin });
  }

  function show(id) {
    ['c-login', 'c-list', 'c-detail'].forEach(function (s) { $('#' + s).hidden = s !== id; });
    $('#c-logout').hidden = id === 'c-login';
    window.scrollTo(0, 0);
  }

  function msg(box, text) { box.textContent = text || ''; box.hidden = !text; }

  function fmtDay(iso) {
    if (!iso) return '—';
    var d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
    if (isNaN(d)) return String(iso);
    return d.toLocaleDateString(A.getLang() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function badge(cls, key) { return el('span', { class: 'badge badge--' + cls }, t(key)); }

  function badges(p) {
    var out = [];
    if (p.flags.clearance) out.push(badge('red', 'co.flag.clearance'));
    if (p.flags.minor) out.push(badge('amber', 'co.flag.minor'));
    if (p.flags.default_active) out.push(badge('blue', 'co.flag.default'));
    if (p.flags.locked) out.push(badge('dark', 'co.flag.locked'));
    return out;
  }

  /* ---------------------------------------------------------------------------
     Login
  --------------------------------------------------------------------------- */
  function showLogin() {
    A.session.clear(KEY);
    show('c-login');
    $('#c-user').focus();
  }

  function onLogin(ev) {
    ev.preventDefault();
    var user = $('#c-user').value.trim(), pw = $('#c-pw').value;
    A.fieldError('c-user', user ? '' : t('err.required'));
    A.fieldError('c-pw', pw ? '' : t('err.required'));
    if (!user || !pw) return;
    $('#c-login-error').hidden = true;
    var b = $('#c-login-submit');
    b.disabled = true; b.textContent = t('login.sending');
    A.post({ type: 'coach_login', username: user, password: pw })
      .then(function (res) {
        A.saveSession(res, KEY);
        $('#c-pw').value = '';
        loadList();
      })
      .catch(function (err) {
        $('#c-pw').value = '';
        $('#c-login-error-body').textContent = A.apiMessage(err && err.code);
        $('#c-login-error').hidden = false;
      })
      .then(function () { b.disabled = false; b.textContent = t('login.submit'); });
  }

  function logout() {
    var s = A.session.get(KEY);
    A.session.clear(KEY);
    if (s) A.post({ type: 'logout', session: s.token }).catch(function () { /* already gone */ });
    showLogin();
  }

  /* ---------------------------------------------------------------------------
     The list
  --------------------------------------------------------------------------- */
  function loadList() {
    show('c-list');
    msg($('#c-list-msg'), t('co.loading'));
    call('coach_list')
      .then(function (res) {
        state.list = res.participants || [];
        msg($('#c-list-msg'), state.list.length ? '' : t('co.list.empty'));
        renderList();
      })
      .catch(function (err) { msg($('#c-list-msg'), A.apiMessage(err && err.code)); });
  }

  function renderList() {
    var q = $('#c-search').value.trim().toLowerCase();
    var f = $('#c-filter').value;
    var host = $('#c-rows');
    host.innerHTML = '';
    state.list.filter(function (p) {
      if (f && p.status !== f) return false;
      if (!q) return true;
      return (p.name + ' ' + p.participant_id + ' ' + p.username).toLowerCase().indexOf(q) !== -1;
    }).forEach(function (p) {
      var adh = p.stats && p.stats.adherence !== null ? p.stats.adherence + '%' : '—';
      host.appendChild(el('li', null, el('button', {
        type: 'button', class: 'c-rowbtn', on: { click: function () { openDetail(p.participant_id); } }
      }, [
        el('span', { class: 'c-rowbtn__main' }, [
          el('span', { class: 'c-rowbtn__name' }, p.name || '—'),
          el('span', { class: 'c-rowbtn__id', dir: 'ltr' }, p.participant_id),
          el('span', { class: 'c-badges' }, badges(p))
        ]),
        el('span', { class: 'c-rowbtn__meta' }, [
          el('span', { class: 'st st--' + p.status }, t('co.st.' + p.status)),
          el('span', null, t('co.objectives') + ': ' + objectives(p.objectives)),
          el('span', null, t('co.joined') + ': ' + fmtDay(p.joined)),
          el('span', null, t('co.last') + ': ' + (p.last_activity ? fmtDay(p.last_activity) : '—')),
          el('span', null, t('pv.adherence') + ': ' + adh)
        ])
      ])));
    });
  }

  function objectives(codes) {
    return String(codes || '').split(',').filter(Boolean).map(function (c) { return t('opt.objectives.' + c); }).join('، ') || '—';
  }

  /* ---------------------------------------------------------------------------
     One participant
  --------------------------------------------------------------------------- */
  function openDetail(pid) {
    state.current = pid;
    state.preview = null;
    show('c-detail');
    ['c-reset-box', 'c-errors', 'c-preview-box', 'c-published', 'c-log-detail'].forEach(function (id) { $('#' + id).hidden = true; });
    $('#c-json').value = '';
    $('#c-clear').checked = false;
    $('#c-brief-msg').textContent = '';
    $('#c-notes-msg').textContent = '';
    $('#c-name').textContent = '…';
    msg($('#c-detail-msg'), t('co.loading'));
    loadDetail(true);
  }

  function loadDetail(focus) {
    return call('coach_get', { participant_id: state.current })
      .then(function (d) {
        state.detail = d;
        state.week = d.stats && d.stats.current_week ? d.stats.current_week : 1;
        msg($('#c-detail-msg'), '');
        renderDetail();
        if (focus) $('#c-name').focus();
      })
      .catch(function (err) { msg($('#c-detail-msg'), A.apiMessage(err && err.code)); });
  }

  function summaryOf(pid) {
    return state.list.filter(function (p) { return p.participant_id === pid; })[0];
  }

  function renderDetail() {
    var d = state.detail, i = d.intake, u = d.user;
    $('#c-name').textContent = i.name || '—';
    $('#c-id').textContent = d.participant_id;
    $('#c-user-line').textContent = u ? u.username : t('co.st.no_account');
    var flags = { clearance: String(i.needs_medical_clearance) === 'TRUE', minor: String(i.is_minor) === 'TRUE',
                  default_active: !!(u && u.default_active), locked: !!(u && u.locked) };
    var bh = $('#c-badges'); bh.innerHTML = '';
    badges({ flags: flags }).forEach(function (b) { bh.appendChild(b); });

    $('#c-status').value = u ? u.status : 'awaiting_plan';
    $('#c-status').disabled = !u;
    $('#c-unlock').hidden = !(u && u.locked);
    $('#c-reset').hidden = !u;

    /* WhatsApp: a plain chat, plus the welcome with login details while the
       first password is still the one they were given. */
    var phone = u ? u.username : String(i.whatsapp || '');
    $('#c-wa-chat').href = A.waUrl(phone, '');
    var lang = i.language_used === 'en' ? 'en' : 'ar';
    if (u && u.default_active && d.default_password) {
      $('#c-wa-welcome').hidden = false;
      $('#c-wa-welcome').href = A.waUrl(phone, msgIn(lang, 'co.wa.welcome.msg', {
        name: firstName(i.name), user: u.username, pw: d.default_password, url: SITE + 'login.html' }));
    } else { $('#c-wa-welcome').hidden = true; }

    $('#c-notes').value = i.coach_notes || '';
    renderProgram();
    renderCheckins();
    renderAccount();
    renderIntake();
    $('#c-clear-box').hidden = !flags.clearance;
  }

  function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }

  /** A message in the participant's own language, whatever the console shows. */
  function msgIn(lang, key, vars) {
    var s = (window.I18N[lang] || window.I18N.ar)[key] || t(key);
    Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(String(vars[k])); });
    return s;
  }

  /* Program grid: weeks down, sessions across, coloured by status. */
  function renderProgram() {
    var d = state.detail, host = $('#c-prog');
    host.innerHTML = '';
    $('#c-prog-none').hidden = !!d.plan;
    $('#c-log-detail').hidden = true;
    var logs = {};
    (d.logs || []).forEach(function (l) { logs[l.session_id] = l; });

    if (d.plan) {
      host.appendChild(el('p', { class: 'trk__title' }, PV.txt(d.plan.title) + ' · v' + d.plan.version));
      if (d.stats) {
        var s = d.stats;
        host.appendChild(el('p', { class: 'c-statline' }, [
          t('pv.week') + ' ' + t('pv.week.of', { n: s.current_week || 0, total: s.weeks }) + ' · ',
          t('co.prog.done', { done: s.done, partial: s.partial, skipped: s.skipped, planned: s.planned_to_date }) + ' · ',
          t('pv.adherence') + ' ' + (s.adherence === null ? '—' : s.adherence + '%') + ' · ',
          t('co.prog.streak', { n: s.streak })
        ]));
      }
      var grid = el('div', { class: 'pgrid', role: 'table', 'aria-label': t('co.prog.title') });
      d.plan.by_week.forEach(function (w) {
        grid.appendChild(el('div', { class: 'pgrid__row', role: 'row' }, [
          el('span', { class: 'pgrid__wk', role: 'rowheader' }, t('pv.week.n', { n: w.week })),
          el('span', { class: 'pgrid__cells', role: 'cell' }, w.sessions.map(function (sess) {
            var st = sess.type === 'rest' ? 'rest' : ((logs[sess.session_id] || {}).status || 'todo');
            return el('button', {
              type: 'button', class: 'pcell pcell--' + st,
              title: PV.txt(sess.title) + ' — ' + t('pv.st.' + st),
              'aria-label': sess.session_id + ': ' + PV.txt(sess.title) + ' — ' + t('pv.st.' + st),
              on: { click: function () { showLog(sess, logs[sess.session_id]); } }
            }, sess.session_id.replace(/^w\d+/, ''));
          }))
        ]));
      });
      host.appendChild(grid);
    }

    var earlier = d.earlier_logs || [];
    $('#c-earlier').hidden = !earlier.length;
    var el1 = $('#c-earlier-list'); el1.innerHTML = '';
    earlier.forEach(function (l) {
      el1.appendChild(el('li', null, l.session_id + ' — ' + t('pv.st.' + l.status) + (l.note ? ' — ' + l.note : '') + ' (' + fmtDay(l.updated_at) + ')'));
    });

    var vers = d.versions || [];
    $('#c-versions-box').hidden = vers.length < 2;
    var vl = $('#c-versions'); vl.innerHTML = '';
    vers.forEach(function (v) {
      vl.appendChild(el('li', null, 'v' + v.version + ' — ' + PV.txt(v.title) + ' — ' + t('co.plan.' + v.status) + ' (' + fmtDay(v.published_at) + ')'));
    });
  }

  function showLog(sess, log) {
    var box = $('#c-log-detail');
    box.innerHTML = '';
    var plan = state.detail.plan;
    box.appendChild(el('p', { class: 'c-logdetail__h' }, sess.session_id + ' · ' + PV.dayLabel(sess, plan) + ' · ' + PV.txt(sess.title)));
    if (PV.txt(sess.details)) box.appendChild(el('p', null, PV.txt(sess.details)));
    if (sess.type === 'rest') box.appendChild(el('p', null, t('pv.st.rest')));
    else if (!log) box.appendChild(el('p', null, t('co.log.none')));
    else {
      var bits = [t('pv.st.' + log.status)];
      if (log.actual_duration_min !== null) bits.push(t('pv.min', { n: log.actual_duration_min }));
      if (log.actual_distance_km !== null) bits.push(t('pv.km', { n: log.actual_distance_km }));
      if (log.effort_1_10 !== null) bits.push(t('co.log.effort', { n: log.effort_1_10 }));
      box.appendChild(el('p', { class: 'c-logdetail__st' }, bits.join(' · ')));
      if (log.note) box.appendChild(el('p', { class: 'sess__note' }, log.note));
      box.appendChild(el('p', { class: 'c-hint' }, t('co.log.when', { date: fmtDay(log.updated_at) })));
    }
    box.hidden = false;
  }

  function renderCheckins() {
    var cis = state.detail.checkins || [];
    $('#c-ci-none').hidden = !!cis.length;
    $('#c-ci-table').hidden = !cis.length;
    var tb = $('#c-ci-table tbody'); tb.innerHTML = '';
    cis.slice().reverse().forEach(function (c) {
      tb.appendChild(el('tr', null, [
        el('td', null, fmtDay(c.date)), el('td', null, c.weight_kg === null ? '—' : String(c.weight_kg)),
        el('td', null, c.waist_cm === null ? '—' : String(c.waist_cm)), el('td', null, c.sessions_done === null ? '—' : String(c.sessions_done)),
        el('td', null, c.energy === null ? '—' : c.energy + '/5'), el('td', null, [c.best_effort, c.notes].filter(Boolean).join(' — ') || '—')
      ]));
    });
    var tr = $('#c-trend'); tr.innerHTML = '';
    [['weight_kg', 'co.ci.weight', 'pv.kg'], ['waist_cm', 'co.ci.waist', 'pv.cm']].forEach(function (k) {
      var pts = cis.filter(function (c) { return typeof c[k[0]] === 'number'; });
      if (pts.length < 2) return;
      var fig = el('figure', { class: 'trend__fig' });
      fig.appendChild(sparkline(pts.map(function (p) { return p[k[0]]; })));
      fig.appendChild(el('figcaption', { class: 'trend__cap' }, [el('span', { class: 'trend__k' }, t(k[1])),
        el('span', { class: 'trend__v', dir: 'ltr' }, pts[0][k[0]] + ' → ' + pts[pts.length - 1][k[0]] + ' ' + t(k[2]))]));
      tr.appendChild(fig);
    });
  }

  function sparkline(vals) {
    var W = 300, H = 90, P = 10, NS = 'http://www.w3.org/2000/svg';
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (hi - lo < 1) { hi += 0.5; lo -= 0.5; }
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'trend__svg');
    svg.setAttribute('aria-hidden', 'true');
    var line = document.createElementNS(NS, 'polyline');
    line.setAttribute('class', 'trend__line');
    line.setAttribute('points', vals.map(function (v, i) {
      return (P + i * (W - 2 * P) / (vals.length - 1)).toFixed(1) + ',' + (H - P - (v - lo) * (H - 2 * P) / (hi - lo)).toFixed(1);
    }).join(' '));
    svg.appendChild(line);
    return svg;
  }

  function renderAccount() {
    var u = state.detail.user, dl = $('#c-acc');
    dl.innerHTML = '';
    if (!u) { dl.appendChild(el('p', { class: 'note' }, t('co.acc.none'))); return; }
    [['co.acc.user', u.username], ['co.acc.created', fmtDay(u.created_at)],
     ['co.acc.lastlogin', u.last_login_at ? fmtDay(u.last_login_at) : '—'],
     ['co.acc.default', t(u.default_active ? 'common.yes' : 'common.no')],
     ['co.acc.changed', u.password_changed_at ? fmtDay(u.password_changed_at) : '—'],
     ['co.acc.failed', String(u.failed_count)]
    ].forEach(function (row) {
      dl.appendChild(el('div', { class: 'c-dl__row' }, [el('dt', null, t(row[0])), el('dd', { dir: 'auto' }, row[1])]));
    });
  }

  /* The intake, grouped the way the form asks it. BMI and waist-to-height are
     shown here, to the coach only. */
  var GROUPS = [
    ['co.g.contact', ['name', 'whatsapp', 'email', 'city', 'contact_pref']],
    ['co.g.goal', ['objectives', 'target_weight', 'timeframe', 'new_sport', 'new_sport_other', 'new_sport_target',
      'new_sport_target_other', 'experience', 'race_sport', 'race_sport_other', 'race_distance', 'race_distance_other',
      'current_time', 'target_time', 'race_name', 'race_date', 'community_needs', 'community_other', 'why_now']],
    ['co.g.body', ['age', 'is_minor', 'guardian_name', 'guardian_phone', 'gender', 'weight_kg', 'height_cm', 'waist_cm', 'bmi', 'waist_to_height']],
    ['co.g.activity', ['current_sports', 'activity_details', 'recent_results']],
    ['co.g.avail', ['days_per_week', 'preferred_days', 'hours_per_session', 'time_of_day', 'facilities']],
    ['co.g.health', ['parq_heart', 'parq_chest', 'parq_balance', 'parq_chronic', 'parq_meds', 'parq_bone',
      'parq_supervised', 'parq_pregnant', 'needs_medical_clearance', 'injuries_notes']],
    ['co.g.admin', ['timestamp', 'consent_accuracy', 'consent_data', 'consent_media', 'language_used', 'status']]
  ];

  function fieldLabel(k) {
    var tries = ['co.f.' + k, 'f.' + k + '.label', 'f.' + k + '.q',
                 k.replace(/^parq_/, 'parq.'), k.replace(/^consent_/, 'consent.')];
    for (var i = 0; i < tries.length; i++) { var s = t(tries[i]); if (s !== tries[i]) return s; }
    return k;
  }

  function renderIntake() {
    var i = state.detail.intake, host = $('#c-intake');
    host.innerHTML = '';
    GROUPS.forEach(function (g, gi) {
      var rows = g[1].filter(function (k) { return i[k] !== '' && i[k] !== null && i[k] !== undefined; });
      if (!rows.length) return;
      var det = el('details', { class: 'c-group', open: gi < 3 ? true : null }, [
        el('summary', null, t(g[0])),
        el('dl', { class: 'c-dl' }, rows.map(function (k) {
          var v = k === 'timestamp' ? fmtDay(i[k]) : String(i[k]);
          var warn = (/^parq_/.test(k) && v === 'yes') || ((k === 'needs_medical_clearance' || k === 'is_minor') && v === 'TRUE');
          return el('div', { class: 'c-dl__row' + (warn ? ' is-warn' : '') }, [el('dt', null, fieldLabel(k)), el('dd', { dir: 'auto' }, v)]);
        }))
      ]);
      host.appendChild(det);
    });
  }

  /* ---------------------------------------------------------------------------
     Actions: status, unlock, reset link, notes
  --------------------------------------------------------------------------- */
  function update(body, okMsg) {
    msg($('#c-detail-msg'), t('co.saving'));
    return call('coach_update_user', Object.assign({ participant_id: state.current }, body))
      .then(function (res) {
        msg($('#c-detail-msg'), okMsg || t('co.saved'));
        var p = summaryOf(state.current);
        if (p) { p.status = res.status; p.flags.locked = res.locked; }
        return loadDetail(false).then(function () { return res; });
      })
      .catch(function (err) { msg($('#c-detail-msg'), A.apiMessage(err && err.code)); throw err; });
  }

  function makeReset() {
    msg($('#c-detail-msg'), t('co.saving'));
    call('coach_reset_link', { participant_id: state.current, site_url: SITE })
      .then(function (res) {
        msg($('#c-detail-msg'), '');
        state.resetUrl = res.reset_url;
        $('#c-reset-url').value = res.reset_url;
        $('#c-reset-exp').textContent = t('co.reset.exp', { date: new Date(res.expires_at).toLocaleString(A.getLang() === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB') });
        $('#c-reset-wa').href = res.whatsapp_url;
        $('#c-reset-box').hidden = false;
        $('#c-reset-copy').focus();
      })
      .catch(function (err) { msg($('#c-detail-msg'), A.apiMessage(err && err.code)); });
  }

  /* ---------------------------------------------------------------------------
     Plan import: brief → paste → validate → preview → publish
  --------------------------------------------------------------------------- */
  function copyBrief() {
    $('#c-brief-msg').textContent = t('co.loading');
    call('coach_brief', { participant_id: state.current })
      .then(function (res) { return A.copyText(res.brief); })
      .then(function (ok) { $('#c-brief-msg').textContent = t(ok ? 'co.imp.brief.ok' : 'co.imp.brief.fail'); })
      .catch(function (err) { $('#c-brief-msg').textContent = A.apiMessage(err && err.code); });
  }

  function validate() {
    $('#c-errors').hidden = true;
    $('#c-preview-box').hidden = true;
    $('#c-published').hidden = true;
    state.preview = null;
    var b = $('#c-validate');
    b.disabled = true;
    call('coach_plan_validate', { participant_id: state.current, plan_json: $('#c-json').value })
      .then(function (res) {
        if (!res.valid) { showErrors(res.errors); return; }
        state.preview = res;
        state.previewWeek = 1;
        renderPreview();
        $('#c-preview-box').hidden = false;
        $('#c-preview-box').scrollIntoView({ behavior: 'smooth', block: 'start' });
      })
      .catch(function (err) { showErrors([{ msg: A.apiMessage(err && err.code), line: null }]); })
      .then(function () { b.disabled = false; });
  }

  function showErrors(errors) {
    var ul = $('#c-errors-list'); ul.innerHTML = '';
    errors.forEach(function (e) {
      ul.appendChild(el('li', null, [e.line ? el('strong', null, t('co.imp.line', { n: e.line }) + ' ') : null, e.msg]));
    });
    $('#c-errors').hidden = false;
    $('#c-errors').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function renderPreview() {
    var r = state.preview, logs = {};
    (state.detail.logs || []).concat(state.detail.earlier_logs || []).forEach(function (l) { logs[l.session_id] = l; });
    $('#c-preview-title').textContent = PV.txt(r.plan.title) + ' — ' + t('co.imp.count', { n: r.sessions, w: r.plan.weeks });
    var note = PV.txt(r.plan.coach_note);
    $('#c-preview-note').textContent = note;
    $('#c-preview-note').hidden = !note;
    PV.render($('#c-preview'), r.plan, logs, r.stats, {
      week: state.previewWeek, today: state.detail.today,
      onWeek: function (n) { state.previewWeek = n; renderPreview(); }
    });
    paintPublish();
  }

  function paintPublish() {
    var needs = !$('#c-clear-box').hidden;
    $('#c-publish').disabled = needs && !$('#c-clear').checked;
  }

  function publish() {
    if (!state.preview) return;
    var name = state.detail.intake.name || state.current;
    if (!window.confirm(t('co.imp.confirm', { name: name }))) return;
    var b = $('#c-publish');
    b.disabled = true;
    call('coach_plan_publish', {
      participant_id: state.current, plan_json: $('#c-json').value,
      clearance_confirmed: $('#c-clear').checked, site_url: SITE
    })
      .then(function (res) {
        $('#c-preview-box').hidden = true;
        $('#c-published-msg').textContent = t('co.imp.done', { v: res.version, name: name });
        $('#c-notify').href = res.whatsapp_url;
        $('#c-published').hidden = false;
        $('#c-json').value = '';
        state.preview = null;
        var p = summaryOf(state.current);
        if (p) p.status = 'active';
        return loadDetail(false).then(function () { $('#c-published').hidden = false; $('#c-notify').focus(); });
      })
      .catch(function (err) {
        var code = err && err.code;
        if (code === 'invalid_plan' && err.detail && err.detail.errors) showErrors(err.detail.errors);
        else showErrors([{ msg: A.apiMessage(code), line: null }]);
      })
      .then(function () { paintPublish(); });
  }

  /* ---------------------------------------------------------------------------
     Start-up
  --------------------------------------------------------------------------- */
  function init() {
    A.initPage();
    A.initPasswordToggles();
    document.addEventListener('ayw:lang', function () {
      if (!$('#c-list').hidden) renderList();
      if (!$('#c-detail').hidden && state.detail) {
        renderDetail();
        if (state.preview) renderPreview();
      }
    });

    $('#c-login-form').addEventListener('submit', onLogin);
    $('#c-logout').addEventListener('click', logout);
    $('#c-refresh').addEventListener('click', loadList);
    $('#c-search').addEventListener('input', renderList);
    $('#c-filter').addEventListener('change', renderList);
    $('#c-back').addEventListener('click', function () { show('c-list'); renderList(); });

    $('#c-status').addEventListener('change', function () { update({ status: this.value }); });
    $('#c-unlock').addEventListener('click', function () { update({ unlock: true }, t('co.unlocked')); });
    $('#c-reset').addEventListener('click', makeReset);
    $('#c-reset-copy').addEventListener('click', function () {
      var b = this;
      A.copyText(state.resetUrl).then(function (ok) {
        b.textContent = t(ok ? 'done.copied' : 'co.imp.brief.fail');
        setTimeout(function () { b.textContent = t('co.copy'); }, 2000);
      });
    });
    $('#c-notes-save').addEventListener('click', function () {
      $('#c-notes-msg').textContent = t('co.saving');
      update({ coach_note: $('#c-notes').value }, '').then(function () { $('#c-notes-msg').textContent = t('co.saved'); },
        function () { $('#c-notes-msg').textContent = ''; });
    });

    $('#c-brief').addEventListener('click', copyBrief);
    $('#c-validate').addEventListener('click', validate);
    $('#c-json').addEventListener('input', function () { $('#c-preview-box').hidden = true; state.preview = null; });
    $('#c-clear').addEventListener('change', paintPublish);
    $('#c-publish').addEventListener('click', publish);

    if (A.session.get(KEY)) loadList(); else showLogin();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
