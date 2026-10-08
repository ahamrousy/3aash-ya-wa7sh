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
    post(S, Object.assign({}, ADULT, { type: undefined, submission_token: 'old', whatsapp: '+20 1012345670' })).ok === true);

  const ck = { type: 'checkin', submission_token: 'ck', elapsed_ms: 60000, hp: '', participant_id: r.participant_id,
               whatsapp: '+20 1012345678', weight_kg: '91', sessions_done: '3', energy: '4' };
  check('old ID + WhatsApp check-in is refused: it needs a session now', post(S, ck).error === 'session_expired');
  check('a check-in without a session still has the 20-second gate',
    post(S, Object.assign({}, ck, { submission_token: 'ck2', elapsed_ms: 100 })).error === 'too_fast');
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
  check('record has algo, 1000 iterations, salt, hash',
    rec.algo === 'sha256-iter-v1' && rec.iter === 1000 && Buffer.from(rec.salt, 'base64').length === 16 && rec.hash.length === 44, rec);
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
  const nameCell = S.__state.sheets.Users._state.rows[u._row - 1][S.TABS.Users.headers.indexOf('name')];
  check('a name that looks like a formula is stored as plain text', typeof nameCell === 'string' && nameCell.charAt(0) === '=', nameCell);
  check('the default password is not stored in plain text', !JSON.stringify(S.__state.sheets.Users._state.rows).includes('Default#0000'));
  const N = load();
  N.initSecrets_();
  check('no DEFAULT_PASSWORD property → account creation refuses', /DEFAULT_PASSWORD/.test(throws(() => N.createAccount_('AYW-2026-0001', '+201001240186', 'x')) || ''));
}

