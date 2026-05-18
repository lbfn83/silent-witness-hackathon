# Evidence Schema (canonical)

Status: v1.3 — SW-SCHEMA-003 (supersedes v1.2 / SW-SCHEMA-002)
Owners: Tobi + Wonjae
Consumers: PWA classifier UI, Sprite VM extraction prompts (SW-PROMPT-001/002/003), pattern-analysis prompt (SW-PROMPT-004), Chain of Custody envelope

## Changelog

- **v1.3 (2026-05-11)** — SW-SCHEMA-003. Adds the **pattern_analysis extension** (§9) — a cross-incident analysis record produced by `prompts/pattern_analysis.v1.md`. This is NOT a 10th `evidence_type`. It is a separate `record_kind: "pattern_analysis"` artifact whose input is an array of `incident` records and whose output is a structured pattern report consumable by the survivor review screen and (later) an advocate / legal-aid intake UI. Severity codes still flow from the canonical §1.1 enum; manipulation patterns across messages use the plain-language vocabulary aligned with `digital_communication_photo.v1`'s `content_tags[]` + a small extended plain-language set defined in §9.2. No changes to existing per-type extensions; no changes to base fields. Filename strategy unchanged: `pattern_analysis.v1.md` is the stable filename, with `prompt_version` bumped in frontmatter on content changes (cache invalidated via `sw.js` `CACHE_NAME` bump). Reason for separation from `evidence_type`: pattern_analysis records have no captured photo, no single `occurred_at`, and their chain of custody is over a *set* of incidents rather than a capture event — folding them into the 9-type discriminator would break the §5 base validation rules (4, 5, 13) wholesale.

- **v1.2 (2026-05-11)** — SW-SCHEMA-002. Three additions to `journal_entry_photo` (§2.3) plus a cache-first lock on prompt loading:
  1. **`medium` enum gains `"mixed"`** for pages that combine handwritten + typed content (e.g. handwritten page with a typed sticker, typed page with a handwritten margin annotation). Picking rule: the **dominant medium is primary**; `"mixed"` is a flag indicating both are present in non-trivial amounts, not a fourth medium category. If a page is 95% handwritten with one printed date stamp, `medium: "handwritten"` (not `"mixed"`). Use `"mixed"` only when neither medium is clearly dominant or both carry semantically distinct content.
  2. **`named_actors[]` extension field** restored on `journal_entry_photo`. Each entry: `{label: 'S1'|'P1'|'P2'|...|'W1'|'R1'|'C1', words_in_journal: string, role_if_stated: string|null}`. `label` follows the v1.1 actor-labeling rules (§1). `words_in_journal` is the verbatim string from the page (e.g. `"Mark"`, `"my husband"`, `"the officer"`). `role_if_stated` is what the journal entry itself says about the relationship (e.g. `"my husband"`, `"the officer"`, `null` if not stated on the page). The extractor uses the existing record-level `actor_display_map` to map verbatim names → stable labels; if the model cannot disambiguate confidently, it emits `P?` or `W?` (generic placeholder) and adds a `gaps[]` entry asking the PWA to resolve.
  3. **`referenced_incidents[]` extension field** added on `journal_entry_photo`. Each entry: `{date_claimed: string|null, event_summary_verbatim: string, page_location_hint: string|null}`. `date_claimed` is whatever the writer wrote — `"last Tuesday"`, `"March 3"`, `"around Easter"` — **verbatim, not normalized**. `event_summary_verbatim` is the journal's own words for what happened. `page_location_hint` is optional context like `"top paragraph"` or `"after the second drawing"` for downstream linking. This replaces the v1.1 workaround of pushing referenced-incident detail into `gaps[]` as `suggested_followup` strings.
  4. **Cache-first prompt loading lock** (cross-cutting; encoded in `API_CONTRACT.md`): `/prompts/*.md` are served cache-first by the service worker. Cache invalidation is triggered by SW version bump or filename change.

  **Filename strategy for prompt files (decision):** keep stable `<type>.v1.md` filenames forever; bump only the in-file `prompt_version` frontmatter on schema updates. Trade-off captured: stable filename keeps `EXTRACT_PROMPT_FILES` dispatch in `inference_chat.next.js` simple and avoids file churn, at the cost of requiring the SW `CACHE_NAME` to be bumped on every prompt content change so clients re-fetch. The alternative — versioned filenames (`<type>.v1.2.md`) — gives automatic cache invalidation but multiplies file count over time and requires dispatch-table edits on every bump. Stable filenames win for hackathon-stage iteration velocity. **Operational requirement:** every prompt content change MUST be paired with a `CACHE_NAME` bump in `sw.js`.

  Drift note: v1.1 (SW-SPEC-001) explicitly removed `named_actors[]` and `referenced_incidents[]` from `journal_entry_photo` and pushed both into `gaps[]` `suggested_followup` strings. v1.2 reverses that decision because: (a) the gap-only path produced unstructured downstream that the PWA actor-labeling UI and the cross-entry incident graph couldn't consume reliably; (b) verbatim quotation belongs in a typed field, not a free-text gap reason. The v1.1 rationale (labels are PWA-assigned, not prompt-assigned) is preserved by allowing `P?`/`W?` placeholders when the model can't resolve confidently.

- **v1.1 (2026-05-11)** — SW-SPEC-001. Baked in 7 locked decisions:
  1. Unknown values: set field to `null` AND append `{field, reason}` to `gaps[]` (codified in §1 base fields + §5 validation rules).
  2. Body-region: hybrid model — canonical snake_case enum (35 regions) PLUS preserved `body_region_user_words` raw survivor language. Gemma maps user words → enum and stores both.
  3. Shared severity enum lifted from `injury_photo.v1.md` into the canonical schema as the single source of truth. 12 codes. Every prompt picks from this list — never invents its own.
  4. Confidence: single `confidence: 0.0–1.0` float per record in base fields (replaces per-field `model_confidence`).
  5. Actor labeling: in-record actors use stable labels (`P1`, `P2`, `W1`, `R1`). New `actor_display_map` field stores label → user-provided name. Map is encrypted at rest, joined back ONLY at export when survivor opts in.
  6. `prompt_version` format locked: `<evidence_type>.v<n>`, e.g. `injury_photo.v1`.
  7. Tombstone retention: 30 days. When the phone deletes payload after VM ack, the stub is kept 30 days then auto-purged. (Affects `OUTBOX_FSM.md` — flagged below.)
