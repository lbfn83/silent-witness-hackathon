# Silent Witness — Closed Enums (canonical reference)

## Severity signals (12 codes — closed, shared across all evidence types)

Use ONLY these codes in `severity_signals[]`. Never invent new codes.

| Code | Meaning |
|---|---|
| `strangulation_marker_neck` | Visible neck signs consistent with strangulation |
| `strangulation_marker_petechiae` | Pinpoint hemorrhages around eyes / face / behind ears |
| `defensive_pattern` | Bruising / abrasion on forearms or hand backs |
| `weapon_pattern` | Marks consistent with use of an object |
| `head_or_face_injury` | Injury on head, face, or scalp |
| `pregnancy_risk` | Survivor pregnant OR abdominal injury during pregnancy |
| `hand_grip_pattern` | Bruising consistent with grip on limb or neck |
| `repeated_within_30d` | New injury within 30 days of a prior documented incident |
| `child_present` | Child witness or child involved |
| `loss_of_consciousness` | Evidence or report of LOC during incident |
| `escalation_from_prior` | Severity, frequency, or weaponization increased vs. prior |
| `threat_to_kill` | Explicit threat to kill (verbal, written, or digital) |

---

## body_region enum (35 values — injury_photo only)

Pick the single closest value. Null + gap if uncertain.

```
head_top, head_back,
face_left, face_right, face_center,
eye_left, eye_right,
mouth,
ear_left, ear_right,
neck_anterior, neck_posterior, neck_left, neck_right,
shoulder_left, shoulder_right,
chest,
back_upper, back_lower,
abdomen,
hip_left, hip_right,
groin,
arm_upper_left, arm_upper_right,
arm_lower_left, arm_lower_right,
hand_left, hand_right,
leg_upper_left, leg_upper_right,
leg_lower_left, leg_lower_right,
foot_left, foot_right
```

---

## injury_kind[] (injury_photo)
`bruise`, `laceration`, `abrasion`, `swelling`, `burn`, `bite`, `strangulation_mark`, `fracture_suspected`, `pattern_injury`, `other`

## coloration (injury_photo)
`red`, `purple`, `blue`, `green`, `yellow`, `brown`, `mixed`, `n/a`

## apparent_age_of_injury (injury_photo)
`fresh_<24h`, `1-3d`, `3-7d`, `1-2w`, `older`, `unknown`

## pattern_consistent_with[] (injury_photo)
`hand_strike`, `grip_marks`, `ligature`, `object_impact`, `bite`, `none_visible`

---

## platform (digital_communication_photo)
`sms`, `imessage`, `whatsapp`, `signal`, `messenger`, `instagram_dm`, `email`, `tiktok_dm`, `other`

## direction (digital_communication_photo)
`from_perpetrator`, `to_perpetrator`, `between_third_parties`

## content_tags[] (digital_communication_photo)
`threat`, `coercion`, `apology_cycle`, `monitoring`, `financial_pressure`, `child_weaponization`, `sexual_coercion`, `love_bombing`, `gaslighting`

---

## medium (journal_entry_photo)
`handwritten`, `typed`, `note_app_screenshot`, `mixed`

---

## damage_kind[] (property_damage_photo)
`shattered`, `dented`, `torn`, `burned`, `punctured`, `displaced`, `liquid_damage`, `other`

## suspected_cause (property_damage_photo)
`thrown_object`, `struck`, `kicked`, `crushed`, `set_alight`, `unknown`

## ownership (property_damage_photo, clothing_object_photo)
`survivor`, `perpetrator`, `shared`, `third_party`

---

## document_kind (medical_document_photo)
`discharge_summary`, `ed_record`, `imaging_report`, `prescription`, `clinic_note`, `provider_letter`, `other`

---

## setting (scene_photo)
`interior_residence`, `exterior_residence`, `vehicle`, `workplace`, `public_space`, `other`

## disorder_level (scene_photo)
`none`, `minor`, `moderate`, `severe`

---

## condition[] (clothing_object_photo)
`torn`, `stained`, `bloodied`, `stretched`, `cut`, `burned`, `missing_pieces`

## stain_apparent_substance (clothing_object_photo)
`blood_apparent`, `unknown_dark`, `unknown_light`, `none`

---

## document_kind (legal_document_photo)
`restraining_order`, `police_report`, `court_filing`, `custody_order`, `eviction_notice`, `attorney_letter`, `other`

---

## record_kind (financial_record_photo)
`bank_statement`, `card_statement`, `receipt`, `pay_stub`, `bill`, `transfer_confirmation`, `crypto_tx`, `other`

## pattern_tags[] (financial_record_photo)
`recurring_to_perpetrator`, `large_withdrawal_unfamiliar`, `account_drained`, `card_maxed`, `denied_access_evidence`
