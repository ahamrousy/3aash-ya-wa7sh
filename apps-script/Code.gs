/* =============================================================================
   Code.gs — عاش يا وحش · the private back end
   -----------------------------------------------------------------------------
   Paste this whole file into Apps Script (Extensions → Apps Script) on a Google
   Sheet that only you own. Then:

     1. Change COACH_EMAIL below to your address.
     2. Run  setup()  once from the editor (it builds the tabs, headers,
        formats, the status dropdown and the Dashboard).
     3. Deploy → New deployment → Web app
          Execute as        : Me
          Who has access    : Anyone
     4. Copy the /exec URL into config.js on the website.

   NOTHING here trusts the browser. Every value that arrives is re-checked,
   re-typed and trimmed before it is written, and anything that is not on an
   allow-list is dropped.
   ========================================================================== */


/* ===========================================================================
   SETTINGS — the only part you normally edit
   -----------------------------------------------------------------------------
   Secrets and anything personal live in Script Properties, never in this file
   (Project Settings → Script properties). This file is public on GitHub.

     COACH_EMAIL       where the "new submission" mail goes (overrides the
                       placeholder below, so pasting a new Code.gs never
                       silently switches notifications off)
     DEFAULT_PASSWORD  the first-login password every new account gets
     PEPPER            created for you by setup(); never change it afterwards
     COACH_USERNAME    \  set by the "Set coach password…" menu item
     COACH_HASH        /
   ======================================================================== */
var COACH_EMAIL      = 'coach@example.com';  // fallback only — set the COACH_EMAIL property instead
var SEND_EMAIL       = true;                 // set false to switch notifications off
var MIN_SECONDS      = 20;                   // must match config.js minSecondsOnPage
var SHEET_MAIN       = 'Submissions';
var SHEET_CHECKINS   = 'Checkins';
var SHEET_DASHBOARD  = 'Dashboard';
var ID_PREFIX        = 'AYW';

/* The status values that appear as a dropdown on every row. */
var STATUS_VALUES = ['New', 'Reviewing', 'Program sent', 'Active', 'Paused', 'Completed'];


/* ===========================================================================
   THE SHEET LAYOUT
   Column order, left to right. Change it only if you also change the sheet.
   ======================================================================== */
var HEADERS = [
  'timestamp', 'participant_id',
  /* contact */
  'name', 'whatsapp', 'email', 'city', 'contact_pref',
  /* objective */
  'objectives',
  'target_weight', 'timeframe',
  'new_sport', 'new_sport_other', 'new_sport_target', 'new_sport_target_other', 'experience',
  'race_sport', 'race_sport_other', 'race_distance', 'race_distance_other',
  'current_time', 'target_time', 'race_name', 'race_date',
  'community_needs', 'community_other',
  'why_now',
  /* body */
  'age', 'is_minor', 'guardian_name', 'guardian_phone',
  'gender', 'weight_kg', 'height_cm', 'waist_cm', 'bmi', 'waist_to_height',
  /* activity */
  'current_sports', 'activity_details', 'recent_results',
  /* availability */
  'days_per_week', 'preferred_days', 'hours_per_session', 'time_of_day', 'facilities',
  /* health */
  'parq_heart', 'parq_chest', 'parq_balance', 'parq_chronic', 'parq_meds',
  'parq_bone', 'parq_supervised', 'parq_pregnant',
  'needs_medical_clearance', 'injuries_notes',
  /* consent + admin */
  'consent_accuracy', 'consent_data', 'consent_media',
  'language_used', 'status', 'coach_notes', 'submission_token'
];

var CHECKIN_HEADERS = [
  'timestamp', 'participant_id', 'name', 'whatsapp',
  'weight_kg', 'waist_cm', 'sessions_done', 'best_effort', 'energy', 'notes',
  'language_used', 'submission_token'
];

/* Columns that hold real numbers; everything else is stored as plain text so a
   value beginning with = + - or @ can never be read as a formula. */
var NUMERIC_COLUMNS = {
  target_weight: true, age: true, weight_kg: true, height_cm: true, waist_cm: true,
  bmi: true, waist_to_height: true, days_per_week: true, hours_per_session: true
};
var CHECKIN_NUMERIC = {
  weight_kg: true, waist_cm: true, sessions_done: true, energy: true
};


/* ===========================================================================
   WHAT EACH FIELD IS ALLOWED TO BE
   type   : text | enum | enumlist | num | int | yesno | bool | time | date | phone | email
   req    : true when a submission is rejected without it
   ======================================================================== */
var SPEC = {
  name              : { type: 'text',  max: 80,  req: true, min: 2 },
  whatsapp          : { type: 'phone', req: true },
  email             : { type: 'email', max: 120 },
  city              : { type: 'text',  max: 60 },
  contact_pref      : { type: 'enum',  values: ['whatsapp', 'phone', 'email'] },

  objectives        : { type: 'enumlist', values: ['weight', 'sport', 'time', 'community'], req: true },
  target_weight     : { type: 'num', min: 30, max: 250 },
  timeframe         : { type: 'enum', values: ['1', '3', '6', '12'] },
  new_sport         : { type: 'enum', values: ['walking', 'running', 'swimming', 'cycling', 'triathlon', 'strength', 'other'] },
  new_sport_other   : { type: 'text', max: 60 },
  new_sport_target  : { type: 'enum', values: ['5k', '10k', '21k', '42k', '30min', '1k', '3k', 'other'] },
  new_sport_target_other : { type: 'text', max: 80 },
  experience        : { type: 'enum', values: ['never', 'little', 'stopped'] },
  race_sport        : { type: 'enum', values: ['walking', 'running', 'swimming', 'cycling', 'triathlon', 'strength', 'other'] },
  race_sport_other  : { type: 'text', max: 60 },
  race_distance     : { type: 'enum', values: ['5k', '10k', '21k', '42k', '30min', '1k', '3k', 'other'] },
  race_distance_other : { type: 'text', max: 80 },
  current_time      : { type: 'time' },
  target_time       : { type: 'time' },
  race_name         : { type: 'text', max: 80 },
  race_date         : { type: 'date' },
  community_needs   : { type: 'enumlist', values: ['partners', 'group', 'motivation', 'networking', 'other'] },
  community_other   : { type: 'text', max: 80 },
  why_now           : { type: 'text', max: 500 },

  age               : { type: 'int', min: 12, max: 90, req: true },
  guardian_name     : { type: 'text', max: 80 },
  guardian_phone    : { type: 'phone' },
  guardian_consent  : { type: 'bool' },
  gender            : { type: 'enum', values: ['male', 'female'], req: true },
  weight_kg         : { type: 'num', min: 30,  max: 250, req: true },
  height_cm         : { type: 'num', min: 120, max: 220, req: true },
  waist_cm          : { type: 'num', min: 50,  max: 200, req: true },

  no_sports         : { type: 'bool' },
  current_sports    : { type: 'enumlist', values: ['walking', 'running', 'swimming', 'cycling', 'gym', 'football', 'padel', 'other', 'none'] },
  current_sports_other : { type: 'text', max: 60 },
  activity_details  : { type: 'text', max: 300 },
  recent_results    : { type: 'text', max: 300 },

  days_per_week     : { type: 'enum', values: ['1', '2', '3', '4', '5', '6', '7'], req: true },
  preferred_days    : { type: 'enumlist', values: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'], req: true },
  hours_per_session : { type: 'enum', values: ['30', '45', '60', '90', '120'], req: true },
  time_of_day       : { type: 'enum', values: ['early', 'morning', 'afternoon', 'evening', 'late'], req: true },
  facilities        : { type: 'enumlist', values: ['pool', 'gym', 'track', 'bike', 'road', 'none'], req: true },

  parq_heart        : { type: 'yesno', req: true },
  parq_chest        : { type: 'yesno', req: true },
  parq_balance      : { type: 'yesno', req: true },
  parq_chronic      : { type: 'yesno', req: true },
  parq_meds         : { type: 'yesno', req: true },
  parq_bone         : { type: 'yesno', req: true },
  parq_supervised   : { type: 'yesno', req: true },
  parq_pregnant     : { type: 'yesno' },          // only asked of women
  injuries_notes    : { type: 'text', max: 500 },

  consent_accuracy  : { type: 'bool', req: true },
  consent_data      : { type: 'bool', req: true },
  consent_media     : { type: 'bool' },
  language_used     : { type: 'enum', values: ['ar', 'en'] }
};

var PARQ_KEYS = ['parq_heart', 'parq_chest', 'parq_balance', 'parq_chronic',
                 'parq_meds', 'parq_bone', 'parq_supervised', 'parq_pregnant'];


/* ===========================================================================
   WEB APP ENTRY POINTS
   ======================================================================== */

/** A plain GET is only used to check that the deployment is alive. */
function doGet() {
  return json({ ok: true, service: '3aash-ya-wa7sh', ready: true });
}

/* Every request is a POST with a JSON body; body.type picks the handler.
   Later build steps add the account, tracker and coach routes here. */
var ROUTES = {
  intake:          handleIntake,
  checkin:         handleCheckin,
  login:           handleLogin,
  change_password: handleChangePassword,
  logout:          handleLogout,
  reset_verify:    handleResetVerify,
  reset_complete:  handleResetComplete,
  me:              handleMe,
  log_session:     handleLogSession
};

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); }
      catch (parseErr) { return json({ ok: false, error: 'bad_request' }); }
    }
    if (!body || typeof body !== 'object') return json({ ok: false, error: 'bad_request' });

    var type  = String(body.type || 'intake');
    var route = ROUTES.hasOwnProperty(type) ? ROUTES[type] : null;
    if (!route) return json({ ok: false, error: 'unknown_type' });

    /* The spam gates protect the two public forms only. Account and tracker
       calls rely on sessions and lockout instead — a 20-second wait would
       break normal use of the tracker. */
    if (type === 'intake' || type === 'checkin') {
      /* --- spam gate 1: the honeypot. A person never sees that field. ---- */
      if (body.hp && String(body.hp).trim() !== '') {
        return json({ ok: false, error: 'spam' });
      }
    }

    /* --- spam gate 2: nobody fills six steps in under MIN_SECONDS ---------
       A check-in sent from inside a signed-in tracker carries a session, and
       the session is its protection, so only the anonymous forms wait. */
    if (type === 'intake' || (type === 'checkin' && !body.session)) {
      var elapsed = Number(body.elapsed_ms || 0);
      if (!(elapsed >= MIN_SECONDS * 1000)) {
        return json({ ok: false, error: 'too_fast' });
      }
    }

    return route(body);

  } catch (err) {
    log_('doPost failed: ' + err + '\n' + (err && err.stack));
    return json({ ok: false, error: 'server_error' });
  }
}


/* ===========================================================================
   INTAKE
   ======================================================================== */
