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

  /* The message must be seen: on a phone the keyboard can hide the box, which
     looks as if the page simply "went back to login". Scroll to it and focus it. */
  function showError(code) {
    $('#lg-error-body').textContent = A.apiMessage(code);
    $('#lg-error-wa').hidden = !(code === 'locked' || code === 'initial_expired' || code === 'storage_blocked');
    var box = $('#lg-error');
    box.hidden = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    box.setAttribute('tabindex', '-1');
    box.focus();
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        /* If the browser will not keep the login, the next page would find
           none and send the person straight back here. Say so instead. */
        if (!A.saveSession(res)) {
          setSending(false);
          showError('storage_blocked');
          return;
        }
        window.location.replace(res.scope === 'full' ? 'tracker.html' : 'change-password.html');
      })
      .catch(function (err) {
        setSending(false);
        $('#lg-pw').value = '';
        showError(err && err.code);
      });
  }

  function init() {
    var expired = window.location.hash === '#expired';
    if (expired) {
      try { history.replaceState(null, '', window.location.pathname); } catch (e) { /* old browsers */ }
    } else if (routeExisting()) return;
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
    if (expired) {
      $('#lg-error-body').textContent = A.apiMessage('session_expired');
      $('#lg-error').hidden = false;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