/* --------------------------------------------------------------- migration */
section('9. Migrating existing participants');
{
  const S = load();                     // rows saved before accounts existed: no DEFAULT_PASSWORD yet
  const ids = {};
  [['a', '+20 1011111111'], ['b', '+20 1022222222'], ['c', '+20 1022222222'], ['d', '+966 512345678']].forEach(([k, phone]) => {
    ids[k] = post(S, Object.assign({}, ADULT, { submission_token: 'm' + k, whatsapp: phone, name: 'P ' + k })).participant_id;
  });
  /* a row with a phone the old rules never produced */
  const sub = S.__state.sheets.Submissions._state.rows;
  sub[sub.findIndex((r) => r[1] === ids.d)][3] = 'not a phone';
  S.__state.props.DEFAULT_PASSWORD = PROPS.DEFAULT_PASSWORD;

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

/* --------------------------------------------- "+20 …" saved as #ERROR! */
section('12. Phone numbers that Sheets turned into #ERROR!');
{
  const S = load({ props: PROPS });
  const id = post(S, ADULT).participant_id;
  const sub = table(S, 'Submissions').find((r) => r.participant_id === id);
  check('a new submission keeps its phone as text', sub.whatsapp === '+20 1012345678', sub.whatsapp);

  /* the rows already in the live sheet: written without the apostrophe */
  const rows = S.__state.sheets.Submissions._state.rows;
  const iPhone = S.HEADERS.indexOf('whatsapp');
  const old = rows[1].slice();
  old[S.HEADERS.indexOf('participant_id')] = 'AYW-2026-0002';
  old[S.HEADERS.indexOf('submission_token')] = 'legacy';
  old[iPhone] = { f: '=+20 1033333333', v: '#ERROR!' };
  rows.push(old);
  check('the legacy row reads as #ERROR! (as in the screenshot)',
    table(S, 'Submissions').find((r) => r.participant_id === 'AYW-2026-0002').whatsapp === '#ERROR!');

  const msg = S.setup();
  check('setup repairs it back to text', table(S, 'Submissions').find((r) => r.participant_id === 'AYW-2026-0002').whatsapp === '+20 1033333333');
  check('setup says how many cells it repaired', /Repaired 1 phone/.test(msg), msg);
  check('a second setup finds nothing to repair', !/Repaired/.test(S.setup()));

  rows[rows.length - 1][iPhone] = { f: '=+20 1033333333', v: '#ERROR!' };
  const rep = S.migrateExistingParticipants();
  check('migration repairs #ERROR! phones itself and gives the legacy row its account',
    /Accounts created: 1\n  AYW-2026-0002 → \+201033333333/.test(rep) && table(S, 'Users').length === 2, rep);
  check('username saved as text, not as a number',
    table(S, 'Users').every((u) => typeof u.username === 'string' && u.username[0] === '+'), table(S, 'Users').map((u) => u.username));

  S.createTestParticipant();
  check('test participant username stays "+201099999999"',
    table(S, 'Users').find((u) => u.participant_id === 'AYW-9999-0001').username === '+201099999999');

  const u = S.findUser_('participant_id', id);
  S.updateRow_('Users', u._row, { status: 'active' });
  check('updating another column keeps the username as text', S.findUser_('participant_id', id).username === '+201012345678');
}

/* -------------------------------------------------------- step 2: auth flow */
section('13. Intake creates the account');
{
  const S = load({ props: Object.assign({ COACH_EMAIL: 'coach@test.dev' }, PROPS) });
  const r = post(S, ADULT);
  check('intake returns the username and the default password',
    r.ok && r.username === '+201012345678' && r.default_password === PROPS.DEFAULT_PASSWORD, r);
  const u = S.findUser_('participant_id', r.participant_id);
  check('Users row: awaiting_plan, must change password', u && u.status === 'awaiting_plan' && u.must_change_password === 'TRUE');
  const again = post(S, Object.assign({}, ADULT, { submission_token: 'other', whatsapp: '+20 01012345678' }));
  check('same number again → phone_exists', again.ok === false && again.error === 'phone_exists', again);
  check('…and no second row anywhere', table(S, 'Submissions').length === 1 && table(S, 'Users').length === 1);
  const retry = post(S, ADULT);
  check('a retried submission returns the same username', retry.duplicate && retry.username === '+201012345678', retry);
  const ar = post(S, Object.assign({}, ADULT, { submission_token: 'ar2', whatsapp: '+20 ١٠٠١٢٤٠١٨٦' }));
  check('Arabic-Indic digits → username +201001240186', ar.username === '+201001240186', ar);
  const mail = S.__state.mails[S.__state.mails.length - 1] || {};
  check('coach email names the username', /Username {4}: \+201001240186/.test(mail.body || ''), mail.body);

  const N = load();                                     // no DEFAULT_PASSWORD set
  const n = post(N, ADULT);
  check('without DEFAULT_PASSWORD the intake is still saved, without an account',
    n.ok && !n.username && table(N, 'Submissions').length === 1 && table(N, 'Users').length === 0, n);
}

section('14. Login, first-login change, logout');
{
  const S = load({ props: PROPS });
  post(S, ADULT);
  const D = PROPS.DEFAULT_PASSWORD;

  const first = post(S, { type: 'login', username: '01012345678', password: D });
  check('default password logs in with a restricted session',
    first.ok && first.scope === 'change_password_only' && first.must_change_password === true && first.name === 'أحمد', first);
  check('Arabic-Indic digits work in the username field',
    post(S, { type: 'login', username: '٠١٠١٢٣٤٥٦٧٨', password: D }).ok === true);
  check('restricted session is refused by a full-session check',
    S.auth_({ session: first.session }, 'participant', false).s === undefined);

  const cp = (b) => post(S, Object.assign({ type: 'change_password', session: first.session, current_password: D }, b));
  check('wrong current password → bad_current_password', cp({ current_password: 'nope1234', new_password: 'Wa7sh!2026' }).error === 'bad_current_password');
  check('Arabic in the new password → pw_ascii_only', cp({ new_password: 'كلمةسر2026' }).error === 'pw_ascii_only');
  check('the default as the new password → pw_is_default', cp({ new_password: D }).error === 'pw_is_default');
  check('the phone digits in it → pw_has_phone', cp({ new_password: 'x1012345678' }).error === 'pw_has_phone');
  const ok = cp({ new_password: 'Wa7sh!2026' });
  check('good new password → full session', ok.ok && ok.scope === 'full' && /^[0-9a-f]{64}$/.test(ok.session), ok);
  check('the restricted session is revoked', S.resolveSession_(first.session) === null);
  const u = S.findUser_('username', '+201012345678');
  check('must_change_password cleared, password_changed_at set', u.must_change_password === 'FALSE' && !!u.password_changed_at);

  check('the default password no longer works', post(S, { type: 'login', username: '+201012345678', password: D }).error === 'bad_credentials');
  const full = post(S, { type: 'login', username: '+20 1012345678', password: 'Wa7sh!2026' });
  check('the new password does, with a full session', full.ok && full.scope === 'full' && full.must_change_password === false, full);

  check('logout answers ok', post(S, { type: 'logout', session: full.session }).ok === true);
  check('…and the session is dead', S.resolveSession_(full.session) === null);
  check('AuthLog never holds a password',
    !JSON.stringify(table(S, 'AuthLog')).includes('Wa7sh!2026') && !JSON.stringify(table(S, 'AuthLog')).includes(D));
}

section('15. Lockout, expiry and hash upgrade');
{
  const S = load({ props: PROPS });
  post(S, ADULT);
  const bad = () => post(S, { type: 'login', username: '+201012345678', password: 'wrong-pass' });
  const errs = [1, 2, 3, 4, 5].map(() => bad().error);
  check('five wrong passwords → bad_credentials each time', errs.every((e) => e === 'bad_credentials'), errs);
  check('then locked, even with the right password',
    post(S, { type: 'login', username: '+201012345678', password: PROPS.DEFAULT_PASSWORD }).error === 'locked');
  const ghost = () => post(S, { type: 'login', username: '+201055555555', password: 'wrong-pass' });
  const gErrs = [1, 2, 3, 4, 5].map(() => ghost().error);
  check('a number with no account answers the same way…', gErrs.every((e) => e === 'bad_credentials'), gErrs);
  check('…and is "locked" too, so nothing reveals whether it exists', ghost().error === 'locked');

  const T = load({ props: PROPS });
  const r = post(T, ADULT);
  const u = T.findUser_('participant_id', r.participant_id);
  T.updateRow_('Users', u._row, { initial_expires_at: new Date(Date.now() - 1000).toISOString() });
  check('default password older than 14 days → initial_expired',
    post(T, { type: 'login', username: '+201012345678', password: PROPS.DEFAULT_PASSWORD }).error === 'initial_expired');

  const H = load({ props: PROPS });
  post(H, ADULT);
  const hu = H.findUser_('username', '+201012345678');
  const salt = H.Utilities.base64Encode(H.randomBytes_(16));
  H.updateRow_('Users', hu._row, { pw_iter: 5000, pw_salt: salt, pw_hash: H.hashPassword_(PROPS.DEFAULT_PASSWORD, salt, 5000) });
  check('an account hashed at 5000 iterations still logs in',
    post(H, { type: 'login', username: '+201012345678', password: PROPS.DEFAULT_PASSWORD }).ok === true);
  check('…and is re-hashed at the current 1000', Number(H.findUser_('username', '+201012345678').pw_iter) === 1000);
}

section('16. Reset links');
{
  const S = load({ props: PROPS });
  const r = post(S, ADULT);
  const token = S.randomToken_();
  S.writeRow_('ResetTokens', { token_hash: S.sha256Hex_(token), participant_id: r.participant_id, created_by: 'coach',
                               created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 864e5).toISOString(), used_at: '' });
  const v = post(S, { type: 'reset_verify', token });
  check('reset_verify greets by first name only', v.ok && v.name === 'أحمد' && Object.keys(v).length === 2, v);
  check('a weak password is refused on reset', post(S, { type: 'reset_complete', token, new_password: 'short' }).error === 'pw_too_short');
  const done = post(S, { type: 'reset_complete', token, new_password: 'Reset#2026x' });
  check('reset_complete logs in with a full session', done.ok && done.scope === 'full', done);
  check('the link works only once', post(S, { type: 'reset_verify', token }).error === 'reset_invalid');
  check('the new password works', post(S, { type: 'login', username: '+201012345678', password: 'Reset#2026x' }).ok === true);
  check('AuthLog has reset_used', table(S, 'AuthLog').some((x) => x.event === 'reset_used'));

  const old = S.randomToken_();
  S.writeRow_('ResetTokens', { token_hash: S.sha256Hex_(old), participant_id: r.participant_id, created_by: 'coach',
                               created_at: '', expires_at: new Date(Date.now() - 1000).toISOString(), used_at: '' });
  check('an expired link is refused', post(S, { type: 'reset_verify', token: old }).error === 'reset_invalid');
  check('a malformed token is refused', post(S, { type: 'reset_verify', token: '../etc' }).error === 'reset_invalid');
}