function handleIntake(body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return json({ ok: false, error: 'busy' }); }

  try {
    /* A retry after a dropped connection must not create a second row. */
    var token = clean_(body.submission_token, 60);
    var already = tokenSeen_(token, SHEET_MAIN);
    if (already) {
      var had = findUser_('participant_id', already);
      return json({ ok: true, participant_id: already, duplicate: true,
                    username: had ? String(had.username) : undefined,
                    default_password: had && defaultPasswordActive_(had) ? prop_('DEFAULT_PASSWORD') : undefined });
    }

    var clean = {};
    var missing = [];

    Object.keys(SPEC).forEach(function (key) {
      var spec = SPEC[key];
      var value = coerce_(body[key], spec);
      clean[key] = value;
      if (spec.req && isBlank_(value)) missing.push(key);
    });

    /* Under-18s cannot be accepted without a named, consenting guardian. */
    var isMinor = clean.age !== '' && Number(clean.age) < 18;
    if (isMinor) {
      if (isBlank_(clean.guardian_name))  missing.push('guardian_name');
      if (isBlank_(clean.guardian_phone)) missing.push('guardian_phone');
      if (clean.guardian_consent !== true) missing.push('guardian_consent');
    }

    /* Both hard consents must be ticked. */
    if (clean.consent_accuracy !== true) pushOnce_(missing, 'consent_accuracy');
    if (clean.consent_data !== true)     pushOnce_(missing, 'consent_data');

    /* Women are asked the pregnancy question; everyone else is not. */
    if (clean.gender === 'female' && isBlank_(clean.parq_pregnant)) missing.push('parq_pregnant');

    /* A target time, when given, has to be faster than the current one. */
    if (clean.current_time && clean.target_time &&
        seconds_(clean.target_time) >= seconds_(clean.current_time)) {
      missing.push('target_time');
    }

    if (missing.length) {
      return json({ ok: false, error: 'invalid', fields: missing });
    }

    /* One account per number: the username is the WhatsApp number. */
    var username = normalisePhone_(clean.whatsapp);
    if (username && findUser_('username', username)) {
      return json({ ok: false, error: 'phone_exists' });
    }

    /* --- derived numbers: for the coach only, never shown to the person --- */
    var heightM = Number(clean.height_cm) / 100;
    var bmi     = round_(Number(clean.weight_kg) / (heightM * heightM), 1);
    var wthr    = round_(Number(clean.waist_cm) / Number(clean.height_cm), 2);
    var clearance = PARQ_KEYS.some(function (k) { return clean[k] === 'yes'; });

    var sheet = getSheet_(SHEET_MAIN, HEADERS);
    var id    = nextParticipantId_();

    var row = {};
    HEADERS.forEach(function (h) { row[h] = ''; });

    Object.keys(clean).forEach(function (k) {
      if (HEADERS.indexOf(k) !== -1) row[k] = clean[k];
    });

    row.timestamp               = new Date();
    row.participant_id          = id;
    row.is_minor                = isMinor ? 'TRUE' : 'FALSE';
    row.bmi                     = bmi;
    row.waist_to_height         = wthr;
    row.needs_medical_clearance = clearance ? 'TRUE' : 'FALSE';
    row.status                  = 'New';
    row.coach_notes             = '';
    row.submission_token        = token;

    /* "None right now" is recorded explicitly so an empty cell always means
       "they did not answer", never "they answered nothing". */
    if (clean.no_sports === true) {
      row.current_sports   = 'none';
      row.activity_details = '';
    } else if (clean.current_sports_other) {
      row.current_sports = row.current_sports
        ? row.current_sports + ' (' + clean.current_sports_other + ')'
        : clean.current_sports_other;
    }

    /* booleans read better as TRUE/FALSE in a sheet than as checkboxes */
    ['consent_accuracy', 'consent_data', 'consent_media'].forEach(function (k) {
      row[k] = clean[k] === true ? 'TRUE' : 'FALSE';
    });

    appendRow_(sheet, HEADERS, row, NUMERIC_COLUMNS);
    rememberToken_(token, id);

    /* The account is created in the same lock as the row. If the default
       password is not set yet the submission is still kept, just without an
       account; "Create accounts for existing participants" adds it later. */
    var account = false;
    if (username && prop_('DEFAULT_PASSWORD')) {
      try { initSecrets_(); createAccount_(id, username, clean.name); account = true; }
      catch (accErr) { log_('No account for ' + id + ': ' + accErr); }
    }

    notifyCoach_(row, clearance, isMinor, account ? username : '');

    return json({ ok: true, participant_id: id,
                  username: account ? username : undefined,
                  default_password: account ? prop_('DEFAULT_PASSWORD') : undefined });

  } finally {
    lock.releaseLock();
  }
}


/* ===========================================================================
   WEEKLY CHECK-IN — sent from inside the signed-in tracker
   Who it belongs to comes from the session, never from an ID or phone number
   typed into the form. The old ID + WhatsApp page now redirects to login.
   ======================================================================== */
function handleCheckin(body) {
  var a = auth_(body, 'participant');
  if (a.reply) return a.reply;
  var pid = a.s.pid;

  return withLock_(function () {
    var token = clean_(body.submission_token, 60);
    if (tokenSeen_(token, SHEET_CHECKINS)) return json({ ok: true, duplicate: true, checkins: checkinsOf_(pid, 12) });

    var user = findUser_('participant_id', pid);
    if (!user) return fail_('session_expired');

    var weight   = coerce_(body.weight_kg,     { type: 'num', min: 30, max: 250 });
    var waist    = coerce_(body.waist_cm,      { type: 'num', min: 50, max: 200 });
    var sessions = coerce_(body.sessions_done, { type: 'int', min: 0,  max: 30 });
    var energy   = coerce_(body.energy,        { type: 'int', min: 1,  max: 5 });

    if (isBlank_(weight) || isBlank_(sessions) || isBlank_(energy)) {
      return json({ ok: false, error: 'invalid' });
    }

    var sheet = getSheet_(SHEET_CHECKINS, CHECKIN_HEADERS);
    appendRow_(sheet, CHECKIN_HEADERS, {
      timestamp: new Date(),
      participant_id: pid,
      name: String(user.name),
      whatsapp: String(user.username),
      weight_kg: weight,
      waist_cm: waist,
      sessions_done: sessions,
      best_effort: clean_(body.best_effort, 120),
      energy: energy,
      notes: clean_(body.notes, 500),
      language_used: coerce_(body.language_used, { type: 'enum', values: ['ar', 'en'] }),
      submission_token: token
    }, CHECKIN_NUMERIC);

    rememberToken_(token, pid);
    return json({ ok: true, checkins: checkinsOf_(pid, 12) });
  });
}


/* ===========================================================================
   PARTICIPANT IDs — AYW-YYYY-XXXX, one running sequence per year
   ======================================================================== */
function nextParticipantId_() {
  var year  = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Africa/Cairo', 'yyyy');
  var props = PropertiesService.getScriptProperties();
  var key   = 'seq_' + year;
  var next  = Number(props.getProperty(key) || 0) + 1;

  /* If the counter was ever lost, rebuild it from the sheet rather than
     handing out an ID that already exists. */
  var fromSheet = highestSequenceInSheet_(year);
  if (fromSheet >= next) next = fromSheet + 1;

  props.setProperty(key, String(next));
  return ID_PREFIX + '-' + year + '-' + padLeft_(next, 4);
}

function highestSequenceInSheet_(year) {
  var sheet = getSheet_(SHEET_MAIN, HEADERS);
  var last  = sheet.getLastRow();
  if (last < 2) return 0;
  var col   = HEADERS.indexOf('participant_id') + 1;
  var ids   = sheet.getRange(2, col, last - 1, 1).getValues();
  var best  = 0;
  var re    = new RegExp('^' + ID_PREFIX + '-' + year + '-(\\d{4})$');
  ids.forEach(function (r) {
    var m = re.exec(String(r[0]).trim());
    if (m) best = Math.max(best, Number(m[1]));
  });
  return best;
}


/* ===========================================================================
   THE EMAIL TO THE COACH
   ======================================================================== */
/** The notification address: the COACH_EMAIL Script Property wins over the file. */
function coachEmail_() {
  var fromProps = PropertiesService.getScriptProperties().getProperty('COACH_EMAIL');
  return String(fromProps || COACH_EMAIL || '').trim();
}

function notifyCoach_(row, clearance, isMinor, username) {
  var to = coachEmail_();
  if (!SEND_EMAIL || !to || to === 'coach@example.com') return;
  try {
    var flags = [];
    if (clearance) flags.push('⚠ NEEDS MEDICAL CLEARANCE');
    if (isMinor)   flags.push('⚠ UNDER 18 — guardian consent on file');

    var lines = [
      'New 3aash Ya Wa7sh submission',
      '',
      'ID          : ' + row.participant_id,
      'Name        : ' + row.name,
      'WhatsApp    : ' + row.whatsapp,
      'Username    : ' + (username || '— (no account yet)'),
      'Email       : ' + (row.email || '—'),
      'City        : ' + (row.city || '—'),
      'Contact via : ' + (row.contact_pref || '—'),
      '',
      'Objectives  : ' + row.objectives,
      'Why now     : ' + (row.why_now || '—'),
      '',
      'Age         : ' + row.age + (isMinor ? ' (minor)' : ''),
      'Gender      : ' + row.gender,
      'Weight/Height/Waist : ' + row.weight_kg + ' kg / ' + row.height_cm + ' cm / ' + row.waist_cm + ' cm',
      'BMI         : ' + row.bmi,
      'Waist:height: ' + row.waist_to_height,
      '',
      'Trains now  : ' + (row.current_sports || '—'),
      'Detail      : ' + (row.activity_details || '—'),
      'Availability: ' + row.days_per_week + ' days/week, ' + row.hours_per_session +
                         ' min, ' + row.time_of_day + ' — ' + row.preferred_days,
      'Facilities  : ' + row.facilities,
      '',
      'PAR-Q yes answers : ' + (PARQ_KEYS.filter(function (k) { return row[k] === 'yes'; }).join(', ') || 'none'),
      'Injuries/notes    : ' + (row.injuries_notes || '—'),
      '',
      'Media consent : ' + row.consent_media,
      'Form language : ' + row.language_used
    ];

    if (flags.length) lines.unshift(flags.join('\n'), '');

    var url = SpreadsheetApp.getActiveSpreadsheet().getUrl();
    lines.push('', 'Open the sheet: ' + url);

    MailApp.sendEmail({
      to: to,
      subject: (clearance ? '[clearance] ' : '') + 'عاش يا وحش — ' + row.participant_id + ' — ' + row.name,
      body: lines.join('\n')
    });
  } catch (err) {
    /* A failed email must never lose a submission. */
    log_('email failed: ' + err);
  }
}


/* ===========================================================================
   VALIDATION + SANITISING HELPERS
   ======================================================================== */

