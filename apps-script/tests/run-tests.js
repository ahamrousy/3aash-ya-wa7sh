/* =============================================================================
   run-tests.js — offline tests for apps-script/Code.gs
       node apps-script/tests/run-tests.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const { load, post, table, CODE } = require('./gas-harness');

let pass = 0, fail = 0;
function check(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }
function throws(fn) { try { fn(); return null; } catch (e) { return String(e.message || e); } }

const PROPS = { DEFAULT_PASSWORD: 'Default#0000' };   // tests never use the real default

const ADULT = {
  type: 'intake', language_used: 'ar', submission_token: 'tok-adult', elapsed_ms: 60000, hp: '',
  name: 'أحمد محمود', whatsapp: '+20 1012345678', email: 'a@b.com', city: 'مدينة نصر', contact_pref: 'whatsapp',
  objectives: 'weight', target_weight: '80', timeframe: '3',
  age: '34', gender: 'male', weight_kg: '92', height_cm: '178', waist_cm: '100',
  current_sports: 'gym', activity_details: 'gym=3x/week,60min',
  days_per_week: '3', preferred_days: 'sat,mon,wed', hours_per_session: '60', time_of_day: 'early', facilities: 'gym',
  parq_heart: 'no', parq_chest: 'no', parq_balance: 'no', parq_chronic: 'no', parq_meds: 'no', parq_bone: 'no',
  parq_supervised: 'no', consent_accuracy: 'TRUE', consent_data: 'TRUE'
};

/* ------------------------------------------------------------------ router */
section('1. Router and Phase 1 regressions');
{
  const S = load({ props: PROPS });
  const r = post(S, ADULT);
  check('intake still accepted', r.ok === true && /^AYW-\d{4}-0001$/.test(r.participant_id), r);
  check('honeypot still rejects intake', post(S, Object.assign({}, ADULT, { submission_token: 'h', hp: 'x' })).error === 'spam');
  check('too-fast intake still rejected', post(S, Object.assign({}, ADULT, { submission_token: 'f', elapsed_ms: 500 })).error === 'too_fast');
  check('unknown type → unknown_type', post(S, { type: 'nope' }).error === 'unknown_type');
  check('broken JSON → bad_request',
    JSON.parse(S.doPost({ postData: { contents: '{not json' } }).getContent()).error === 'bad_request');
  check('missing type still means intake (old clients)',
    post(S, Object.assign({}, ADULT, { type: undefined, submission_token: 'old' })).ok === true);

  const ck = { type: 'checkin', submission_token: 'ck', elapsed_ms: 60000, hp: '', participant_id: r.participant_id,
               whatsapp: '+20 1012345678', weight_kg: '91', sessions_done: '3', energy: '4' };
  check('legacy check-in (ID + WhatsApp) still works', post(S, ck).ok === true);
  check('legacy check-in still needs 20 s', post(S, Object.assign({}, ck, { submission_token: 'ck2', elapsed_ms: 100 })).error === 'too_fast');
  check('check-in carrying a session skips the 20-second gate',
    post(S, Object.assign({}, ck, { submission_token: 'ck3', elapsed_ms: 100, session: 'abc' })).error !== 'too_fast');
  check('check-in honeypot still applies', post(S, Object.assign({}, ck, { submission_token: 'ck4', hp: 'bot' })).error === 'spam');

  const arabic = post(S, Object.assign({}, ADULT, { submission_token: 'ar', whatsapp: '+20 ١٠١٢٣٤٥٦٧٩' }));
  const row = table(S, 'Submissions').find((x) => x.participant_id === arabic.participant_id) || {};
  check('Arabic-Indic digits accepted by the server', arabic.ok === true && row.whatsapp === '+20 1012345679', row.whatsapp);
}

/* ------------------------------------------------------------- coach email */
section('2. COACH_EMAIL comes from Script Properties');
{
  const A = load({ props: PROPS });
  post(A, ADULT);
  check('placeholder address → no email sent', A.__state.mails.length === 0);
  const B = load({ props: Object.assign({ COACH_EMAIL: 'coach@real.example' }, PROPS) });
  post(B, ADULT);
  check('property address receives the email', B.__state.mails.length === 1 && B.__state.mails[0].to === 'coach@real.example',
    B.__state.mails.map((m) => m.to));
}