/* ----------------------------------------------------- steps 3–4: tracker */
/** A participant with a full session (password already changed). */
function member(S, phone, token) {
  const r = post(S, Object.assign({}, ADULT, { submission_token: token || ('t' + phone), whatsapp: '+20 ' + phone }));
  const first = post(S, { type: 'login', username: '+20' + phone, password: PROPS.DEFAULT_PASSWORD });
  const full = post(S, { type: 'change_password', session: first.session, current_password: PROPS.DEFAULT_PASSWORD, new_password: 'Wa7sh!2026' });
  return { pid: r.participant_id, session: full.session, restricted: first.session };
}
/** A plan typed by hand into Plans + PlanSessions, as in build step 3. */
function handPlan(S, pid, start) {
  S.writeRow_('Plans', { plan_id: 'hand-' + pid, participant_id: pid, version: 1, title: 'برنامج تجريبي', start_date: start || '',
    weeks: 2, status: 'published', coach_note: 'ابدأ هادي', created_at: '', published_at: new Date().toISOString(), clearance_confirmed: 'FALSE' });
  [['w1d1', 1, 1, 'run'], ['w1d3', 1, 3, 'strength'], ['w1d5', 1, 5, 'rest'], ['w2d1', 2, 1, 'run'], ['w2d3', 2, 3, 'walk']]
    .forEach(([id, week, day, type], i) => S.writeRow_('PlanSessions', { plan_id: 'hand-' + pid, participant_id: pid, session_id: id,
      week, day, order: i, title: 'حصة ' + id, type, details: 'تفاصيل', target_duration_min: 30 }));
}