/** Turn whatever arrived into the one shape this field is allowed to have. */
function coerce_(raw, spec) {
  if (raw === undefined || raw === null) return '';
  var s = String(raw);

  switch (spec.type) {
    case 'text': {
      var txt = clean_(s, spec.max || 200);
      if (spec.min && txt.length < spec.min) return '';   // e.g. a one-letter "name"
      return txt;
    }

    case 'email': {
      var v = clean_(s, spec.max || 120).toLowerCase();
      return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v) ? v : '';
    }

    case 'phone': {
      /* "+20 1012345678" → kept as text, digits only after the country code.
         Digits typed on an Arabic keyboard (٠–٩) are turned into 0–9 first. */
      var m = /^(\+\d{1,4})\s*(\d{6,14})$/.exec(clean_(toAsciiDigits_(s), 24));
      if (!m) return '';
      if (m[1] === '+20') m[2] = m[2].replace(/^0/, '');     // "+20 0100…" is the same number
      if (m[1] === '+20' && !/^1[0125]\d{8}$/.test(m[2])) return '';
      return m[1] + ' ' + m[2];
    }

    case 'num': {
      var n = parseFloat(clean_(s, 12).replace(',', '.'));
      if (!isFinite(n)) return '';
      if (spec.min !== undefined && n < spec.min) return '';
      if (spec.max !== undefined && n > spec.max) return '';
      return round_(n, 1);
    }

    case 'int': {
      var i = parseInt(clean_(s, 6), 10);
      if (!isFinite(i)) return '';
      if (spec.min !== undefined && i < spec.min) return '';
      if (spec.max !== undefined && i > spec.max) return '';
      return i;
    }

    case 'enum': {
      var e = clean_(s, 20);
      return spec.values.indexOf(e) === -1 ? '' : e;
    }

    case 'enumlist': {
      var parts = clean_(s, 200).split(',').map(function (x) { return x.trim(); })
        .filter(function (x) { return spec.values.indexOf(x) !== -1; });
      /* de-duplicate while keeping the order they chose */
      var seen = {}, out = [];
      parts.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
      return out.join(',');
    }

    case 'yesno': {
      var y = clean_(s, 4).toLowerCase();
      return (y === 'yes' || y === 'no') ? y : '';
    }

    case 'bool':
      return (s === 'TRUE' || s === 'true' || s === '1' || raw === true);

    case 'time': {
      var tm = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(clean_(s, 12));
      if (!tm) return '';
      var hh = Number(tm[1]), mm = Number(tm[2]), ss = Number(tm[3]);
      if (mm > 59 || ss > 59 || hh > 99) return '';
      if (hh + mm + ss === 0) return '';
      return padLeft_(hh, 2) + ':' + padLeft_(mm, 2) + ':' + padLeft_(ss, 2);
    }

    case 'date': {
      var d = clean_(s, 12);
      return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
    }
  }
  return '';
}

/**
 * Strip control characters, collapse runs of whitespace, trim, cut to length,
 * and neutralise anything that a spreadsheet could read as a formula.
 */
function clean_(value, max) {
  if (value === undefined || value === null) return '';
  var s = String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')  // control characters
    .replace(/[ \t\u00A0]+/g, ' ')                        // runs of spaces, tabs, non-breaking spaces
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (max && s.length > max) s = s.slice(0, max);
  if (/^[=+\-@]/.test(s) && !/^\+\d/.test(s)) s = "'" + s;   // formula guard
  return s;
}

function isBlank_(v) { return v === '' || v === null || v === undefined; }
function pushOnce_(arr, v) { if (arr.indexOf(v) === -1) arr.push(v); }
function digits_(s) { return String(s || '').replace(/[^\d]/g, ''); }
function round_(n, places) { var f = Math.pow(10, places); return Math.round(n * f) / f; }
function padLeft_(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}
function seconds_(t) {
  var p = String(t).split(':');
  return (Number(p[0]) || 0) * 3600 + (Number(p[1]) || 0) * 60 + (Number(p[2]) || 0);
}
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function log_(msg) { try { console.error(msg); } catch (e) { /* nothing else to do */ } }


/* ===========================================================================
   DUPLICATE PROTECTION
   A dropped connection makes the browser retry. The same token must never
   produce a second row.
   ======================================================================== */
function tokenSeen_(token, sheetName) {
  if (!token) return null;

  var cache = CacheService.getScriptCache();
  var hit   = cache.get('tok_' + token);
  if (hit) return hit;

  var headers = sheetName === SHEET_CHECKINS ? CHECKIN_HEADERS : HEADERS;
  var sheet   = getSheet_(sheetName, headers);
  var last    = sheet.getLastRow();
  if (last < 2) return null;

  var tokCol = headers.indexOf('submission_token') + 1;
  var idCol  = headers.indexOf('participant_id') + 1;
  var from   = Math.max(2, last - 200);                 // recent rows are enough
  var rows   = sheet.getRange(from, 1, last - from + 1, headers.length).getValues();

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][tokCol - 1]) === token) return String(rows[i][idCol - 1]) || 'duplicate';
  }
  return null;
}

function rememberToken_(token, id) {
  if (!token) return;
  try { CacheService.getScriptCache().put('tok_' + token, id || 'seen', 21600); } catch (e) { /* cache full */ }
}


/* ===========================================================================
   WRITING A ROW
   ======================================================================== */
function appendRow_(sheet, headers, obj, numericMap) {
  var values = headers.map(function (h) {
    var v = obj[h];
    if (v === undefined || v === null) return '';
    if (h === 'timestamp') return v;
    if (numericMap && numericMap[h]) return v === '' ? '' : Number(v);
    return asCell_(String(v));
  });
  sheet.appendRow(values);
}

/**
 * Sheets reads "+20 1001240186" as a broken formula (#ERROR!) and
 * "+201001240186" as a number, even in a plain-text column. A leading
 * apostrophe makes it keep the text exactly as written.
 */
function asCell_(v) {
  return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;
}

/** The text a cell holds, without an apostrophe that Sheets chose to keep. */
function fromCell_(v) {
  return (typeof v === 'string' && /^'[=+\-@]/.test(v)) ? v.slice(1) : v;
}

/**
 * Rows written before asCell_ existed hold "=+20 1001240186" as a formula
 * that shows #ERROR!. Turn every such cell back into the text it was.
 * Returns how many cells were repaired.
 */
function repairPlusCells_(sheet, headers, numericMap) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  var n = 0;
  var rows = sheet.getLastRow() - 1;
  headers.forEach(function (h, i) {
    if (h === 'timestamp' || (numericMap && numericMap[h])) return;
    var range = sheet.getRange(2, i + 1, rows, 1);
    var formulas = range.getFormulas();
    formulas.forEach(function (f, r) {
      var m = /^=?\s*(\+[\d\s]+)$/.exec(String(f[0] || ''));
      if (!m) return;
      sheet.getRange(r + 2, i + 1).setValue("'" + m[1].trim());
      n++;
    });
  });
  return n;
}


/* ===========================================================================
   ONE-TIME SET-UP — run this from the Apps Script editor
   ======================================================================== */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var main = getSheet_(SHEET_MAIN, HEADERS);
  formatSheet_(main, HEADERS, NUMERIC_COLUMNS);
  addStatusDropdown_(main);

  var checks = getSheet_(SHEET_CHECKINS, CHECKIN_HEADERS);
  formatSheet_(checks, CHECKIN_HEADERS, CHECKIN_NUMERIC);

  /* Phone numbers saved as broken formulas (#ERROR!) become text again. */
  var repaired = repairPlusCells_(main, HEADERS, NUMERIC_COLUMNS) +
                 repairPlusCells_(checks, CHECKIN_HEADERS, CHECKIN_NUMERIC);

  buildDashboard_();

  /* Phase 3: the account, program and log tabs, plus the pepper. */
  var secrets = initSecrets_();
  Object.keys(TABS).forEach(function (name) { ensureTab_(name, true); });
  protectUsersTab_();

  /* Tidy up the default "Sheet1" if it is still there and empty. */
  var stray = ss.getSheetByName('Sheet1');
  if (stray && stray.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(stray);

  var msg = 'Set-up finished.' + (repaired ? ' Repaired ' + repaired + ' phone cells that showed #ERROR!.' : '') +
            (secrets.length ? ' ' + secrets.join(' ') : '');
  log_(msg);
  SpreadsheetApp.getActiveSpreadsheet().toast(msg, '3aash Ya Wa7sh', 12);
  return msg;
}

/** A menu so the coach never has to open the script editor again. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('عاش يا وحش')
    .addItem('Set up / repair this sheet', 'setup')
    .addItem('Rebuild the dashboard', 'buildDashboard_')
    .addItem('Send me a test email', 'sendTestEmail')
    .addSeparator()
    .addItem('Set coach password…', 'setCoachPasswordFromMenu')
    .addItem('Create accounts for existing participants', 'migrateExistingParticipants')
    .addItem('Create test participant (AYW-9999-0001)', 'createTestParticipant')
    .addItem('Delete test participant', 'deleteTestParticipant')
    .addItem('Delete a participant (deletion request)…', 'deleteParticipantFromMenu')
    .addItem('Time the password hashing', 'benchmarkHashing')
    .addToUi();
}

function sendTestEmail() {
  MailApp.sendEmail(coachEmail_(), 'عاش يا وحش — test', 'If you are reading this, notifications work.');
}

function getSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function formatSheet_(sheet, headers, numericMap) {
  sheet.getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#14181D')
    .setFontColor('#FFFFFF')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 34);

  /* Plain text for everything except the timestamp and the real numbers, so a
     value starting with = + - or @ can never become a live formula. */
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  headers.forEach(function (h, i) {
    var range = sheet.getRange(2, i + 1, rows, 1);
    if (h === 'timestamp')            range.setNumberFormat('yyyy-mm-dd hh:mm');
    else if (numericMap && numericMap[h]) range.setNumberFormat('0.##');
    else                              range.setNumberFormat('@');
  });

  sheet.autoResizeColumns(1, Math.min(headers.length, 12));
  headers.forEach(function (h, i) {
    if (sheet.getColumnWidth(i + 1) > 260) sheet.setColumnWidth(i + 1, 260);
  });
}

function addStatusDropdown_(sheet) {
  var col  = HEADERS.indexOf('status') + 1;
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_VALUES, true)
    .setAllowInvalid(false)
    .setHelpText('Pick one of: ' + STATUS_VALUES.join(', '))
    .build();
  sheet.getRange(2, col, rows, 1).setDataValidation(rule);
}


/* ===========================================================================
   THE COACH'S DASHBOARD
   One participant at a time, picked from a dropdown. Everything below the
   dropdown is a formula, so it updates itself as check-ins arrive.
   ======================================================================== */