/* ------------------------------------------------------------ phone rules */
section('3. Phone normaliser');
{
  const S = load();
  const cases = [
    ['01001240186', '+201001240186'], ['+20 01001240186', '+201001240186'], ['+201001240186', '+201001240186'],
    ['٠١٠٠١٢٤٠١٨٦', '+201001240186'], ['۰۱۰۰۱۲۴۰۱۸۶', '+201001240186'], ['00201001240186', '+201001240186'],
    ['+20 100-124-0186', '+201001240186'], ['1001240186', '+201001240186'], ['+20 1012345678', '+201012345678'],
    ['‎+20 1001240186', '+201001240186'], ['+966512345678', '+966512345678'], ['00971501234567', '+971501234567'],
    ['+20 9999', ''], ['+20 2012345678', ''], ['abc', ''], ['', ''], ['+1234', '']
  ];
  cases.forEach(([inp, want]) => {
    const got = S.normalisePhone_(inp);
    check(JSON.stringify(inp) + ' → ' + (want || "''"), got === want, got);
  });
}

/* ----------------------------------------------------------------- hashing */
section('4. Password hashing');
{
  const S = load({ props: PROPS });
  check('hashing refuses to run without a PEPPER', /PEPPER/.test(throws(() => S.makePasswordRecord_('x')) || ''));
  S.initSecrets_();
  const pep = S.__state.props.PEPPER;
  check('initSecrets_ creates a 32-byte PEPPER', !!pep && Buffer.from(pep, 'base64').length === 32);
  S.initSecrets_();
  check('…and never replaces it', S.__state.props.PEPPER === pep);

  const rec = S.makePasswordRecord_('Wa7sh!2026');
  check('record has algo, 5000 iterations, salt, hash',
    rec.algo === 'sha256-iter-v1' && rec.iter === 5000 && Buffer.from(rec.salt, 'base64').length === 16 && rec.hash.length === 44, rec);
  check('right password matches', S.checkPassword_('Wa7sh!2026', rec) === true);
  check('wrong password does not', S.checkPassword_('wa7sh!2026', rec) === false);
  const rec2 = S.makePasswordRecord_('Wa7sh!2026');
  check('same password, new salt → different hash', rec2.hash !== rec.hash && rec2.salt !== rec.salt);
  check('stored iteration count is honoured', S.checkPassword_('abc12345', Object.assign({}, S.makePasswordRecord_('abc12345'))) === true);
  check('unknown algorithm is refused', S.checkPassword_('Wa7sh!2026', Object.assign({}, rec, { algo: 'md5' })) === false);
  check('safeEqual_ basics', S.safeEqual_('abc', 'abc') && !S.safeEqual_('abc', 'abd') && !S.safeEqual_('abc', 'abcd'));
  check('the plain password is nowhere in the record', !JSON.stringify(rec).includes('Wa7sh!2026'));
  const tok = S.randomToken_();
  check('tokens are 64 hex characters and unique', /^[0-9a-f]{64}$/.test(tok) && tok !== S.randomToken_());
}

/* ----------------------------------------------------------- password rules */
section('5. New-password rules');
{
  const S = load({ props: PROPS });
  const u = '+201001240186';
  [['short1!', 'pw_too_short'], ['a'.repeat(65), 'pw_too_long'], ['Pass١٢٣٤word', 'pw_ascii_only'],
   ['كلمةسر12345', 'pw_ascii_only'], ['has space1', 'pw_ascii_only'], ['Default#0000', 'pw_is_default'],
   ['x01001240186y', 'pw_has_phone'], ['ab1240186cd', ''], ['zz01240186', 'pw_has_phone'], ['Wa7sh!2026', '']
  ].forEach(([pw, want]) => {
    const got = S.passwordProblem_(pw, u);
    check(JSON.stringify(pw) + ' → ' + (want || 'ok'), got === want, got);
  });
}