section('17. Tracker: me');
{
  const S = load({ props: PROPS });
  const A = member(S, '1011111111');
  const me0 = post(S, { type: 'me', session: A.session });
  check('before a plan: waiting state (plan null, awaiting_plan)', me0.ok && me0.plan === null && me0.status === 'awaiting_plan' && me0.stats === null, me0);
  check('me never returns BMI or waist-to-height', !/bmi|waist_to_height/i.test(JSON.stringify(me0)));
  check('a restricted session cannot read the tracker', post(S, { type: 'me', session: A.restricted }).error === 'session_expired' ||
    post(S, { type: 'me', session: member(S, '1022222222').restricted }).error === 'password_change_required');
  check('a coach session is not a participant', post(S, { type: 'me', session: S.createSession_('COACH', 'coach', 'full').token }).error === 'forbidden');

  const start = S.isoOfDay_(S.dayNum_(S.cairoDay_()) - 8);       // today is week 2, day 2
  handPlan(S, A.pid, start);
  const me = post(S, { type: 'me', session: A.session });
  const w1 = me.plan.by_week[0].sessions, w2 = me.plan.by_week[1].sessions;
  check('a hand-made plan shows, grouped by week', me.plan.weeks === 2 && w1.length === 3 && w2.length === 2, me.plan);
  check('dates: w1d1 = start date, w2d3 = start + 9 days', w1[0].date === start && w2[1].date === S.isoOfDay_(S.dayNum_(start) + 9));
  check('plain Arabic title reads as {ar, en:""}', me.plan.title.ar === 'برنامج تجريبي' && me.plan.title.en === '');
  check('stats: week 2 of 2, 3 sessions planned so far (rest days excluded)',
    me.stats.current_week === 2 && me.stats.planned_to_date === 3 && me.stats.adherence === 0, me.stats);

  const B = load({ props: PROPS });
  const nb = member(B, '1033333333');
  handPlan(B, nb.pid, '');
  const pb = post(B, { type: 'me', session: nb.session }).plan;
  check('no start date: day 1 is a Saturday on or before today',
    new Date(pb.start + 'T00:00:00Z').getUTCDay() === 6 && B.dayNum_(pb.start) <= B.dayNum_(B.cairoDay_()) && B.dayNum_(B.cairoDay_()) - B.dayNum_(pb.start) < 7, pb.start);
}

