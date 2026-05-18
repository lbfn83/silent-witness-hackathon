// pwa-app/demo-data/seed.js
//
// Demo evidence dataset for Silent Witness.
// Built for the Gemma for Good hackathon.
//
// One fictional survivor ("Mara") over 14 weeks. 30 records.
// Every name, date, location, and circumstance is fictional.
//
// Why this dataset exists:
//   The Silent Witness pattern-analysis demo needs an evidence vault dense
//   enough for Gemma to surface real, court-grade signals on the first
//   pass, not a thin sample. This seed is engineered so that running
//   pattern_analysis.v1 over it returns a coherent, intersecting set of
//   findings (region recurrence, severity escalation, weekend clustering,
//   a corroboration gap that closes mid-story).
//
// Pattern signals planted (kept in sync with README.md):
//   - upper_arm_left recurs 7x across the timeline (grip-injury repetition)
//   - head_face recurs 5x; neck_front recurs 5x (escalation regions)
//   - severity climbs minor → moderate → severe → critical
//   - ~70% of photo entries cluster Fri 21:00 – Sat 02:00
//   - corroboration is empty through record 22, then opens:
//       record 23 → doctor (first ER visit, week 11)
//       record 26 → police
//       record 27 → witnesses
//       record 30 → digital
//
// Record shape conforms to pwa-app/vault.js `_buildRecord` (the live runtime
// shape), not the v1.3 canonical schema in docs/EVIDENCE_SCHEMA.md. The
// canonical migration is tracked separately; demo records will be replayable
// through any migration script Wonjae lands.
//
// To load: see README.md in this folder.

export const DEMO_SEED_VERSION = 'mara-v1';

export const DEMO_PERSONA = {
  name: 'Mara',
  notes: 'Single fictional survivor. Late 20s. Lives with her partner (referenced only as "he" or "him" in narratives; never named). He drinks heavily on Fridays and Saturdays; the weekend-night clustering signal is driven by his pattern, not hers.',
};

// All timestamps use US/Eastern. DST begins 2026-03-08 (records before that
// date use -05:00; from 2026-03-08 onward use -04:00).