/* ---------------------------------------------------------------- sessions */
section('6. Sessions');
{
  const S = load({ props: PROPS });
  S.initSecrets_();
  const s = S.createSession_('AYW-2026-0002', 'participant', 'full');
  check('token returned, only its hash stored',
    /^[0-9a-f]{64}$/.test(s.token) && !JSON.stringify(S.__state.sheets.Sessions._state.rows).includes(s.token));
  const r = S.resolveSession_(s.token);
  check('resolves to the right participant and scope', r && r.pid === 'AYW-2026-0002' && r.scope === 'full', r);
  check('malformed tokens are refused', S.resolveSession_('') === null && S.resolveSession_('../etc') === null && S.resolveSession_('A'.repeat(64)) === null);
  check('an unknown token is refused', S.resolveSession_(S.randomToken_()) === null);

  const days = (iso) => (Date.parse(iso) - Date.now()) / 864e5;
  check('participant session lasts 30 days', Math.abs(days(s.expires_at) - 30) < 0.01);
  const c = S.createSession_('COACH', 'coach', 'full');
  check('coach session lasts 12 hours', Math.abs(days(c.expires_at) * 24 - 12) < 0.01);

  /* expired: cache cleared, row backdated */
  const e = S.createSession_('AYW-2026-0003', 'participant', 'full');
  const eh = S.sha256Hex_(e.token);
  delete S.__state.cache['sess_' + eh];
  const rows = S.__state.sheets.Sessions._state.rows;
  const ri = rows.findIndex((x) => x[0] === eh);
  rows[ri][5] = new Date(Date.now() - 1000).toISOString();
  check('an expired session is refused', S.resolveSession_(e.token) === null);

  /* revoked: even while it is still cached */
  S.resolveSession_(s.token);
  S.revokeSession_(S.sha256Hex_(s.token));
  check('a revoked session is refused straight away (cache cleared)', S.resolveSession_(s.token) === null);

  /* revoke all but one */
  const a1 = S.createSession_('AYW-2026-0004', 'participant', 'full');
  const a2 = S.createSession_('AYW-2026-0004', 'participant', 'full');
  const a3 = S.createSession_('AYW-2026-0004', 'participant', 'full');
  S.revokeAllSessions_('AYW-2026-0004', S.sha256Hex_(a3.token));
  check('revokeAllSessions_ ends the others…', S.resolveSession_(a1.token) === null && S.resolveSession_(a2.token) === null);
  check('…and keeps the current one', !!S.resolveSession_(a3.token));

  /* sliding expiry: only once an hour */
  const sl = S.createSession_('AYW-2026-0005', 'participant', 'full');
  const slh = S.sha256Hex_(sl.token);
  const sri = rows.findIndex((x) => x[0] === slh);
  rows[sri][6] = new Date(Date.now() - 2 * 36e5).toISOString();     // last seen 2 h ago
  rows[sri][5] = new Date(Date.now() + 864e5).toISOString();        // expires in 1 day
  delete S.__state.cache['sess_' + slh];
  S.resolveSession_(sl.token);
  check('a session seen over an hour ago is extended to 30 days', Math.abs(days(rows[sri][5]) - 30) < 0.01, rows[sri][5]);
  const before = rows[sri][5];
  S.resolveSession_(sl.token);
  check('…but not rewritten again within the hour', rows[sri][5] === before);
}

/* ----------------------------------------------------------------- lockout */
section('7. Lockout and AuthLog');
{
  const S = load({ props: PROPS });
  S.initSecrets_();
  S.createAccount_('AYW-2026-0002', '+201001240186', 'Test');
  const user = () => S.findUser_('username', '+201001240186');
  for (let i = 0; i < 4; i++) S.registerFailure_(user(), '+201001240186');
  check('4 failures: not locked yet', !S.isLocked_(user()));
  S.registerFailure_(user(), '+201001240186');
  const mins = (Date.parse(user().locked_until) - Date.now()) / 6e4;
  check('5th failure: locked for 15 minutes', S.isLocked_(user()) && Math.abs(mins - 15) < 0.1, user().locked_until);
  S.registerSuccess_(user());
  check('a success clears the lock and the count', !S.isLocked_(user()) && Number(user().failed_count) === 0 && !!user().last_login_at);

  for (let i = 0; i < 20; i++) S.registerFailure_(user(), '+201001240186');
  check('20 failures in a day: locked until the coach unlocks', user().locked_until === '9999-12-31T00:00:00.000Z', user().locked_until);

  S.registerFailure_(null, '+201555555555');
  const log = table(S, 'AuthLog');
  check('failures are logged, including unknown usernames', log.some((x) => x.detail === 'unknown username') &&
        log.filter((x) => x.event === 'lockout').length >= 2);
  check('no password or token ever reaches AuthLog', !JSON.stringify(log).includes('Default#0000'));
}