section('18. Tracker: log_session, stats, check-in, isolation');
{
  const S = load({ props: PROPS });
  const A = member(S, '1011111111');
  const start = S.isoOfDay_(S.dayNum_(S.cairoDay_()) - 8);
  handPlan(S, A.pid, start);
  const log = (b) => post(S, Object.assign({ type: 'log_session', session: A.session, submission_token: S.Utilities.getUuid() }, b));

  const r1 = log({ session_id: 'w1d1', status: 'done', actual_duration_min: '32', actual_distance_km: '4.2', effort_1_10: '6', note: 'حلو' });
  check('logging done returns the log and new stats', r1.ok && r1.log.status === 'done' && r1.log.actual_distance_km === 4.2 && r1.stats.done === 1 && r1.stats.adherence === 33, r1);
  const r2 = log({ session_id: 'w1d3', status: 'partial' });
  check('partial counts half: adherence (1 + ½) ÷ 3 = 50 %', r2.stats.adherence === 50, r2.stats);
  const r3 = log({ session_id: 'w1d1', status: 'skipped', effort_1_10: '' });
  check('editing a log updates it in place', r3.stats.skipped === 1 && r3.stats.done === 0 && table(S, 'SessionLogs').length === 2);
  check('a rest day cannot be logged', log({ session_id: 'w1d5', status: 'done' }).error === 'invalid');
  check('an unknown session cannot be logged', log({ session_id: 'w9d9', status: 'done' }).error === 'invalid');
  check('a made-up status is refused', log({ session_id: 'w2d1', status: 'perfect' }).error === 'invalid');
  check('effort outside 1–10 is dropped', log({ session_id: 'w2d1', status: 'done', effort_1_10: '42' }).log.effort_1_10 === null);

  const tok = 'same-token';
  log({ session_id: 'w2d3', status: 'done', submission_token: tok });
  const dup = log({ session_id: 'w2d3', status: 'skipped', submission_token: tok });
  check('a retried log (same token) changes nothing', dup.duplicate === true && dup.log.status === 'done');
  check('a session logged early counts as planned', dup.stats.planned_to_date === 4, dup.stats);
  log({ session_id: 'w1d1', status: 'done' }); log({ session_id: 'w1d3', status: 'done' });
  check('streak: week 1 all done → 1, week 2 already done → 2', post(S, { type: 'me', session: A.session }).stats.streak === 2);

  const ci = post(S, { type: 'checkin', session: A.session, submission_token: 'ci1', weight_kg: '90.5', waist_cm: '98',
                       sessions_done: '3', energy: '4', notes: 'تمام', language_used: 'ar' });
  check('check-in from the tracker is saved', ci.ok && ci.checkins.length === 1 && ci.checkins[0].weight_kg === 90.5, ci);
  const row = table(S, 'Checkins')[0];
  check('…with ID and username taken from the session', row.participant_id === A.pid && row.whatsapp === '+201011111111', row);
  check('a retried check-in adds no row', post(S, { type: 'checkin', session: A.session, submission_token: 'ci1', weight_kg: '90',
    sessions_done: '3', energy: '4' }).duplicate === true && table(S, 'Checkins').length === 1);
  check('me returns the check-ins', post(S, { type: 'me', session: A.session }).checkins.length === 1);

  const B = member(S, '1022222222');
  const meB = post(S, { type: 'me', session: B.session, participant_id: A.pid });
  check('B asking for A\'s ID in the body still gets only B', meB.participant_id === B.pid && meB.plan === null && meB.checkins.length === 0, meB);
  check('B cannot log on A\'s plan', post(S, { type: 'log_session', session: B.session, participant_id: A.pid, session_id: 'w1d1', status: 'done' }).error === 'no_plan');
  check('B\'s check-in lands under B', post(S, { type: 'checkin', session: B.session, participant_id: A.pid, submission_token: 'ci2',
    weight_kg: '80', sessions_done: '1', energy: '3' }).ok && table(S, 'Checkins')[1].participant_id === B.pid);
}

console.log('\n================  ' + pass + ' passed, ' + fail + ' failed  ================\n');
process.exit(fail ? 1 : 0);