- **v0.1 (prior)** — Initial draft (SW-SCHEMA-001). Nine evidence types, base + per-type extension blocks, `gaps[]` convention, migration map from `inference_chat.js`.

---

This is the single source of truth for the structured JSON every evidence
entry carries. The PWA classifier UI, the per-type extraction prompts, and
the VM persistence layer MUST all conform to it. If you change a field name
here, the prompts and the UI change in the same PR.

The 9 evidence types are:

```
injury_photo
digital_communication_photo
journal_entry_photo
property_damage_photo
medical_document_photo
scene_photo
clothing_object_photo
legal_document_photo
financial_record_photo
```

`evidence_type` is the discriminator. The full record is `BaseFields ∪
PerTypeExtension[evidence_type]`.

---

## 1. Base fields (every evidence type carries these)

| Field | Type | Required | Notes |
|---|---|---|---|
| `incident_id` | string (uuid v4) | **required** | Generated on capture. Stable across all chain events. |
| `evidence_type` | enum (one of the 9) | **required** | Discriminator. Written by `classified` event. |
| `schema_version` | string | **required** | e.g. `"evidence-v1.2"`. Bump on any breaking change. |
| `captured_at` | string (ISO-8601 with offset) | **required** | When the device wrote the file. Authoritative. |
| `occurred_at` | string (ISO-8601 with offset) \| null | optional | When the incident happened. Often differs from `captured_at`. Null + gap if survivor doesn't know. |
| `occurred_at_precision` | enum: `exact` \| `hour` \| `day` \| `week` \| `month` \| `unknown` | **required** | Granularity of `occurred_at`. `unknown` when `occurred_at` is null. |
| `location` | object \| null | optional | `{ kind: "home"\|"work"\|"vehicle"\|"public"\|"other", text, coords?: {lat, lng, accuracy_m}, withheld: bool }`. `withheld:true` means survivor declined to record. Null → gap. |
| `actors[]` | array<Actor> | optional | People referenced. `Actor = { label, role, relationship?, age_band? }`. **`label` MUST be from the stable label space:** `P1, P2, ...` (perpetrators / persons of interest), `W1, W2, ...` (witnesses), `R1, R2, ...` (responders — police, medical), `C1, C2, ...` (children), `S1` (survivor — self). Never raw names. See `actor_display_map`. |
| `actor_display_map` | object \| null | optional | Map from stable label → user-provided display name, e.g. `{ "P1": "Mark", "W1": "my sister" }`. **Encrypted at rest in the VM vault** (separate envelope from the record). NEVER joined into the record body. Only joined back at export, and only when the survivor explicitly opts in for that export. Null when no display names have been captured. |
| `incident_type` | array<enum> | optional | Tags: `physical`, `verbal`, `digital`, `financial`, `coercive_control`, `property`, `sexual`, `stalking`, `legal_threat`. Multi-select. |
| `narrative` | object | **required** | `{ user_words: string, model_summary: string\|null }`. `user_words` is verbatim survivor input. `model_summary` is third-person past tense (per Prompts Workspace template). Null `model_summary` → gap. |
| `severity_signals[]` | array<enum> | optional | Multi-select from the **shared severity enum** (§1.1). Closed list. Every extraction prompt picks from this list and **never invents its own codes**. New values require a schema bump. |
| `confidence` | number 0.0–1.0 | **required** | **Single record-level confidence** for the structured extraction. NOT per-field. Per-field uncertainty is expressed by `null` + a `gaps[]` entry. |
| `chain_of_custody[]` | array<ChainEvent> | **required** | Conforms to Chain of Custody Spec. Append-only. First entry is always `captured`. |
| `evidence_attached[]` | array<Attachment> | optional | `Attachment = { kind: "photo"\|"audio"\|"video"\|"text", mime, sha256, size_bytes, duration_ms?, dimensions? }`. The bytes live in the encrypted blob store; this is the manifest. |
| `device_attestation` | object | **required** | `{ device_id_hash, app_version, os, os_version, capture_app, secure_capture: bool }`. `secure_capture:true` only if the photo came from the in-app camera (not gallery import). |
| `gaps[]` | array<Gap> | **required** (may be empty) | See §3. Any field the extractor couldn't fill confidently lands here. **Rule: every `null` field MUST have a matching `gaps[]` entry.** |
| `prompt_versions` | object | **required** | Map of `event_kind → prompt_version`, where each `prompt_version` follows the canonical format `<evidence_type>.v<n>` (see §1.2), e.g. `{ classify: "classifier.v1", extract: "injury_photo.v1", describe: "describe.v1" }`. Mirrors the chain. |

### 1.1 Shared severity enum (canonical)

This list is lifted from `injury_photo.v1.md` and promoted to the canonical
schema. **Every prompt picks from this list and never invents its own.**
The 12 codes:

| Code | Plain meaning |
|---|---|
| `strangulation_marker_neck` | Visible neck signs consistent with strangulation (banding, abrasion, ligature). |
| `strangulation_marker_petechiae` | Pinpoint hemorrhages around eyes / face / behind ears — high-lethality indicator. |
| `defensive_pattern` | Bruising / abrasion in defensive distribution (forearms, hand backs). |
| `weapon_pattern` | Marks consistent with use of an object (linear bruise, puncture, burn shape). |
| `head_or_face_injury` | Injury localized to head, face, or scalp. Elevated medical risk. |
| `pregnancy_risk` | Survivor pregnant OR abdominal-targeted injury during pregnancy. |
| `hand_grip_pattern` | Bruising consistent with grip (thumb + finger distribution on limb / neck). |
| `repeated_within_30d` | New injury within 30 days of a prior documented incident in vault. |
| `child_present` | Child witness or child involved at time of incident. |
| `loss_of_consciousness` | Survivor reports / evidence suggests LOC during incident. |
| `escalation_from_prior` | Severity, frequency, or weaponization increased vs. prior entries. |
| `threat_to_kill` | Explicit threat to kill recorded (verbal, written, or digital). |

