/* =============================================================================
   config.js — the ONLY file you normally need to edit to go live.
   -----------------------------------------------------------------------------
   Nothing secret belongs in this file. This repository is public, so the Apps
   Script URL below is the only "address" the browser knows. All validation and
   all storage happen on the Apps Script side, inside the coach's private Google
   Sheet. No keys, no passwords, no participant data ever live here.
   ========================================================================== */

window.AYW_CONFIG = {

  /* ---------------------------------------------------------------------------
     1) THE ENDPOINT
     Paste the Web App URL you get after deploying Code.gs (see README.md,
     "Deploying the Apps Script"). It looks like:
     https://script.google.com/macros/s/AKfycb.....X/exec
     Leave it as "https://script.google.com/macros/s/AKfycbwJ-CejyFyCideXHAZmV26iM8i_9BpxZ37ERWtN5U0B6T3Nhv258OYjT7S4HvPdwZf2/exec" while designing: the form
     will run normally but will tell you the endpoint is not configured yet.
  --------------------------------------------------------------------------- */
  endpoint: 'https://script.google.com/macros/s/AKfycbwJ-CejyFyCideXHAZmV26iM8i_9BpxZ37ERWtN5U0B6T3Nhv258OYjT7S4HvPdwZf2/exec',

  /* ---------------------------------------------------------------------------
     2) CONTACT + SOCIAL (shown to participants, safe to be public)
  --------------------------------------------------------------------------- */
  instagramHandle: '@3aashyawa7sh',
  instagramUrl:    'https://instagram.com/3aashyawa7sh',

  // Used in the privacy text so a participant knows how to ask for correction
  // or deletion of their data. Use a number/address you are happy to publish.
  contactWhatsapp: '+201001240186',
  contactEmail:    'ahmedamrousy@gmail.com',

  /* ---------------------------------------------------------------------------
     3) EXPECTED RESPONSE TIME on the confirmation screen.
        Change the wording freely; it is shown exactly as written.
  --------------------------------------------------------------------------- */
  responseTime: {
    ar: 'الكوتش بيراجع كل استمارة بنفسه، فهيتواصل معاك خلال 3 أيام شغل بالكتير.',
    en: 'The coach reviews every form personally, so expect to hear back within 3 working days at most.'
  },

  /* ---------------------------------------------------------------------------
     4) LANGUAGE
        'ar' (default, right-to-left) or 'en'. A visitor's own choice is
        remembered in their browser and wins over this default.
  --------------------------------------------------------------------------- */
  defaultLang: 'ar',

  /* ---------------------------------------------------------------------------
     5) SPAM PROTECTION (no CAPTCHA)
        minSecondsOnPage — a real person needs longer than this to fill six
        steps. Bots submit instantly. 20 seconds is deliberately generous.
        The same number is checked again inside Code.gs; change it in both
        places if you want it stricter.
  --------------------------------------------------------------------------- */
  minSecondsOnPage: 20,

  /* ---------------------------------------------------------------------------
     6) DRAFT SAVING
        The half-finished form is kept in the visitor's own browser so they can
        close the tab and come back. It is deleted the moment the form is sent.
        Set saveDraft to false to switch that off entirely.
  --------------------------------------------------------------------------- */
  saveDraft: true,
  storageKey: 'ayw.intake.draft.v1',
  langStorageKey: 'ayw.lang',

  /* ---------------------------------------------------------------------------
     7) NETWORK
        How long to wait for the server before showing "try again" (ms).
  --------------------------------------------------------------------------- */
  requestTimeoutMs: 20000
};
