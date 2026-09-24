/* =============================================================================
   app.js — the six-step intake form.
   -----------------------------------------------------------------------------
   HOW THIS FILE IS ORGANISED
     1. Option lists and country codes
     2. SCHEMA — every question on the form, in order. This is the single
        source of truth: the form, the validation, the review screen and the
        data that gets sent are all built from it. Add a question here and it
        appears everywhere automatically.
     3. State and draft saving
     4. Rendering
     5. Conditional visibility
     6. Validation
     7. Navigation + progress
     8. Review screen
     9. Submitting
    10. Start-up

   The words themselves are NOT here — they are in i18n.js, looked up by key.
   ========================================================================== */

(function () {
  'use strict';

  var A = window.AYW;
  var el = A.el, t = A.t, $ = A.$, $$ = A.$$;

  /* ===========================================================================
     1. OPTION LISTS
     Each list is an array of codes. The visible label for a code lives in
     i18n.js under 'opt.<list>.<code>'.
     ======================================================================== */
  var OPTS = {
    contact_pref   : ['whatsapp', 'phone', 'email'],
    objectives     : ['weight', 'sport', 'time', 'community'],
    timeframe      : ['1', '3', '6', '12'],
    sport          : ['walking', 'running', 'swimming', 'cycling', 'triathlon', 'strength', 'other'],
    target_walking : ['5k', '10k', 'other'],
    target_running : ['5k', '10k', '21k', '42k', 'other'],
    target_swimming: ['30min', '1k', '3k', 'other'],
    experience     : ['never', 'little', 'stopped'],
    community      : ['partners', 'group', 'motivation', 'networking', 'other'],
    gender         : ['male', 'female'],
    current_sports : ['walking', 'running', 'swimming', 'cycling', 'gym', 'football', 'padel', 'other'],
    duration       : ['30', '45', '60', '90', '120'],
    days           : ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'],
    time_of_day    : ['early', 'morning', 'afternoon', 'evening', 'late'],
    facilities     : ['pool', 'gym', 'track', 'bike', 'road', 'none'],
    week_days      : ['1', '2', '3', '4', '5', '6', '7']
  };

  /* Sports whose target is a fixed list; everything else gets a free-text target. */
  var LISTED_TARGETS = { walking: 'target_walking', running: 'target_running', swimming: 'target_swimming' };

  /* Country dialling codes. Egypt first, then the GCC and the rest.
     Add a country by copying a line. */
  var COUNTRIES = [
    { code: '+20',  ar: 'مصر',        en: 'Egypt' },
    { code: '+966', ar: 'السعودية',   en: 'Saudi Arabia' },
    { code: '+971', ar: 'الإمارات',   en: 'UAE' },
    { code: '+965', ar: 'الكويت',     en: 'Kuwait' },
    { code: '+974', ar: 'قطر',        en: 'Qatar' },
    { code: '+973', ar: 'البحرين',    en: 'Bahrain' },
    { code: '+968', ar: 'عُمان',       en: 'Oman' },
    { code: '+962', ar: 'الأردن',     en: 'Jordan' },
    { code: '+961', ar: 'لبنان',      en: 'Lebanon' },
    { code: '+963', ar: 'سوريا',      en: 'Syria' },
    { code: '+964', ar: 'العراق',     en: 'Iraq' },
    { code: '+249', ar: 'السودان',    en: 'Sudan' },
    { code: '+218', ar: 'ليبيا',      en: 'Libya' },
    { code: '+216', ar: 'تونس',       en: 'Tunisia' },
    { code: '+213', ar: 'الجزائر',    en: 'Algeria' },
    { code: '+212', ar: 'المغرب',     en: 'Morocco' },
    { code: '+44',  ar: 'بريطانيا',   en: 'United Kingdom' },
    { code: '+1',   ar: 'أمريكا/كندا', en: 'USA/Canada' },
    { code: '+49',  ar: 'ألمانيا',    en: 'Germany' },
    { code: '+33',  ar: 'فرنسا',      en: 'France' },
    { code: '+39',  ar: 'إيطاليا',    en: 'Italy' },
    { code: '+34',  ar: 'إسبانيا',    en: 'Spain' },
    { code: '+31',  ar: 'هولندا',     en: 'Netherlands' },
    { code: '+90',  ar: 'تركيا',      en: 'Turkey' }
  ];

  /* Simple geometric icons for the four objective cards — no photos, no clichés. */
  var ICONS = {
    weight: '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M5 13l12 13 8-7 18 18"/><path d="M43 27v10H33"/></svg>',
    sport: '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M12 42V8"/><path d="M12 10h22l-5 7 5 7H12"/></svg>',
    time: '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="24" cy="27" r="15"/><path d="M24 27v-8"/><path d="M24 27l7 5"/><path d="M19 6h10"/></svg>',
    community: '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><circle cx="14" cy="16" r="6"/><circle cx="34" cy="16" r="6"/><path d="M4 40c0-6 4-10 10-10s10 4 10 10"/><path d="M24 40c0-6 4-10 10-10s10 4 10 10"/></svg>'
  };

  /* ===========================================================================
     2. SCHEMA — every question, in order.
     ---------------------------------------------------------------------------
     Field properties:
       name      unique key; becomes the column name in the sheet
       type      text | email | textarea | num | phone | date | time3
                 radio | checks | cards | yesno | bool | activity | block | note
       label     i18n key for the label
       hint      i18n key for the small grey helper line (optional)
       ph        i18n key for the placeholder (optional)
       required  true, or a function of the answers so far
       when      function of the answers; the field only shows when it returns true
       opts      name of a list in OPTS (or a function returning one)
       min/max   for numbers
       dec       true if decimals are allowed
       maxLength for text
     ======================================================================== */
  var SCHEMA = [
    /* ---- STEP 1 : contact ------------------------------------------------ */
    { step: 1, fields: [
      { name: 'name',    type: 'text',  label: 'f.name.label', ph: 'f.name.ph', required: true,
        maxLength: 80, autocomplete: 'name' },
      { name: 'whatsapp', type: 'phone', label: 'f.whatsapp.label', hint: 'f.whatsapp.hint',
        ph: 'f.whatsapp.ph', required: true, autocomplete: 'tel-national' },
      { name: 'email',   type: 'email', label: 'f.email.label', ph: 'f.email.ph',
        maxLength: 120, autocomplete: 'email' },
      { name: 'city',    type: 'text',  label: 'f.city.label', ph: 'f.city.ph',
        maxLength: 60, autocomplete: 'address-level2' },
      { name: 'contact_pref', type: 'radio', label: 'f.contact_pref.label', opts: 'contact_pref',
        required: true, def: 'whatsapp' }
    ]},

    /* ---- STEP 2 : objective ---------------------------------------------- */
    { step: 2, fields: [
      { name: 'objectives', type: 'cards', label: 'f.objectives.label', hint: 'f.objectives.hint',
        opts: 'objectives', required: true },

      /* A) lose weight */
      { type: 'block', key: 'weight', icon: 'weight', titleKey: 'opt.objectives.weight',
        when: function (d) { return has(d.objectives, 'weight'); }, fields: [
        { name: 'target_weight', type: 'num', label: 'f.target_weight.label', hint: 'f.target_weight.hint',
          min: 30, max: 250, dec: true },
        { name: 'timeframe', type: 'radio', label: 'f.timeframe.label', opts: 'timeframe', required: true }
      ]},

      /* B) start a new sport */
      { type: 'block', key: 'sport', icon: 'sport', titleKey: 'opt.objectives.sport',
        when: function (d) { return has(d.objectives, 'sport'); }, fields: [
        { name: 'new_sport', type: 'radio', label: 'f.new_sport.label', opts: 'sport', required: true },
        { name: 'new_sport_other', type: 'text', label: 'f.new_sport_other.label', ph: 'common.other_ph',
          maxLength: 60, required: true,
          when: function (d) { return d.new_sport === 'other'; } },
        { name: 'new_sport_target', type: 'radio', label: 'f.new_sport_target.label', required: true,
          opts: function (d) { return LISTED_TARGETS[d.new_sport] || null; },
          when: function (d) { return !!LISTED_TARGETS[d.new_sport]; } },
        { name: 'new_sport_target_other', type: 'text', label: 'f.new_sport_target_other.label',
          ph: 'common.other_ph', maxLength: 80, required: true,
          when: function (d) {
            if (!d.new_sport) return false;
            if (!LISTED_TARGETS[d.new_sport]) return true;          // cycling, triathlon, strength, other
            return d.new_sport_target === 'other';
          } },
        { name: 'experience', type: 'radio', label: 'f.experience.label', opts: 'experience', required: true }
      ]},

      /* C) improve a race time */
      { type: 'block', key: 'time', icon: 'time', titleKey: 'opt.objectives.time',
        when: function (d) { return has(d.objectives, 'time'); }, fields: [
        { name: 'race_sport', type: 'radio', label: 'f.race_sport.label', opts: 'sport', required: true },
        { name: 'race_sport_other', type: 'text', label: 'f.race_sport_other.label', ph: 'common.other_ph',
          maxLength: 60, required: true,
          when: function (d) { return d.race_sport === 'other'; } },
        { name: 'race_distance', type: 'radio', label: 'f.race_distance.label', required: true,
          opts: function (d) { return LISTED_TARGETS[d.race_sport] || null; },
          when: function (d) { return !!LISTED_TARGETS[d.race_sport]; } },
        { name: 'race_distance_other', type: 'text', label: 'f.race_distance_other.label',
          ph: 'common.other_ph', maxLength: 80, required: true,
          when: function (d) {
            if (!d.race_sport) return false;
            if (!LISTED_TARGETS[d.race_sport]) return true;
            return d.race_distance === 'other';
          } },
        { name: 'current_time', type: 'time3', label: 'f.current_time.label', hint: 'f.current_time.hint',
          required: true },
        { name: 'target_time',  type: 'time3', label: 'f.target_time.label',  hint: 'f.target_time.hint',
          required: true },
        { name: 'race_name', type: 'text', label: 'f.race_name.label', ph: 'f.race_name.ph', maxLength: 80 },
        { name: 'race_date', type: 'date', label: 'f.race_date.label' }
      ]},

      /* D) connection / community */
      { type: 'block', key: 'community', icon: 'community', titleKey: 'opt.objectives.community',
        when: function (d) { return has(d.objectives, 'community'); }, fields: [
        { name: 'community_needs', type: 'checks', label: 'f.community_needs.label',
          opts: 'community', required: true },
        { name: 'community_other', type: 'text', label: 'f.community_other.label', ph: 'common.other_ph',
          maxLength: 80, required: true,
          when: function (d) { return has(d.community_needs, 'other'); } }
      ]},

      { name: 'why_now', type: 'textarea', label: 'f.why_now.label', hint: 'f.why_now.hint',
        ph: 'f.why_now.ph', maxLength: 500 }
    ]},

    /* ---- STEP 3 : body data ---------------------------------------------- */
    { step: 3, fields: [
      { name: 'age', type: 'num', label: 'f.age.label', hint: 'f.age.hint',
        min: 12, max: 90, required: true },

      { type: 'block', key: 'guardian', variant: 'warn', titleKey: 'f.guardian.title',
        bodyKey: 'f.guardian.body',
        when: function (d) { var a = parseFloat(d.age); return a >= 12 && a < 18; }, fields: [
        { name: 'guardian_name',  type: 'text',  label: 'f.guardian_name.label', maxLength: 80, required: true },
        { name: 'guardian_phone', type: 'phone', label: 'f.guardian_phone.label', required: true },
        { name: 'guardian_consent', type: 'bool', label: 'f.guardian_consent.label', required: true }
      ]},

      { name: 'gender',    type: 'radio', label: 'f.gender.label', hint: 'f.gender.hint',
        opts: 'gender', required: true },
      { name: 'weight_kg', type: 'num', label: 'f.weight_kg.label', min: 30,  max: 250, dec: true, required: true },
      { name: 'height_cm', type: 'num', label: 'f.height_cm.label', min: 120, max: 220, required: true },
      { name: 'waist_cm',  type: 'num', label: 'f.waist_cm.label',  min: 50,  max: 200, dec: true, required: true,
        tip: 'waist' },
      { type: 'note', textKey: 'f.body.note' }
    ]},

    /* ---- STEP 4 : current activity --------------------------------------- */
    { step: 4, fields: [
      { name: 'no_sports', type: 'bool', label: 'f.no_sports.label' },
      { name: 'current_sports', type: 'checks', label: 'f.current_sports.label',
        hint: 'f.current_sports.hint', opts: 'current_sports', required: true,
        when: function (d) { return !d.no_sports; } },
      { name: 'current_sports_other', type: 'text', label: 'f.current_sports_other.label',
        ph: 'common.other_ph', maxLength: 60, required: true,
        when: function (d) { return !d.no_sports && has(d.current_sports, 'other'); } },
      { name: 'activity_details', type: 'activity', label: 'f.activity.title',
        when: function (d) { return !d.no_sports && (d.current_sports || []).length > 0; } },
      { name: 'recent_results', type: 'textarea', label: 'f.recent_results.label',
        hint: 'f.recent_results.hint', ph: 'f.recent_results.ph', maxLength: 300 }
    ]},

    /* ---- STEP 5 : availability ------------------------------------------- */
    { step: 5, fields: [
      { name: 'days_per_week', type: 'radio', label: 'f.days_per_week.label', opts: 'week_days',
        plain: true, required: true },
      { name: 'preferred_days', type: 'checks', label: 'f.preferred_days.label',
        hint: 'f.preferred_days.hint', opts: 'days', required: true },
      { name: 'hours_per_session', type: 'radio', label: 'f.hours_per_session.label',
        opts: 'duration', required: true },
      { name: 'time_of_day', type: 'radio', label: 'f.time_of_day.label', opts: 'time_of_day', required: true },
      { name: 'facilities', type: 'checks', label: 'f.facilities.label', hint: 'f.facilities.hint',
        opts: 'facilities', required: true }
    ]},

    /* ---- STEP 6 : health + consent --------------------------------------- */
    { step: 6, fields: [
      { type: 'note', textKey: 'parq.intro' },
      { name: 'parq_heart',      type: 'yesno', label: 'parq.heart',      required: true },
      { name: 'parq_chest',      type: 'yesno', label: 'parq.chest',      required: true },
      { name: 'parq_balance',    type: 'yesno', label: 'parq.balance',    required: true },
      { name: 'parq_chronic',    type: 'yesno', label: 'parq.chronic',    required: true },
      { name: 'parq_meds',       type: 'yesno', label: 'parq.meds',       required: true },
      { name: 'parq_bone',       type: 'yesno', label: 'parq.bone',       required: true },
      { name: 'parq_supervised', type: 'yesno', label: 'parq.supervised', required: true },
      { name: 'parq_pregnant',   type: 'yesno', label: 'parq.pregnant',   required: true,
        when: function (d) { return d.gender === 'female'; } },

      { type: 'clearance' },

      { name: 'injuries_notes', type: 'textarea', label: 'f.injuries_notes.label',
        hint: 'f.injuries_notes.hint', ph: 'f.injuries_notes.ph', maxLength: 500 },

      { type: 'block', key: 'consent', titleKey: 'consent.title', fields: [
        { name: 'consent_accuracy', type: 'bool', label: 'consent.accuracy', required: true },
        { name: 'consent_data',     type: 'bool', label: 'consent.data',     required: true },
        { name: 'consent_media',    type: 'bool', label: 'consent.media',    hint: 'consent.media.hint' }
      ]}
    ]}
  ];

  var TOTAL_STEPS = 6;
  var REVIEW_STEP = 7;

  /* The seven PAR-Q answers that trigger the medical-clearance flag. */
  var PARQ = ['parq_heart', 'parq_chest', 'parq_balance', 'parq_chronic',
              'parq_meds', 'parq_bone', 'parq_supervised', 'parq_pregnant'];

  function has(arr, v) { return Array.isArray(arr) && arr.indexOf(v) !== -1; }

  /* Walk every field in the schema, including the ones nested inside blocks. */
  function eachField(fn) {
    SCHEMA.forEach(function (stepDef) {
      stepDef.fields.forEach(function (f) {
        if (f.type === 'block') {
          fn(f, stepDef.step, null);
          f.fields.forEach(function (c) { fn(c, stepDef.step, f); });
        } else {
          fn(f, stepDef.step, null);
        }
      });
    });
  }

  /* ===========================================================================
     3. STATE + DRAFT SAVING
     ======================================================================== */
  var state = {
    step: 1,
    data: {},
    startedAt: Date.now(),
    token: A.uuid(),
    submitting: false
  };

  var saveTimer = null;
  function saveDraft() {
    if (!A.cfg.saveDraft) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      A.store.set(A.cfg.storageKey, JSON.stringify({
        v: 1, step: state.step, data: state.data, token: state.token, at: Date.now()
      }));
    }, 300);
  }

  function loadDraft() {
    if (!A.cfg.saveDraft) return false;
    var raw = A.store.get(A.cfg.storageKey);
    if (!raw) return false;
    try {
      var d = JSON.parse(raw);
      if (!d || d.v !== 1 || !d.data) return false;
      state.data  = d.data;
      state.step  = Math.min(Math.max(1, d.step || 1), REVIEW_STEP);
      state.token = d.token || state.token;
      return true;
    } catch (e) { return false; }
  }

  function clearDraft() { A.store.remove(A.cfg.storageKey); }

  /* ===========================================================================
     4. RENDERING
     Every field is rendered once. Conditional fields are rendered too and then
     simply hidden — that way typing in one box never re-draws (and never steals
     focus from) another.
     ======================================================================== */
  var nodes = {};      // field name -> { wrap, control(s), err }
  var blocks = [];     // { def, wrap }

  function fieldWrap(f, inner, opts) {
    opts = opts || {};
    var id  = 'f-' + f.name;
    var hid = 'h-' + f.name;
    var eid = 'e-' + f.name;
    var describedBy = (f.hint ? hid + ' ' : '') + eid;

    var labelNode = opts.group
      ? el('legend', { class: 'field__label' }, [
          el('span', { 'data-i18n': f.label }),
          f.required ? el('span', { class: 'req', 'aria-hidden': 'true', text: '*' }) : null
        ])
      : el('label', { class: 'field__label', for: id }, [
          el('span', { 'data-i18n': f.label }),
          f.required ? el('span', { class: 'req', 'aria-hidden': 'true', text: '*' }) : null
        ]);

    var kids = [labelNode];
    if (f.hint) kids.push(el('p', { class: 'field__hint', id: hid, 'data-i18n': f.hint }));
    if (f.tip === 'waist') kids.push(waistTip());
    kids.push(inner);
    kids.push(el('p', { class: 'field__err', id: eid, role: 'alert' }));

    var wrap = opts.group
      ? el('fieldset', { class: 'field field--group', 'data-field': f.name, 'aria-describedby': describedBy }, kids)
      : el('div', { class: 'field', 'data-field': f.name }, kids);

    return { wrap: wrap, describedBy: describedBy, id: id, eid: eid };
  }

  /* The "how do I measure my waist" disclosure, with a small drawing. */
  function waistTip() {
    var panel = el('div', { class: 'tip__panel', hidden: true }, [
      el('div', { class: 'tip__art', html:
        '<svg viewBox="0 0 120 120" role="img" aria-hidden="true" focusable="false">' +
        '<path class="body" d="M42 12c0-5 6-8 18-8s18 3 18 8c0 8-4 12-4 20 0 6 6 10 6 20v14c0 14-3 22-3 34 0 8 1 14 1 14H44s1-6 1-14c0-12-3-20-3-34V52c0-10 6-14 6-20 0-8-4-12-4-20z"/>' +
        '<path class="tape" d="M32 62c0 5 12 9 28 9s28-4 28-9"/>' +
        '<path class="tape" d="M32 62c0-5 12-9 28-9s28 4 28 9"/>' +
        '<circle class="navel" cx="60" cy="62" r="2.5"/>' +
        '</svg>' }),
      el('p', { 'data-i18n': 'f.waist_cm.tip' })
    ]);
    var btn = el('button', {
      type: 'button', class: 'tip__btn', 'aria-expanded': 'false',
      'data-i18n': 'f.waist_cm.tipOpen',
      on: { click: function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        panel.hidden = open;
      } }
    });
    return el('div', { class: 'tip' }, [btn, panel]);
  }

  function optionList(f, data) {
    var list = typeof f.opts === 'function' ? f.opts(data || state.data) : f.opts;
    return { key: list, values: (list && OPTS[list]) || [] };
  }

  function optLabel(listKey, value, plain) {
    return plain ? value : t('opt.' + listKey + '.' + value);
  }

  /** Register the control(s) for a field and wire up change handling. */
  function bind(f, controls, onRead) {
    nodes[f.name] = nodes[f.name] || {};
    nodes[f.name].controls = controls;
    nodes[f.name].read = onRead;
    controls.forEach(function (c) {
      var ev = (c.tagName === 'INPUT' &&
                (c.type === 'checkbox' || c.type === 'radio' || c.type === 'date')) ||
               c.tagName === 'SELECT' ? 'change' : 'input';
      c.addEventListener(ev, function () {
        state.data[f.name] = onRead();
        saveDraft();
        updateVisibility();
        if (nodes[f.name].touched) validateField(f);   // only nag after a first attempt
      });
      c.addEventListener('blur', function () {
        nodes[f.name].touched = true;
        validateField(f);
      }, true);
    });
  }

  function renderField(f, parentWrapList) {
    var out = null;

    /* ---- plain note ---------------------------------------------------- */
    if (f.type === 'note') {
      out = el('p', { class: 'note', 'data-i18n': f.textKey });
      parentWrapList.push(out);
      return;
    }

    /* ---- the medical-clearance message (appears when any PAR-Q is yes) -- */
    if (f.type === 'clearance') {
      var box = el('div', {
        class: 'callout callout--care', id: 'clearance-box', hidden: true,
        role: 'status', 'aria-live': 'polite'
      }, [
        el('h3', { 'data-i18n': 'clearance.title' }),
        el('p', { 'data-i18n': 'clearance.body' })
      ]);
      nodes.__clearance = { wrap: box };
      parentWrapList.push(box);
      return;
    }

    /* ---- a group of related fields inside a card ----------------------- */
    if (f.type === 'block') {
      var kids = [];
      if (f.titleKey) {
        kids.push(el('h3', { class: 'block__title' }, [
          f.icon ? el('span', { class: 'block__icon', 'aria-hidden': 'true', html: ICONS[f.icon] }) : null,
          el('span', { 'data-i18n': f.titleKey })
        ]));
      }
      if (f.bodyKey) kids.push(el('p', { class: 'block__body', 'data-i18n': f.bodyKey }));
      f.fields.forEach(function (c) { renderField(c, kids); });
      var bw = el('div', { class: 'block' + (f.variant === 'warn' ? ' block--warn' : ''),
                           'data-block': f.key }, kids);
      blocks.push({ def: f, wrap: bw });
      parentWrapList.push(bw);
      return;
    }

    /* ---- text / email / number ----------------------------------------- */
    if (f.type === 'text' || f.type === 'email' || f.type === 'num' || f.type === 'date') {
      var input = el('input', {
        id: 'f-' + f.name,
        name: f.name,
        class: 'input',
        type: f.type === 'date' ? 'date' : (f.type === 'email' ? 'email' : 'text'),
        inputmode: f.type === 'num' ? (f.dec ? 'decimal' : 'numeric') : (f.type === 'email' ? 'email' : null),
        maxlength: f.maxLength || null,
        autocomplete: f.autocomplete || 'off',
        'aria-invalid': 'false'
      });
      if (f.ph) input.setAttribute('data-i18n-ph', f.ph);
      out = fieldWrap(f, input);
      input.setAttribute('aria-describedby', out.describedBy);
      bind(f, [input], function () { return input.value.trim(); });
      nodes[f.name].set = function (v) { input.value = v == null ? '' : v; };

      parentWrapList.push(out.wrap);
      return;
    }

    /* ---- textarea ------------------------------------------------------- */
    if (f.type === 'textarea') {
      var ta = el('textarea', {
        id: 'f-' + f.name, name: f.name, class: 'input input--area', rows: '4',
        maxlength: f.maxLength || null, 'aria-invalid': 'false'
      });
      if (f.ph) ta.setAttribute('data-i18n-ph', f.ph);
      out = fieldWrap(f, ta);
      ta.setAttribute('aria-describedby', out.describedBy);
      bind(f, [ta], function () { return ta.value.trim(); });
      nodes[f.name].set = function (v) { ta.value = v == null ? '' : v; };
      addCounter(f, ta, out.wrap);
      parentWrapList.push(out.wrap);
      return;
    }

    /* ---- phone: country code + national number -------------------------- */
    if (f.type === 'phone') {
      var sel = el('select', { class: 'input input--code', id: 'f-' + f.name + '-code',
                               'data-i18n-aria': 'f.whatsapp.country' });
      COUNTRIES.forEach(function (c) {
        /* U+200E (left-to-right mark) stops an RTL page from showing "+20" as "20+". */
        sel.appendChild(el('option', { value: c.code, 'data-country': c.code }, '\u200E' + c.code));
      });
      var num = el('input', {
        id: 'f-' + f.name, name: f.name, class: 'input input--tel', type: 'tel',
        inputmode: 'tel', maxlength: '15', autocomplete: f.autocomplete || 'tel-national',
        'aria-invalid': 'false'
      });
      num.setAttribute('data-i18n-ph', 'f.whatsapp.ph');
      var row = el('div', { class: 'phone' }, [sel, num]);
      out = fieldWrap(f, row);
      num.setAttribute('aria-describedby', out.describedBy);
      sel.setAttribute('aria-describedby', out.describedBy);

      bind(f, [sel, num], function () {
        var digits = num.value.replace(/[^\d]/g, '').replace(/^0+/, '');
        return digits ? sel.value + ' ' + digits : '';
      });
      nodes[f.name].code = function () { return sel.value; };
      nodes[f.name].raw  = function () { return num.value.replace(/[^\d]/g, '').replace(/^0+/, ''); };
      nodes[f.name].set  = function (v) {
        if (!v) { sel.value = '+20'; num.value = ''; return; }
        var parts = String(v).split(' ');
        sel.value = parts[0] || '+20';
        num.value = parts.slice(1).join('') || '';
      };
      nodes[f.name].label = function () { return sel; };
      parentWrapList.push(out.wrap);
      return;
    }

    /* ---- hh:mm:ss ------------------------------------------------------- */
    if (f.type === 'time3') {
      var parts = ['h', 'm', 's'].map(function (p) {
        var inp = el('input', {
          id: 'f-' + f.name + '-' + p, class: 'input input--time', type: 'text',
          inputmode: 'numeric', maxlength: p === 'h' ? '2' : '2',
          'data-i18n-aria': 'common.' + (p === 'h' ? 'hours' : p === 'm' ? 'minutes' : 'seconds'),
          placeholder: p === 'h' ? 'hh' : (p === 'm' ? 'mm' : 'ss'),
          'aria-invalid': 'false'
        });
        return inp;
      });
      var timeRow = el('div', { class: 'time3' }, [
        el('span', { class: 'time3__unit' }, [parts[0], el('small', { 'data-i18n': 'common.hours' })]),
        el('span', { class: 'time3__sep', 'aria-hidden': 'true', text: ':' }),
        el('span', { class: 'time3__unit' }, [parts[1], el('small', { 'data-i18n': 'common.minutes' })]),
        el('span', { class: 'time3__sep', 'aria-hidden': 'true', text: ':' }),
        el('span', { class: 'time3__unit' }, [parts[2], el('small', { 'data-i18n': 'common.seconds' })])
      ]);
      /* The visible <label> points at the hours box. */
      out = fieldWrap(f, timeRow);
      out.wrap.querySelector('label').setAttribute('for', 'f-' + f.name + '-h');
      parts.forEach(function (p) { p.setAttribute('aria-describedby', out.describedBy); });

      bind(f, parts, function () {
        var h = parts[0].value.replace(/\D/g, ''),
            m = parts[1].value.replace(/\D/g, ''),
            s = parts[2].value.replace(/\D/g, '');
        if (!h && !m && !s) return '';
        return pad(h) + ':' + pad(m) + ':' + pad(s);
      });
      nodes[f.name].set = function (v) {
        var bits = String(v || '').split(':');
        parts[0].value = bits[0] || '';
        parts[1].value = bits[1] || '';
        parts[2].value = bits[2] || '';
      };
      parentWrapList.push(out.wrap);
      return;
    }

    /* ---- single checkbox ------------------------------------------------ */
    if (f.type === 'bool') {
      var cb = el('input', { type: 'checkbox', id: 'f-' + f.name, name: f.name,
                             class: 'check__input', 'aria-invalid': 'false' });
      var lab = el('label', { class: 'check', for: 'f-' + f.name }, [
        cb,
        el('span', { class: 'check__box', 'aria-hidden': 'true' }),
        el('span', { class: 'check__text' }, [
          el('span', { 'data-i18n': f.label }),
          f.required ? el('span', { class: 'req', 'aria-hidden': 'true', text: '*' }) : null
        ])
      ]);
      var eid2 = 'e-' + f.name;
      var kids2 = [lab];
      if (f.hint) kids2.push(el('p', { class: 'field__hint', id: 'h-' + f.name, 'data-i18n': f.hint }));
      kids2.push(el('p', { class: 'field__err', id: eid2, role: 'alert' }));
      cb.setAttribute('aria-describedby', (f.hint ? 'h-' + f.name + ' ' : '') + eid2);
      var boolWrap = el('div', { class: 'field field--check', 'data-field': f.name }, kids2);
      bind(f, [cb], function () { return cb.checked; });
      nodes[f.name].set = function (v) { cb.checked = !!v; };
      parentWrapList.push(boolWrap);
      return;
    }

    /* ---- yes / no ------------------------------------------------------- */
    if (f.type === 'yesno') {
      var ynInputs = ['yes', 'no'].map(function (v) {
        return el('input', { type: 'radio', name: f.name, id: 'f-' + f.name + '-' + v,
                             value: v, class: 'seg__input' });
      });
      var seg = el('div', { class: 'seg' }, [
        ynInputs[0], el('label', { class: 'seg__btn', for: 'f-' + f.name + '-yes', 'data-i18n': 'common.yes' }),
        ynInputs[1], el('label', { class: 'seg__btn', for: 'f-' + f.name + '-no',  'data-i18n': 'common.no'  })
      ]);
      out = fieldWrap(f, seg, { group: true });
      out.wrap.classList.add('field--yesno');
      bind(f, ynInputs, function () {
        var picked = ynInputs.filter(function (i) { return i.checked; })[0];
        return picked ? picked.value : '';
      });
      nodes[f.name].set = function (v) {
        ynInputs.forEach(function (i) { i.checked = (i.value === v); });
      };
      parentWrapList.push(out.wrap);
      return;
    }

    /* ---- chips: radio (one) or checks (many) ---------------------------- */
    if (f.type === 'radio' || f.type === 'checks') {
      var box = el('div', { class: 'chips' });
      out = fieldWrap(f, box, { group: true });
      nodes[f.name] = nodes[f.name] || {};
      nodes[f.name].renderChips = function () {
        var list = optionList(f);
        box.innerHTML = '';
        if (!list.key) return;
        list.values.forEach(function (v) {
          var id = 'f-' + f.name + '-' + v;
          var inp = el('input', {
            type: f.type === 'radio' ? 'radio' : 'checkbox',
            name: f.name, id: id, value: v, class: 'chip__input'
          });
          box.appendChild(inp);
          box.appendChild(el('label', { class: 'chip', for: id },
            optLabel(list.key, v, f.plain)));
        });
        var inputs = $$('input', box);
        bind(f, inputs, function () {
          if (f.type === 'radio') {
            var p = inputs.filter(function (i) { return i.checked; })[0];
            return p ? p.value : '';
          }
          return inputs.filter(function (i) { return i.checked; }).map(function (i) { return i.value; });
        });
        applyValue(f);
      };
      nodes[f.name].set = function (v) {
        $$('input', box).forEach(function (i) {
          i.checked = f.type === 'radio' ? (i.value === v) : has(v, i.value);
        });
      };
      parentWrapList.push(out.wrap);
      return;
    }

    /* ---- the four big objective cards ----------------------------------- */
    if (f.type === 'cards') {
      var grid = el('div', { class: 'cards' });
      optionList(f).values.forEach(function (v) {
        var id = 'f-' + f.name + '-' + v;
        var inp = el('input', { type: 'checkbox', name: f.name, id: id, value: v, class: 'card__input' });
        grid.appendChild(inp);
        grid.appendChild(el('label', { class: 'card', for: id }, [
          el('span', { class: 'card__icon', 'aria-hidden': 'true', html: ICONS[v] }),
          el('span', { class: 'card__title', 'data-i18n': 'opt.objectives.' + v }),
          el('span', { class: 'card__desc',  'data-i18n': 'opt.objectives.' + v + '.d' }),
          el('span', { class: 'card__tick', 'aria-hidden': 'true' })
        ]));
      });
      out = fieldWrap(f, grid, { group: true });
      var cardInputs = $$('input', grid);
      bind(f, cardInputs, function () {
        return cardInputs.filter(function (i) { return i.checked; }).map(function (i) { return i.value; });
      });
      nodes[f.name].set = function (v) {
        cardInputs.forEach(function (i) { i.checked = has(v, i.value); });
      };
      parentWrapList.push(out.wrap);
      return;
    }

    /* ---- per-sport detail rows (sessions/week + session length) --------- */
    if (f.type === 'activity') {
      var rows = el('div', { class: 'activity' });
      out = fieldWrap(f, rows, { group: true });
      nodes[f.name] = nodes[f.name] || {};
      nodes[f.name].renderRows = function () {
        var sports = state.data.current_sports || [];
        var current = state.data.activity_map || {};
        rows.innerHTML = '';
        sports.forEach(function (sp) {
          var sId = 'act-' + sp + '-s', dId = 'act-' + sp + '-d';
          var sSel = el('select', { class: 'input input--mini', id: sId });
          OPTS.week_days.forEach(function (n) { sSel.appendChild(el('option', { value: n }, n)); });
          var dSel = el('select', { class: 'input input--mini', id: dId });
          OPTS.duration.forEach(function (d) {
            dSel.appendChild(el('option', { value: d }, t('opt.duration.' + d)));
          });
          var saved = current[sp] || {};
          sSel.value = saved.s || '3';
          dSel.value = saved.d || '60';

          function push() {
            var map = state.data.activity_map || {};
            map[sp] = { s: sSel.value, d: dSel.value };
            state.data.activity_map = map;
            state.data.activity_details = serialiseActivity();
            saveDraft();
          }
          sSel.addEventListener('change', push);
          dSel.addEventListener('change', push);
          push();

          rows.appendChild(el('div', { class: 'activity__row' }, [
            el('span', { class: 'activity__name',
                         text: t('opt.current_sports.' + sp) }),
            el('span', { class: 'activity__ctrl' }, [
              el('label', { class: 'activity__lbl', for: sId, 'data-i18n': 'f.activity.sessions' }), sSel
            ]),
            el('span', { class: 'activity__ctrl' }, [
              el('label', { class: 'activity__lbl', for: dId, 'data-i18n': 'f.activity.duration' }), dSel
            ])
          ]));
        });
        A.applyI18n(rows);
      };
      parentWrapList.push(out.wrap);
      return;
    }
  }

  function serialiseActivity() {
    var map = state.data.activity_map || {};
    return (state.data.current_sports || []).map(function (sp) {
      var v = map[sp] || { s: '3', d: '60' };
      return sp + '=' + v.s + 'x/week,' + v.d + 'min';
    }).join('; ');
  }

  function pad(n) { n = String(n || '0'); return n.length < 2 ? '0' + n : n; }

  /** Small "N characters left" counter under long text fields. */
  function addCounter(f, input, wrap) {
    if (!f.maxLength) return;
    var c = el('p', { class: 'counter', 'aria-hidden': 'true' });
    function upd() { c.textContent = t('common.chars_left', { n: f.maxLength - input.value.length }); }
    input.addEventListener('input', upd);
    document.addEventListener('ayw:lang', upd);
    upd();
    wrap.appendChild(c);
  }

  function applyValue(f) {
    var n = nodes[f.name];
    if (n && n.set) n.set(state.data[f.name]);
  }

  /** Build the six step sections. Called once, and again on language switch. */
  function renderAll() {
    var host = $('#steps');
    host.innerHTML = '';
    nodes = {};
    blocks = [];

    SCHEMA.forEach(function (stepDef) {
      var kids = [];
      stepDef.fields.forEach(function (f) { renderField(f, kids); });

      var sec = el('section', {
        class: 'step', 'data-step': String(stepDef.step), hidden: true,
        'aria-labelledby': 'step-h-' + stepDef.step
      }, [
        el('header', { class: 'step__head' }, [
          el('h2', { id: 'step-h-' + stepDef.step, class: 'step__title', tabindex: '-1',
                     'data-i18n': 'step.' + stepDef.step + '.title' }),
          el('p', { class: 'step__sub', 'data-i18n': 'step.' + stepDef.step + '.sub' })
        ]),
        el('div', { class: 'step__body' }, kids)
      ]);
      host.appendChild(sec);
    });

    /* chips and activity rows build their own contents */
    eachField(function (f) {
      if (nodes[f.name] && nodes[f.name].renderChips) nodes[f.name].renderChips();
    });

    A.applyI18n(host);

    /* restore saved answers into the freshly built controls */
    eachField(function (f) {
      if (!f.name) return;
      if (state.data[f.name] === undefined && f.def !== undefined) state.data[f.name] = f.def;
      applyValue(f);
    });

    if (nodes.activity_details && nodes.activity_details.renderRows) nodes.activity_details.renderRows();
    updateVisibility();
  }

  /* ===========================================================================
     5. CONDITIONAL VISIBILITY
     ======================================================================== */
  function isVisible(f) {
    if (f.when && !f.when(state.data)) return false;
    return true;
  }

  /** A field inside a hidden block is hidden too. */
  function fieldVisible(f) {
    var parent = null;
    eachField(function (c, s, p) { if (c === f) parent = p; });
    if (parent && !isVisible(parent)) return false;
    return isVisible(f);
  }

  var lastOptSignature = {};

  function updateVisibility() {
    /* blocks */
    blocks.forEach(function (b) { b.wrap.hidden = !isVisible(b.def); });

    /* individual fields */
    eachField(function (f, step, parent) {
      if (!f.name || f.type === 'block') return;
      var wrap = $('[data-field="' + f.name + '"]');
      if (!wrap) return;
      var vis = (!parent || isVisible(parent)) && isVisible(f);
      wrap.hidden = !vis;

      /* option lists that depend on another answer (e.g. running -> distances) */
      if (typeof f.opts === 'function' && nodes[f.name] && nodes[f.name].renderChips) {
        var sig = String(optionList(f).key);
        if (lastOptSignature[f.name] !== sig) {
          lastOptSignature[f.name] = sig;
          nodes[f.name].renderChips();
        }
      }
    });

    /* per-sport rows follow the sports chosen */
    if (nodes.activity_details && nodes.activity_details.renderRows) {
      var sig2 = (state.data.current_sports || []).join(',');
      if (lastOptSignature.__activity !== sig2) {
        lastOptSignature.__activity = sig2;
        nodes.activity_details.renderRows();
      }
    }

    /* the medical-clearance note */
    if (nodes.__clearance) {
      nodes.__clearance.wrap.hidden = !needsClearance();
    }
  }

  function needsClearance() {
    return PARQ.some(function (k) { return state.data[k] === 'yes'; });
  }

  /* ===========================================================================
     6. VALIDATION
     Every message tells the person exactly how to fix the field.
     ======================================================================== */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
  var EG_MOBILE_RE = /^1[0125]\d{8}$/;

  function setError(name, msg) {
    var wrap = $('[data-field="' + name + '"]');
    if (!wrap) return;
    var errNode = $('#e-' + name, wrap) || $('.field__err', wrap);
    if (errNode) errNode.textContent = msg || '';
    wrap.classList.toggle('is-invalid', !!msg);
    $$('input, select, textarea', wrap).forEach(function (c) {
      c.setAttribute('aria-invalid', msg ? 'true' : 'false');
    });
  }

  function isEmpty(v) {
    if (v === undefined || v === null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'boolean') return v === false;
    return String(v).trim() === '';
  }

  function timeToSeconds(v) {
    var b = String(v || '').split(':');
    return (parseInt(b[0], 10) || 0) * 3600 + (parseInt(b[1], 10) || 0) * 60 + (parseInt(b[2], 10) || 0);
  }

  /** Returns an error message string, or '' when the field is fine. */
  function checkField(f) {
    var v = state.data[f.name];
    var req = typeof f.required === 'function' ? f.required(state.data) : f.required;

    if (isEmpty(v)) {
      if (!req) return '';
      if (f.type === 'checks' || f.type === 'cards') return t('err.pick_one');
      if (f.type === 'bool')  return f.name === 'guardian_consent' ? t('err.guardian') : t('err.consent');
      return t('err.required');
    }

    switch (f.type) {
      case 'text':
        if (f.name === 'name' && String(v).length < 2) return t('err.name_short');
        if (f.maxLength && String(v).length > f.maxLength) return t('err.maxlen', { max: f.maxLength });
        return '';

      case 'textarea':
        if (f.maxLength && String(v).length > f.maxLength) return t('err.maxlen', { max: f.maxLength });
        return '';

      case 'email':
        return EMAIL_RE.test(String(v)) ? '' : t('err.email');

      case 'num': {
        var n = parseFloat(String(v).replace(',', '.'));
        if (isNaN(n) || !/^\d+([.,]\d+)?$/.test(String(v).trim())) {
          return t('err.range', { min: f.min, max: f.max });
        }
        if (n < f.min || n > f.max) return t('err.range', { min: f.min, max: f.max });
        return '';
      }

      case 'phone': {
        var bits = String(v).split(' ');
        var code = bits[0], digits = (bits[1] || '');
        if (code === '+20') return EG_MOBILE_RE.test(digits) ? '' : t('err.whatsapp');
        return /^\d{6,14}$/.test(digits) ? '' : t('err.whatsapp_intl');
      }

      case 'time3': {
        var p = String(v).split(':');
        var hh = parseInt(p[0], 10) || 0, mm = parseInt(p[1], 10) || 0, ss = parseInt(p[2], 10) || 0;
        if (mm > 59 || ss > 59 || hh > 99) return t('err.time_format');
        if (hh + mm + ss === 0) return t('err.time_zero');
        if (f.name === 'target_time') {
          var cur = state.data.current_time;
          if (cur && timeToSeconds(v) >= timeToSeconds(cur)) return t('err.time_faster');
        }
        return '';
      }

      default:
        return '';
    }
  }

  function validateField(f) {
    if (!f.name) return true;
    if (!fieldVisible(f)) { setError(f.name, ''); return true; }
    var msg = checkField(f);
    setError(f.name, msg);
    return !msg;
  }

  /** Validate one step. Returns the list of field names that failed. */
  function validateStep(step) {
    var bad = [];
    SCHEMA.filter(function (s) { return s.step === step; }).forEach(function (s) {
      s.fields.forEach(function (f) {
        var list = f.type === 'block' ? f.fields : [f];
        list.forEach(function (c) {
          if (!c.name) return;
          nodes[c.name] && (nodes[c.name].touched = true);
          if (!validateField(c)) bad.push(c.name);
        });
      });
    });
    return bad;
  }

  function validateAll() {
    var bad = [];
    for (var s = 1; s <= TOTAL_STEPS; s++) bad = bad.concat(validateStep(s));
    return bad;
  }

  /* ===========================================================================
     7. NAVIGATION + PROGRESS
     ======================================================================== */
  function showScreen(id) {
    ['screen-intro', 'screen-form', 'screen-done'].forEach(function (s) {
      var n = document.getElementById(s);
      if (n) n.hidden = (s !== id);
    });
  }

  function goToStep(n, opts) {
    opts = opts || {};
    var dir = n >= state.step ? 'fwd' : 'back';
    state.step = n;
    saveDraft();

    $$('#steps .step').forEach(function (sec) {
      sec.hidden = (parseInt(sec.getAttribute('data-step'), 10) !== n);
    });
    var rev = $('#review');
    if (rev) rev.hidden = (n !== REVIEW_STEP);

    if (opts.animate !== false) {
      slideIn(n === REVIEW_STEP ? rev : $('#steps .step[data-step="' + n + '"]'), dir);
    }

    if (n === REVIEW_STEP) buildReview();
    updateProgress();
    updateNav();

    if (opts.focus !== false) {
      var head = n === REVIEW_STEP ? $('#review-h') : $('#step-h-' + n);
      if (head) head.focus();
    }
    if (opts.scroll !== false) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* The new step slides in from the side the reader is heading towards —
     from the left in Arabic, from the right in English. CSS does the moving. */
  function slideIn(sec, dir) {
    if (!sec || !A.motionOK()) return;
    sec.classList.remove('is-entering');
    void sec.offsetWidth;                       // restart the animation
    sec.setAttribute('data-dir', dir);
    sec.classList.add('is-entering');
  }

  function updateProgress() {
    var pct = Math.round((Math.min(state.step, TOTAL_STEPS) / TOTAL_STEPS) * 100);
    var bar = $('#progress-bar');
    if (bar) bar.style.width = pct + '%';
    var meter = $('#progress');
    if (meter) {
      meter.setAttribute('aria-valuenow', String(Math.min(state.step, TOTAL_STEPS)));
      meter.setAttribute('aria-valuetext',
        state.step === REVIEW_STEP ? t('prog.review') : t('prog.step', { n: state.step, t: TOTAL_STEPS }));
    }
    var lbl = $('#progress-label');
    if (lbl) {
      lbl.textContent = state.step === REVIEW_STEP
        ? t('prog.review')
        : t('prog.step', { n: state.step, t: TOTAL_STEPS });
    }
  }

  function updateNav() {
    var back = $('#btn-back'), next = $('#btn-next'), submit = $('#btn-submit');
    var onReview = state.step === REVIEW_STEP;
    back.hidden   = false;
    next.hidden   = onReview;
    submit.hidden = !onReview;
    next.textContent = state.step === TOTAL_STEPS ? t('nav.review') : t('nav.next');
  }

  function announce(msg) {
    var live = $('#form-live');
    if (!live) return;
    live.textContent = '';
    setTimeout(function () { live.textContent = msg; }, 50);
  }

  function onNext() {
    var bad = validateStep(state.step);
    if (bad.length) {
      announce(bad.length === 1 ? t('err.summary.one') : t('err.summary.many', { n: bad.length }));
      var first = $('[data-field="' + bad[0] + '"]');
      if (first) {
        var ctrl = $('input:not([type=hidden]), select, textarea', first);
        (ctrl || first).focus({ preventScroll: true });
        first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    goToStep(state.step === TOTAL_STEPS ? REVIEW_STEP : state.step + 1);
  }

  function onBack() {
    if (state.step === 1) { showScreen('screen-intro'); return; }
    goToStep(state.step - 1);
  }

  /* ===========================================================================
     8. REVIEW SCREEN
     ======================================================================== */
  function displayValue(f) {
    var v = state.data[f.name];
    if (isEmpty(v)) return t('review.empty');

    if (f.type === 'bool')  return v ? t('common.yes') : t('common.no');
    if (f.type === 'yesno') return v === 'yes' ? t('common.yes') : t('common.no');

    if (f.type === 'cards') return v.map(function (x) { return t('opt.objectives.' + x); }).join('، ');

    if (f.type === 'radio' || f.type === 'checks') {
      var list = optionList(f);
      var arr = Array.isArray(v) ? v : [v];
      return arr.map(function (x) { return optLabel(list.key, x, f.plain); }).join(A.getLang() === 'ar' ? '، ' : ', ');
    }

    if (f.type === 'activity') {
      var map = state.data.activity_map || {};
      return (state.data.current_sports || []).map(function (sp) {
        var d = map[sp] || {};
        return t('opt.current_sports.' + sp) + ': ' + (d.s || '?') + ' × ' + t('opt.duration.' + (d.d || '60'));
      }).join(' · ');
    }

    return String(v);
  }

  function buildReview() {
    var host = $('#review-groups');
    host.innerHTML = '';

    SCHEMA.forEach(function (stepDef) {
      var rows = [];
      stepDef.fields.forEach(function (f) {
        var list = f.type === 'block' ? f.fields : [f];
        list.forEach(function (c) {
          if (!c.name || !fieldVisible(c)) return;
          rows.push(el('div', { class: 'rev__row' }, [
            el('dt', { class: 'rev__k', text: t(c.label) }),
            el('dd', { class: 'rev__v', text: displayValue(c) })
          ]));
        });
      });
      if (!rows.length) return;

      host.appendChild(el('section', { class: 'rev__group' }, [
        el('div', { class: 'rev__head' }, [
          el('h3', { text: t('step.' + stepDef.step + '.title') }),
          el('button', {
            type: 'button', class: 'btn btn--link', 'data-goto': String(stepDef.step),
            text: t('nav.edit'),
            'aria-label': t('nav.edit') + ' — ' + t('step.' + stepDef.step + '.title'),
            on: { click: function () { goToStep(stepDef.step); } }
          })
        ]),
        el('dl', { class: 'rev__list' }, rows)
      ]));
    });

    var flag = $('#review-clearance');
    if (flag) flag.hidden = !needsClearance();
  }

  /* ===========================================================================
     9. SUBMITTING
     ======================================================================== */
  function buildPayload() {
    var out = {
      type: 'intake',
      language_used: A.getLang(),
      submission_token: state.token,
      elapsed_ms: Date.now() - state.startedAt,
      hp: ($('#hp-website') || {}).value || ''       // honeypot: must stay empty
    };

    eachField(function (f) {
      if (!f.name || f.type === 'block') return;
      if (!fieldVisible(f)) return;                   // never send answers to hidden questions
      var v = state.data[f.name];
      if (v === undefined) return;
      if (Array.isArray(v)) v = v.join(',');
      if (typeof v === 'boolean') v = v ? 'TRUE' : 'FALSE';
      out[f.name] = v;
    });

    /* things the coach needs that are derived, not typed */
    out.is_minor = (parseFloat(state.data.age) < 18) ? 'TRUE' : 'FALSE';
    out.needs_medical_clearance = needsClearance() ? 'TRUE' : 'FALSE';
    if (out.activity_details === undefined && !state.data.no_sports) out.activity_details = '';
    if (state.data.no_sports) { out.current_sports = 'none'; out.activity_details = ''; }

    return out;
  }

  function setSubmitting(on) {
    state.submitting = on;
    var b = $('#btn-submit');
    b.disabled = on;
    b.textContent = on ? t('nav.sending') : t('nav.submit');
    b.classList.toggle('is-busy', on);
  }

  function showFailure(code) {
    var box = $('#submit-error');
    var msg = code === 'no_endpoint' ? t('fail.noEndpoint')
            : code === 'timeout'     ? t('fail.timeout')
            : code === 'too_fast'    ? t('fail.spam')
            : t('fail.body');
    $('#submit-error-body').textContent = msg;
    box.hidden = false;
    box.setAttribute('tabindex', '-1');
    box.focus();
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function onSubmit() {
    if (state.submitting) return;
    $('#submit-error').hidden = true;

    var bad = validateAll();
    if (bad.length) {
      /* Send them back to the first step that still has a problem. */
      var firstStep = TOTAL_STEPS;
      SCHEMA.forEach(function (s) {
        s.fields.forEach(function (f) {
          var list = f.type === 'block' ? f.fields : [f];
          list.forEach(function (c) {
            if (c.name && bad.indexOf(c.name) !== -1) firstStep = Math.min(firstStep, s.step);
          });
        });
      });
      goToStep(firstStep);
      announce(bad.length === 1 ? t('err.summary.one') : t('err.summary.many', { n: bad.length }));
      var first = $('[data-field="' + bad[0] + '"]');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    /* time-on-page check — a bot fills six steps in under a second */
    if ((Date.now() - state.startedAt) < (A.cfg.minSecondsOnPage || 20) * 1000) {
      showFailure('too_fast');
      return;
    }

    setSubmitting(true);
    A.post(buildPayload())
      .then(function (res) {
        clearDraft();
        showDone(res.participant_id);
      })
      .catch(function (err) {
        setSubmitting(false);
        showFailure(err && err.code);
      });
  }

  function showDone(id) {
    setSubmitting(false);
    $('#done-id').textContent = id || '—';
    showScreen('screen-done');
    celebrate();
    var h = $('#done-h');
    if (h) h.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* A short burst of the logo's own X, O and dash marks around the tick. */
  function celebrate() {
    var host = $('#burst');
    if (!host) return;
    host.innerHTML = '';
    if (!A.motionOK()) return;
    var shapes = ['x', 'o', 'dash'];
    var colours = ['var(--accent)', 'var(--sun)', 'var(--plum)'];
    var count = 18;
    for (var i = 0; i < count; i++) {
      var angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      var dist = 70 + Math.random() * 75;
      var bit = el('span', { class: 'burst__bit burst__bit--' + shapes[i % 3] });
      bit.style.setProperty('--tx', Math.round(Math.cos(angle) * dist) + 'px');
      bit.style.setProperty('--ty', Math.round(Math.sin(angle) * dist) + 'px');
      bit.style.setProperty('--r', Math.round(Math.random() * 360 - 180) + 'deg');
      bit.style.setProperty('--c', colours[(i + 1) % 3]);
      bit.style.animationDelay = (0.45 + Math.random() * 0.2).toFixed(2) + 's';
      host.appendChild(bit);
    }
  }

  /* ===========================================================================
     10. START-UP
     ======================================================================== */
  function init() {
    A.initLang();
    A.initLangToggle();
    A.applyConfigText();
    A.initReveal();

    var hadDraft = loadDraft();
    renderAll();

    /* language switch: rebuild the controls, keep every answer */
    document.addEventListener('ayw:lang', function () {
      var step = state.step;
      renderAll();
      A.applyConfigText();
      if (!$('#screen-form').hidden) goToStep(step, { focus: false, scroll: false, animate: false });
      updateProgress();
      updateNav();
    });

    $('#btn-start').addEventListener('click', function () {
      showScreen('screen-form');
      goToStep(state.step || 1);
    });
    $('#btn-next').addEventListener('click', onNext);
    $('#btn-back').addEventListener('click', onBack);
    $('#btn-submit').addEventListener('click', onSubmit);
    $('#btn-retry').addEventListener('click', function () {
      $('#submit-error').hidden = true;
      onSubmit();
    });
    $('#btn-review-back').addEventListener('click', function () { goToStep(TOTAL_STEPS); });

    $('#btn-copy-id').addEventListener('click', function () {
      var id = $('#done-id').textContent;
      var btn = this;
      var done = function () {
        btn.textContent = t('done.copied');
        setTimeout(function () { btn.textContent = t('done.copy'); }, 2000);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(done, fallback);
      } else { fallback(); }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = id; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* nothing else to try */ }
        document.body.removeChild(ta);
      }
    });

    $('#btn-again').addEventListener('click', function () {
      state.data = {}; state.step = 1; state.token = A.uuid(); state.startedAt = Date.now();
      clearDraft();
      renderAll();
      showScreen('screen-intro');
      window.scrollTo({ top: 0 });
    });

    /* Someone who already started goes straight back into the form. */
    if (hadDraft && Object.keys(state.data).length) {
      showScreen('screen-form');
      goToStep(state.step, { focus: false, scroll: false });
    } else {
      showScreen('screen-intro');
    }

    updateProgress();
    updateNav();
    document.documentElement.classList.add('js-ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