**Closed enum.** Any signal not in this list MUST NOT be emitted. If the
extractor sees something potentially severity-relevant outside the enum, it
emits a `gaps[]` entry with `field: "severity_signals"` and the reason —
it does not invent a new code.

### 1.2 `prompt_version` format

Canonical format: `<evidence_type>.v<n>` (or `<role>.v<n>` for non-per-type
prompts like `classifier.v1`).

Examples:
- `injury_photo.v1` — injury extractor, version 1
- `digital_communication_photo.v1` — DM extractor, version 1
- `classifier.v1` — the cross-type classifier
- `describe.v1` — the narrative-rewrite prompt
- `statute_match.v1` — statute matcher
- `timeline.v1` — timeline reconstructor

Rules:
- Lowercase. Snake_case for the prefix. Single dot before `v`.
- Version is an integer, no minor versions. A prompt change that affects
  output shape bumps the integer.
- Phone and VM both maintain a registry. `prompt_version_unknown` (per
  API contract) fires if the phone sends a version the VM doesn't have.

### 1.3 Required fields (the 5 we hold the line on)

These five are non-negotiable. The extractor MUST emit them. If unsure,
emit a sentinel + log a `gaps[]` entry, do not omit the key.

1. `incident_id`
2. `evidence_type`
3. `captured_at`
4. `narrative` (object — at minimum `user_words` must be present; `model_summary` may be null with a gap)
5. `chain_of_custody[]` (at minimum the `captured` event)

`schema_version`, `occurred_at_precision`, `device_attestation`,
`prompt_versions`, `confidence`, and `gaps[]` are also required by the
schema, but they are written by the platform (device + VM glue), not by
Gemma. The five above are what an extraction prompt is judged against.

---

## 2. Per-type extension blocks

Each block lists fields ADDED on top of the base for that `evidence_type`.
Every extension field is nullable; uncertainty is expressed via **`null` +
`gaps[]` entry**, never via missing keys.

### 2.1 `injury_photo`

| Field | Type | Notes |
|---|---|---|
| `body_region` | enum \| null | **Canonical snake_case enum**, see §2.1.1. Set by Gemma after mapping survivor's words. Null + gap if Gemma can't map confidently. |
| `body_region_user_words` | string \| null | **Raw survivor language**, verbatim. Preserved alongside the canonical enum value. E.g. "right cheekbone" → `body_region: "face_right"` AND `body_region_user_words: "right cheekbone"`. Both are stored. |
| `injury_kind[]` | array<enum> | `bruise`, `laceration`, `abrasion`, `swelling`, `burn`, `bite`, `strangulation_mark`, `fracture_suspected`, `pattern_injury`, `other`. |
| `coloration` | enum \| null | `red`, `purple`, `blue`, `green`, `yellow`, `brown`, `mixed`, `n/a`. Aging cue, not diagnosis. |
| `apparent_age_of_injury` | enum \| null | `fresh_<24h`, `1-3d`, `3-7d`, `1-2w`, `older`, `unknown`. |
| `pattern_consistent_with[]` | array<enum> | `hand_strike`, `grip_marks`, `ligature`, `object_impact`, `bite`, `none_visible`. Descriptive only — never diagnostic. |
| `medical_attention_sought` | bool \| null | |
| `paired_evidence_suggested[]` | array<string> | Suggestions surfaced to the survivor: e.g. `"medical_document_photo"`. Never auto-attached. |

Validation: if `injury_kind[]` is non-empty, `body_region` MUST be set OR
`gaps[]` MUST contain `{field: "body_region", reason: "..."}`. If
`body_region` is set but `body_region_user_words` is null, that is allowed
(survivor may have answered via a region picker, not text).

#### 2.1.1 Canonical `body_region` enum (35 regions)

Snake_case, left/right where laterality matters. **Closed enum.** Anything
that doesn't fit → `null` + gap.

```
# Head & face
head_top
head_back
face_left
face_right
face_center
eye_left
eye_right
mouth
ear_left
ear_right

# Neck
neck_anterior
neck_posterior
neck_left
neck_right

# Torso
shoulder_left
shoulder_right
chest
back_upper
back_lower
abdomen
hip_left
hip_right
groin

# Arms
arm_upper_left
arm_upper_right
arm_lower_left
arm_lower_right
hand_left
hand_right

# Legs
leg_upper_left
leg_upper_right
leg_lower_left
leg_lower_right
foot_left
foot_right
```

Mapping rule: Gemma reads `body_region_user_words` and selects the **closest
single region**. If two regions are equally plausible, pick the one with
the higher strangulation/head/face risk weighting and add a gap noting the
alternative. Multi-region injuries: pick the primary, list others in a gap
with `field: "body_region"` and `suggested_followup: "ask survivor to
confirm additional regions"`.

### 2.2 `digital_communication_photo`

| Field | Type | Notes |
|---|---|---|
| `platform` | enum \| null | `sms`, `imessage`, `whatsapp`, `signal`, `messenger`, `instagram_dm`, `email`, `tiktok_dm`, `other`. |
| `direction` | enum \| null | `from_perpetrator`, `to_perpetrator`, `between_third_parties`. |
| `sender_label` | string \| null | Stable label from `actors[]` (e.g. `"P1"`). Never raw phone/handle. |
| `message_count` | integer \| null | Number of messages visible in the screenshot. |
| `message_text[]` | array<string> | Verbatim OCR transcript, one entry per message bubble. |
| `timestamps_visible[]` | array<string> | Whatever timestamps the screenshot shows; verbatim. |
| `content_tags[]` | array<enum> | `threat`, `coercion`, `apology_cycle`, `monitoring`, `financial_pressure`, `child_weaponization`, `sexual_coercion`, `love_bombing`, `gaslighting`. |
| `redactions_applied[]` | array<string> | Fields the survivor asked to blur (e.g. `"phone_number"`). |

Validation: `message_count > 0` requires `message_text[]` to be non-empty
OR a gap entry.

### 2.3 `journal_entry_photo`

