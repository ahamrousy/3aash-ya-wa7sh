/* =============================================================================
   check-events.js — check an events batch file before it is published.
   -----------------------------------------------------------------------------
       node apps-script/tests/check-events.js docs/events/<file>.json
   Runs the file through the real import in Code.gs (inside the fake Google
   services) and also checks docs/events/manifest.json. Prints "OK" and exits
   0, or lists every problem and exits 1. Developer tool only.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { load } = require('./gas-harness');

const file = process.argv[2];
if (!file) { console.error('usage: node apps-script/tests/check-events.js docs/events/<file>.json'); process.exit(2); }
const problems = [];
const text = fs.readFileSync(file, 'utf8');

const S = load({ props: { DEFAULT_PASSWORD: 'Check#0000', COACH_EMAIL: 'check@dev.local' } });
S.setup();
S.setCoachPassword('Check#Dev2026', 'check@dev.local');
const cs = S.createSession_(S.COACH_PID, 'coach', 'full').token;
const r = JSON.parse(S.doPost({ postData: { contents: JSON.stringify({ type: 'coach_events_save', session: cs, events_json: text }) } }).getContent());
if (!r.ok) problems.push(...(r.errors || [r.error]));

/* Every other batch's ids, so a new file does not reuse one by mistake. */
const dir = path.dirname(path.resolve(file));
const mine = path.basename(file);
let list = [];
try { list = JSON.parse(text); if (!Array.isArray(list)) list = list.events || []; } catch (e) { /* reported above */ }
const others = {};
fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json' && f !== mine).forEach((f) => {
  try { (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) || []).forEach((e) => { others[e.event_id] = f; }); } catch (e) { /* skip */ }
});
const reused = list.filter((e) => others[e.event_id]).map((e) => e.event_id + ' (also in ' + others[e.event_id] + ')');
if (reused.length) console.log('Note — these update events from older files (fine if the facts really changed): ' + reused.join(', '));

try {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (!Array.isArray(m.files)) problems.push('manifest.json: "files" must be a list');
  else if (m.files.indexOf(mine) < 0) problems.push('manifest.json does not list ' + mine);
} catch (e) { problems.push('manifest.json: ' + e.message); }

if (problems.length) { console.log('PROBLEMS:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('OK — ' + list.length + ' events, ' + JSON.stringify(r.counts));
