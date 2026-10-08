/* =============================================================================
   dev-server.js — try the whole site locally, with Code.gs behind it.
   -----------------------------------------------------------------------------
   Developer tool only; nothing here is deployed.
       node apps-script/tests/dev-server.js          → http://localhost:8787
   Serves the repo's static files, rewrites config.js so the site talks to
   /exec on this server, and answers /exec by running the real Code.gs in the
   fake Google services from gas-harness.js. Data lives in memory only.

   Seeded test data (made-up values, not real people):
     participant  AYW-9999-0001 · username +201099999999 · password Default#0000
     coach        coach@dev.local · Coach#Dev2026
   ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { load } = require('./gas-harness');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 8787);

const S = load({ props: { DEFAULT_PASSWORD: 'Default#0000', COACH_EMAIL: 'coach@dev.local' } });
S.setup();
S.setCoachPassword('Coach#Dev2026', 'coach@dev.local');
S.createTestParticipant();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.json': 'application/json' };

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/exec') {
    if (req.method !== 'POST') return send(res, 200, TYPES['.json'], S.doGet().getContent());
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const delay = Number(process.env.DELAY || 300);              // feel the round trip
      setTimeout(() => {
        let out;
        try { out = S.doPost({ postData: { contents: body } }).getContent(); }
        catch (e) { out = JSON.stringify({ ok: false, error: 'server_error', detail: String(e) }); }
        send(res, 200, TYPES['.json'], out);
      }, delay);
    });
    return;
  }

  let file = decodeURIComponent(url.pathname);
  if (file.endsWith('/')) file += 'index.html';
  const full = path.normalize(path.join(ROOT, file));
  if (!full.startsWith(ROOT) || full.includes(`${path.sep}apps-script${path.sep}`) || full.includes(`${path.sep}.git`)) {
    return send(res, 404, 'text/plain', 'not found');
  }
  fs.readFile(full, (err, data) => {
    if (err) return send(res, 404, 'text/plain', 'not found');
    if (path.basename(full) === 'config.js') {
      data = Buffer.from(String(data).replace(/endpoint:\s*'[^']*'/, "endpoint: '/exec'"));
    }
    send(res, 200, TYPES[path.extname(full)] || 'application/octet-stream', data);
  });
}).listen(PORT, () => console.log('3aash Ya Wa7sh dev server on http://localhost:' + PORT));

module.exports = { S };
