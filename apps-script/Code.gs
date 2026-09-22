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
   ======================================================================== */
var COACH_EMAIL      = 'coach@example.com';  // where the "new submission" mail goes
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

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }

    /* --- spam gate 1: the honeypot. A person never sees that field. ------ */
    if (body.hp && String(body.hp).trim() !== '') {
      return json({ ok: false, error: 'spam' });
    }

    /* --- spam gate 2: nobody fills six steps in under MIN_SECONDS -------- */
    var elapsed = Number(body.elapsed_ms || 0);
    if (!(elapsed >= MIN_SECONDS * 1000)) {
      return json({ ok: false, error: 'too_fast' });
    }

    if (body.type === 'checkin') return handleCheckin(body);
    return handleIntake(body);

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
    if (already) return json({ ok: true, participant_id: already, duplicate: true });

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

    notifyCoach_(row, clearance, isMinor);

    return json({ ok: true, participant_id: id });

  } finally {
    lock.releaseLock();
  }
}


/* ===========================================================================
   WEEKLY CHECK-IN  (Phase 2)
   The participant proves who they are with ID + the WhatsApp number already on
   their intake row. Nothing is ever read back to the browser.
   ======================================================================== */
function handleCheckin(body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return json({ ok: false, error: 'busy' }); }

  try {
    var token = clean_(body.submission_token, 60);
    if (tokenSeen_(token, SHEET_CHECKINS)) return json({ ok: true, duplicate: true });

    var id = clean_(body.participant_id, 16).toUpperCase();
    if (!/^AYW-\d{4}-\d{4}$/.test(id)) return json({ ok: false, error: 'no_match' });

    var phone = coerce_(body.whatsapp, { type: 'phone' });
    if (!phone) return json({ ok: false, error: 'no_match' });

    var match = findParticipant_(id, phone);
    if (!match) return json({ ok: false, error: 'no_match' });

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
      participant_id: id,
      name: match.name,
      whatsapp: phone,
      weight_kg: weight,
      waist_cm: waist,
      sessions_done: sessions,
      best_effort: clean_(body.best_effort, 120),
      energy: energy,
      notes: clean_(body.notes, 500),
      language_used: coerce_(body.language_used, { type: 'enum', values: ['ar', 'en'] }),
      submission_token: token
    }, CHECKIN_NUMERIC);

    rememberToken_(token, id);
    return json({ ok: true });

  } finally {
    lock.releaseLock();
  }
}

/** Look up a participant by ID *and* phone. Returns null unless both match. */
function findParticipant_(id, phone) {
  var sheet = getSheet_(SHEET_MAIN, HEADERS);
  var last  = sheet.getLastRow();
  if (last < 2) return null;

  var idCol    = HEADERS.indexOf('participant_id') + 1;
  var phoneCol = HEADERS.indexOf('whatsapp') + 1;
  var nameCol  = HEADERS.indexOf('name') + 1;

  var values = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var wanted = digits_(phone);

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][idCol - 1]).toUpperCase() !== id) continue;
    if (digits_(String(values[i][phoneCol - 1])) !== wanted) continue;
    return { row: i + 2, name: String(values[i][nameCol - 1]) };
  }
  return null;
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
function notifyCoach_(row, clearance, isMinor) {
  if (!SEND_EMAIL || !COACH_EMAIL || COACH_EMAIL === 'coach@example.com') return;
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
      to: COACH_EMAIL,
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
      /* "+20 1012345678" → kept as text, digits only after the country code. */
      var m = /^(\+\d{1,4})\s*(\d{6,14})$/.exec(clean_(s, 24));
      if (!m) return '';
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
    return String(v);
  });
  sheet.appendRow(values);
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

  buildDashboard_();

  /* Tidy up the default "Sheet1" if it is still there and empty. */
  var stray = ss.getSheetByName('Sheet1');
  if (stray && stray.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(stray);

  SpreadsheetApp.getActiveSpreadsheet().toast('Set-up finished. You can deploy the Web App now.', '3aash Ya Wa7sh', 8);
}

/** A menu so the coach never has to open the script editor again. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('عاش يا وحش')
    .addItem('Set up / repair this sheet', 'setup')
    .addItem('Rebuild the dashboard', 'buildDashboard_')
    .addItem('Send me a test email', 'sendTestEmail')
    .addToUi();
}

function sendTestEmail() {
  MailApp.sendEmail(COACH_EMAIL, 'عاش يا وحش — test', 'If you are reading this, notifications work.');
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
  sh.getRange('A1:B1').setBackground('#FF5A1F').setFontColor('#14100D');

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
    .setOption('colors', ['#FF5A1F', '#0F7B60'])
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