| Field | Type | Notes |
|---|---|---|
| `medium` | enum \| null | `handwritten`, `typed`, `note_app_screenshot`, `mixed`. **v1.2:** `"mixed"` covers pages combining handwritten + typed content (e.g. handwritten page with typed sticker, typed page with handwritten margin annotation). Picking rule: dominant medium wins; `"mixed"` is a flag, not a fourth medium. Use only when neither is clearly dominant or both carry semantically distinct content. |
| `transcript` | string \| null | Full OCR transcript. |
| `entry_date_in_text` | string \| null | If the journal page is dated, that date verbatim. |
| `themes[]` | array<enum> | Same vocabulary as `incident_type`. |
| `emotional_state_words[]` | array<string> | Verbatim — never paraphrase. |
| `references_other_incidents` | bool \| null | |
| `named_actors[]` | array<NamedActor> | **v1.2.** People referenced by name on the page. `NamedActor = { label, words_in_journal, role_if_stated }`. `label` MUST come from the actor-label space in §1 (`S1`, `P1..Pn`, `W1..Wn`, `R1..Rn`, `C1..Cn`) — typically resolved against the record's `actor_display_map`. If the model cannot disambiguate which existing label a name maps to, it emits the generic placeholder `P?` or `W?` and adds a `gaps[]` entry asking the PWA to resolve. `words_in_journal` is the verbatim string from the page (e.g. `"Mark"`, `"Daniel"`, `"my husband"`). `role_if_stated` is what the journal itself says about the relationship (e.g. `"my husband"`, `"the officer"`, `null` if the page does not state a role). |
| `referenced_incidents[]` | array<ReferencedIncident> | **v1.2.** Past incidents the page describes as having happened. `ReferencedIncident = { date_claimed, event_summary_verbatim, page_location_hint }`. `date_claimed` is whatever date the writer wrote — `"last Tuesday"`, `"March 3"`, `"around Easter"` — **verbatim, never normalized**, or `null` if no date was attached on the page. `event_summary_verbatim` is the journal's own words for what happened (verbatim quotation preferred; if the wording spans many lines, the verbatim phrase that anchors the incident). `page_location_hint` is optional context the PWA can use for linking, e.g. `"top paragraph"`, `"after the second drawing"`, or `null`. Hypotheticals, wishes, or fears are NOT incidents — only events the writer describes as having happened. |

### 2.4 `property_damage_photo`

| Field | Type | Notes |
|---|---|---|
| `object` | string \| null | "phone screen", "front door", "drywall", etc. |
| `damage_kind[]` | array<enum> | `shattered`, `dented`, `torn`, `burned`, `punctured`, `displaced`, `liquid_damage`, `other`. |
| `suspected_cause` | enum \| null | `thrown_object`, `struck`, `kicked`, `crushed`, `set_alight`, `unknown`. |
| `replacement_cost_estimate_usd` | number \| null | |
| `ownership` | enum \| null | `survivor`, `perpetrator`, `shared`, `third_party`. |

### 2.5 `medical_document_photo`

| Field | Type | Notes |
|---|---|---|
| `document_kind` | enum \| null | `discharge_summary`, `ed_record`, `imaging_report`, `prescription`, `clinic_note`, `provider_letter`, `other`. |
| `provider_name` | string \| null | OCR. |
| `provider_address` | string \| null | OCR. |
| `visit_date` | string (ISO-8601 date) \| null | |
| `diagnoses_listed[]` | array<string> | Verbatim — Gemma does not interpret medical terms. |
| `treatments_listed[]` | array<string> | Verbatim. |
| `references_violence` | bool \| null | True only if document explicitly references assault/abuse. |
| `patient_name_visible` | bool | For redaction UI. |

### 2.6 `scene_photo`

| Field | Type | Notes |
|---|---|---|
| `setting` | enum \| null | `interior_residence`, `exterior_residence`, `vehicle`, `workplace`, `public_space`, `other`. |
| `room` | string \| null | "kitchen", "bedroom". |
| `objects_of_interest[]` | array<string> | Anything visible that supports the narrative (broken glass, overturned chair). |
| `disorder_level` | enum \| null | `none`, `minor`, `moderate`, `severe`. |
| `time_of_day_inferred` | enum \| null | `day`, `night`, `dawn_dusk`, `unknown`. |
| `bystanders_visible` | bool \| null | |

### 2.7 `clothing_object_photo`

| Field | Type | Notes |
|---|---|---|
| `item` | string \| null | "torn shirt", "bloodied sock". |
| `condition[]` | array<enum> | `torn`, `stained`, `bloodied`, `stretched`, `cut`, `burned`, `missing_pieces`. |
| `stain_apparent_substance` | enum \| null | `blood_apparent`, `unknown_dark`, `unknown_light`, `none`. Descriptive only. |
| `ownership` | enum \| null | `survivor`, `perpetrator`, `child`, `other`. |
| `worn_during_incident` | bool \| null | |

### 2.8 `legal_document_photo`

| Field | Type | Notes |
|---|---|---|
| `document_kind` | enum \| null | `restraining_order`, `police_report`, `court_filing`, `custody_order`, `eviction_notice`, `attorney_letter`, `other`. |
| `case_number` | string \| null | OCR. |
| `jurisdiction` | string \| null | "Alameda County Superior Court". |
| `parties[]` | array<string> | Stable labels from `actors[]`. |
| `effective_date` | string (ISO-8601 date) \| null | |
| `expiration_date` | string (ISO-8601 date) \| null | |
| `provisions_summarized[]` | array<string> | Short phrases verbatim from the doc. No interpretation. |

### 2.9 `financial_record_photo`

| Field | Type | Notes |
|---|---|---|
| `record_kind` | enum \| null | `bank_statement`, `card_statement`, `receipt`, `pay_stub`, `bill`, `transfer_confirmation`, `crypto_tx`, `other`. |
| `institution` | string \| null | "Chase", "Venmo". |
| `period_start` / `period_end` | string (ISO-8601 date) \| null | |
| `notable_transactions[]` | array<{date, amount, currency, counterparty, note}> | Only items the survivor flagged or that match coercive-financial patterns. |
| `pattern_tags[]` | array<enum> | `recurring_to_perpetrator`, `large_withdrawal_unfamiliar`, `account_drained`, `card_maxed`, `denied_access_evidence`. |
| `account_holder_visible` | bool | Redaction UI cue. |