function buildDashboard_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_DASHBOARD) || ss.insertSheet(SHEET_DASHBOARD);
  sh.clear();
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });

  var C = function (name) { return colLetter_(HEADERS.indexOf(name) + 1); };
  var S = "'" + SHEET_MAIN + "'!";
  var K = "'" + SHEET_CHECKINS + "'!";

  /* Checkins columns: A time, B id, C name, D phone, E weight, F waist,
     G sessions, H best, I energy, J notes */

  sh.getRange('A1').setValue('Participant ID').setFontWeight('bold');
  sh.getRange('B1').setValue('');
  sh.getRange('A1:B1').setBackground('#394F9F').setFontColor('#FFFFFF');   // brand blue

  var idRange = ss.getSheetByName(SHEET_MAIN).getRange(2, HEADERS.indexOf('participant_id') + 1, 5000, 1);
  sh.getRange('B1').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(idRange, true).setAllowInvalid(true).build()
  );

  var rows = [
    ['Name',                 '=IFERROR(INDEX(' + S + C('name') + ':' + C('name') + ',MATCH($B$1,' + S + C('participant_id') + ':' + C('participant_id') + ',0)),"")'],
    ['Status',               '=IFERROR(INDEX(' + S + C('status') + ':' + C('status') + ',MATCH($B$1,' + S + C('participant_id') + ':' + C('participant_id') + ',0)),"")'],
    ['Objectives',           '=IFERROR(INDEX(' + S + C('objectives') + ':' + C('objectives') + ',MATCH($B$1,' + S + C('participant_id') + ':' + C('participant_id') + ',0)),"")'],
    ['Needs clearance',      '=IFERROR(INDEX(' + S + C('needs_medical_clearance') + ':' + C('needs_medical_clearance') + ',MATCH($B$1,' + S + C('participant_id') + ':' + C('participant_id') + ',0)),"")'],
    ['', ''],
    ['Start weight (kg)',    '=IFERROR(INDEX(' + S + C('weight_kg') + ':' + C('weight_kg') + ',MATCH($B$1,' + S + C('participant_id') + ':' + C('participant_id') + ',0)),"")'],
    ['Latest weight (kg)',   '=IFERROR(LOOKUP(2,1/(' + K + 'B2:B=$B$1),' + K + 'E2:E),"")'],
    ['Weight change',        '=IF(AND(ISNUMBER($B$8),ISNUMBER($B$9)),$B$9-$B$8,"")'],
    ['Start waist (cm)',     '=IFERROR(INDEX(' + S + C('waist_cm') + ':' + C('waist_cm') + ',MATCH($B$1,' + S + C('participant_id') + ':' + C('participant_id') + ',0)),"")'],
    ['Latest waist (cm)',    '=IFERROR(LOOKUP(2,1/(' + K + 'B2:B=$B$1),' + K + 'F2:F),"")'],
    ['Waist change',         '=IF(AND(ISNUMBER($B$11),ISNUMBER($B$12)),$B$12-$B$11,"")'],
    ['', ''],
    ['Check-ins logged',     '=COUNTIF(' + K + 'B2:B,$B$1)'],
    ['Sessions completed',   '=SUMIF(' + K + 'B2:B,$B$1,' + K + 'G2:G)'],
    ['Sessions planned',     '=IFERROR($B$15*INDEX(' + S + C('days_per_week') + ':' + C('days_per_week') + ',MATCH($B$1,' + S + C('participant_id') + ':' + C('participant_id') + ',0)),"")'],
    ['Adherence',            '=IFERROR($B$16/$B$17,"")'],
    ['Average energy (1-5)', '=IFERROR(AVERAGEIF(' + K + 'B2:B,$B$1,' + K + 'I2:I),"")'],
    ['', ''],
    ['Weight trend',         '=IFERROR(SPARKLINE(FILTER(' + K + 'E2:E,' + K + 'B2:B=$B$1)),"")'],
    ['Waist trend',          '=IFERROR(SPARKLINE(FILTER(' + K + 'F2:F,' + K + 'B2:B=$B$1)),"")'],
    ['Energy trend',         '=IFERROR(SPARKLINE(FILTER(' + K + 'I2:I,' + K + 'B2:B=$B$1),{"charttype","column"}),"")'],
    ['Sessions per week',    '=IFERROR(SPARKLINE(FILTER(' + K + 'G2:G,' + K + 'B2:B=$B$1),{"charttype","column"}),"")']
  ];

  /* rows[0] lands on sheet row 3, so: B8 start weight, B9 latest weight,
     B11 start waist, B12 latest waist, B15 check-ins, B16 sessions done,
     B17 sessions planned, B18 adherence. */
  sh.getRange(3, 1, rows.length, 2).setValues(rows);
  sh.getRange(3, 1, rows.length, 1).setFontWeight('bold');
  sh.getRange('B18').setNumberFormat('0%');   // Adherence sits on row 18

  /* The chart needs a tidy block of its own, so pull this participant's
     check-ins out into columns D:F. */
  sh.getRange('D1').setValue('Date').setFontWeight('bold');
  sh.getRange('E1').setValue('Weight').setFontWeight('bold');
  sh.getRange('F1').setValue('Waist').setFontWeight('bold');
  sh.getRange('D2').setFormula(
    '=IFERROR(FILTER({' + K + 'A2:A,' + K + 'E2:E,' + K + 'F2:F},' + K + 'B2:B=$B$1),"")'
  );

  var chart = sh.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(sh.getRange('D1:F400'))
    .setNumHeaders(1)
    .setPosition(3, 8, 0, 0)
    .setOption('title', 'Weight and waist over time')
    .setOption('width', 620)
    .setOption('height', 360)
    .setOption('colors', ['#394F9F', '#0F7B60'])
    .setOption('legend', { position: 'bottom' })
    .build();
  sh.insertChart(chart);

  sh.setColumnWidth(1, 190);
  sh.setColumnWidth(2, 190);
  sh.getRange('A1').setNote('Pick a participant here. Everything below updates by itself.');
}

/** 1 → A, 27 → AA */
function colLetter_(index) {
  var s = '';
  while (index > 0) {
    var r = (index - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    index = Math.floor((index - 1) / 26);
  }
  return s;
}


/* ###########################################################################
   PHASE 3 — ACCOUNTS, SESSIONS, PROGRAMS
   ###########################################################################
   Everything below backs the participant login, the program tracker and the
   coach console. Passwords and session tokens are never stored: only salted,
   iterated hashes. The default first-login password lives in the
   DEFAULT_PASSWORD Script Property, never in this file.
   ######################################################################## */

var SHEET_USERS         = 'Users';
var SHEET_SESSIONS      = 'Sessions';
var SHEET_RESETS        = 'ResetTokens';
var SHEET_PLANS         = 'Plans';
var SHEET_PLAN_SESSIONS = 'PlanSessions';
var SHEET_LOGS          = 'SessionLogs';
var SHEET_AUTHLOG       = 'AuthLog';

/* Column order of every new tab, left to right (spec section 5). */
var TABS = {
  Users: {
    headers: ['participant_id', 'username', 'name', 'role', 'status', 'pw_algo', 'pw_iter', 'pw_salt',
              'pw_hash', 'must_change_password', 'created_at', 'initial_expires_at', 'password_changed_at',
              'failed_count', 'locked_until', 'last_login_at'],
    numeric: { pw_iter: true, failed_count: true }
  },
  Sessions: {
    headers: ['token_hash', 'participant_id', 'role', 'scope', 'created_at', 'expires_at', 'last_seen_at', 'revoked'],
    numeric: {}
  },
  ResetTokens: {
    headers: ['token_hash', 'participant_id', 'created_by', 'created_at', 'expires_at', 'used_at'],
    numeric: {}
  },
  Plans: {
    headers: ['plan_id', 'participant_id', 'version', 'title', 'start_date', 'weeks', 'status', 'coach_note',
              'created_at', 'published_at', 'clearance_confirmed'],
    numeric: { version: true, weeks: true }
  },
  PlanSessions: {
    headers: ['plan_id', 'participant_id', 'session_id', 'week', 'day', 'date', 'order', 'title', 'type', 'details',
              'target_duration_min', 'target_distance_km', 'target_intensity', 'target_reps'],
    numeric: { week: true, day: true, order: true, target_duration_min: true, target_distance_km: true }
  },
  SessionLogs: {
    headers: ['log_id', 'participant_id', 'plan_id', 'session_id', 'status', 'actual_duration_min',
              'actual_distance_km', 'effort_1_10', 'note', 'logged_at', 'updated_at'],
    numeric: { actual_duration_min: true, actual_distance_km: true, effort_1_10: true }
  },
  AuthLog: {
    headers: ['timestamp', 'username', 'event', 'result', 'detail'],
    numeric: {}
  }
};

/* Security settings. Changing PW_ITERATIONS later is safe: each user row keeps
   the count it was hashed with, and a successful login re-hashes it with the
   current count. 1,000 rather than the spec's 5,000: on the live sheet one
   hash check took 4 s at 5,000 (benchmarkHashing, Oct 2026), which breaks the
   3-second target for a login. The pepper, which never leaves Script
   Properties, is what protects the hashes if the sheet ever leaks. */
var AUTH = {
  PW_ALGO:                 'sha256-iter-v1',
  PW_ITERATIONS:           1000,
  PARTICIPANT_SESSION_DAYS: 30,
  COACH_SESSION_HOURS:     12,
  INITIAL_PASSWORD_DAYS:   14,
  RESET_HOURS:             48,
  LOCK_AFTER:              5,      // consecutive failures → 15-minute lock
  LOCK_MINUTES:            15,
  HARD_LOCK_PER_DAY:       20,     // failures in one day → locked until the coach unlocks
  SESSION_CACHE_SECONDS:   600,
  SESSION_REFRESH_MINUTES: 60      // a session's expiry slides forward at most once an hour
};
var HARD_LOCK_UNTIL = '9999-12-31T00:00:00.000Z';
var COACH_PID       = 'COACH';
var TEST_PID        = 'AYW-9999-0001';
var TEST_USERNAME   = '+201099999999';


/* ===========================================================================
   SMALL HELPERS
   ======================================================================== */
function prop_(key) { return PropertiesService.getScriptProperties().getProperty(key); }
function nowIso_() { return new Date().toISOString(); }
function isoIn_(ms) { return new Date(Date.now() + ms).toISOString(); }
function isTrue_(v) { return v === true || String(v).toUpperCase() === 'TRUE'; }
function timeOf_(iso) { var t = Date.parse(String(iso || '')); return isFinite(t) ? t : 0; }

/** Digits typed on an Arabic (٠–٩) or Persian (۰–۹) keyboard become 0–9. */
function toAsciiDigits_(s) {
  return String(s == null ? '' : s)
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
    .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
}

/**
 * The one shared phone normaliser (common.js has the same rules).
 * Returns the username form "+201001240186", or '' if it is not a valid number.
 *   01001240186 · +20 01001240186 · ٠١٠٠١٢٤٠١٨٦ · 0020 100 124 0186 → +201001240186
 *   +966 5XXXXXXXX → +9665XXXXXXXX (other countries keep their own code)
 */
function normalisePhone_(raw) {
  var s = toAsciiDigits_(raw).replace(/[\s\-().‎‏‪-‮]/g, '');
  if (/^00/.test(s)) s = '+' + s.slice(2);
  if (/^0\d{10}$/.test(s)) s = '+20' + s.slice(1);          // local Egyptian number with its 0
  else if (/^1[0125]\d{8}$/.test(s)) s = '+20' + s;          // Egyptian number typed without 0 or code
  if (!/^\+\d+$/.test(s)) return '';
  if (s.indexOf('+20') === 0) {
    var national = s.slice(3).replace(/^0/, '');
    return /^1[0125]\d{8}$/.test(national) ? '+20' + national : '';
  }
  var len = s.length - 1;
  return (len >= 8 && len <= 15) ? s : '';
}


/* ===========================================================================
   HASHING
   Apps Script has no crypto RNG, but Utilities.getUuid() is a random (v4)
   UUID backed by Java's SecureRandom; hashing several of them gives the
   random bytes used for salts and tokens.
   ======================================================================== */
function bytes_(s) { return Utilities.newBlob(String(s)).getBytes(); }
function sha256_(byteArr) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, byteArr); }
function hex_(byteArr) {
  return byteArr.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length < 2 ? '0' + v : v;
  }).join('');
}
function sha256Hex_(s) { return hex_(sha256_(bytes_(s))); }

