/* =============================================================================
   change-password.js — the forced first-login change, and any later change.
   -----------------------------------------------------------------------------
   Works with either session scope. The current password is read from the box
   and sent once; it is never written to storage. On success the server
   revokes every other session and hands back a full one.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.AYW;
  var $ = A.$, t = A.t;
  var sending = false, allOk = null, s = null;

  function lead() {
    $('#cp-lead').textContent = s.scope === 'full'
      ? t('cp.lead')
      : t('cp.lead.first', { name: s.name || '' });
    $('#h-cp-current').hidden = s.scope === 'full';
  }

  function showError(code) {
    $('#cp-error-body').textContent = A.apiMessage(code);
    $('#cp-error').hidden = false;
  }

  function setSending(on) {
    sending = on;
    $('#cp-submit').disabled = on;
    $('#cp-submit').textContent = t(on ? 'cp.sending' : 'cp.submit');
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (sending) return;
    $('#cp-error').hidden = true;
    ['current', 'new', 'confirm'].forEach(function (f) { A.fieldError(f, ''); });

    var current = $('#cp-current').value, next = $('#cp-new').value, confirm = $('#cp-confirm').value;
    if (!current) { A.fieldError('current', t('err.required')); $('#cp-current').focus(); return; }
    if (!allOk()) {
      if (next && next === confirm) A.fieldError('new', t('cp.err.rules'));
      else A.fieldError(next ? 'confirm' : 'new', next ? t('cp.err.match') : t('err.required'));
      (next ? $('#cp-confirm') : $('#cp-new')).focus();
      return;
    }

    setSending(true);
    A.call('change_password', { current_password: current, new_password: next })
      .then(function (res) {
        A.saveSession(res);
        window.location.replace('tracker.html');
      })
      .catch(function (err) {
        setSending(false);
        var code = err && err.code;
        if (code === 'bad_current_password') {
          $('#cp-current').value = '';
          A.fieldError('current', A.apiMessage(code));
          $('#cp-current').focus();
        } else {
          showError(code);
        }
      });
  }

  function logout() {
    var tok = s && s.token;
    A.session.clear();
    var go = function () { window.location.replace('login.html'); };
    if (tok) A.post({ type: 'logout', session: tok }).then(go, go); else go();
  }

  function init() {
    s = A.session.get();
    if (!s) { window.location.replace('login.html'); return; }
    A.initPage();
    A.initPasswordToggles();
    $('#cp-user').value = s.username || '';        // lets a password manager file the new password correctly
    allOk = A.bindPasswordChecklist({
      next: $('#cp-new'), confirm: $('#cp-confirm'), current: $('#cp-current'),
      list: $('#cp-rules'), username: s.username
    });
    lead();
    document.addEventListener('ayw:lang', function () { lead(); setSending(sending); });
    $('#cp-form').addEventListener('submit', onSubmit);
    $('#cp-logout').addEventListener('click', logout);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