---

## 3. Null + `gaps[]` convention

Rule: **when uncertain, return `null` AND append a structured entry to
`gaps[]`. Never omit a field.** A `null` without a matching gap is a
schema violation.

```json
{
  "field": "body_region",
  "reason": "image cropped above shoulder; cannot localize",
  "suggested_followup": "ask survivor to identify region verbally"
}
```

`Gap` shape:

| Field | Type | Notes |
|---|---|---|
| `field` | string (dotted path) | e.g. `"injury_kind"` or `"location.coords"`. |
| `reason` | string | One sentence, plain English. |
| `suggested_followup` | string \| null | What the UI should prompt the survivor for. |

**Note (v1.1):** per-gap `model_confidence` is removed. Record-level
`confidence` (§1) is the single confidence signal. A gap simply says "I
don't know this field"; the record's overall trustworthiness is captured
by `confidence`.

Why this matters: a missing key looks like a schema bug. A `null` + gap
looks like an honest "I don't know" — which is what the courtroom wants
and what the survivor UI can act on.

---

## 4. Migration note — current `inference_chat.js` → canonical

Current shape in `inference_chat.js` (lines 22–29, 196–204):

```js
{
  injury_description, injury_locations[], severity_assessment,
  visible_indicators[], recommended_documentation[], summary
}
```

This shape is **injury-only** — a single hard-coded flat object. It does
not know about the other 8 evidence types and has no envelope, no chain,
no gaps. Concretely:

| Current field (inference_chat.js) | Canonical home | Migration action |
|---|---|---|
| `injury_description` (L23) | `narrative.model_summary` (when `evidence_type=injury_photo`) | Rename + move under `narrative`. |
| `injury_locations[]` (L24) | `body_region` (singular) + `body_region_user_words` under injury extension | Map free-text to canonical enum; preserve original in `body_region_user_words`. Additional regions → gap entry. |
| `severity_assessment` enum mild/moderate/severe (L25, L31) | **removed** | Replaced by structured `severity_signals[]` from the shared enum (§1.1). Mild/moderate/severe is too lossy for court. |
| `visible_indicators[]` (L26) | `injury_kind[]` + `pattern_consistent_with[]` (injury extension) | Split: medical-style cues vs. cause-style cues. |
| `recommended_documentation[]` (L27) | `paired_evidence_suggested[]` (injury extension) | Rename. |
| `summary` (L28) | `narrative.model_summary` | Same destination as `injury_description`. Pick one — `narrative.model_summary` is the canonical field. |
| `_raw_output` fallback (L203) | drop | Replace with a `gaps[]` entry + record-level `confidence: 0` on `narrative` parse failure. |

Other fixes the rewrite picks up:

- `ANALYSIS_SYSTEM_PROMPT` (L19) hard-codes the injury vocabulary. After
  migration, the system prompt is **selected by `evidence_type`** — one
  prompt per type (the 9 prompts SW-PROMPT-001/002/003 will author), all
  drawing severity codes from the §1.1 shared enum.
- The current parser (L181–205) silently swallows malformed model output
  and returns a fake "Could not parse AI output" record. Canonical
  behavior: surface the parse failure as a `gaps[]` entry on
  `narrative`, set record-level `confidence: 0`, and refuse to
  auto-approve.
- `storage.js` (L32–38) writes whatever `data` shape it's handed and only
  indexes on `timestamp`. After migration it should also index on
  `evidence_type` and `incident_id`, and reject writes that fail
  `schema_version` validation.
- The classifier step is **not yet present** in `inference_chat.js` at
  all. Today the app assumes "every entry is an injury report." The
  canonical flow is: classify → select extraction prompt → extract →
  describe. That's a new pipeline, not a tweak.

---

## 5. Validation rules

Enforced by the VM glue before any record is written. Failures emit a
`gaps[]` entry rather than a hard reject — except for the five required
base fields, which hard-fail.

1. `evidence_type` MUST be one of the 9. Anything else → reject, return
   to classifier.
2. `incident_id` MUST be uuid v4. Reject otherwise.
3. `captured_at` MUST parse as ISO-8601 with timezone offset. Reject
   otherwise.
4. `narrative.user_words` MUST be a non-empty string. Reject otherwise.
5. `chain_of_custody[0].event` MUST equal `"captured"`. Reject otherwise.
6. `occurred_at_precision == "unknown"` IFF `occurred_at == null`.
7. If `evidence_type == "injury_photo"` and `injury_kind[]` is
   non-empty, then `body_region != null` OR a `gaps[]` entry exists with
   `field == "body_region"`.
8. If `evidence_type == "digital_communication_photo"` and
   `message_count > 0`, then `message_text[]` is non-empty OR a gap
   entry exists with `field == "message_text"`.
9. If `evidence_type == "medical_document_photo"` and
   `patient_name_visible == true`, the UI MUST present a redaction step
   before `approved` can be signed.
10. If `evidence_type == "financial_record_photo"` and
    `account_holder_visible == true`, same redaction gate as above.
11. `prompt_versions.classify` MUST be present on any record where
    `chain_of_custody[]` contains a `classified` event.
12. `prompt_versions.extract` MUST be present on any record where
    `chain_of_custody[]` contains an `extracted` event.
13. Every key declared in the base schema MUST be present in the JSON,
    even if its value is `null` or `[]`. Missing keys are a contract
    breach.
14. `confidence` MUST be in `[0.0, 1.0]`. Required on every record.
15. `severity_signals[]` entries MUST each be from the closed enum in
    §1.1. New values require a schema bump. A prompt emitting a code
    outside the enum → reject + classifier-return.
16. **Null/gap parity.** Every base or extension field whose value is
    `null` MUST have a matching `gaps[]` entry with the same `field`
    path. A `null` without a gap → reject.
17. **Actor labels.** Every entry in `actors[].label` MUST match
    `^(S1|P\d+|W\d+|R\d+|C\d+)$`. Free-text names in the label slot →
    reject. Display names live ONLY in `actor_display_map`.