function randomBytes_(n) {
  var out = [];
  while (out.length < n) {
    out = out.concat(sha256_(bytes_(Utilities.getUuid() + Utilities.getUuid() + Date.now() + out.length)));
  }
  return out.slice(0, n);
}
function randomToken_() { return hex_(randomBytes_(32)); }       // 32 random bytes → 64 hex characters

function pepper_() {
  var p = prop_('PEPPER');
  if (!p) throw new Error('The PEPPER script property is missing — run setup() first.');
  return p;
}

/** salt(16 bytes) + pepper + password, then SHA-256 repeated `iterations` times. */
function hashPassword_(password, saltB64, iterations) {
  var salt = Utilities.base64Decode(saltB64);
  var h = sha256_(salt.concat(bytes_(pepper_())).concat(bytes_(password)));
  for (var i = 1; i < iterations; i++) h = sha256_(h.concat(salt));
  return Utilities.base64Encode(h);
}

function makePasswordRecord_(password) {
  var salt = Utilities.base64Encode(randomBytes_(16));
  return { algo: AUTH.PW_ALGO, iter: AUTH.PW_ITERATIONS, salt: salt,
           hash: hashPassword_(password, salt, AUTH.PW_ITERATIONS) };
}

function checkPassword_(password, rec) {
  if (!rec || rec.algo !== AUTH.PW_ALGO || !rec.salt || !rec.hash) return false;
  return safeEqual_(hashPassword_(String(password), rec.salt, Number(rec.iter) || AUTH.PW_ITERATIONS), rec.hash);
}

/** Compares in time that does not depend on where the strings differ. */
function safeEqual_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * Why a new password is not acceptable, or '' if it is fine. Same rules as
 * the browser: 8–64 characters, English letters, numbers and symbols only
 * (no Arabic, no spaces), not the default password, not the phone number.
 */
function passwordProblem_(pw, username) {
  pw = String(pw == null ? '' : pw);
  if (pw.length < 8)  return 'pw_too_short';
  if (pw.length > 64) return 'pw_too_long';
  if (!/^[\x21-\x7E]+$/.test(pw)) return 'pw_ascii_only';
  var dflt = prop_('DEFAULT_PASSWORD');
  if (dflt && pw === dflt) return 'pw_is_default';
  var d = digits_(username);
  if (d.length >= 8 && pw.indexOf(d.slice(-8)) !== -1) return 'pw_has_phone';
  return '';
}


/* ===========================================================================
   TABS — read, write and update rows by column name
   ======================================================================== */
var tabCache_ = {};

/** Get a Phase-3 tab, creating and formatting it (plain text) if it is new. */
function ensureTab_(name, reformat) {
  if (tabCache_[name] && !reformat) return tabCache_[name];
  var def = TABS[name];
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  var isNew = !sh;
  if (isNew) sh = ss.insertSheet(name);
  if (isNew || sh.getLastRow() === 0 || reformat) {
    /* Text format matters: without it Sheets would turn "+201001240186" into a number. */
    formatSheet_(sh, def.headers, def.numeric);
  }
  tabCache_[name] = sh;
  return sh;
}

function readRows_(name) {
  var def = TABS[name];
  var sh = ensureTab_(name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, def.headers.length).getValues();
  return vals.map(function (r, i) {
    var o = { _row: i + 2 };
    def.headers.forEach(function (h, j) { o[h] = fromCell_(r[j]); });
    return o;
  });
}

function writeRow_(name, obj) {
  appendRow_(ensureTab_(name), TABS[name].headers, obj, TABS[name].numeric);
}

function updateRow_(name, rowNum, patch) {
  var def = TABS[name];
  var sh = ensureTab_(name);
  var current = sh.getRange(rowNum, 1, 1, def.headers.length).getValues()[0];
  var vals = def.headers.map(function (h, j) {
    if (!patch.hasOwnProperty(h)) return asCell_(fromCell_(current[j]));
    var v = patch[h];
    if (v === null || v === undefined) return '';
    if (def.numeric[h]) return v === '' ? '' : Number(v);
    return asCell_(String(v));
  });
  sh.getRange(rowNum, 1, 1, vals.length).setValues([vals]);
}

/** Delete, bottom-up, every row whose value in `column` passes `test`. */
function deleteRowsWhere_(sheet, headers, column, test) {
  if (!sheet) return 0;
  var col = headers.indexOf(column) + 1;
  var last = sheet.getLastRow();
  if (col < 1 || last < 2) return 0;
  var vals = sheet.getRange(2, col, last - 1, 1).getValues();
  var n = 0;
  for (var i = vals.length - 1; i >= 0; i--) {
    if (test(vals[i][0])) { sheet.deleteRow(i + 2); n++; }
  }
  return n;
}

function findUser_(field, value) {
  var rows = readRows_(SHEET_USERS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][field]) === String(value)) return rows[i];
  }
  return null;
}

/** The Users tab holds password hashes: editor-only, hash columns hidden. */
function protectUsersTab_() {
  var sh = ensureTab_(SHEET_USERS);
  try {
    var existing = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    var p = existing.length ? existing[0] : sh.protect();
    p.setDescription('Accounts — editor only. Never share this sheet.');
    p.removeEditors(p.getEditors());
    if (p.canDomainEdit()) p.setDomainEdit(false);
  } catch (e) { log_('Could not protect Users: ' + e); }
  var h = TABS.Users.headers;
  sh.hideColumns(h.indexOf('pw_salt') + 1, 2);           // pw_salt and pw_hash
}


/* ===========================================================================
   SECRETS
   ======================================================================== */
/** Creates PEPPER once if it is missing, and reports what still needs setting. */
function initSecrets_() {
  var props = PropertiesService.getScriptProperties();
  var notes = [];
  if (!props.getProperty('PEPPER')) {
    props.setProperty('PEPPER', Utilities.base64Encode(randomBytes_(32)));
    notes.push('A PEPPER was created in Script Properties — never change or delete it.');
  }
  if (!props.getProperty('DEFAULT_PASSWORD')) {
    notes.push('Set the DEFAULT_PASSWORD script property before creating accounts.');
  }
  if (!props.getProperty('COACH_EMAIL') && (!COACH_EMAIL || COACH_EMAIL === 'coach@example.com')) {
    notes.push('Set the COACH_EMAIL script property to get submission emails.');
  }
  if (!props.getProperty('COACH_HASH')) {
    notes.push('Use the menu "Set coach password…" to create the coach login.');
  }
  return notes;
}


/* ===========================================================================
   ACCOUNTS
   ======================================================================== */
/** New participant account with the default password, which must be changed. */
function createAccount_(pid, username, name) {
  var dflt = prop_('DEFAULT_PASSWORD');
  if (!dflt) throw new Error('The DEFAULT_PASSWORD script property is missing.');
  var rec = makePasswordRecord_(dflt);
  writeRow_(SHEET_USERS, {
    participant_id: pid, username: username, name: clean_(name, 80),
    role: 'participant', status: 'awaiting_plan',
    pw_algo: rec.algo, pw_iter: rec.iter, pw_salt: rec.salt, pw_hash: rec.hash,
    must_change_password: 'TRUE',
    created_at: nowIso_(),
    initial_expires_at: isoIn_(AUTH.INITIAL_PASSWORD_DAYS * 864e5),
    password_changed_at: '', failed_count: 0, locked_until: '', last_login_at: ''
  });
}

function passwordRecordOf_(user) {
  return { algo: String(user.pw_algo), iter: Number(user.pw_iter), salt: String(user.pw_salt), hash: String(user.pw_hash) };
}

/** True while the default password can still be used on this account. */
function defaultPasswordActive_(user) {
  return isTrue_(user.must_change_password) && timeOf_(user.initial_expires_at) > Date.now();
}


/* ===========================================================================
   SESSIONS
   Only the SHA-256 of a token is stored. Valid sessions are cached for 10
   minutes; revoking one removes it from the cache at once.
   ======================================================================== */
function sessionTtlMs_(role) {
  return role === 'coach' ? AUTH.COACH_SESSION_HOURS * 36e5 : AUTH.PARTICIPANT_SESSION_DAYS * 864e5;
}

function cacheSession_(hash, s) {
  try { CacheService.getScriptCache().put('sess_' + hash, JSON.stringify(s), AUTH.SESSION_CACHE_SECONDS); }
  catch (e) { /* the sheet is the source of truth */ }
}

/** Issue a session. scope is 'full' or 'change_password_only'. Caller holds the lock. */
function createSession_(pid, role, scope) {
  var token = randomToken_();
  var hash = sha256Hex_(token);
  var now = nowIso_();
  var exp = isoIn_(sessionTtlMs_(role));
  writeRow_(SHEET_SESSIONS, {
    token_hash: hash, participant_id: pid, role: role, scope: scope,
    created_at: now, expires_at: exp, last_seen_at: now, revoked: 'FALSE'
  });
  cacheSession_(hash, { pid: pid, role: role, scope: scope, exp: exp, seen: now });
  return { token: token, expires_at: exp };
}

