/* =============================================================================
   checkin.js — Phase 2: the weekly progress check-in.
   -----------------------------------------------------------------------------
   The participant proves who they are with two things they already have:
   their participant ID and the WhatsApp number they signed up with. Both must
   match the same row in the intake sheet, which Code.gs checks.

   This page RECEIVES ONLY. It never asks the server for stored data and never
   displays anything back, so nobody can use it to look up another participant.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.AYW;
  var $ = A.$, $$ = A.$$, el = A.el, t = A.t;

  /* Same country list as the intake form, kept short here on purpose: this page
     only needs to match a number that already exists in the sheet. */
  var CODES = ['+20', '+966', '+971', '+965', '+974', '+973', '+968', '+962', '+961',
               '+963', '+964', '+249', '+218', '+216', '+213', '+212', '+44', '+1',
               '+49', '+33', '+39', '+34', '+31', '+90'];

  var ID_RE = /^AYW-\d{4}-\d{4}$/;
  var EG_MOBILE_RE = /^1[0125]\d{8}$/;

  var startedAt = Date.now();
  var sending = false;

  /* ---------------------------------------------------------------------------
     Build the bits that are easier made in JS than written out by hand
  --------------------------------------------------------------------------- */
  function buildCodes() {
    var sel = $('#ci-wa-code');
    /* U+200E (left-to-right mark) stops an RTL page from showing "+20" as "20+". */
    CODES.forEach(function (c) { sel.appendChild(el('option', { value: c }, '\u200E' + c)); });
    sel.value = '+20';
  }

  function buildScale() {
    var host = $('#ci-energy');
    [1, 2, 3, 4, 5].forEach(function (n) {
      var id = 'ci-energy-' + n;
      host.appendChild(el('input', { type: 'radio', name: 'energy', id: id,
                                     value: String(n), class: 'scale__input' }));
      host.appendChild(el('label', { class: 'scale__btn', for: id }, String(n)));
    });
  }

  /* ---------------------------------------------------------------------------
     Validation — same friendly, specific tone as the intake form
  --------------------------------------------------------------------------- */
  function setError(field, msg) {
    var wrap = $('[data-field="' + field + '"]');
    if (!wrap) return;
    var e = $('.field__err', wrap);
    if (e) e.textContent = msg || '';
    wrap.classList.toggle('is-invalid', !!msg);
    $$('input, select, textarea', wrap).forEach(function (c) {
      c.setAttribute('aria-invalid', msg ? 'true' : 'false');
    });
  }

  function num(v) { return parseFloat(String(v).replace(',', '.')); }

  function readForm() {
    var digits = $('#ci-wa').value.replace(/[^\d]/g, '').replace(/^0+/, '');
    return {
      type: 'checkin',
      participant_id: $('#ci-id').value.trim().toUpperCase(),
      whatsapp: digits ? $('#ci-wa-code').value + ' ' + digits : '',
      weight_kg: $('#ci-weight').value.trim(),
      waist_cm: $('#ci-waist').value.trim(),
      sessions_done: $('#ci-sessions').value.trim(),
      best_effort: $('#ci-best').value.trim(),
      energy: (($$('#ci-energy input').filter(function (i) { return i.checked; })[0]) || {}).value || '',
      notes: $('#ci-notes').value.trim(),
      language_used: A.getLang(),
      elapsed_ms: Date.now() - startedAt,
      hp: $('#ci-hp').value,
      submission_token: A.uuid()
    };
  }

  function validate(d) {
    var bad = [];

    setError('participant_id', '');
    if (!d.participant_id) { setError('participant_id', t('err.required')); bad.push('participant_id'); }
    else if (!ID_RE.test(d.participant_id)) { setError('participant_id', t('ci.err.id')); bad.push('participant_id'); }

    setError('whatsapp', '');
    var parts = d.whatsapp.split(' ');
    if (!d.whatsapp) { setError('whatsapp', t('err.required')); bad.push('whatsapp'); }
    else if (parts[0] === '+20' && !EG_MOBILE_RE.test(parts[1] || '')) {
      setError('whatsapp', t('err.whatsapp')); bad.push('whatsapp');
    } else if (parts[0] !== '+20' && !/^\d{6,14}$/.test(parts[1] || '')) {
      setError('whatsapp', t('err.whatsapp_intl')); bad.push('whatsapp');
    }

    setError('weight_kg', '');
    if (!d.weight_kg) { setError('weight_kg', t('err.required')); bad.push('weight_kg'); }
    else if (!(num(d.weight_kg) >= 30 && num(d.weight_kg) <= 250)) {
      setError('weight_kg', t('err.range', { min: 30, max: 250 })); bad.push('weight_kg');
    }

    setError('waist_cm', '');
    if (d.waist_cm && !(num(d.waist_cm) >= 50 && num(d.waist_cm) <= 200)) {
      setError('waist_cm', t('err.range', { min: 50, max: 200 })); bad.push('waist_cm');
    }

    setError('sessions_done', '');
    if (d.sessions_done === '') { setError('sessions_done', t('err.required')); bad.push('sessions_done'); }
    else if (!/^\d{1,2}$/.test(d.sessions_done) || num(d.sessions_done) > 30) {
      setError('sessions_done', t('err.range', { min: 0, max: 30 })); bad.push('sessions_done');
    }

    setError('energy', '');
    if (!d.energy) { setError('energy', t('err.pick_one')); bad.push('energy'); }

    return bad;
  }

  function announce(msg) {
    var live = $('#ci-live');
    live.textContent = '';
    setTimeout(function () { live.textContent = msg; }, 50);
  }

  function showError(code) {
    var msg = code === 'no_match'    ? t('ci.err.match')
            : code === 'no_endpoint' ? t('fail.noEndpoint')
            : code === 'timeout'     ? t('fail.timeout')
            : t('ci.err.generic');
    $('#ci-error-body').textContent = msg;
    $('#ci-error').hidden = false;
    $('#ci-error').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function setSending(on) {
    sending = on;
    var b = $('#ci-submit');
    b.disabled = on;
    b.textContent = on ? t('ci.sending') : t('ci.submit');
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (sending) return;
    $('#ci-error').hidden = true;

    var d = readForm();
    var bad = validate(d);
    if (bad.length) {
      announce(bad.length === 1 ? t('err.summary.one') : t('err.summary.many', { n: bad.length }));
      var wrap = $('[data-field="' + bad[0] + '"]');
      var ctrl = wrap && $('input, select, textarea', wrap);
      if (ctrl) ctrl.focus();
      if (wrap) wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setSending(true);
    A.post(d)
      .then(function () {
        setSending(false);
        $('#ci-screen-form').hidden = true;
        $('#ci-screen-done').hidden = false;
        $('#ci-done-h').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch(function (err) {
        setSending(false);
        showError(err && err.code);
      });
  }

  function reset() {
    $('#checkin').reset();
    $('#ci-wa-code').value = '+20';
    $$('.field').forEach(function (f) { f.classList.remove('is-invalid'); });
    $$('.field__err').forEach(function (e) { e.textContent = ''; });
    startedAt = Date.now();
    $('#ci-screen-done').hidden = true;
    $('#ci-screen-form').hidden = false;
    $('#ci-id').focus();
  }

  function init() {
    buildCodes();
    buildScale();
    A.initLang();
    A.initLangToggle();
    A.applyConfigText();
    A.initReveal();
    document.addEventListener('ayw:lang', function () {
      A.applyConfigText();
      setSending(sending);
    });

    $('#checkin').addEventListener('submit', onSubmit);
    $('#ci-again').addEventListener('click', reset);

    /* Uppercase the ID as it is typed, so AYW-2026-0001 is the only shape possible. */
    $('#ci-id').addEventListener('input', function () {
      var pos = this.selectionStart;
      this.value = this.value.toUpperCase();
      try { this.setSelectionRange(pos, pos); } catch (e) { /* older browsers */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