/* ------------------------------------------------------------- accounts */
section('8. Accounts');
{
  const S = load({ props: PROPS });
  S.initSecrets_();
  S.createAccount_('AYW-2026-0009', '+201001240186', '=HYPERLINK("x")');
  const u = S.findUser_('participant_id', 'AYW-2026-0009');
  check('new account: awaiting_plan, must change password', u.status === 'awaiting_plan' && u.must_change_password === 'TRUE');
  check('default password checks out against the stored hash', S.checkPassword_('Default#0000', S.passwordRecordOf_(u)));
  check('default password window is 14 days',
    Math.abs((Date.parse(u.initial_expires_at) - Date.now()) / 864e5 - 14) < 0.01 && S.defaultPasswordActive_(u));
  check('name passes through the formula guard', String(u.name).charAt(0) === "'", u.name);
  check('the default password is not stored in plain text', !JSON.stringify(S.__state.sheets.Users._state.rows).includes('Default#0000'));
  const N = load();
  N.initSecrets_();
  check('no DEFAULT_PASSWORD property → account creation refuses', /DEFAULT_PASSWORD/.test(throws(() => N.createAccount_('AYW-2026-0001', '+201001240186', 'x')) || ''));
}

/* --------------------------------------------------------------- migration */
section('9. Migrating existing participants');
{
  const S = load({ props: PROPS });
  const ids = {};
  [['a', '+20 1011111111'], ['b', '+20 1022222222'], ['c', '+20 1022222222'], ['d', '+966 512345678']].forEach(([k, phone]) => {
    ids[k] = post(S, Object.assign({}, ADULT, { submission_token: 'm' + k, whatsapp: phone, name: 'P ' + k })).participant_id;
  });
  /* a row with a phone the old rules never produced */
  const sub = S.__state.sheets.Submissions._state.rows;
  sub[sub.findIndex((r) => r[1] === ids.d)][3] = 'not a phone';

  const rep = S.migrateExistingParticipants();
  const users = table(S, 'Users');
  check('valid, unique numbers get accounts', users.length === 1 && users[0].participant_id === ids.a && users[0].username === '+201011111111', users.map((u) => u.username));
  check('both rows sharing a number are skipped and reported', /used by more than one submission/.test(rep) && rep.includes(ids.b) && rep.includes(ids.c));
  check('an invalid phone is skipped and reported', rep.includes(ids.d) && /not a valid number/.test(rep));
  const rep2 = S.migrateExistingParticipants();
  check('running it twice creates nothing new', table(S, 'Users').length === 1 && /Accounts created: 0/.test(rep2));

  S.deleteParticipant(ids.c);
  S.migrateExistingParticipants();
  check('after removing the duplicate, the remaining one gets its account', table(S, 'Users').some((u) => u.participant_id === ids.b));
  const N = load();
  post(N, ADULT);
  check('migration refuses without DEFAULT_PASSWORD', /DEFAULT_PASSWORD/.test(throws(() => N.migrateExistingParticipants()) || ''));
}