/** Look a token up. Returns {pid, role, scope, exp, hash} or null. */
function resolveSession_(token) {
  token = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  var hash = sha256Hex_(token);
  var cache = CacheService.getScriptCache();
  var hit = cache.get('sess_' + hash);
  var s = hit ? JSON.parse(hit) : null;

  if (!s) {
    var rows = readRows_(SHEET_SESSIONS);
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].token_hash) !== hash) continue;
      if (isTrue_(rows[i].revoked)) return null;
      s = { pid: String(rows[i].participant_id), role: String(rows[i].role), scope: String(rows[i].scope),
            exp: String(rows[i].expires_at), seen: String(rows[i].last_seen_at) };
      break;
    }
    if (!s) return null;
  }
  if (timeOf_(s.exp) <= Date.now()) return null;

  /* Sliding expiry, written at most once an hour so reads stay fast. */
  if (Date.now() - timeOf_(s.seen) > AUTH.SESSION_REFRESH_MINUTES * 6e4) {
    var lock = LockService.getScriptLock();
    if (lock.tryLock(2000)) {
      try {
        var all = readRows_(SHEET_SESSIONS);
        for (var j = 0; j < all.length; j++) {
          if (String(all[j].token_hash) === hash) {
            if (isTrue_(all[j].revoked)) return null;
            s.seen = nowIso_();
            s.exp = isoIn_(sessionTtlMs_(s.role));
            updateRow_(SHEET_SESSIONS, all[j]._row, { last_seen_at: s.seen, expires_at: s.exp });
            break;
          }
        }
      } finally { lock.releaseLock(); }
    }
  }
  cacheSession_(hash, s);
  s.hash = hash;
  return s;
}

/** Revoke one session by its hash. Caller holds the lock. */
function revokeSession_(hash) {
  var rows = readRows_(SHEET_SESSIONS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].token_hash) === hash) { updateRow_(SHEET_SESSIONS, rows[i]._row, { revoked: 'TRUE' }); break; }
  }
  try { CacheService.getScriptCache().remove('sess_' + hash); } catch (e) { /* nothing cached */ }
}

/** Revoke every session of a participant except one (or all). Caller holds the lock. */
function revokeAllSessions_(pid, exceptHash) {
  var keys = [];
  readRows_(SHEET_SESSIONS).forEach(function (r) {
    if (String(r.participant_id) !== pid || String(r.token_hash) === exceptHash) return;
    keys.push('sess_' + r.token_hash);
    if (!isTrue_(r.revoked)) updateRow_(SHEET_SESSIONS, r._row, { revoked: 'TRUE' });
  });
  if (keys.length) { try { CacheService.getScriptCache().removeAll(keys); } catch (e) { /* nothing cached */ } }
  return keys.length;
}


/* ===========================================================================
   LOCKOUT + AUTH LOG
   ======================================================================== */
/** One line per auth event. Never passwords, never tokens. */
function logAuth_(username, event, result, detail) {
  try {
    writeRow_(SHEET_AUTHLOG, {
      timestamp: new Date(), username: clean_(username, 40), event: event, result: result,
      detail: clean_(detail || '', 200)
    });
  } catch (e) { log_('AuthLog write failed: ' + e); }
}

function isLocked_(user) {
  return !!user && timeOf_(user.locked_until) > Date.now();
}

/** The cache-side lock on a number that has no account. */
function isNameLocked_(username) {
  try { return !!CacheService.getScriptCache().get('ulock_' + sha256Hex_(String(username)).slice(0, 20)); }
  catch (e) { return false; }
}

/**
 * Count a failed login. Caller holds the lock. Numbers without an account are
 * locked the same way (in the cache), so "locked" never reveals whether a
 * number is registered.
 */
function registerFailure_(user, username, event) {
  var idk = sha256Hex_(String(username)).slice(0, 20);
  var day = Utilities.formatDate(new Date(), 'Africa/Cairo', 'yyyyMMdd');
  var key = 'faild_' + idk + '_' + day;
  var cache = CacheService.getScriptCache();
  var today = Number(cache.get(key) || 0) + 1;
  try { cache.put(key, String(today), 21600); } catch (e) { /* best effort */ }

  logAuth_(username, event || 'login', 'fail', user ? 'bad password' : 'unknown username');
  if (!user) {
    var run = Number(cache.get('ufail_' + idk) || 0) + 1;
    try {
      cache.put('ufail_' + idk, String(run), 3600);
      if (today >= AUTH.HARD_LOCK_PER_DAY) cache.put('ulock_' + idk, '1', 21600);
      else if (run % AUTH.LOCK_AFTER === 0) cache.put('ulock_' + idk, '1', AUTH.LOCK_MINUTES * 60);
    } catch (e) { /* best effort */ }
    return;
  }

  var count = Number(user.failed_count || 0) + 1;
  var patch = { failed_count: count };
  if (today >= AUTH.HARD_LOCK_PER_DAY) {
    patch.locked_until = HARD_LOCK_UNTIL;
    logAuth_(username, 'lockout', 'until_unlock', today + ' failures today');
  } else if (count % AUTH.LOCK_AFTER === 0) {
    patch.locked_until = isoIn_(AUTH.LOCK_MINUTES * 6e4);
    logAuth_(username, 'lockout', AUTH.LOCK_MINUTES + 'min', count + ' failures in a row');
  }
  updateRow_(SHEET_USERS, user._row, patch);
}

/** A successful login clears the failure count. Caller holds the lock. */
function registerSuccess_(user) {
  updateRow_(SHEET_USERS, user._row, { failed_count: 0, locked_until: '', last_login_at: nowIso_() });
}


/* ===========================================================================
   COACH ACCOUNT — username and hash live in Script Properties only
   ======================================================================== */
function setCoachPassword(password, username) {
  initSecrets_();
  var problem = passwordProblem_(password, '');
  if (problem) throw new Error('Password not accepted (' + problem + '): 8–64 characters, English letters, numbers and symbols only.');
  username = clean_(username || prop_('COACH_USERNAME') || coachEmail_(), 120).toLowerCase();
  if (!username || username === 'coach@example.com') throw new Error('Give a coach username (your email).');
  var props = PropertiesService.getScriptProperties();
  props.setProperty('COACH_USERNAME', username);
  props.setProperty('COACH_HASH', JSON.stringify(makePasswordRecord_(password)));
  logAuth_(username, 'change_password', 'ok', 'coach password set');
  return 'Coach login saved for ' + username + '.';
}

/** Menu version: asks for the username and password in two dialogs. */
function setCoachPasswordFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var u = ui.prompt('Coach login (1 of 2)', 'Your coach username — your email address:', ui.ButtonSet.OK_CANCEL);
  if (u.getSelectedButton() !== ui.Button.OK) return;
  var p = ui.prompt('Coach login (2 of 2)',
    'Your coach password: 8–64 characters, English letters, numbers and symbols.\n' +
    'It is visible while you type, so make sure nobody is watching your screen.', ui.ButtonSet.OK_CANCEL);
  if (p.getSelectedButton() !== ui.Button.OK) return;
  try { ui.alert(setCoachPassword(p.getResponseText(), u.getResponseText())); }
  catch (e) { ui.alert(String(e.message || e)); }
}


/* ===========================================================================
   API HELPERS — replies, sessions and roles for the account routes
   ======================================================================== */
function fail_(code, extra) {
  var o = { ok: false, error: code };
  if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
  return json(o);
}

/**
 * The session behind a request, checked for role and scope. Returns {s} or
 * {reply}. A participant ID always comes from the session, never the body.
 */
function auth_(body, role, allowRestricted) {
  var s = resolveSession_(body && body.session);
  if (!s) return { reply: fail_('session_expired') };
  if (s.role !== role) return { reply: fail_('forbidden') };
  if (s.scope !== 'full' && !allowRestricted) return { reply: fail_('password_change_required') };
  return { s: s };
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return fail_('busy'); }
  try { return fn(); } finally { lock.releaseLock(); }
}

function firstName_(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }
function str_(v, max) { return String(v == null ? '' : v).slice(0, max || 200); }

/** A participant's intake row as an object, or null. */
function submissionOf_(pid) {
  var sheet = getSheet_(SHEET_MAIN, HEADERS);
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var iPid = HEADERS.indexOf('participant_id');
  var rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][iPid]).trim().toUpperCase() !== pid) continue;
    var o = { _row: i + 2 };
    HEADERS.forEach(function (h, j) { o[h] = fromCell_(rows[i][j]); });
    return o;
  }
  return null;
}

/** New password for a user: hashed, first-login flag cleared, lock lifted. */
function setPassword_(user, password) {
  var rec = makePasswordRecord_(password);
  updateRow_(SHEET_USERS, user._row, {
    pw_algo: rec.algo, pw_iter: rec.iter, pw_salt: rec.salt, pw_hash: rec.hash,
    must_change_password: 'FALSE', password_changed_at: nowIso_(), failed_count: 0, locked_until: ''
  });
}

/** Re-hash after a good login when the stored cost is not the current one. */
function upgradeHashIfNeeded_(user, password) {
  if (String(user.pw_algo) === AUTH.PW_ALGO && Number(user.pw_iter) === AUTH.PW_ITERATIONS) return;
  var rec = makePasswordRecord_(password);
  updateRow_(SHEET_USERS, user._row, { pw_algo: rec.algo, pw_iter: rec.iter, pw_salt: rec.salt, pw_hash: rec.hash });
}

function sessionReply_(sess, scope, user, extra) {
  var o = { ok: true, session: sess.token, expires_at: sess.expires_at, scope: scope,
            name: firstName_(user.name), username: String(user.username) };
  if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
  return json(o);
}


/* ===========================================================================
   AUTH ROUTES — login, change_password, logout, reset_verify, reset_complete
   ======================================================================== */
function handleLogin(body) {
  var typed = clean_(body.username, 30);
  var username = normalisePhone_(typed);
  var password = str_(body.password, 200);
  return withLock_(function () {
    var user = username ? findUser_('username', username) : null;
    if (user && String(user.role) !== 'participant') user = null;
    if (user ? isLocked_(user) : isNameLocked_(username || typed)) {
      logAuth_(username || typed, 'login', 'locked', '');
      return fail_('locked');
    }
    if (!user || !password || !checkPassword_(password, passwordRecordOf_(user))) {
      registerFailure_(user, username || typed);
      return fail_('bad_credentials');
    }
    var mustChange = isTrue_(user.must_change_password);
    if (mustChange && timeOf_(user.initial_expires_at) <= Date.now()) {
      logAuth_(username, 'login', 'initial_expired', '');
      return fail_('initial_expired');
    }
    registerSuccess_(user);
    upgradeHashIfNeeded_(user, password);
    var scope = mustChange ? 'change_password_only' : 'full';
    var sess = createSession_(String(user.participant_id), 'participant', scope);
    logAuth_(username, 'login', 'ok', mustChange ? 'must change password' : '');
    var sub = submissionOf_(String(user.participant_id));
    return sessionReply_(sess, scope, user, {
      must_change_password: mustChange, lang: sub ? String(sub.language_used || '') : ''
    });
  });
}

function handleChangePassword(body) {
  var a = auth_(body, 'participant', true);
  if (a.reply) return a.reply;
  return withLock_(function () {
    var user = findUser_('participant_id', a.s.pid);
    if (!user) return fail_('session_expired');
    if (isLocked_(user)) return fail_('locked');
    var current = str_(body.current_password, 200);
    var next = String(body.new_password == null ? '' : body.new_password);
    if (!checkPassword_(current, passwordRecordOf_(user))) {
      registerFailure_(user, String(user.username), 'change_password');
      return fail_('bad_current_password');
    }
    var problem = passwordProblem_(next, user.username) || (next === current ? 'pw_same' : '');
    if (problem) return fail_(problem);
    setPassword_(user, next);
    revokeAllSessions_(a.s.pid, '');
    var sess = createSession_(a.s.pid, 'participant', 'full');
    logAuth_(user.username, 'change_password', 'ok', '');
    return sessionReply_(sess, 'full', user);
  });
}

