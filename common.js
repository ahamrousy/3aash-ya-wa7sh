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
   */
  function applyI18n(root) {
    $$('[data-i18n]', root).forEach(function (n) { n.textContent = t(n.getAttribute('data-i18n')); });
    $$('[data-i18n-html]', root).forEach(function (n) { n.innerHTML = t(n.getAttribute('data-i18n-html')); });
    $$('[data-i18n-ph]', root).forEach(function (n) { n.setAttribute('placeholder', t(n.getAttribute('data-i18n-ph'))); });
    $$('[data-i18n-aria]', root).forEach(function (n) { n.setAttribute('aria-label', t(n.getAttribute('data-i18n-aria'))); });
    $$('[data-i18n-title]', root).forEach(function (n) { n.setAttribute('title', t(n.getAttribute('data-i18n-title'))); });

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
    post: post, uuid: uuid, AywError: AywError
  };
})();
