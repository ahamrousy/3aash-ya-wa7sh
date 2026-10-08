/* =============================================================================
   reset.js — a coach-made, one-time reset link.
   -----------------------------------------------------------------------------
   The link is reset.html#t=<64 hex>. The token sits in the fragment, which a
   browser never sends to any server, and it is wiped from the address bar
   before anything else happens, so it is not left in history or shared by
   accident. It then travels only in the POST body.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.AYW;
  var $ = A.$, t = A.t;

  /* Read the token and remove it from the address bar straight away. */
  var token = (function () {
    var m = /(?:^#|[#&])t=([0-9a-f]{64})(?:&|$)/.exec(window.location.hash || '');
    if (window.location.hash) {
      try { history.replaceState(null, '', window.location.pathname + window.location.search); }
      catch (e) { window.location.hash = ''; }
    }
    return m ? m[1] : '';
  })();

  var sending = false, allOk = null, firstName = '';

  function invalid() {
    $('#rs-checking').hidden = true;
    $('#rs-form').hidden = true;
    $('#rs-invalid').hidden = false;
  }

  function hello() { $('#rs-hello').textContent = t('rs.hello', { name: firstName }); }

  function setSending(on) {
    sending = on;
    $('#rs-submit').disabled = on;
    $('#rs-submit').textContent = t(on ? 'cp.sending' : 'rs.submit');
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (sending) return;
    $('#rs-error').hidden = true;
    A.fieldError('new', ''); A.fieldError('confirm', '');
    var next = $('#rs-new').value, confirm = $('#rs-confirm').value;
    if (!allOk()) {
      if (next && next === confirm) A.fieldError('new', t('cp.err.rules'));
      else A.fieldError(next ? 'confirm' : 'new', next ? t('cp.err.match') : t('err.required'));
      return;
    }
    setSending(true);
    A.post({ type: 'reset_complete', token: token, new_password: next })
      .then(function (res) {
        token = '';
        A.saveSession(res);
        window.location.replace('tracker.html');
      })
      .catch(function (err) {
        setSending(false);
        var code = err && err.code;
        if (code === 'reset_invalid') { invalid(); return; }
        $('#rs-error-body').textContent = A.apiMessage(code);
        $('#rs-error').hidden = false;
      });
  }

  function init() {
    A.initPage();
    A.initPasswordToggles();
    A.initCoachLinks(document, t('login.forgot.msg'));
    document.addEventListener('ayw:lang', function () {
      A.initCoachLinks(document, t('login.forgot.msg'));
      if (firstName) hello();
      setSending(sending);
    });
    if (!token) { invalid(); return; }

    /* A new password replaces whatever login this browser had. */
    A.session.clear();
    allOk = A.bindPasswordChecklist({ next: $('#rs-new'), confirm: $('#rs-confirm'), list: $('#rs-rules') });
    $('#rs-form').addEventListener('submit', onSubmit);

    A.post({ type: 'reset_verify', token: token })
      .then(function (res) {
        firstName = res.name || '';
        hello();
        $('#rs-checking').hidden = true;
        $('#rs-form').hidden = false;
        $('#rs-new').focus();
      })
      .catch(function (err) {
        if (err && err.code === 'reset_invalid') { invalid(); return; }
        $('#rs-checking').textContent = A.apiMessage(err && err.code);
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