function handleLogout(body) {
  var s = resolveSession_(body && body.session);
  if (!s) return json({ ok: true });
  return withLock_(function () { revokeSession_(s.hash); return json({ ok: true }); });
}

/** An unused, unexpired reset-token row, or null. */
function findResetToken_(token) {
  token = String(token || '');
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  var hash = sha256Hex_(token);
  var rows = readRows_(SHEET_RESETS);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].token_hash) !== hash) continue;
    if (rows[i].used_at || timeOf_(rows[i].expires_at) <= Date.now()) return null;
    return rows[i];
  }
  return null;
}

function handleResetVerify(body) {
  var r = findResetToken_(body.token);
  var user = r && findUser_('participant_id', String(r.participant_id));
  if (!user) return fail_('reset_invalid');
  return json({ ok: true, name: firstName_(user.name) });
}

function handleResetComplete(body) {
  return withLock_(function () {
    var r = findResetToken_(body.token);
    var user = r && findUser_('participant_id', String(r.participant_id));
    if (!user) return fail_('reset_invalid');
    var next = String(body.new_password == null ? '' : body.new_password);
    var problem = passwordProblem_(next, user.username);
    if (problem) return fail_(problem);
    updateRow_(SHEET_RESETS, r._row, { used_at: nowIso_() });
    setPassword_(user, next);
    var pid = String(user.participant_id);
    revokeAllSessions_(pid, '');
    var sess = createSession_(pid, 'participant', 'full');
    logAuth_(user.username, 'reset_used', 'ok', '');
    return sessionReply_(sess, 'full', user);
  });
}


/* ===========================================================================
   PROGRAMS — reading a published plan, its dates and the progress numbers
   -----------------------------------------------------------------------------
   Text cells that come in two languages (title, details, coach note) hold
   either {"ar":"…","en":"…"} from an import, or plain Arabic typed by hand
   in the sheet. Both read the same way.
   ======================================================================== */
var SESSION_TYPES = ['run', 'walk', 'swim', 'bike', 'strength', 'mobility', 'cross', 'rest', 'other'];
var INTENSITIES   = ['easy', 'moderate', 'hard', 'race'];
var LOG_STATUSES  = ['done', 'partial', 'skipped'];

function biText_(v) {
  var s = String(v == null ? '' : v).trim();
  if (s.charAt(0) === '{') {
    try { var o = JSON.parse(s); return { ar: String(o.ar || ''), en: String(o.en || '') }; }
    catch (e) { /* not JSON after all: plain text */ }
  }
  return { ar: s, en: '' };
}
function biCell_(o) { return o.en ? JSON.stringify({ ar: o.ar, en: o.en }) : o.ar; }

/* Dates are handled as whole days, yyyy-MM-dd, in Cairo time. */
function cairoDay_(d) { return Utilities.formatDate(d || new Date(), 'Africa/Cairo', 'yyyy-MM-dd'); }
function dayNum_(iso) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : NaN;
}
function isoOfDay_(n) { return new Date(n * 864e5).toISOString().slice(0, 10); }
/** A date cell typed by hand may arrive as a Date object or as text. */
function dateCell_(v) {
  if (v instanceof Date) return cairoDay_(v);
  var s = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}
function num_(v) { return v === '' || v === null || v === undefined || !isFinite(Number(v)) ? null : Number(v); }

/** The participant's published plan with its sessions, or null. */
function publishedPlan_(pid) {
  var best = null;
  readRows_(SHEET_PLANS).forEach(function (p) {
    if (String(p.participant_id) !== pid || String(p.status) !== 'published' || !p.plan_id) return;
    if (!best || Number(p.version) > Number(best.version)) best = p;
  });
  return best ? buildPlan_(best) : null;
}

/** Turn a Plans row (and its PlanSessions rows) into the plan object. */
function buildPlan_(p) {
  var planId = String(p.plan_id);
  var startGiven = dateCell_(p.start_date);
  /* No start date: day 1 is the Saturday on or before the day it was published. */
  var start = startGiven;
  if (!start) {
    var pub = dayNum_(cairoDay_(p.published_at ? new Date(timeOf_(p.published_at) || Date.now()) : new Date()));
    var weekday = new Date(pub * 864e5).getUTCDay();            // 0 Sun … 6 Sat
    start = isoOfDay_(pub - ((weekday + 1) % 7));
  }
  var startN = dayNum_(start);
  var sessions = readRows_(SHEET_PLAN_SESSIONS)
    .filter(function (s) { return String(s.plan_id) === planId && s.session_id; })
    .map(function (s) {
      var week = Number(s.week) || 1, day = Number(s.day) || 1;
      return {
        session_id: String(s.session_id), week: week, day: day, order: Number(s.order) || 0,
        date: isoOfDay_(startN + (week - 1) * 7 + (day - 1)),
        type: SESSION_TYPES.indexOf(String(s.type)) === -1 ? 'other' : String(s.type),
        title: biText_(s.title), details: biText_(s.details),
        target_duration_min: num_(s.target_duration_min), target_distance_km: num_(s.target_distance_km),
        target_intensity: INTENSITIES.indexOf(String(s.target_intensity)) === -1 ? null : String(s.target_intensity),
        target_reps: String(s.target_reps || '') || null
      };
    })
    .sort(function (a, b) { return a.week - b.week || a.day - b.day || a.order - b.order; });
  return {
    plan_id: planId, version: Number(p.version) || 1, title: biText_(p.title),
    start_date: startGiven, start: start, weeks: Math.max(1, Number(p.weeks) || 1),
    coach_note: biText_(p.coach_note), published_at: String(p.published_at || ''),
    clearance_confirmed: isTrue_(p.clearance_confirmed), sessions: sessions
  };
}

/** What the tracker shows: sessions grouped by week. */
function publicPlan_(plan) {
  var weeks = [];
  for (var w = 1; w <= plan.weeks; w++) weeks.push({ week: w, sessions: [] });
  plan.sessions.forEach(function (s) { if (weeks[s.week - 1]) weeks[s.week - 1].sessions.push(s); });
  return { plan_id: plan.plan_id, version: plan.version, title: plan.title, start_date: plan.start_date,
           start: plan.start, weeks: plan.weeks, coach_note: plan.coach_note, by_week: weeks };
}

/** A participant's logs, the latest row per session_id. */
function logsOf_(pid, rows) {
  var latest = {};
  (rows || readRows_(SHEET_LOGS)).forEach(function (r) {
    if (String(r.participant_id) === pid && r.session_id) latest[String(r.session_id)] = r;
  });
  return Object.keys(latest).map(function (k) { return latest[k]; });
}

function publicLog_(r) {
  return {
    session_id: String(r.session_id), plan_id: String(r.plan_id || ''), status: String(r.status),
    actual_duration_min: num_(r.actual_duration_min), actual_distance_km: num_(r.actual_distance_km),
    effort_1_10: num_(r.effort_1_10), note: String(r.note || ''),
    updated_at: String(r.updated_at || r.logged_at || '')
  };
}

/**
 * Progress numbers. Adherence = (done + ½ partial) ÷ sessions planned up to
 * today (rest days do not count; a session logged early counts as planned).
 * Streak = weeks in a row with ≥ 80 % of their sessions done; the current
 * week joins the streak once it reaches 80 %, and never breaks it before.
 */
function planStats_(plan, logs, today) {
  var todayN = dayNum_(today || cairoDay_());
  var startN = dayNum_(plan.start);
  var byId = {};
  logs.forEach(function (l) { byId[String(l.session_id)] = String(l.status); });

  var planned = 0, score = 0, done = 0, partial = 0, skipped = 0, weekly = {};
  plan.sessions.forEach(function (s) {
    if (s.type === 'rest') return;
    var st = byId[s.session_id];
    var w = weekly[s.week] || (weekly[s.week] = { total: 0, score: 0 });
    var pts = st === 'done' ? 1 : st === 'partial' ? 0.5 : 0;
    w.total++; w.score += pts;
    if (st === 'done') done++; else if (st === 'partial') partial++; else if (st === 'skipped') skipped++;
    if (dayNum_(s.date) <= todayN || st) { planned++; score += pts; }
  });

  var started = todayN >= startN;
  var current = started ? Math.min(plan.weeks, Math.floor((todayN - startN) / 7) + 1) : 0;
  var good = function (wk) { var x = weekly[wk]; return x && x.total ? x.score / x.total >= 0.8 : null; };
  var streak = 0;
  if (current && good(current)) streak++;
  for (var wk = current - 1; wk >= 1; wk--) {
    var g = good(wk);
    if (g === null) continue;                 // a week with only rest days neither counts nor breaks
    if (!g) break;
    streak++;
  }
  return {
    current_week: current, weeks: plan.weeks, started: started, start: plan.start,
    planned_to_date: planned, done: done, partial: partial, skipped: skipped,
    adherence: planned ? Math.min(100, Math.round(score / planned * 100)) : null, streak: streak
  };
}

/** The participant's own last n check-ins, oldest first. */
function checkinsOf_(pid, n) {
  var sh = getSheet_(SHEET_CHECKINS, CHECKIN_HEADERS);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var H = CHECKIN_HEADERS;
  var out = sh.getRange(2, 1, last - 1, H.length).getValues()
    .filter(function (r) { return String(r[H.indexOf('participant_id')]).toUpperCase() === pid; })
    .map(function (r) {
      var ts = r[H.indexOf('timestamp')];
      return {
        date: ts instanceof Date ? cairoDay_(ts) : String(ts).slice(0, 10),
        weight_kg: num_(r[H.indexOf('weight_kg')]), waist_cm: num_(r[H.indexOf('waist_cm')]),
        sessions_done: num_(r[H.indexOf('sessions_done')]), energy: num_(r[H.indexOf('energy')]),
        best_effort: String(fromCell_(r[H.indexOf('best_effort')]) || ''), notes: String(fromCell_(r[H.indexOf('notes')]) || '')
      };
    });
  return n ? out.slice(-n) : out;
}


/* ===========================================================================
   TRACKER ROUTES — me, log_session (check-in is handleCheckin above)
   Every query here is scoped to the session's participant_id.
   ======================================================================== */
function handleMe(body) {
  var a = auth_(body, 'participant');
  if (a.reply) return a.reply;
  var pid = a.s.pid;
  var user = findUser_('participant_id', pid);
  if (!user) return fail_('session_expired');
  var plan = publishedPlan_(pid);
  var logs = logsOf_(pid);
  return json({
    ok: true, participant_id: pid, name: firstName_(user.name), status: String(user.status),
    today: cairoDay_(), plan: plan ? publicPlan_(plan) : null, logs: logs.map(publicLog_),
    stats: plan ? planStats_(plan, logs) : null, checkins: checkinsOf_(pid, 12)
  });
}