export const DEMO_RECORDS = [
  // ──────────────────────────────────────────────────────────────────
  // Phase 1: first documentation (weeks 1-3, records 01-05)
  // Minor injuries, sparse, no corroboration. Mara is still calibrating
  // her own perception against what she sees.
  // ──────────────────────────────────────────────────────────────────

  // ── 01 ── Wed week 1. Text. Wrist grab during a morning argument. No visible mark.
  {
    modality: 'text',
    textNotes: 'He grabbed my wrist this morning when I tried to leave the kitchen. Held on. Let go when I stopped pulling.',
    narrative: 'Argument about the credit card statement before work. I tried to walk out of the kitchen and he caught my left wrist. He held on while he kept talking. Let go when I went still. No mark after, but the skin felt hot for a while. Writing this down because I keep thinking about it.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'wrist_left',
    timestamp: '2026-02-04T18:30:00-05:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Survivor describes a non-consensual grab of the left wrist during a verbal conflict. No visible injury reported in the text. The contact ended when the survivor stopped resisting, a pattern worth noting alongside future entries.',
      severity: 'minor',
      injury_type: null,
      injury_locations: ['wrist_left'],
      body_region: 'wrist_left',
      is_defensive_injury: false,
      visible_indicators: [],
      photo_quality: null,
      recommended_documentation: [
        'record date and time of similar events',
        'note whether the contact left marks several hours later',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-02-04T18:42:11-05:00',
  },

  // ── 02 ── Fri-Sat week 1. First photo. Upper-arm-left bruise. (Region recurrence will start here.)
  {
    modality: 'photo',
    textNotes: 'Bruise on my left arm where he grabbed me last night.',
    narrative: 'Friday night. He came back from the bar around eleven. Grabbed my left arm above the elbow when I asked him to keep his voice down. Photo taken Saturday morning in the bathroom. The purple is starting to come up.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'upper_arm_left',
    timestamp: '2026-02-06T23:35:00-05:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Single oval bruise on the upper left arm, medial aspect. Coloration consistent with a recent injury (within 24 hours). No swelling visible. Distribution is localized.',
      severity: 'minor',
      injury_type: 'bruise',
      injury_locations: ['upper_arm_left'],
      body_region: 'upper_arm_left',
      is_defensive_injury: false,
      visible_indicators: [
        'light purple discoloration',
        'oval shape',
        'no swelling',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'photograph the same region in 2-3 days to track resolution',
        'note the time of the incident in the record',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-02-07T08:12:33-05:00',
  },

  // ── 03 ── Sat night week 2. Same arm, same place. Pattern starts to surface.
  {
    modality: 'photo',
    textNotes: 'Same arm. Same place. He drank a lot tonight.',
    narrative: 'Saturday night. He had been drinking since the afternoon. Argument over the rent escalated. He grabbed the same arm in the same spot. Photo taken later, after he fell asleep on the couch. The mark is in the same place as the last one.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'upper_arm_left',
    timestamp: '2026-02-14T23:15:00-05:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Bruising on the upper left arm in the same anatomical region as a prior entry. Coloration suggests a recent injury. The repeat location is notable: the same anatomical area appearing twice in two weeks is a documentable pattern.',
      severity: 'moderate',
      injury_type: 'bruise',
      injury_locations: ['upper_arm_left'],
      body_region: 'upper_arm_left',
      is_defensive_injury: false,
      visible_indicators: [
        'purple discoloration',
        'localized to medial upper arm',
        'consistent with hand-grip pressure',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'compare to the prior photo of the same region',
        'consider keeping a private log of weekend incidents',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-02-15T02:04:01-05:00',
  },

  // ── 04 ── Sun morning week 2. Voice recording, abdomen. (Different modality, recent injury.)
  {
    modality: 'voice',
    textNotes: 'Recorded after he fell asleep. Bruise on my stomach.',
    narrative: 'Recording made around six in the morning on Sunday. He had pushed me into the corner of the kitchen counter sometime late Saturday night during the same fight. There is a bruise on the right side of my stomach where the counter caught me. I described what happened while it was still fresh.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'abdomen',
    timestamp: '2026-02-15T06:45:00-05:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Survivor recorded a verbal account of a physical incident overnight. She describes being pushed into a kitchen counter, resulting in a bruise to the right abdomen. The recording was made privately while the other person was asleep.',
      severity: 'moderate',
      injury_type: 'bruise',
      injury_locations: ['abdomen'],
      body_region: 'abdomen',
      is_defensive_injury: false,
      visible_indicators: ['bruise to right abdomen as described'],
      photo_quality: null,
      recommended_documentation: [
        'photograph the bruise while it remains visible',
        'audio entries can corroborate later photographic evidence',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-02-15T06:51:12-05:00',
  },

  // ── 05 ── Tue week 3 evening. Text. Mid-week argument, no injury. Logs blocking behavior.
  {
    modality: 'text',
    textNotes: 'Argument again. No marks this time but he was close.',
    narrative: 'Tuesday after work. The same argument about money started again. He blocked the bedroom door for about ten minutes. No physical contact this time, but he was within reach and stayed there until I sat down. I am writing this down because it felt like the same thing.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'unknown',
    timestamp: '2026-02-24T20:15:00-05:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical', 'verbal'],
      summary: 'Survivor describes a verbal conflict that included being physically blocked from leaving a room for approximately ten minutes. No injury reported. The pattern of restricting freedom of movement during conflict is consistent with earlier entries.',
      severity: 'minor',
      injury_type: null,
      injury_locations: [],
      body_region: null,
      is_defensive_injury: false,
      visible_indicators: [],
      photo_quality: null,
      recommended_documentation: [
        'continue logging non-injury incidents',
        'note duration of blocking behavior in future entries',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-02-24T20:23:47-05:00',
  },

  // ──────────────────────────────────────────────────────────────────
  // Phase 2: escalation begins (weeks 4-6, records 06-12)
  // upper_arm_left recurs through #5. New regions appear. Severity
  // climbs from minor to moderate to a first "severe." Still zero
  // corroboration: she has not told anyone, has not seen a doctor.
  // ──────────────────────────────────────────────────────────────────

  // ── 06 ── Fri week 4 night. Photo. upper_arm_left (#3). Finger marks now distinct.
  {
    modality: 'photo',
    textNotes: 'Third time on the same arm. Finger marks this time.',
    narrative: 'Friday night. He had been drinking again. The fight was about a phone call he saw me take. He grabbed the same arm in the same spot. This time you can count the fingers in the mark. Photo taken in the bathroom around midnight after he passed out.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'upper_arm_left',
    timestamp: '2026-02-27T23:45:00-05:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Bruising on the upper left arm with a distribution consistent with finger-grip pressure. Discrete oval marks suggest individual fingertips. This is the third documented injury to the same anatomical region in three weeks.',
      severity: 'moderate',
      injury_type: 'bruise',
      injury_locations: ['upper_arm_left'],
      body_region: 'upper_arm_left',
      is_defensive_injury: true,
      visible_indicators: [
        'discrete oval marks consistent with fingertips',
        'spacing consistent with a single hand',
        'localized to medial upper arm',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'compare against the two earlier photos of the same region',
        'measure the spacing of marks to support pattern documentation later',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-02-28T00:14:22-05:00',
  },

  // ── 07 ── Sat week 4 late. Photo. shoulder_left + abdomen. New regions.
  {
    modality: 'photo',
    textNotes: 'Shoulder and stomach tonight. He shoved me into the bookshelf.',
    narrative: 'Saturday night, late. He shoved me hard into the bookshelf in the living room. The corner caught my left shoulder and the edge of the shelf hit my stomach below the ribs. I waited until he went out for cigarettes to take these.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'shoulder_left',
    timestamp: '2026-02-28T22:20:00-05:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Bruising to the left shoulder and abdomen. Distribution is consistent with impact against a hard edge as described. The two injuries appear in a single incident.',
      severity: 'moderate',
      injury_type: 'bruise',
      injury_locations: ['shoulder_left', 'abdomen'],
      body_region: 'shoulder_left',
      is_defensive_injury: false,
      visible_indicators: [
        'linear bruising on the lateral shoulder',
        'bruise on the right abdomen below the ribs',
        'pattern consistent with impact rather than grip',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'document the surface that was struck (here: a bookshelf edge)',
        'photograph from multiple angles to show the linear pattern',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-02-28T22:54:11-05:00',
  },

  // ── 08 ── Sun week 4 morning. Voice. Long reflective narrative after weekend.
  {
    modality: 'voice',
    textNotes: 'Sunday morning recording. He is still asleep. I needed to say this out loud.',
    narrative: 'Sunday around eight in the morning. He is still asleep on the couch downstairs. I recorded this in the closet because I wanted to hear myself say it. I talked about the last six weeks. The pattern. The same arm. The new bruise on my shoulder. The fact that it is not a one-time thing anymore. I said the word "afraid" for the first time.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'unknown',
    timestamp: '2026-03-01T08:12:00-05:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical', 'verbal'],
      summary: 'Survivor recorded a reflective audio entry the morning after a documented incident. She references the pattern across the prior six weeks and explicitly uses the word "afraid" for the first time. No new injuries are described in this entry; it is a self-account of cumulative emotional impact.',
      severity: 'moderate',
      injury_type: null,
      injury_locations: [],
      body_region: null,
      is_defensive_injury: false,
      visible_indicators: [],
      photo_quality: null,
      recommended_documentation: [
        'consider preserving this recording separately as a contemporaneous statement',
        'audio entries can support photographic evidence in a timeline',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-03-01T08:23:45-05:00',
  },

  // ── 09 ── Tue week 5. Text. Threatening text messages from him during the day.
  {
    modality: 'text',
    textNotes: 'He sent threats from work today. I screenshotted them but did not save them here yet.',
    narrative: 'Tuesday afternoon at my office. He sent six messages over an hour. Two of them named what he would do if I "kept embarrassing him." I screenshotted them on my work phone but I do not want to put the screenshots in this app yet. Logging that they happened so the date is preserved.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'unknown',
    timestamp: '2026-03-03T14:35:00-05:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['verbal'],
      summary: 'Survivor describes receiving six text messages from the other person during the workday. She reports that two messages contained explicit threats conditioned on her behavior. The text content is not captured in this entry; only the date and her account.',
      severity: 'moderate',
      injury_type: null,
      injury_locations: [],
      body_region: null,
      is_defensive_injury: false,
      visible_indicators: [],
      photo_quality: null,
      recommended_documentation: [
        'preserve the original screenshots in a separate secure location',
        'note the time window the messages arrived and the device they came from',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-03-03T14:42:18-05:00',
  },

  // ── 10 ── Fri week 5. Photo. upper_arm_left (#4). First "severe." Grip-pattern explicit.
  {
    modality: 'photo',
    textNotes: 'After he came home. Marks darker than last time.',
    narrative: 'Friday night after a fight about the bank account. Marks where his fingers were. The shape is the same as the last three times. Took this in the bathroom while he was asleep. The bruise was darker than the previous ones from the start. It also hurts more when I move my arm.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'upper_arm_left',
    timestamp: '2026-03-06T23:00:00-05:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Bruising on the upper left arm in a distribution consistent with finger-grip pressure. The pattern matches earlier entries on the same region. Coloration and the survivor\'s account of increased tenderness suggest greater force compared with prior incidents.',
      severity: 'severe',
      injury_type: 'bruise',
      injury_locations: ['upper_arm_left'],
      body_region: 'upper_arm_left',
      is_defensive_injury: true,
      visible_indicators: [
        'finger-shaped marks',
        'darker discoloration than prior entries',
        'consistent with a sustained grip',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'preserve dated photos of the same region for comparison',
        'consider seeking medical evaluation if tenderness or limited motion persists',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-03-07T00:14:18-05:00',
  },

  // ── 11 ── Sat week 6 night. Photo. lower_back. New region. Moderate.
  {
    modality: 'photo',
    textNotes: 'Lower back. He shoved me into the railing on the stairs.',
    narrative: 'Saturday night. He came up behind me on the stairs and shoved. The railing caught my lower back on the right side. I held onto the banister and did not fall, but it knocked the wind out of me. Photo taken in the bedroom when he was downstairs.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'lower_back',
    timestamp: '2026-03-14T22:50:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Linear bruising across the lower back on the right side. Distribution is consistent with impact against a horizontal edge as described. The pattern suggests force directed from behind.',
      severity: 'moderate',
      injury_type: 'bruise',
      injury_locations: ['lower_back'],
      body_region: 'lower_back',
      is_defensive_injury: false,
      visible_indicators: [
        'linear bruising across the lower right back',
        'consistent with impact against a hard horizontal edge',
        'force directionality suggests rear-on contact',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'document the surface struck (a stair railing)',
        'consider medical evaluation if breathing remains painful',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-03-14T23:31:02-04:00',
  },

  // ── 12 ── Sun week 6 midday. Photo. upper_arm_left (#5) + scratch on neck_front (#1).
  {
    modality: 'photo',
    textNotes: 'Same arm again. Also a scratch on my neck. That is new.',
    narrative: 'Sunday around noon. He was holding me by the arm and reaching for my face when I turned my head. The grab on the arm is in the usual place. The scratch on the front of my neck is from his thumbnail. The neck is new. I do not like that the neck is new.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'upper_arm_left',
    timestamp: '2026-03-15T12:05:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Two injuries documented in a single entry. The upper left arm shows finger-grip bruising matching the established pattern. A linear scratch is visible on the anterior neck, consistent with the survivor\'s account of a thumbnail contact. The neck injury is the first to that region in the vault.',
      severity: 'moderate',
      injury_type: 'bruise',
      injury_locations: ['upper_arm_left', 'neck_front'],
      body_region: 'upper_arm_left',
      is_defensive_injury: true,
      visible_indicators: [
        'finger-grip bruising on upper left arm',
        'linear scratch on anterior neck consistent with thumbnail contact',
        'first documented injury to the neck region',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'photograph the neck region separately to capture the scratch clearly',
        'note that injuries to the neck are documented as a separate severity signal',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-03-15T12:38:09-04:00',
  },

  // ──────────────────────────────────────────────────────────────────
  // Phase 3: head/face/neck (weeks 7-10, records 13-22)
  // Injuries cross into the head, face, and neck regions. First
  // strangulation marks. Severity peaks at "critical" in week 10
  // with a multi-region incident and reported dizziness. Still no
  // medical care, no police, no one outside the home knows.
  // ──────────────────────────────────────────────────────────────────

  // ── 13 ── Wed week 7. Voice. Anticipatory anxiety. No injury.
  {
    modality: 'voice',
    textNotes: 'Mid-week recording. The pattern is week to week now.',
    narrative: 'Wednesday evening. He is not home yet. I recorded this because I have started noticing I get a feeling on Wednesdays now. It tells me I have three more days before Friday. That is not a thing I should be tracking. I described the last three weeks in order.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'unknown',
    timestamp: '2026-03-18T19:30:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['verbal', 'coercive_control'],
      summary: 'Survivor recorded an anticipatory account in the middle of the week. She describes a learned association between specific days of the week and the likelihood of an incident. No new physical injuries are reported in this entry.',
      severity: 'moderate',
      injury_type: null,
      injury_locations: [],
      body_region: null,
      is_defensive_injury: false,
      visible_indicators: [],
      photo_quality: null,
      recommended_documentation: [
        'note that anticipatory entries can establish duration of the documented pattern',
        'consider whether a private safety plan would help on weekend nights',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-03-18T19:42:23-04:00',
  },

  // ── 14 ── Fri week 7. Photo. head_face (#1). First face injury. Moderate.
  {
    modality: 'photo',
    textNotes: 'Mark on my cheekbone. He has never hit me on the face before.',
    narrative: 'Friday night. He slapped the left side of my face during an argument over a phone call. The mark is on the cheekbone. He apologized within minutes and went to bed. I waited until he was asleep and took the photo in the kitchen with the overhead light.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'head_face',
    timestamp: '2026-03-20T23:20:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Bruising and slight swelling on the left cheekbone, consistent with an open-hand strike as described. This is the first documented injury to the head or face region in the vault. Head and face injuries are treated as elevated medical risk.',
      severity: 'moderate',
      injury_type: 'bruise',
      injury_locations: ['head_face'],
      body_region: 'head_face',
      is_defensive_injury: false,
      visible_indicators: [
        'diffuse redness over left cheekbone',
        'mild swelling',
        'consistent with open-hand strike',
        'first head or face injury in the documented timeline',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'head and face injuries warrant medical evaluation regardless of apparent severity',
        'photograph again in 24-48 hours as bruising develops',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-03-20T23:48:51-04:00',
  },

  // ── 15 ── Sat week 7 (after midnight). Photo. mouth/lip cut. Moderate.
  {
    modality: 'photo',
    textNotes: 'Lip split tonight. I am fine.',
    narrative: 'Sometime after midnight Saturday into Sunday. The same fight from Friday continued when he came back from being out. He hit me again, this time on the mouth. The lip split on the inside. I rinsed with salt water. Photo taken in the downstairs bathroom.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'head_face',
    timestamp: '2026-03-21T01:00:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Laceration of the inner lower lip with mild surrounding swelling. Consistent with the survivor\'s account of a strike to the mouth. Occurs within the same 36-hour window as the prior face injury.',
      severity: 'moderate',
      injury_type: 'cut',
      injury_locations: ['head_face'],
      body_region: 'head_face',
      is_defensive_injury: false,
      visible_indicators: [
        'small laceration on the inner lower lip',
        'mild peri-oral swelling',
        'paired with prior face injury within the same weekend',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'oral injuries should be evaluated for dental impact',
        'document the timing of paired injuries within a single weekend',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-03-21T01:18:33-04:00',
  },

  // ── 16 ── Fri week 8. Photo. neck_front (#2). First strangulation marks. Severe.
  {
    modality: 'photo',
    textNotes: 'Marks on my neck. Faint but they are there.',
    narrative: 'Friday night. He put his hands around my neck during an argument and squeezed for what felt like a few seconds. He let go on his own. I could speak afterward and there was no pain when I swallowed. There are faint marks on the front of my neck where his thumbs were. Photo taken in the bedroom mirror after he was asleep.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'neck_front',
    timestamp: '2026-03-27T23:00:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Faint linear and oval markings on the anterior neck, bilateral, distribution consistent with manual contact by a single pair of hands. The survivor describes a brief compression event. Marks of this kind are documented as a high-priority severity signal regardless of visible severity, because strangulation injuries do not always present visibly even when significant pressure has been applied.',
      severity: 'severe',
      injury_type: 'strangulation_marks',
      injury_locations: ['neck_front'],
      body_region: 'neck_front',
      is_defensive_injury: false,
      visible_indicators: [
        'faint thumb-print impressions over the anterior neck',
        'symmetric distribution consistent with two-handed contact',
        'absence of visible swelling does not rule out internal injury',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'strangulation injuries warrant medical evaluation within 24 hours regardless of how the survivor feels',
        'document any voice changes, swallowing difficulty, or petechial markings in the days that follow',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-03-27T23:34:17-04:00',
  },

  // ── 17 ── Sat week 8 (after midnight). Voice. Scared narrative.
  {
    modality: 'voice',
    textNotes: 'Recorded after midnight. I am scared.',
    narrative: 'Saturday into Sunday, around two in the morning. He is asleep. I recorded this from the bathroom floor because my legs felt unsteady. I said what happened earlier. His hands on my neck, the few seconds. I said that I could feel my pulse in my eyes. I have not said that out loud before.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'neck_front',
    timestamp: '2026-03-28T02:00:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Survivor recorded a brief audio account following a strangulation incident documented earlier the same weekend. She describes lightheadedness and a sensation of pulse in the eyes. This is a symptom recognized as consistent with brief loss of perfusion. No new visible injuries described.',
      severity: 'severe',
      injury_type: null,
      injury_locations: ['neck_front'],
      body_region: 'neck_front',
      is_defensive_injury: false,
      visible_indicators: [
        'survivor reports pulse sensation in eyes (potential petechiae precursor)',
        'unsteady legs after the incident',
      ],
      photo_quality: null,
      recommended_documentation: [
        'symptoms following strangulation can develop hours later; medical evaluation is recommended',
        'audio accounts made within 24 hours of a strangulation event are considered contemporaneous',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-03-28T02:11:48-04:00',
  },

  // ── 18 ── Fri week 9. Photo. head_face (#2) + swelling. Severe.
  {
    modality: 'photo',
    textNotes: 'Eye swelling. He hit me harder this time.',
    narrative: 'Friday night. He hit me with a closed fist on the left side of the face. The eye started swelling within an hour. I held a bag of frozen peas on it. Photo taken in the bathroom mirror. The bruise was already forming.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'head_face',
    timestamp: '2026-04-03T22:40:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Periorbital swelling and bruising of the left side of the face. Distribution is consistent with a closed-fist strike as described. The injury is to a region that has been struck before in the documented timeline.',
      severity: 'severe',
      injury_type: 'bruise',
      injury_locations: ['head_face'],
      body_region: 'head_face',
      is_defensive_injury: false,
      visible_indicators: [
        'left periorbital swelling',
        'developing bruising over the cheekbone and lower eyelid',
        'pattern consistent with closed-fist strike',
        'repeat injury to a previously documented region',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'periorbital injuries should be evaluated for orbital fracture, especially when swelling progresses',
        'preserve any clothing that may have come into contact with the injured area',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-04-03T23:21:55-04:00',
  },

  // ── 19 ── Sat week 9. Photo. neck_front (#3). Strangulation again, clearer. Severe + dizziness.
  {
    modality: 'photo',
    textNotes: 'He did it again. Hands on my neck. Felt dizzy after.',
    narrative: 'Saturday night. He came home angrier than usual. His hands on my neck again, longer this time. I went lightheaded but did not lose consciousness. He stopped when I stopped struggling. The marks on the front of my neck are clearer than the ones from last week. Photo taken in the closet under the lamp.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'neck_front',
    timestamp: '2026-04-04T23:30:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Bilateral oval impressions on the anterior neck consistent with manual strangulation. The survivor reports lightheadedness during the event. This is a symptom of partial loss of perfusion. This is the second documented strangulation incident in two weeks; the marks are more pronounced than the prior occurrence.',
      severity: 'severe',
      injury_type: 'strangulation_marks',
      injury_locations: ['neck_front'],
      body_region: 'neck_front',
      is_defensive_injury: false,
      visible_indicators: [
        'distinct thumb impressions on the anterior neck',
        'survivor reports lightheadedness during the event',
        'second documented strangulation incident within two weeks',
        'reported duration longer than the prior incident',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'repeat strangulation events significantly raise medical and lethality risk and warrant urgent evaluation',
        'preserve this entry and the prior strangulation entry together for any future medical or legal record',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-04-05T00:09:31-04:00',
  },

  // ── 20 ── Wed week 10. Photo. upper_arm_left (#6) + shoulder_left. Severe. Grip cluster.
  {
    modality: 'photo',
    textNotes: 'Same arm again. He grabbed and would not let go.',
    narrative: 'Wednesday evening, after he came home. He grabbed my left arm and the shoulder near the collarbone and held on. I could not pull free for a couple of minutes. The marks on the upper arm are in the usual place. The shoulder bruise is new and lateral. Photos taken once he was in another room.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'upper_arm_left',
    timestamp: '2026-04-08T20:15:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Two paired injuries from a single sustained-grip event. The upper left arm shows the established finger-grip pattern. The left shoulder shows discrete bruising near the lateral aspect of the clavicle. This is the sixth documented injury to the upper left arm region.',
      severity: 'severe',
      injury_type: 'bruise',
      injury_locations: ['upper_arm_left', 'shoulder_left'],
      body_region: 'upper_arm_left',
      is_defensive_injury: true,
      visible_indicators: [
        'recurring finger-grip pattern on the upper left arm',
        'discrete shoulder bruise lateral to the clavicle',
        'sustained-grip event reported by the survivor',
        'sixth incident to the same anatomical region',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'a region documented six times within twelve weeks is a significant pattern record',
        'consider archiving the full sequence of upper-arm photos as a single bundle',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-04-08T20:48:09-04:00',
  },

  // ── 21 ── Fri week 10. Photo. lip + head_face + neck_front. Multi-region. CRITICAL.
  {
    modality: 'photo',
    textNotes: 'Worst one yet. Lip, face, neck.',
    narrative: 'Friday night, very late. The worst one. He hit me in the mouth and on the side of the face and his hands were on my neck again. I do not remember the order. There is a cut on my lip, swelling on the left side of my face, marks on my neck. I waited a long time before I could get up. Photos taken in the bathroom sitting on the floor.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'head_face',
    timestamp: '2026-04-10T23:55:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Multi-region injury event involving the lip, left side of the face, and anterior neck. The survivor reports temporal disorientation about the order of contacts during the incident. The combination of facial and strangulation injuries in a single event is documented as the most severe entry in the timeline to date.',
      severity: 'critical',
      injury_type: 'bruise',
      injury_locations: ['head_face', 'neck_front'],
      body_region: 'head_face',
      is_defensive_injury: false,
      visible_indicators: [
        'lip laceration with surrounding swelling',
        'left periorbital bruising and swelling',
        'thumb impressions on the anterior neck consistent with strangulation',
        'survivor reports inability to recall sequence of events',
        'third strangulation event documented in three weeks',
      ],
      photo_quality: 'fair',
      recommended_documentation: [
        'multi-region injury combined with reported temporal disorientation indicates urgent medical evaluation regardless of how the survivor feels',
        'preserve each region as a separate photo if possible to support detailed documentation later',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-04-11T00:42:18-04:00',
  },

  // ── 22 ── Sat week 10 early. Voice. Brief, fearful. Reports dizziness.
  {
    modality: 'voice',
    textNotes: 'Recorded after. I felt dizzy for a long time.',
    narrative: 'Saturday around one-thirty in the morning. He is asleep. Short recording, maybe a minute. I said that I felt dizzy for a long time after, longer than the last two times. I said the word "scared" again. I also said something else for the first time which is that I do not know what stops him next time.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'neck_front',
    timestamp: '2026-04-11T01:20:00-04:00',
    corroboration: { doctor: false, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical', 'verbal'],
      summary: 'Brief audio account recorded immediately after the multi-region incident. The survivor reports a longer duration of post-event dizziness than during prior strangulation events. She articulates uncertainty about what would have stopped the contact, which is a meaningful change in tone from prior entries.',
      severity: 'severe',
      injury_type: null,
      injury_locations: ['neck_front'],
      body_region: 'neck_front',
      is_defensive_injury: false,
      visible_indicators: [
        'longer post-event dizziness than prior strangulation incidents',
        'survivor articulates uncertainty about future escalation',
      ],
      photo_quality: null,
      recommended_documentation: [
        'a contemporaneous audio account within hours of a strangulation event is a significant evidentiary record',
        'lengthening post-event symptoms warrant a same-day medical visit',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-04-11T01:24:55-04:00',
  },

  // ──────────────────────────────────────────────────────────────────
  // Phase 4: corroboration opens (weeks 11-14, records 23-30)
  // The gap closes. Mara goes to the ER (week 11). A police report
  // is filed (week 12). She moves to a friend's house (week 12-13).
  // The story ends with her at a safe location and digital evidence
  // (screenshots of his messages) preserved.
  // ──────────────────────────────────────────────────────────────────

  // ── 23 ── Tue week 11. Photo. ER day. neck_front (#4) + head_face (#3). doctor=true. FIRST CORROBORATION.
  {
    modality: 'photo',
    textNotes: 'Went to the ER today. The doctor saw the marks on my neck.',
    narrative: 'Tuesday morning. I called in sick to work and went to the urgent care that connects to the hospital. I told them what happened. They moved me to the ER. The doctor saw the marks on my neck and the bruising on my face. They took their own photos and gave me a discharge summary. The photo here is what my neck looked like before I went in.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'neck_front',
    timestamp: '2026-04-14T08:30:00-04:00',
    corroboration: { doctor: true, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical'],
      summary: 'Pre-medical-visit documentation of strangulation marks on the anterior neck and bruising of the left face. The survivor reports that the same day, an ER physician examined the injuries, took clinical photographs, and provided a discharge summary. This is the first entry in the timeline with documented medical corroboration.',
      severity: 'severe',
      injury_type: 'strangulation_marks',
      injury_locations: ['neck_front', 'head_face'],
      body_region: 'neck_front',
      is_defensive_injury: false,
      visible_indicators: [
        'thumb impressions on anterior neck',
        'periorbital bruising on left side of face',
        'first entry with concurrent medical examination',
        'survivor obtained discharge summary',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'request a copy of the ER report and the clinical photographs for the vault',
        'note the visit date and provider name in a future entry for cross-reference',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-04-14T18:45:32-04:00',
  },

  // ── 24 ── Tue week 11 evening. Text. Summary of doctor visit.
  {
    modality: 'text',
    textNotes: 'Discharge summary in my bag. The nurse asked me twice if I was safe.',
    narrative: 'Tuesday evening. I am home. He is at work. The nurse asked me twice if I had a safe place to go tonight and gave me a card with a hotline number. The doctor said the strangulation marks were significant and that I should come back if I had voice changes or trouble swallowing. I have the discharge summary in my work bag. I am not telling him about the ER visit.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'unknown',
    timestamp: '2026-04-14T19:15:00-04:00',
    corroboration: { doctor: true, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical', 'verbal'],
      summary: 'Same-day evening text entry recording the survivor\'s account of the ER visit. She notes that medical staff specifically inquired about her safety and provided resource information. The survivor states she has not disclosed the ER visit to the other person. This entry establishes both medical corroboration and an intentional information boundary.',
      severity: 'severe',
      injury_type: null,
      injury_locations: [],
      body_region: null,
      is_defensive_injury: false,
      visible_indicators: [],
      photo_quality: null,
      recommended_documentation: [
        'preserve the discharge summary in a location the other person cannot access',
        'consider whether a follow-up appointment is documented in writing',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-04-14T19:23:11-04:00',
  },

  // ── 25 ── Fri week 11. Photo. abdomen (#2). Severe. doctor=true. (After ER.)
  {
    modality: 'photo',
    textNotes: 'Stomach. He knew not to go for my neck or face this time.',
    narrative: 'Friday night, late. He went for my stomach and ribs this time. I think he knew not to put marks anywhere visible because I had a turtleneck on at the ER, and he saw it before I left for work Tuesday. He was careful tonight. The bruise is on the right side, low. Photo taken before I went to bed.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'abdomen',
    timestamp: '2026-04-17T23:00:00-04:00',
    corroboration: { doctor: true, witnesses: false, police: false, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical', 'coercive_control'],
      summary: 'Bruise to the right lower abdomen, consistent with a focused strike. The survivor describes the placement of the injury as intentional to avoid visible regions, suggesting awareness of her medical visit earlier in the week. This is the second documented abdominal injury in the timeline.',
      severity: 'severe',
      injury_type: 'bruise',
      injury_locations: ['abdomen'],
      body_region: 'abdomen',
      is_defensive_injury: false,
      visible_indicators: [
        'discrete bruise to right lower abdomen',
        'pattern consistent with focused strike',
        'survivor reports awareness of intentional placement by the other person',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'abdominal injuries can mask internal harm; medical follow-up is recommended',
        'patterns of injury placement that avoid visible regions are a documentable behavior',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-04-17T23:38:17-04:00',
  },

  // ── 26 ── Wed week 12. Photo. upper_arm_left (#7). Moderate. POLICE filed. doctor+police.
  {
    modality: 'photo',
    textNotes: 'Same arm. Police report filed today.',
    narrative: 'Wednesday afternoon. I filed a police report this morning with a detective who works domestic cases. I gave them the ER discharge summary and screenshots of the most recent text messages. The detective took down everything in writing. They gave me a case number. The bruise photo is from last night. Same arm, same place. The seventh time.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'upper_arm_left',
    timestamp: '2026-04-22T15:00:00-04:00',
    corroboration: { doctor: true, witnesses: false, police: true, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical', 'verbal'],
      summary: 'Continued documentation of the upper-left-arm finger-grip pattern. The survivor reports that a police report was filed the same day as this entry, providing the second institutional corroboration source after the ER record. This is the seventh injury to the same anatomical region.',
      severity: 'moderate',
      injury_type: 'bruise',
      injury_locations: ['upper_arm_left'],
      body_region: 'upper_arm_left',
      is_defensive_injury: true,
      visible_indicators: [
        'finger-grip bruising on upper left arm',
        'seventh entry to the same anatomical region',
        'first entry with concurrent police record',
      ],
      photo_quality: 'good',
      recommended_documentation: [
        'request a copy of the police report with the case number for the vault',
        'note that medical and police records are both now part of the documented trail',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-04-22T15:24:08-04:00',
  },

  // ── 27 ── Fri week 12. Voice. At a friend's house. doctor+police+witnesses.
  {
    modality: 'voice',
    textNotes: 'At my friend Dani\'s. Recording from her guest room.',
    narrative: 'Friday night. I left after work and went straight to Dani\'s house. I am not going home tonight. I recorded this from her guest room. I told her about everything. The arm, the neck, the ER visit, the police report. She wrote down the case number and the detective\'s name on a piece of paper and put it in her safe. She is a witness now.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'unknown',
    timestamp: '2026-04-24T22:30:00-04:00',
    corroboration: { doctor: true, witnesses: true, police: true, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical', 'verbal', 'coercive_control'],
      summary: 'Audio entry recorded from the home of a third party. The survivor reports having disclosed the full timeline to the third party, who has retained a written copy of identifying information for the medical and police records. This is the first entry with concurrent witness corroboration in addition to medical and police corroboration.',
      severity: 'moderate',
      injury_type: null,
      injury_locations: [],
      body_region: null,
      is_defensive_injury: false,
      visible_indicators: [],
      photo_quality: null,
      recommended_documentation: [
        'a third party retaining a written copy of case identifiers is a meaningful corroboration step',
        'consider asking the witness to record a brief statement of what they observed and were told',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-04-24T22:41:33-04:00',
  },

  // ── 28 ── Sat week 13. Photo. head_face (#5) + lip. Severe. He came to friend's house. All corroboration.
  {
    modality: 'photo',
    textNotes: 'He showed up at Dani\'s. Lip and face again.',
    narrative: 'Saturday night. He came to Dani\'s house. He talked his way through the door before Dani could stop him. He hit me twice. Lip again, side of the face again. Dani called the police. The police came. I am writing this in the back of an Uber to Dani\'s sister\'s house. There is a bruise forming where he hit me. Photo taken in the car using the front-facing camera.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'head_face',
    timestamp: '2026-05-02T23:15:00-04:00',
    corroboration: { doctor: true, witnesses: true, police: true, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['physical', 'verbal', 'stalking'],
      summary: 'Injury to the lip and left side of the face from an incident at a third-party residence. The survivor reports that the other person traveled to a location she had not disclosed to him and that a witness placed an emergency call which brought a police response. The fifth documented injury to the head and face region.',
      severity: 'severe',
      injury_type: 'bruise',
      injury_locations: ['head_face'],
      body_region: 'head_face',
      is_defensive_injury: false,
      visible_indicators: [
        'developing bruise on left side of face',
        'lip swelling',
        'fifth documented injury to head or face region',
        'incident occurred outside the survivor\'s home for the first time in the timeline',
      ],
      photo_quality: 'fair',
      recommended_documentation: [
        'request a copy of the police call record and any officer narrative from the on-scene response',
        'this incident establishes that the documented pattern continues outside the shared residence',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-05-02T23:52:21-04:00',
  },

  // ── 29 ── Sun week 13. Text. Summary of weekend, decision pending.
  {
    modality: 'text',
    textNotes: 'At Dani\'s sister\'s. Decision pending.',
    narrative: 'Sunday afternoon. I am at Dani\'s sister\'s house. The detective from the original case called me yesterday evening and wants to update the report with what happened Saturday. There is a victim advocate I can talk to on Monday morning. I have not gone back to the apartment. My bag was already mostly packed.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'unknown',
    timestamp: '2026-05-03T18:00:00-04:00',
    corroboration: { doctor: true, witnesses: true, police: true, digital: false },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['coercive_control'],
      summary: 'Text entry the day after the third-party-residence incident. The survivor records procedural next steps with the police detective and an advocate referral. She has remained outside the shared residence for a second consecutive night.',
      severity: 'moderate',
      injury_type: null,
      injury_locations: [],
      body_region: null,
      is_defensive_injury: false,
      visible_indicators: [],
      photo_quality: null,
      recommended_documentation: [
        'keep this entry alongside the police record update for continuity',
        'a victim advocate can help with safety planning and protective-order options',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-05-03T18:08:43-04:00',
  },

  // ── 30 ── Mon week 14. Voice. At safe location. Resolution. All corroboration including digital.
  {
    modality: 'voice',
    textNotes: 'Recorded from the safe location. I exported his texts to a file.',
    narrative: 'Monday afternoon. I am at a longer-term safe location that the advocate helped me find. I recorded this to mark the date. I also exported every text message thread between him and me onto a USB drive and gave a copy to my lawyer this morning. The advocate said I have a complete record. I do not know what comes next but I know what is already documented.',
    photoDataUrl: null,
    audioDataUrl: null,
    audioMime: null,
    bodyRegion: 'unknown',
    timestamp: '2026-05-11T14:00:00-04:00',
    corroboration: { doctor: true, witnesses: true, police: true, digital: true },
    status: 'reviewed',
    aiAnalysis: {
      evidence_type: 'injury_photo',
      incident_type: ['coercive_control'],
      summary: 'Audio entry recorded from a confidential location. The survivor reports having preserved a complete digital communication record onto an external storage device, with a copy held by legal counsel. This is the first entry in the timeline carrying all four corroboration sources (medical, witness, police, digital).',
      severity: 'moderate',
      injury_type: null,
      injury_locations: [],
      body_region: null,
      is_defensive_injury: false,
      visible_indicators: [],
      photo_quality: null,
      recommended_documentation: [
        'this entry can be exported alongside the medical, police, and digital records as a complete packet',
        'the documented timeline is now in a state suitable for advocate or legal-aid intake review',
      ],
    },
    analysis_source: 'gemma',
    analysis_ready: true,
    transcription_pending: false,
    user_corrections: [],
    savedAt: '2026-05-11T14:08:55-04:00',
  },
];

export default DEMO_RECORDS;