18. **`actor_display_map` isolation.** `actor_display_map` MUST be
    stored in a separate encrypted envelope inside the VM vault, NOT
    inlined in the record body when written to chain or transmitted at
    export unless the survivor explicitly opts in for that export.
19. **`prompt_versions` values** MUST match the §1.2 format:
    `^[a-z_]+\.v\d+$`. Anything else → reject.

---

## 6. Tombstone retention

When the phone deletes the local payload after a successful `vault.write.ack`
from the VM, it does **not** delete the local record stub. The stub
(envelope-only: `incident_id`, `evidence_type`, `chain_head_hash`,
`captured_at`, `vault_version`) is retained for **30 days** and then
auto-purged.

Rationale:
- 30 days covers the realistic re-sync window if the phone loses its vault
  connection or the survivor switches devices.
- Past 30 days, the chain head and vault are the source of truth; keeping
  the stub longer creates a discoverable trail on the device that the
  survivor explicitly asked to be removed.

This impacts the local outbox state machine and is flagged for
`OUTBOX_FSM.md` follow-up — see §8.

---

## 7. Open questions for prompt authors

These belong with SW-PROMPT-001/002/003 before v1 lock:

- **Closed vs. open enums.** Several fields (`incident_type`,
  `pattern_consistent_with`, `body_region`, `severity_signals`) use
  closed enums. The v1.1 rule is **closed enum + `gaps[]` escape hatch
  only** — confirm with prompt authors that this matches their model
  behavior at q8 (do they hallucinate codes outside the enum often
  enough to need a hardening pass?).
- **Verbatim vs. paraphrase.** `transcript`, `message_text[]`,
  `provisions_summarized[]`, `emotional_state_words[]` are spec'd
  verbatim. Confirm Gemma is reliably verbatim at q8 — if not, we need
  a `text_is_verbatim: bool` flag per field.
- **`model_summary` tense.** Prompts Workspace template says "third
  person past tense." Confirm this applies to `journal_entry_photo`
  even though the source is first-person — court-readable summary vs.
  preserving the survivor's voice.
- **`severity_signals[]` ownership.** Does this get populated by the
  per-type extractor or by the cross-entry pattern-analysis prompt?
  Both pull from the §1.1 enum, but only one should write per record.
- **Cost estimate on `property_damage_photo`.** Is Gemma allowed to
  guess `replacement_cost_estimate_usd`, or always null + gap unless
  the survivor states it?
- **`paired_evidence_suggested[]` UX.** Confirm this surfaces as a
  suggestion in the PWA, never as an auto-attach.
- **`body_region` mapping confidence.** When `body_region_user_words`
  is preserved but the canonical enum mapping is uncertain, do we
  store the candidate enum + a gap, or null + gap and lean on the
  user-words string? Affects court display.

---

## 8. Follow-up Impacts

Files that need v1.1 alignment in follow-up tickets (likely SW-CLIENT-002,
SW-PROMPT-001/002/003, SW-OUTBOX-001):

- **`docs/API_CONTRACT.md`** — companion spec, updated to v1.1 in this
  ticket (SW-SPEC-001).
- **`docs/OUTBOX_FSM.md`** — must implement the 30-day tombstone retention
  rule (§6). Add a `tombstone_expires_at` field on the local stub and a
  background sweep that auto-purges. Not edited here.
- **`docs/REFACTOR_NOTES.md`** — note (a) the actor label space and the
  `actor_display_map` encrypted-at-rest requirement, (b) the canonical
  `body_region` enum + `body_region_user_words` dual storage, (c)
  removal of per-field confidence in favor of record-level `confidence`,
  (d) the closed shared severity enum.
- **Prompt files** (per `injury_photo.v1.md`,
  `digital_communication_photo.v1.md`, the other 7): each prompt MUST be
  rewritten to (i) pull severity codes from the §1.1 enum, (ii) emit
  `prompt_version` in the `<evidence_type>.v<n>` form, (iii) emit
  `null` + `gaps[]` rather than omitting fields, (iv) emit a single
  record-level `confidence`.
- **`gemma-pwa/src/inference_chat.next.js`** (the post-migration rewrite
  of `inference_chat.js`): must conform to v1.1 base + extension shapes;
  drop `_raw_output` fallback; route severity through the §1.1 enum.
- **Chain of Custody Spec** — confirm `prompt_version` strings inside
  `classified` / `extracted` / `described` events follow the v1.1
  format (§1.2). v1.3 adds a `pattern_analyzed` event kind (owned by
  SW-PROMPT-004) — see §9.5.

---

## 9. Pattern Analysis Extension (v1.3, SW-SCHEMA-003)

**Status:** Added in v1.3 to support `prompts/pattern_analysis.v1.md`.

A `pattern_analysis` record is a **cross-incident analysis artifact**. Its
input is a *list* of `incident` records (each conforming to base + per-type
extension as defined in §§1–2). Its output is a single structured JSON
object that summarizes patterns *across* those incidents — frequency
trends, severity escalation, day-of-week clustering, contextual
correlations, body-region clustering, and manipulation patterns across
digital communications.

It is NOT a 10th `evidence_type`. It is a separate record kind, with its
own discriminator: `record_kind: "pattern_analysis"`. The 9 evidence
types remain the closed `evidence_type` enum; pattern analyses live
alongside them in the vault and reference incidents by `incident_id`.

**Privacy parity with per-incident records.** Where a pattern_analysis
envelope carries `actor_display_map` (see §9.1), the field is
**non-transmissible by default** — the same isolation rule as §5 rule
18 for per-incident records. The map is stored in a separate encrypted
envelope inside the VM vault, never inlined when written to chain or
transmitted at export, unless the survivor explicitly opts in for that
export. This keeps the privacy story coherent across record kinds: a
display name (e.g. `"Mark"`) never rides the wire just because the
caseworker layer ran a cross-incident analysis. See SW-PATTERN-001 in
`storage.next.js` (`NON_TRANSMISSIBLE_FIELDS`) — both record kinds flow
through the same strip on transmission.

### 9.1 Record envelope

A pattern_analysis record carries this top-level shape (paralleling the
base fields in §1, but with what makes sense for an aggregate):

