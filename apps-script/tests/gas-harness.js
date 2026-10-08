/* =============================================================================
   gas-harness.js — runs the real Code.gs under Node with fake Google services.
   -----------------------------------------------------------------------------
   Developer tool only; the website never loads it. No dependencies:
       node apps-script/tests/run-tests.js
   Each call to load() gives a fresh, empty spreadsheet, properties and cache.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const CODE = path.join(__dirname, '..', 'Code.gs');

/* Java byte[] arrives in Apps Script as an array of signed numbers. */
const toSigned = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const toBuf = (arr) => Buffer.from(arr.map((b) => b & 255));

function proxyBuilder(build) {
  const p = new Proxy({}, { get: (t, k) => (k === 'build' ? () => (build ? build() : {}) : () => p) });
  return p;
}

/* Like Sheets: a leading apostrophe forces text and is dropped; anything else
   starting with = or + becomes a formula. "+20 1012345678" is a broken formula
   (#ERROR!); "+201012345678" evaluates to a number. Formulas are kept as {f, v}. */
function parseInput(v) {
  if (typeof v !== 'string') return v;
  if (v[0] === "'") return v.slice(1);
  if (v[0] === '=' || v[0] === '+') {
    const f = v[0] === '=' ? v : '=' + v;
    const m = /^=\+(\d+)$/.exec(f);
    return { f, v: m ? Number(m[1]) : '#ERROR!' };
  }
  return v;
}
const valueOf = (cell) => (cell && typeof cell === 'object' && 'f' in cell ? cell.v : cell);

function makeSheet(name) {
  const rows = [];
  const state = { name, rows, hidden: [], protections: [] };
  const range = (r, c, nr, nc) => {
    const grid = (pick) => {
      const out = [];
      for (let i = 0; i < nr; i++) {
        const row = rows[r - 1 + i] || [];
        const line = [];
        for (let j = 0; j < nc; j++) line.push(pick(row[c - 1 + j]));
        out.push(line);
      }
      return out;
    };
    const api = {
      getValues: () => grid((x) => (x === undefined ? '' : valueOf(x))),
      getFormulas: () => grid((x) => (x && typeof x === 'object' && 'f' in x ? x.f : '')),
      setValues(vals) {
        vals.forEach((line, i) => {
          const ri = r - 1 + i;
          rows[ri] = rows[ri] || [];
          line.forEach((v, j) => { rows[ri][c - 1 + j] = parseInput(v); });
        });
        return api;
      },
      setValue(v) { return api.setValues([[v]]); },
      setFormula() { return api; }, setNumberFormat() { return api; }, setDataValidation() { return api; },
      setFontWeight() { return api; }, setFontColor() { return api; }, setBackground() { return api; },
      setVerticalAlignment() { return api; }, setNote() { return api; }
    };
    return api;
  };
  const sheet = {
    _state: state,
    getName: () => name,
    getLastRow: () => rows.length,
    getMaxRows: () => Math.max(rows.length, 1000),
    getRange: (...a) => (typeof a[0] === 'string' ? range(1, 1, 1, 1) : range(a[0], a[1], a[2] || 1, a[3] || 1)),
    appendRow: (vals) => { rows.push(vals.map(parseInput)); },
    deleteRow: (i) => { rows.splice(i - 1, 1); },
    setFrozenRows() {}, setRowHeight() {}, autoResizeColumns() {},
    getColumnWidth: () => 100, setColumnWidth() {},
    hideColumns: (c, n) => { state.hidden.push([c, n || 1]); },
    clear() { rows.length = 0; },
    getCharts: () => [], removeChart() {}, insertChart() {},
    newChart: () => proxyBuilder(),
    protect() {
      const p = {
        desc: '', editorsRemoved: false, domain: true,
        setDescription(d) { p.desc = d; return p; },
        getEditors: () => ['someone@example.com'],
        removeEditors() { p.editorsRemoved = true; return p; },
        canDomainEdit: () => p.domain, setDomainEdit(v) { p.domain = v; return p; }
      };
      state.protections.push(p);
      return p;
    },
    getProtections: () => state.protections
  };
  return sheet;
}

function load(opts) {
  opts = opts || {};
  const sheets = {};
  const order = [];
  const props = Object.assign({}, opts.props || {});
  const cache = {};
  const mails = [];
  const logs = [];

  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => { sheets[n] = makeSheet(n); order.push(n); return sheets[n]; },
    getSheets: () => order.map((n) => sheets[n]).filter(Boolean),
    deleteSheet: (s) => { delete sheets[s.getName()]; },
    getUrl: () => 'https://docs.google.com/spreadsheets/d/FAKE',
    toast() {}
  };

  const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')), warn() {}, info() {} },
    Charts: { ChartType: { LINE: 'LINE' } },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s })
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock: () => true, releaseLock() {} }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: (k) => { delete props[k]; },
        getProperties: () => Object.assign({}, props)
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null),
        put: (k, v) => { cache[k] = String(v); },
        remove: (k) => { delete cache[k]; },
        removeAll: (ks) => { ks.forEach((k) => delete cache[k]); }
      })
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      newDataValidation: () => proxyBuilder(),
      ProtectionType: { SHEET: 'SHEET', RANGE: 'RANGE' },
      getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }) })
    },
    MailApp: { sendEmail: (o, subject, body) => mails.push(typeof o === 'object' ? o : { to: o, subject, body }) },
    Session: { getScriptTimeZone: () => 'Africa/Cairo' },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: (alg, bytes) => toSigned(crypto.createHash('sha256').update(toBuf(bytes)).digest()),
      newBlob: (s) => ({ getBytes: () => toSigned(Buffer.from(String(s), 'utf8')) }),
      base64Encode: (x) => (Array.isArray(x) ? toBuf(x) : Buffer.from(String(x), 'utf8')).toString('base64'),
      base64Decode: (s) => toSigned(Buffer.from(String(s), 'base64')),
      getUuid: () => crypto.randomUUID(),
      formatDate: (d, tz, fmt) => {
        const y = d.getUTCFullYear(), m = String(d.getUTCMonth() + 1).padStart(2, '0'), dd = String(d.getUTCDate()).padStart(2, '0');
        return fmt.replace('yyyy', y).replace('MM', m).replace('dd', dd);
      }
    },
    __state: { sheets, props, cache, mails, logs }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CODE, 'utf8'), sandbox, { filename: 'Code.gs' });
  return sandbox;
}

/** POST a body to doPost and return the parsed JSON reply. */
function post(S, body) {
  return JSON.parse(S.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
}

/** The rows of a tab as objects keyed by its header row. */
function table(S, name) {
  const sh = S.__state.sheets[name];
  if (!sh) return [];
  const [head, ...rest] = sh._state.rows;
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, valueOf(r[i])])));
}

module.exports = { load, post, table, CODE };
