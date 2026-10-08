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

/* A made-up 3-week plan for the test participant, typed straight into the
   tabs the way the coach could do by hand. It started 9 days ago, so the
   tracker opens on week 2. NO_PLAN=1 skips it to see the waiting state. */
if (!process.env.NO_PLAN) {
  const pid = S.TEST_PID;
  const start = S.isoOfDay_(S.dayNum_(S.cairoDay_()) - 9);
  S.writeRow_('Plans', { plan_id: 'dev-plan', participant_id: pid, version: 1, status: 'published', weeks: 3,
    start_date: start, published_at: new Date().toISOString(), clearance_confirmed: 'FALSE',
    title: JSON.stringify({ ar: 'برنامج تجريبي — أول 5 كم', en: 'Test plan — first 5 km' }),
    coach_note: JSON.stringify({ ar: 'ابدأ هادي، والمهم الانتظام مش السرعة.', en: 'Start easy — consistency beats speed.' }) });
  const rows = [
    ['w1d1', 1, 1, 'walk', 'مشي سريع', 'Brisk walk', '30 دقيقة مشي سريع', '30 min brisk walk', 30, null, 'easy'],
    ['w1d3', 1, 3, 'strength', 'تمارين قوة في البيت', 'Home strength', '3 جولات: سكوات 12، ضغط 8، بلانك 30 ث', '3 rounds: 12 squats, 8 push-ups, 30 s plank', 25, null, 'moderate'],
    ['w1d5', 1, 5, 'run', 'جري ومشي', 'Run-walk', '8 مرات: دقيقة جري + دقيقتين مشي', '8 x (1 min run + 2 min walk)', 30, 3, 'easy'],
    ['w1d7', 1, 7, 'rest', 'راحة', 'Rest', '', '', null, null, null],
    ['w2d1', 2, 1, 'run', 'جري ومشي', 'Run-walk', '6 مرات: دقيقتين جري + دقيقتين مشي', '6 x (2 min run + 2 min walk)', 30, 3.5, 'easy'],
    ['w2d2', 2, 2, 'mobility', 'إطالة', 'Mobility', '15 دقيقة إطالة للرجلين والضهر', '15 min legs and back stretching', 15, null, null],
    ['w2d4', 2, 4, 'strength', 'تمارين قوة في البيت', 'Home strength', '3 جولات', '3 rounds', 25, null, 'moderate'],
    ['w2d6', 2, 6, 'run', 'جري متواصل', 'Continuous run', '15 دقيقة جري هادي', '15 min easy run', 20, 2.5, 'easy'],
    ['w3d1', 3, 1, 'run', 'جري ومشي', 'Run-walk', '5 مرات: 3 دقايق جري + دقيقة مشي', '5 x (3 min run + 1 min walk)', 30, 4, 'moderate'],
    ['w3d4', 3, 4, 'swim', 'سباحة خفيفة', 'Easy swim', '20 دقيقة سباحة هادية', '20 min easy swim', 20, null, 'easy'],
    ['w3d6', 3, 6, 'run', 'تجربة 5 كم', '5 km try', '5 كم بالراحة', '5 km at your own pace', 40, 5, 'race']
  ];
  rows.forEach(([id, week, day, type, tar, ten, dar, den, mins, km, intensity], i) => S.writeRow_('PlanSessions', {
    plan_id: 'dev-plan', participant_id: pid, session_id: id, week, day, order: i, type,
    title: JSON.stringify({ ar: tar, en: ten }), details: dar ? JSON.stringify({ ar: dar, en: den }) : '',
    target_duration_min: mins, target_distance_km: km, target_intensity: intensity || '' }));
  S.updateRow_('Users', S.findUser_('participant_id', pid)._row, { status: 'active' });
}

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