/* ---------------------------------------------------- test participant + delete */
section('10. Test participant and deleteParticipant');
{
  const S = load({ props: PROPS });
  S.createTestParticipant();
  check('AYW-9999-0001 exists in Submissions and Users',
    table(S, 'Submissions').some((r) => r.participant_id === 'AYW-9999-0001') &&
    (S.findUser_('participant_id', 'AYW-9999-0001') || {}).username === '+201099999999');
  S.createTestParticipant();
  check('creating it again replaces it (still one of each)',
    table(S, 'Submissions').filter((r) => r.participant_id === 'AYW-9999-0001').length === 1 &&
    table(S, 'Users').filter((r) => r.participant_id === 'AYW-9999-0001').length === 1);

  /* give it data in every tab */
  const sess = S.createSession_('AYW-9999-0001', 'participant', 'full');
  S.writeRow_('ResetTokens', { token_hash: 'x', participant_id: 'AYW-9999-0001', created_by: 'coach' });
  S.writeRow_('Plans', { plan_id: 'p1', participant_id: 'AYW-9999-0001', version: 1 });
  S.writeRow_('PlanSessions', { plan_id: 'p1', participant_id: 'AYW-9999-0001', session_id: 'w1d1', week: 1, day: 1 });
  S.writeRow_('SessionLogs', { log_id: 'l1', participant_id: 'AYW-9999-0001', session_id: 'w1d1', status: 'done' });
  S.registerFailure_(S.findUser_('participant_id', 'AYW-9999-0001'), '+201099999999');
  const other = post(S, ADULT).participant_id;

  const msg = S.deleteTestParticipant();
  const left = ['Submissions', 'Users', 'Sessions', 'ResetTokens', 'Plans', 'PlanSessions', 'SessionLogs']
    .filter((t) => table(S, t).some((r) => r.participant_id === 'AYW-9999-0001'));
  check('gone from every tab', left.length === 0, left);
  check('its AuthLog lines are gone too', !table(S, 'AuthLog').some((r) => r.username === '+201099999999'));
  check('its session no longer works', S.resolveSession_(sess.token) === null);
  check('other participants are untouched', table(S, 'Submissions').some((r) => r.participant_id === other));
  check('deleteParticipant reports what it removed', /AYW-9999-0001 deleted: /.test(msg), msg);
  check('a malformed ID is refused', /Not a participant ID/.test(throws(() => S.deleteParticipant('../x')) || ''));
}

/* -------------------------------------------------------------------- setup */
section('11. setup() and the coach account');
{
  const S = load({ props: PROPS });
  const msg = S.setup();
  ['Users', 'Sessions', 'ResetTokens', 'Plans', 'PlanSessions', 'SessionLogs', 'AuthLog'].forEach((t) => {
    const sh = S.__state.sheets[t];
    check(t + ' tab created with its headers', sh && sh._state.rows[0] && sh._state.rows[0].join(',') === S.TABS[t].headers.join(','));
  });
  const users = S.__state.sheets.Users._state;
  check('Users tab protected (editors removed, no domain edit)',
    users.protections.length === 1 && users.protections[0].editorsRemoved && users.protections[0].domain === false);
  check('pw_salt and pw_hash columns hidden', users.hidden.some(([c, n]) => c === 8 && n === 2), users.hidden);
  check('setup reports what still needs setting', /COACH_EMAIL/.test(msg) && /coach password/.test(msg), msg);
  S.setup();
  check('running setup() twice does not add a second protection', users.protections.length === 1);

  check('weak coach password refused', /not accepted/.test(throws(() => S.setCoachPassword('short', 'me@x.com')) || ''));
  check('Arabic coach password refused', /not accepted/.test(throws(() => S.setCoachPassword('كلمة سر قوية', 'me@x.com')) || ''));
  S.setCoachPassword('Coach#Strong1', 'Me@X.com');
  const p = S.__state.props;
  const rec = JSON.parse(p.COACH_HASH || '{}');
  check('coach username and hash saved in Script Properties', p.COACH_USERNAME === 'me@x.com' && S.checkPassword_('Coach#Strong1', rec));
  check('coach password is not stored in plain text', !JSON.stringify(p).includes('Coach#Strong1'));
  check('Dashboard uses the brand blue, not the old orange', !fs.readFileSync(CODE, 'utf8').includes('#FF5A1F'));
}

console.log('\n================  ' + pass + ' passed, ' + fail + ' failed  ================\n');
process.exit(fail ? 1 : 0);
