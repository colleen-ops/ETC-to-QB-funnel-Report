/**
 * Every rule you might want to change lives here.
 * Edit this file, not the logic files.
 */

module.exports = {
  WINDOW_START: '2026-06-01',

  QB: {
    REALM: 'ifundco.quickbase.com',
    TABLE: 'bn5gjsf9c',
    // NOTE: field 7 (Submitted date) added to SELECT — the spec's where-clause
    // uses it and the funded-month fallback needs it, but it was missing from
    // the original select list.
    SELECT: [3, 6, 7, 9, 10, 12, 18, 20, 21, 27, 51, 71, 208, 230, 345, 537],
    F: {
      RECORD_ID: 3,
      STATUS: 6,
      SUBMITTED: 7,
      DEAL_ID: 9,
      DBA: 10,
      LENDER: 12,
      SOURCE: 18,
      PHONE_C: 20,
      PHONE_B: 21,
      FUNDED_AMT: 27,
      FUNDED_DATE: 51,
      REVENUE: 71,
      LEAD_RECORD_ID: 208,
      PHONE_A: 230,
      REP: 345,
      OLD_TAG: 537,
      RENEWAL: 54,
    },
    RECORD_URL: (rid) => `https://ifundco.quickbase.com/db/bn5gjsf9c?a=dr&rid=${rid}`,
  },

  CLOSE: {
    DEAL_ID_FIELD: 'lcf_1JKA1R2CukADLfBzoes3Tivn2ACLdysljqT72CnOsYj',
    LEAD_SOURCE_FIELD: 'lcf_P20cLJgonNrQ0ZaeDUr3H7cOxn8gZSRwYEcuKGByv95',
    MAX_BLANK_SOURCE_LOOKUPS: 30,
    MAX_ACTIVITIES_PER_LEAD: 50,
  },

  SLACK: {
    CHANNEL_NAME: 'getty-daily-pulse',
    COLLEEN_ID: 'U0B6ZPX55DK',
    TAG_IDS: ['UFM1DAZ98', 'U0B6ZPX55DK'],
  },

  // Highest wins. Label = what shows in table B.
  STAGE_RANK: [
    { status: 'Funded', label: 'Funded' },
    { status: 'Approved', label: 'Approved' },
    { status: 'Lost to Other Approval', label: 'Went Elsewhere' },
    { status: 'Additional Info Requested', label: 'Needs Info' },
    { status: 'Merchant Passed', label: 'Said No To Us' },
    { status: 'Declined', label: 'We Declined' },
  ],

  // June+ families. Longest match wins — the matcher sorts by length, so
  // DKCK1 beats DKCK and AT02 beats AT01 automatically.
  ACTIVE_CODES: [
    'DK151', 'DK152', 'DK153', 'DK154', 'DK155', 'DK156',
    'DKCK1', 'DKCK', 'AT01', 'AT02',
  ],

  // Anything matching these is bucketed as "Older campaigns", never mixed in.
  OLDER_CODES: ['DK147', 'DK148', 'DK149', 'DK150', 'DK9'],
  OLDER_PREFIXES: ['TXT', 'RC'],

  // New codes get picked up automatically from EnTrance campaign names.
  NEW_CODE_PATTERN: /\b(DK1[5-9]\d|AT0[3-9]|DKCK\d*)\b/i,

  EXCLUDE_CAMPAIGN_WORDS: ['test', 'telynx'],
  MIN_CONTACTS: 500,
};