| Field | Type | Required | Notes |
|---|---|---|---|
| `record_kind` | const string `"pattern_analysis"` | **required** | Discriminator. Always exactly this string. |
| `analysis_id` | string (uuid v4) | **required** | Generated when the analysis runs. Stable across re-renders. |
| `schema_version` | string | **required** | `"evidence-v1.3"` or higher. |
| `prompt_version` | string | **required** | Canonical format (§1.2). Currently `"pattern_analysis.v1"`. |
| `analyzed_at` | string (ISO-8601 with offset) | **required** | When the analysis ran. |
| `incident_ids_analyzed[]` | array<string (uuid v4)> | **required** | The `incident_id` of every incident fed into the analysis. Stable references — incidents may move in storage, ids do not. |
| `incident_count_analyzed` | integer | **required** | `== incident_ids_analyzed.length`. Redundant for human-readability of the JSON; validator MUST cross-check. |
| `date_range` | object | **required** | `{ start: ISO-8601\|null, end: ISO-8601\|null }`. The earliest and latest `occurred_at` (falling back to `captured_at`) across the analyzed set. Both null + gap when all timestamps are unknown. |
| `actor_display_map` | object \| null | optional | Same shape and isolation rule as §1 (encrypted at rest in a separate envelope; never inlined when transmitted unless survivor opts in). Used by the prompt to resolve cross-incident actor identity (e.g. `P1` across all the messages). |
| `narrative_summary` | string \| null | **required** (may be null + gap) | Third-person present-tense, plain-language, legal-grade summary suitable for family-court judge / legal-aid intake. Target 400–600 words. **Owned by this prompt, not by per-type extractors.** |
| `confidence` | number 0.0–1.0 | **required** | Single record-level confidence. Same semantics as §1. |
| `chain_of_custody[]` | array<ChainEvent> | **required** | Append-only. First entry is `pattern_analysis_requested` (PWA-initiated); subsequent entries describe the analysis pipeline. See §9.5. |
| `gaps[]` | array<Gap> | **required** (may be empty) | Same `{field, reason, suggested_followup}` shape as §3. Null + gap parity rule (§5 rule 16) applies. |

### 9.2 Analysis body (the actual pattern fields)

| Field | Type | Required | Notes |
|---|---|---|---|
| `frequency_trend` | object | **required** | `{ intervals_days[]: number[], trend: "shortening"\|"stable"\|"lengthening"\|"insufficient_data", description: string }`. `intervals_days[]` is the day-count between consecutive incidents in chronological order. `trend` is the descriptive label — `"insufficient_data"` is REQUIRED when fewer than 3 incidents have parseable `occurred_at` (we never claim a trend from 2 points). `description` is one plain sentence. |
| `severity_escalation` | object | **required** | `{ detected: bool, trajectory_codes[]: string[], description: string, escalation_markers[]: string[] }`. `trajectory_codes[]` is the chronological sequence of dominant severity codes across the set, each pulled from the §1.1 12-code enum. `escalation_markers[]` is the closed subset of §1.1 codes that signal escalation in their own right (`escalation_from_prior`, `repeated_within_30d`, `strangulation_marker_neck`, `strangulation_marker_petechiae`, `threat_to_kill`, `weapon_pattern`, `loss_of_consciousness`). `detected: true` requires at least one of: a strict-increasing severity ordering, a new high-lethality marker not in earlier incidents, or `escalation_from_prior` on a recent incident. Otherwise `detected: false`. **Never claim escalation from 2 or fewer incidents.** |
| `day_of_week_pattern` | object | **required** | `{ detected: bool, primary_days[]: ("mon"\|"tue"\|"wed"\|"thu"\|"fri"\|"sat"\|"sun")[], description: string }`. `detected: true` requires at least 4 incidents AND a single day (or contiguous pair) accounting for ≥60% of incidents with parseable dates. Otherwise `detected: false`. |
| `contextual_correlations[]` | array | **required** (may be empty) | Each entry: `{ context: enum, count: int, incidents_referenced_by_id[]: uuid[] }`. `context` is closed: `"alcohol"`, `"other_substance"`, `"after_argument"`, `"weekend"`, `"after_workday"`, `"child_present"`, `"following_separation_threat"`, `"following_legal_action"`, `"other"`. Each entry MUST be supported by an explicit mention in at least one source incident's `narrative.user_words`, `narrative.model_summary`, journal `transcript`, or DM `message_text[]`. Never inferred from absence. |
| `cross_incident_actors[]` | array | **required** (may be empty) | Each entry: `{ label: "P1"\|"P2"\|"W1"\|... (stable-label space §1), incident_ids_present[]: uuid[], pattern_notes: string }`. `pattern_notes` is plain-language ("the same labeled person is referenced in 4 of 5 incidents"), not clinical. Display names live only in `actor_display_map`. |
| `recurring_body_regions[]` | array | **required** (may be empty) | Each entry: `{ region: "<§2.1.1 enum>", count: int, laterality_summary: string }`. Drawn only from `injury_photo` incidents in the input set. `laterality_summary` is plain-language ("left side, 3 of 4 injuries") — never diagnostic. |
| `manipulation_patterns_across_messages[]` | array | **required** (may be empty) | Each entry: `{ pattern_name: enum, instance_count: int, sample_incident_ids[]: uuid[] }`. `pattern_name` is the **plain-language vocabulary** in §9.2.1 — never clinical terms like DARVO, narcissistic, gaslighting in this field. Drawn only from `digital_communication_photo` incidents. |
| `escalation_markers_detected[]` | array<enum> | **required** (may be empty) | Closed subset of §1.1 codes that recur across the analyzed set AND have an escalation interpretation in aggregate. Subset: `strangulation_marker_neck`, `strangulation_marker_petechiae`, `threat_to_kill`, `weapon_pattern`, `loss_of_consciousness`, `escalation_from_prior`, `repeated_within_30d`, `head_or_face_injury`, `pregnancy_risk`, `child_present`. Drawn only from `severity_signals[]` actually present in source incidents — never invented. **Aggregation bar (SW-PATTERN-001):** a code MUST appear in `severity_signals[]` on **≥2 source incidents** to graduate to this field. Single-incident occurrences remain visible via `severity_escalation.escalation_markers[]`. See §9.4 rule 29. |