function handleLogSession(body) {
  var a = auth_(body, 'participant');
  if (a.reply) return a.reply;
  var pid = a.s.pid;
  var token = clean_(body.submission_token, 60);
  var cache = CacheService.getScriptCache();
  var seen = token ? cache.get('logtok_' + token) : null;

  return withLock_(function () {
    var plan = publishedPlan_(pid);
    if (!plan) return fail_('no_plan');
    var sid = clean_(body.session_id, 12);
    var ps = plan.sessions.filter(function (s) { return s.session_id === sid; })[0];
    if (!ps || ps.type === 'rest') return fail_('invalid');

    if (!seen) {
      var status = coerce_(body.status, { type: 'enum', values: LOG_STATUSES });
      if (!status) return fail_('invalid');
      var patch = {
        plan_id: plan.plan_id, status: status,
        actual_duration_min: coerce_(body.actual_duration_min, { type: 'int', min: 0, max: 600 }),
        actual_distance_km: coerce_(body.actual_distance_km, { type: 'num', min: 0, max: 500 }),
        effort_1_10: coerce_(body.effort_1_10, { type: 'int', min: 1, max: 10 }),
        note: clean_(body.note, 300), updated_at: nowIso_()
      };
      var existing = null;
      readRows_(SHEET_LOGS).forEach(function (r) {
        if (String(r.participant_id) === pid && String(r.session_id) === sid) existing = r;
      });
      if (existing) updateRow_(SHEET_LOGS, existing._row, patch);
      else {
        patch.log_id = Utilities.getUuid(); patch.participant_id = pid; patch.session_id = sid; patch.logged_at = patch.updated_at;
        writeRow_(SHEET_LOGS, patch);
      }
      if (token) { try { cache.put('logtok_' + token, '1', 21600); } catch (e) { /* best effort */ } }
    }
    var logs = logsOf_(pid);
    var mine = logs.filter(function (l) { return String(l.session_id) === sid; })[0];
    return json({ ok: true, duplicate: !!seen, log: mine ? publicLog_(mine) : null, stats: planStats_(plan, logs) });
  });
}


/* ===========================================================================
   ONE-OFF HELPERS — run from the editor or the sheet menu
   ======================================================================== */
/**
 * Give every existing participant an account with the default password and a
 * fresh 14-day window. Safe to run twice. Duplicate or invalid phone numbers
 * are skipped and listed in the execution log for you to sort out by hand.
 */
function migrateExistingParticipants() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    initSecrets_();
    if (!prop_('DEFAULT_PASSWORD')) throw new Error('Set the DEFAULT_PASSWORD script property first.');

    var haveUser = {}, havePid = {};
    readRows_(SHEET_USERS).forEach(function (u) {
      haveUser[String(u.username)] = String(u.participant_id);
      havePid[String(u.participant_id)] = true;
    });

    var sub = getSheet_(SHEET_MAIN, HEADERS);
    repairPlusCells_(sub, HEADERS, NUMERIC_COLUMNS);
    var last = sub.getLastRow();
    var rows = last < 2 ? [] : sub.getRange(2, 1, last - 1, HEADERS.length).getValues();
    var iPid = HEADERS.indexOf('participant_id'), iPhone = HEADERS.indexOf('whatsapp'), iName = HEADERS.indexOf('name');

    var todo = [];
    rows.forEach(function (r) {
      var pid = String(r[iPid] || '').trim();
      if (!pid || havePid[pid]) return;
      var phone = fromCell_(String(r[iPhone]));
      todo.push({ pid: pid, raw: phone, username: normalisePhone_(phone), name: fromCell_(String(r[iName])) });
    });

    var count = {};
    todo.forEach(function (t) { if (t.username) count[t.username] = (count[t.username] || 0) + 1; });

    var created = [], skipped = [];
    todo.forEach(function (t) {
      if (!t.username) { skipped.push(t.pid + ': phone "' + t.raw + '" is not a valid number'); return; }
      if (haveUser[t.username]) { skipped.push(t.pid + ': ' + t.username + ' already belongs to ' + haveUser[t.username]); return; }
      if (count[t.username] > 1) { skipped.push(t.pid + ': ' + t.username + ' is used by more than one submission'); return; }
      createAccount_(t.pid, t.username, t.name);
      haveUser[t.username] = t.pid;
      created.push(t.pid + ' → ' + t.username);
    });

    var report = 'Accounts created: ' + created.length + (created.length ? '\n  ' + created.join('\n  ') : '') +
                 '\nSkipped: ' + skipped.length + (skipped.length ? '\n  ' + skipped.join('\n  ') : '');
    log_(report);
    try { SpreadsheetApp.getActiveSpreadsheet().toast('Created ' + created.length + ', skipped ' + skipped.length +
          ' — see Executions for details.', '3aash Ya Wa7sh', 10); } catch (e) { /* run from the editor */ }
    return report;
  } finally {
    lock.releaseLock();
  }
}

/** A throw-away participant (AYW-9999-0001) for testing every flow. */
function createTestParticipant() {
  deleteParticipant(TEST_PID);
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    initSecrets_();
    var clash = findUser_('username', TEST_USERNAME);
    if (clash) throw new Error(TEST_USERNAME + ' already belongs to ' + clash.participant_id + '.');

    var row = {};
    HEADERS.forEach(function (h) { row[h] = ''; });
    row.timestamp = new Date();
    row.participant_id = TEST_PID;
    row.name = 'حساب تجريبي — Test';
    row.whatsapp = '+20 ' + TEST_USERNAME.slice(3);
    row.city = 'Test';
    row.contact_pref = 'whatsapp';
    row.objectives = 'sport';
    row.new_sport = 'running'; row.new_sport_target = '5k'; row.experience = 'little';
    row.age = 30; row.is_minor = 'FALSE'; row.gender = 'male';
    row.weight_kg = 80; row.height_cm = 175; row.waist_cm = 90;
    row.bmi = round_(80 / (1.75 * 1.75), 1); row.waist_to_height = round_(90 / 175, 2);
    row.current_sports = 'walking'; row.days_per_week = 3; row.preferred_days = 'sat,mon,wed';
    row.hours_per_session = 60; row.time_of_day = 'morning'; row.facilities = 'road';
    PARQ_KEYS.forEach(function (k) { row[k] = k === 'parq_pregnant' ? '' : 'no'; });
    row.needs_medical_clearance = 'FALSE';
    row.consent_accuracy = 'TRUE'; row.consent_data = 'TRUE'; row.consent_media = 'FALSE';
    row.language_used = 'ar'; row.status = 'New'; row.submission_token = 'test-participant';
    appendRow_(getSheet_(SHEET_MAIN, HEADERS), HEADERS, row, NUMERIC_COLUMNS);

    createAccount_(TEST_PID, TEST_USERNAME, row.name);
    var msg = 'Test participant ' + TEST_PID + ' created. Username ' + TEST_USERNAME +
              ', password = the DEFAULT_PASSWORD script property.';
    log_(msg);
    try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, '3aash Ya Wa7sh', 10); } catch (e) { /* editor */ }
    return msg;
  } finally {
    lock.releaseLock();
  }
}

function deleteTestParticipant() { return deleteParticipant(TEST_PID); }

/** Menu version for deletion requests: asks for the ID, then asks again to confirm. */
function deleteParticipantFromMenu() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Delete a participant', 'Participant ID to delete everywhere (e.g. AYW-2026-0001):', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var pid = String(r.getResponseText() || '').trim().toUpperCase();
  var sure = ui.alert('Delete ' + pid + '?', 'This removes the person from every tab and cannot be undone.', ui.ButtonSet.YES_NO);
  if (sure !== ui.Button.YES) return;
  try { ui.alert(deleteParticipant(pid)); } catch (e) { ui.alert(String(e.message || e)); }
}

/**
 * Remove a person from every tab — for deletion requests under Law 151/2020.
 * Their account, sessions, reset links, program, logs, check-ins and auth log
 * lines all go. Cannot be undone.
 */
function deleteParticipant(pid) {
  pid = String(pid || '').trim().toUpperCase();
  if (!/^AYW-\d{4}-\d{4}$/.test(pid)) throw new Error('Not a participant ID: "' + pid + '"');

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var user = ss.getSheetByName(SHEET_USERS) ? findUser_('participant_id', pid) : null;

    /* Drop any cached sessions first, so a deleted person is signed out at once. */
    if (ss.getSheetByName(SHEET_SESSIONS)) {
      var keys = readRows_(SHEET_SESSIONS)
        .filter(function (r) { return String(r.participant_id) === pid; })
        .map(function (r) { return 'sess_' + r.token_hash; });
      if (keys.length) { try { CacheService.getScriptCache().removeAll(keys); } catch (e) { /* none cached */ } }
    }

    var isPid = function (v) { return String(v).trim().toUpperCase() === pid; };
    var removed = {};
    removed[SHEET_MAIN] = deleteRowsWhere_(ss.getSheetByName(SHEET_MAIN), HEADERS, 'participant_id', isPid);
    removed[SHEET_CHECKINS] = deleteRowsWhere_(ss.getSheetByName(SHEET_CHECKINS), CHECKIN_HEADERS, 'participant_id', isPid);
    [SHEET_USERS, SHEET_SESSIONS, SHEET_RESETS, SHEET_PLANS, SHEET_PLAN_SESSIONS, SHEET_LOGS].forEach(function (name) {
      removed[name] = deleteRowsWhere_(ss.getSheetByName(name), TABS[name].headers, 'participant_id', isPid);
    });
    if (user) {
      removed[SHEET_AUTHLOG] = deleteRowsWhere_(ss.getSheetByName(SHEET_AUTHLOG), TABS.AuthLog.headers, 'username',
        function (v) { return String(v) === String(user.username); });
    }
    tabCache_ = {};

    var parts = Object.keys(removed).filter(function (k) { return removed[k]; })
      .map(function (k) { return k + ' ' + removed[k]; });
    var msg = pid + ' deleted' + (parts.length ? ': ' + parts.join(', ') : ' (nothing found)') + '.';
    log_(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

/** How long one password hash takes here — the target is a login under 3 s. */
function benchmarkHashing() {
  initSecrets_();
  var t0 = Date.now();
  var rec = makePasswordRecord_('Benchmark#2026');
  var t1 = Date.now();
  var ok = checkPassword_('Benchmark#2026', rec);
  var t2 = Date.now();
  var msg = 'Hashing with ' + AUTH.PW_ITERATIONS + ' iterations: create ' + (t1 - t0) + ' ms, check ' +
            (t2 - t1) + ' ms (' + (ok ? 'match' : 'NO MATCH — something is wrong') + ').';
  log_(msg);
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, '3aash Ya Wa7sh', 15); } catch (e) { /* editor */ }
  return msg;
}
