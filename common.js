/* =============================================================================
   common.js — the small shared toolbox used by every page.
   -----------------------------------------------------------------------------
   Language switching, translation lookup, safe browser storage, and the single
   function that talks to the Apps Script endpoint. No participant data ever
   leaves this file except through AYW.post(), and that goes to one address:
   the endpoint in config.js.
   ========================================================================== */

window.AYW = (function () {
  'use strict';

  var CFG  = window.AYW_CONFIG || {};
  var I18N = window.I18N || {};
  var lang = 'ar';

  /* ---------------------------------------------------------------------------
     Tiny DOM helpers
  --------------------------------------------------------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  /** Create an element: el('p', {class:'x'}, 'text' | [children]) */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class')      node.className = v;
        else if (k === 'html')  node.innerHTML = v;   // only ever fed our own i18n strings
        else if (k === 'text')  node.textContent = v;
        else if (k === 'on')    Object.keys(v).forEach(function (ev) { node.addEventListener(ev, v[ev]); });
        else if (v === true)    node.setAttribute(k, '');
        else                    node.setAttribute(k, v);
      });
    }
    if (children !== undefined && children !== null) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  /* ---------------------------------------------------------------------------
     Translation. t('nav.next') → "التالي". t('prog.step', {n:2, t:6}).
     A missing key returns the key itself, so a typo is visible, not silent.
  --------------------------------------------------------------------------- */
  function t(key, vars) {
    var dict = I18N[lang] || {};
    var s = dict[key];
    if (s === undefined) s = (I18N.ar && I18N.ar[key]) !== undefined ? I18N.ar[key] : key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return s;
  }

  /* ---------------------------------------------------------------------------
     Browser storage that can never throw (private mode, blocked cookies,
     storage full — all silently fall back to "no draft saving").
  --------------------------------------------------------------------------- */
  var store = {
    get: function (key) {
      try { return window.localStorage.getItem(key); } catch (e) { return null; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
    },
    remove: function (key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* nothing to do */ }
    }
  };

  /* ---------------------------------------------------------------------------
     Language
  --------------------------------------------------------------------------- */
  function getLang() { return lang; }

  function setLang(next, persist) {
    if (!I18N[next]) return;
    lang = next;
    var dir = (I18N.dir && I18N.dir[next]) || 'ltr';
    document.documentElement.lang = next;
    document.documentElement.dir  = dir;
    if (persist !== false) store.set(CFG.langStorageKey || 'ayw.lang', next);
    applyI18n(document);
    document.dispatchEvent(new CustomEvent('ayw:lang', { detail: { lang: next, dir: dir } }));
  }

  /** Pick the starting language: the visitor's saved choice wins, else config. */
  function initLang() {
    var saved = store.get(CFG.langStorageKey || 'ayw.lang');
    setLang(I18N[saved] ? saved : (CFG.defaultLang || 'ar'), false);
  }

  /**
   * Translate every marked element inside `root`.
   *   data-i18n           → textContent
   *   data-i18n-html      → innerHTML (for text that contains <strong> etc.)
   *   data-i18n-ph        → placeholder
   *   data-i18n-aria      → aria-label
   *   data-i18n-title     → title
   *   data-i18n-alt       → alt (image descriptions)
   */
  function applyI18n(root) {
    $$('[data-i18n]', root).forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    $$('[data-i18n-html]', root).forEach(function (n) { n.innerHTML = t(n.getAttribute('data-i18n-html')); });
    $$('[data-i18n-ph]', root).forEach(function (n) { n.setAttribute('placeholder', t(n.getAttribute('data-i18n-ph'))); });
    $$('[data-i18n-aria]', root).forEach(function (n) { n.setAttribute('aria-label', t(n.getAttribute('data-i18n-aria'))); });
    $$('[data-i18n-title]', root).forEach(function (n) { n.setAttribute('title', t(n.getAttribute('data-i18n-title'))); });
    $$('[data-i18n-alt]', root).forEach(function (n) { n.setAttribute('alt', t(n.getAttribute('data-i18n-alt'))); });

    // <title> and the meta description, when the page declares keys for them.
    var titleEl = $('title[data-i18n-doc]');
    if (titleEl) document.title = t(titleEl.getAttribute('data-i18n-doc'));
    var descEl = $('meta[name="description"][data-i18n-doc]');
    if (descEl) descEl.setAttribute('content', t(descEl.getAttribute('data-i18n-doc')));
  }

  /** Wire up every [data-lang-toggle] button on the page. */
  function initLangToggle() {
    $$('[data-lang-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setLang(lang === 'ar' ? 'en' : 'ar');
      });
    });
  }

  /* ---------------------------------------------------------------------------
     Talking to the Apps Script Web App.

     Note on the Content-Type: 'text/plain' keeps this a *simple* CORS request,
     so the browser sends it without a preflight OPTIONS call — which Apps
     Script cannot answer. The body is still JSON; Code.gs parses it as JSON.
     This is the standard, documented way to POST to an Apps Script Web App
     from a static site and still read the reply.
  --------------------------------------------------------------------------- */
  function AywError(code, detail) {
    this.name = 'AywError';
    this.code = code;
    this.detail = detail || null;
    this.message = code;
  }
  AywError.prototype = Object.create(Error.prototype);

  function post(payload) {
    var url = CFG.endpoint;
    if (!url || url.indexOf('PASTE_') === 0) {
      return Promise.reject(new AywError('no_endpoint'));
    }

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timedOut = false;
    var timer = setTimeout(function () {
      timedOut = true;
      if (controller) controller.abort();
    }, CFG.requestTimeoutMs || 20000);

    var opts = {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    };
    if (controller) opts.signal = controller.signal;

    return fetch(url, opts)
      .then(function (res) { return res.text(); })
      .then(function (text) {
        clearTimeout(timer);
        var json;
        try { json = JSON.parse(text); }
        catch (e) { throw new AywError('bad_response', text.slice(0, 200)); }
        if (!json || json.ok !== true) {
          throw new AywError((json && json.error) || 'server_error', json);
        }
        return json;
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (err instanceof AywError) throw err;
        if (timedOut || err.name === 'AbortError') throw new AywError('timeout');
        throw new AywError('network', String(err && err.message));
      });
  }

  /* ---------------------------------------------------------------------------
     Motion
     A tiny script in each page's <head> adds class "motion" to <html> only when
     the visitor has NOT asked their device to reduce motion. Everything that
     moves checks that class (or the matching CSS media query) first.
  --------------------------------------------------------------------------- */
  function motionOK() {
    return document.documentElement.classList.contains('motion');
  }

  /** Fade + lift each .reveal element into view the first time it is scrolled to. */
  function initReveal(root) {
    var items = $$('.reveal:not(.is-in)', root);
    if (!motionOK() || !('IntersectionObserver' in window)) {
      items.forEach(function (n) { n.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ---------------------------------------------------------------------------
     Misc
  --------------------------------------------------------------------------- */
  function uuid() {
    try {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      if (window.crypto && window.crypto.getRandomValues) {
        var a = new Uint8Array(16);
        window.crypto.getRandomValues(a);
        return Array.prototype.map.call(a, function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      }
    } catch (e) { /* fall through */ }
    return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /* ---------------------------------------------------------------------------
     Phone numbers — the same rules as normalisePhone_() in Code.gs.
     01001240186 · +20 01001240186 · ٠١٠٠١٢٤٠١٨٦ · 0020 100 124 0186 → +201001240186
  --------------------------------------------------------------------------- */
  var COUNTRY_CODES = ['+20', '+966', '+971', '+965', '+974', '+973', '+968', '+962', '+961',
                       '+963', '+964', '+249', '+218', '+216', '+213', '+212', '+44', '+1',
                       '+49', '+33', '+39', '+34', '+31', '+90'];

  /** Digits typed on an Arabic (٠–٩) or Persian (۰–۹) keyboard become 0–9. */
  function toAsciiDigits(s) {
    return String(s == null ? '' : s)
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
  }

  /** The username form "+201001240186", or '' if it is not a valid number. */
  function normalisePhone(raw) {
    var s = toAsciiDigits(raw).replace(/[\s\-().‎‏‪-‮]/g, '');
    if (/^00/.test(s)) s = '+' + s.slice(2);
    if (/^0\d{10}$/.test(s)) s = '+20' + s.slice(1);
    else if (/^1[0125]\d{8}$/.test(s)) s = '+20' + s;
    if (!/^\+\d+$/.test(s)) return '';
    if (s.indexOf('+20') === 0) {
      var national = s.slice(3).replace(/^0/, '');
      return /^1[0125]\d{8}$/.test(national) ? '+20' + national : '';
    }
    var len = s.length - 1;
    return (len >= 8 && len <= 15) ? s : '';
  }

  /** Fill a <select> with the dialling codes, +20 first. */
  function fillCodes(sel) {
    /* U+200E (left-to-right mark) stops an RTL page from showing "+20" as "20+". */
    COUNTRY_CODES.forEach(function (c) { sel.appendChild(el('option', { value: c }, '‎' + c)); });
    sel.value = '+20';
  }

  /* ---------------------------------------------------------------------------
     Sessions. The login token lives in localStorage and travels only in the
     POST body. The coach console keeps its own key, so one browser can hold a
     participant login and the coach login without one replacing the other.
  --------------------------------------------------------------------------- */
  var SESSION_KEY = 'ayw.session';
  var COACH_KEY   = 'ayw.coach.session';

  var session = {
    get: function (key) {
      try {
        var v = JSON.parse(store.get(key || SESSION_KEY) || 'null');
        return v && /^[0-9a-f]{64}$/.test(v.token) ? v : null;
      } catch (e) { return null; }
    },
    set: function (data, key) { store.set(key || SESSION_KEY, JSON.stringify(data)); },
    clear: function (key) { store.remove(key || SESSION_KEY); }
  };

  /** Keep what a login/change/reset reply says about the session. */
  function saveSession(res, key) {
    session.set({ token: res.session, scope: res.scope, name: res.name || '',
                  username: res.username || '', exp: res.expires_at || '' }, key);
  }

  /**
   * POST with the session token added. An expired session sends the person
   * back to the login page (or calls opts.onExpired), and a restricted one to
   * the password change.
   */
  function call(type, body, opts) {
    opts = opts || {};
    var key = opts.sessionKey || SESSION_KEY;
    var payload = { type: type };
    Object.keys(body || {}).forEach(function (k) { payload[k] = body[k]; });
    var s = session.get(key);
    if (s) payload.session = s.token;
    return post(payload).catch(function (err) {
      var code = err && err.code;
      if (code === 'session_expired' || code === 'forbidden') {
        session.clear(key);
        if (opts.onExpired) opts.onExpired(); else window.location.replace('login.html');
      } else if (code === 'password_change_required' && !opts.onExpired) {
        window.location.replace('change-password.html');
      }
      throw err;
    });
  }

  /** A server or network error code → a sentence for the person. */
  function apiMessage(code) {
    var msg = t('api.' + code);
    return msg === 'api.' + code ? t('api.generic') : msg;
  }

  /* ---------------------------------------------------------------------------
     Passwords — the browser half of passwordProblem_() in Code.gs. The server
     checks everything again, including "not the default password".
  --------------------------------------------------------------------------- */
  function passwordRules(pw, opts) {
    opts = opts || {};
    pw = String(pw || '');
    var digits = String(opts.username || '').replace(/[^\d]/g, '');
    return {
      len:   pw.length >= 8 && pw.length <= 64,
      ascii: pw.length > 0 && /^[\x21-\x7E]+$/.test(pw),
      phone: pw.length > 0 && !(digits.length >= 8 && pw.indexOf(digits.slice(-8)) !== -1),
      diff:  pw.length > 0 && (!opts.current || pw !== opts.current),
      match: pw.length > 0 && opts.confirm !== undefined && pw === opts.confirm
    };
  }

  /**
   * Tick the rule list (<li data-rule="len|ascii|phone|diff|match">) live as
   * the new password is typed. Returns a function: are all listed rules met?
   */
  function bindPasswordChecklist(o) {
    function state() {
      return passwordRules(o.next.value, {
        username: o.username || '', current: o.current ? o.current.value : '', confirm: o.confirm.value
      });
    }
    function paint() {
      var r = state();
      $$('[data-rule]', o.list).forEach(function (li) {
        var ok = !!r[li.getAttribute('data-rule')];
        li.classList.toggle('is-ok', ok);
        li.setAttribute('data-state', ok ? 'ok' : 'todo');
      });
    }
    [o.next, o.confirm, o.current].forEach(function (n) { if (n) n.addEventListener('input', paint); });
    paint();
    return function allOk() {
      var r = state();
      return $$('[data-rule]', o.list).every(function (li) { return r[li.getAttribute('data-rule')]; });
    };
  }

  /** Wire every [data-pw-toggle="inputId"] button: show / hide the password. */
  function initPasswordToggles(root) {
    $$('[data-pw-toggle]', root).forEach(function (btn) {
      var input = document.getElementById(btn.getAttribute('data-pw-toggle'));
      if (!input) return;
      function paint() {
        var shown = input.type === 'text';
        btn.textContent = t(shown ? 'pw.hide' : 'pw.show');
        btn.setAttribute('aria-pressed', shown ? 'true' : 'false');
      }
      btn.addEventListener('click', function () {
        input.type = input.type === 'password' ? 'text' : 'password';
        paint();
        input.focus();
      });
      document.addEventListener('ayw:lang', paint);
      paint();
    });
  }

  /* ---------------------------------------------------------------------------
     Clipboard and WhatsApp
  --------------------------------------------------------------------------- */
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.position = 'absolute'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    }
    return Promise.resolve(fallback());
  }

  /** wa.me link that opens a chat with a message ready to send. */
  function waUrl(phone, text) {
    return 'https://wa.me/' + String(phone || '').replace(/[^\d]/g, '') +
           (text ? '?text=' + encodeURIComponent(text) : '');
  }

  /** Show (or clear, with '') the message under a [data-field] wrapper. */
  function fieldError(field, msg, root) {
    var wrap = $('[data-field="' + field + '"]', root);
    if (!wrap) return;
    var e = $('.field__err', wrap);
    if (e) e.textContent = msg || '';
    wrap.classList.toggle('is-invalid', !!msg);
    $$('input, select, textarea', wrap).forEach(function (c) {
      c.setAttribute('aria-invalid', msg ? 'true' : 'false');
    });
  }

  /** Point every [data-wa-coach] link at the coach's WhatsApp. */
  function initCoachLinks(root, text) {
    $$('[data-wa-coach]', root).forEach(function (a) { a.href = waUrl(CFG.contactWhatsapp, text || ''); });
  }

  /** The start-up every simple page shares: language, config text, motion. */
  function initPage() {
    initLang();
    initLangToggle();
    applyConfigText();
    initReveal();
    document.addEventListener('ayw:lang', function () { applyConfigText(); });
    var year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
  }

  function cfgValue(key) {
    var val = key.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, CFG);
    if (typeof val === 'object' && val !== null) val = val[lang] || val.ar;
    return val;
  }

  /**
   * Put config values on the page.
   *   data-cfg="key"       → the element's visible text (and href, for links)
   *   data-cfg-href="key"  → the link's href ONLY, leaving its translated label alone
   */
  function applyConfigText(root) {
    root = root || document;

    $$('[data-cfg]', root).forEach(function (n) {
      var key = n.getAttribute('data-cfg');
      var val = cfgValue(key);
      if (val === undefined) return;
      n.textContent = val;
      if (n.tagName === 'A') n.href = hrefFor(key, val);
    });

    $$('[data-cfg-href]', root).forEach(function (n) {
      var key = n.getAttribute('data-cfg-href');
      var val = cfgValue(key);
      if (val !== undefined) n.href = hrefFor(key, val);
    });
  }

  function hrefFor(key, val) {
    if (key === 'contactEmail')    return 'mailto:' + val;
    if (key === 'contactWhatsapp') return 'https://wa.me/' + String(val).replace(/[^\d]/g, '');
    if (key === 'instagramUrl' || key === 'instagramHandle') return CFG.instagramUrl;
    return val;
  }

  return {
    cfg: CFG,
    $: $, $$: $$, el: el, t: t,
    store: store,
    getLang: getLang, setLang: setLang, initLang: initLang,
    applyI18n: applyI18n, initLangToggle: initLangToggle,
    applyConfigText: applyConfigText,
    motionOK: motionOK, initReveal: initReveal,
    post: post, uuid: uuid, AywError: AywError,
    toAsciiDigits: toAsciiDigits, normalisePhone: normalisePhone, fillCodes: fillCodes,
    session: session, saveSession: saveSession, call: call, apiMessage: apiMessage,
    COACH_KEY: COACH_KEY,
    passwordRules: passwordRules, initPasswordToggles: initPasswordToggles,
    bindPasswordChecklist: bindPasswordChecklist,
    copyText: copyText, waUrl: waUrl, initPage: initPage,
    fieldError: fieldError, initCoachLinks: initCoachLinks
  };
})();