#### 9.2.1 Manipulation-pattern plain-language vocabulary (closed)

This is the closed enum for `manipulation_patterns_across_messages[].pattern_name`.
It is aligned with `digital_communication_photo.v1.md` `content_tags[]` and the
v1 → v1.1 legacy alias table in `inference_chat.next.js` (which already maps
clinical terms to plain-language equivalents).

| Pattern (plain) | Plain meaning |
|---|---|
| `factual_denial` | Sender denies that an event the survivor referenced ever happened. |
| `attack_on_credibility` | Sender attacks the survivor's memory, perception, or mental state. |
| `role_reversal` | Sender frames themselves as the victim and the survivor as the aggressor. |
| `isolation_pressure` | Sender pressures the survivor to cut contact with others (family, friends, advocates, professionals). |
| `financial_coercion` | Money, accounts, housing, or financial dependence used as leverage. |
| `surveillance_implication` | Sender signals they are tracking the survivor's location, devices, contacts, or activity. |
| `apology_cycle` | Apology / promise-to-change language following a referenced incident (the "honeymoon" pattern). |
| `love_bombing` | Disproportionate affection, gifts, or attention used after an incident or after a survivor signals withdrawal. |
| `child_weaponization` | Children referenced as leverage (taking them, withholding them, threatening them, used to coerce contact). |
| `sexual_coercion` | Pressure or threats relating to sexual contact or sexual content. |

**Closed enum.** Any pattern not in this list MUST NOT be emitted. Clinical
terms (`DARVO`, `gaslighting`, `narcissistic`, `coercive_control`,
`antisocial`, etc.) are **forbidden** in this field; if the prompt
identifies behavior outside the enum, it emits a `gaps[]` entry with
`field: "manipulation_patterns_across_messages"` and a plain description
of what it saw.

### 9.3 Required fields (hold-the-line)

For pattern_analysis records the non-negotiable required fields are:

1. `record_kind` (`"pattern_analysis"`)
2. `analysis_id` (uuid v4)
3. `prompt_version` (`pattern_analysis.v<n>`)
4. `incident_ids_analyzed[]` (≥1)
5. `analyzed_at` (ISO-8601 with offset)
6. `chain_of_custody[]` (≥1 entry — `pattern_analysis_requested`)

`schema_version`, `confidence`, `gaps[]`, `narrative_summary` (may be
null + gap), `date_range`, and the seven analysis-body fields above are
also required, but they are written by the prompt + glue, not by the
caller.

### 9.4 Validation rules (additions to §5)

20. `record_kind == "pattern_analysis"` IFF the record carries the §9
    envelope and analysis-body fields and does NOT carry `evidence_type`.
21. `incident_count_analyzed == incident_ids_analyzed.length`. Reject
    otherwise.
22. `frequency_trend.intervals_days.length == max(0,
    incident_ids_analyzed.length - 1)` when at least 2 incidents have
    parseable `occurred_at`. Otherwise intervals_days is `[]` and
    `frequency_trend.trend == "insufficient_data"`.
23. `severity_escalation.detected == true` requires
    `incident_ids_analyzed.length >= 3`. Two incidents are not a
    pattern. Reject otherwise.
24. Every `incident_ids_referenced_by_id[]` and `sample_incident_ids[]`
    value MUST be present in `incident_ids_analyzed[]`. Reject otherwise.
25. Every `severity_signals` / `escalation_markers` code MUST be from
    the §1.1 closed enum. Same rule as §5 rule 15, scoped to
    pattern_analysis fields.
26. `manipulation_patterns_across_messages[].pattern_name` MUST be from
    the §9.2.1 closed enum. Clinical terms → reject. Surface as `gaps[]`.
27. `recurring_body_regions[].region` MUST be from the §2.1.1 closed
    enum.
28. Null + gap parity rule (§5 rule 16) applies to pattern_analysis
    records — every null field MUST have a matching `gaps[]` entry.
29. **`escalation_markers_detected[]` aggregation bar.** Every code in
    `escalation_markers_detected[]` MUST appear in `severity_signals[]`
    on **≥2 source incidents** (the analyzed set referenced by
    `incident_ids_analyzed[]`). A code present on only one source
    incident is not a cross-incident pattern and MUST NOT graduate to
    this aggregate field. It remains visible — when relevant — via
    `severity_escalation.escalation_markers[]`, which is the
    chronological-evidence field and not subject to the aggregation
    bar. **Tightened in SW-PATTERN-001 from the prior ≥1 rule** to
    keep the aggregate field honest about recurrence; the prior rule
    let a single high-lethality marker surface as an aggregate pattern.
    Reject otherwise.

### 9.5 Chain of custody event kinds added in v1.3

| Event kind | Owner | Notes |
|---|---|---|
| `pattern_analysis_requested` | survivor (via PWA) | First chain event. Carries `incident_ids_analyzed[]` and the requesting actor (survivor). |
| `pattern_analyzed` | model (local Gemma or VM) | Carries `prompt_version: "pattern_analysis.v1"`, `input_hash`, `output_hash`, and a redacted view of the actor_display_map hash if one was joined. |
| `pattern_described` | model or device (parity event, mirrors §3 `described`) | Carries the long `narrative_summary` output_hash. |

These join the existing `captured / classified / extracted / described /
approved / vault.write / vault.write.ack / vault.read / panic` kinds in
the Chain of Custody Spec. Local-mode parity rule from
`API_CONTRACT.md §3.8` applies — `pattern_described` may be a device
parity event when the local backend re-uses the narrative produced in
the `pattern_analyzed` step.

### 9.6 What pattern_analysis records are NOT

- They are **not evidence**. They are an analysis *over* evidence. The
  per-incident records remain the primary evidentiary artifact.
- They are **not a judgment**. They never claim escalation, danger, or
  risk in narrative text. Risk is the UI's job, surfaced from
  `escalation_markers_detected[]`.
- They are **not a prediction**. No future-tense language ("she will
  be at risk"); third-person present-tense observation only.
- They are **not stable across vault state**. Re-running with a new
  incident set produces a new `analysis_id`. Old analyses are retained
  as immutable snapshots; the PWA shows the most recent.
