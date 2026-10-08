/* =============================================================================
   login.js — participant login.
   -----------------------------------------------------------------------------
   Username = the WhatsApp number from the intake form, normalised to
   +201001240186 exactly as Code.gs does it. The password goes only into the
   POST body and is never stored. A first login with the default password
   gets a restricted session that can only change the password.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.AYW;
  var $ = A.$, t = A.t;
  var sending = false;

  /* Already signed in? Go straight on. */
  function routeExisting() {
    var s = A.session.get();
    if (!s) return false;
    window.location.replace(s.scope === 'full' ? 'tracker.html' : 'change-password.html');
    return true;
  }

  function username() {
    var raw = A.toAsciiDigits($('#lg-num').value).replace(/[^\d+]/g, '');
    if (!raw) return '';
    /* Someone may paste the full "+20…" or "0020…" into the number box. */
    if (raw.charAt(0) === '+' || raw.indexOf('00') === 0) return A.normalisePhone(raw);
    return A.normalisePhone($('#lg-code').value + raw.replace(/^0+/, ''));
  }

  function showError(code) {
    $('#lg-error-body').textContent = A.apiMessage(code);
    $('#lg-error-wa').hidden = !(code === 'locked' || code === 'initial_expired');
    $('#lg-error').hidden = false;
  }

  function setSending(on) {
    sending = on;
    var b = $('#lg-submit');
    b.disabled = on;
    b.textContent = t(on ? 'login.sending' : 'login.submit');
  }

  function onSubmit(ev) {
    ev.preventDefault();
    if (sending) return;
    $('#lg-error').hidden = true;

    var user = username();
    var pw = $('#lg-pw').value;
    A.fieldError('username', '');
    A.fieldError('password', '');
    if (!user) {
      A.fieldError('username', $('#lg-num').value.trim() ? t('err.whatsapp') : t('login.err.user'));
      $('#lg-num').focus();
      return;
    }
    if (!pw) { A.fieldError('password', t('login.err.pw')); $('#lg-pw').focus(); return; }

    setSending(true);
    A.post({ type: 'login', username: user, password: pw })
      .then(function (res) {
        A.saveSession(res);
        window.location.replace(res.scope === 'full' ? 'tracker.html' : 'change-password.html');
      })
      .catch(function (err) {
        setSending(false);
        $('#lg-pw').value = '';
        showError(err && err.code);
      });
  }

  function init() {
    if (routeExisting()) return;
    A.fillCodes($('#lg-code'));
    A.initPage();
    A.initPasswordToggles();
    function links() {
      $('#lg-forgot').href = A.waUrl(A.cfg.contactWhatsapp, t('login.forgot.msg'));
      A.initCoachLinks();
      setSending(sending);
    }
    links();
    document.addEventListener('ayw:lang', links);
    $('#login').addEventListener('submit', onSubmit);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
