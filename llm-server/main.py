import json
import logging
import os
import re

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
MODEL      = os.getenv("LLM_MODEL",  "gemma4:e2b")

app = FastAPI(title="Silent Witness LLM")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ── Stage 1: classification prompt ───────────────────────
CLASSIFIER_PROMPT = """You are an evidence classifier for Silent Witness.
Look at the submitted image and/or text and return ONLY this JSON — no other text:

{
  "evidence_type": "<one of: injury_photo | digital_communication_photo | financial_record_photo | clothing_object_photo | legal_document_photo | medical_document_photo | property_damage_photo | scene_photo | journal_entry_photo>"
}

Rules:
- injury_photo: visible body marks, bruises, cuts, swelling
- digital_communication_photo: screenshot of SMS, DM, email, chat
- financial_record_photo: bank statements, receipts, financial documents
- clothing_object_photo: clothing or physical objects as evidence
- legal_document_photo: restraining orders, court documents
- medical_document_photo: medical records, discharge papers
- property_damage_photo: damaged property, broken objects
- scene_photo: location/environment where incident occurred
- journal_entry_photo: handwritten notes or diary pages
- If text-only with no image: journal_entry_photo"""

# ── Stage 2: per-type prompt loader ──────────────────────
GENERIC_FALLBACK_PROMPT = """You are a forensic documentation assistant.
Analyze the evidence and return structured JSON describing what you observe.
Be factual, observational, and court-appropriate."""

PROMPT_CACHE: dict[str, str] = {}


def _load_prompt(evidence_type: str) -> str:
    path = os.path.join(
        os.path.dirname(__file__),
        f"prompts/{evidence_type}.v1.md"
    )
    try:
        content = open(path, encoding="utf-8").read().strip()
        return content + "\n\nNow analyze the submitted evidence and output ONLY valid JSON matching the schema above. No prose, no fences."
    except FileNotFoundError:
        log.warning(f"Prompt not found for {evidence_type}, falling back to generic")
        return GENERIC_FALLBACK_PROMPT


def get_prompt(evidence_type: str) -> str:
    if evidence_type not in PROMPT_CACHE:
        PROMPT_CACHE[evidence_type] = _load_prompt(evidence_type)
        log.info(f"Loaded prompt for {evidence_type} ({len(PROMPT_CACHE[evidence_type])} chars)")
    return PROMPT_CACHE[evidence_type]


# ── Ollama helper ─────────────────────────────────────────
async def _ollama_chat(messages: list[dict], format: dict | None = None) -> str:
    payload = {"model": MODEL, "messages": messages, "stream": False}
    if format:
        payload["format"] = format

    async with httpx.AsyncClient(timeout=1000.0) as client:
        try:
            resp = await client.post(f"{OLLAMA_URL}/api/chat", json=payload)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Ollama unreachable: {e}")

    return resp.json()["message"]["content"]


def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    # strip markdown fences the model adds despite instructions
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```\s*$', '', raw).strip()
    try:
        return json.loads(raw)
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        try:
            return json.loads(m.group())
        except Exception:
            pass
    raise ValueError(raw[:300])


# ── Request models ────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    text:         str       = ""
    image_base64: str | None = None


class ChatRequest(BaseModel):
    messages:     list[dict]
    image_base64: str | None = None


# ── Structured output schema (common fields enforced at token level) ─────────
EXTRACT_FORMAT = {
    "type": "object",
    "properties": {
        # ── common ───────────────────────────────────────────────────────────
        "narrative": {
            "type": "object",
            "properties": {"model_summary": {"type": ["string", "null"]}},
            "required": ["model_summary"]
        },
        "severity_signals": {
            "type": "array",
            "items": {"type": "string", "enum": [
                "strangulation_marker_neck", "strangulation_marker_petechiae",
                "defensive_pattern", "weapon_pattern", "head_or_face_injury",
                "pregnancy_risk", "hand_grip_pattern", "repeated_within_30d",
                "child_present", "loss_of_consciousness", "escalation_from_prior",
                "threat_to_kill"
            ]}
        },
        "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
        "paired_evidence_suggested": {"type": "array", "items": {"type": "string"}},
        "gaps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "field":              {"type": "string"},
                    "reason":             {"type": "string"},
                    "suggested_followup": {"type": ["string", "null"]},
                },
                "required": ["field", "reason"],
            },
        },
        # ── injury_photo ─────────────────────────────────────────────────────
        "body_region":            {"type": ["string", "null"]},
        "body_region_user_words": {"type": ["string", "null"]},
        "injury_kind":            {"type": "array", "items": {"type": "string"}},
        "coloration":             {"type": ["string", "null"]},
        "apparent_age_of_injury": {"type": ["string", "null"]},
        "pattern_consistent_with":{"type": "array", "items": {"type": "string"}},
        "medical_attention_sought":{"type": ["boolean", "null"]},
        # ── digital_communication_photo ──────────────────────────────────────
        "sender":       {"type": ["string", "null"]},
        "recipient":    {"type": ["string", "null"]},
        "platform":     {"type": ["string", "null"]},
        "threat_level": {"type": ["string", "null"]},
        # ── financial / legal / medical ──────────────────────────────────────
        "document_type": {"type": ["string", "null"]},
        "document_kind": {"type": ["string", "null"]},
        "issuer":        {"type": ["string", "null"]},
        # ── scene / property_damage ──────────────────────────────────────────
        "location_description": {"type": ["string", "null"]},
        "damage_description":   {"type": ["string", "null"]},
    },
    "required": ["narrative", "severity_signals", "confidence"]
}

# ── /analyze ─────────────────────────────────────────────
@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    text = req.text.strip()

    user_msg: dict = {"role": "user", "content": text or "(No notes provided)"}
    if req.image_base64:
        user_msg["images"] = [req.image_base64]

    log.info(f"analyze  model={MODEL}  image={'yes' if req.image_base64 else 'no'}  text_len={len(text)}")

    # Stage 1: classify evidence_type
    log.info("stage1: classifying evidence_type")
    raw_class = await _ollama_chat([
        {"role": "system", "content": CLASSIFIER_PROMPT},
        user_msg,
    ])
    log.info(f"stage1 raw: {raw_class[:120]}")

    try:
        evidence_type = _parse_json(raw_class).get("evidence_type", "journal_entry_photo")
    except ValueError:
        evidence_type = "journal_entry_photo"

    log.info(f"stage1 result: {evidence_type}")

    # Stage 2: extract with type-specific prompt
    system_prompt = get_prompt(evidence_type)
    log.info(f"stage2: extracting with {evidence_type} prompt")

    raw_extract = await _ollama_chat([
        {"role": "system", "content": system_prompt},
        user_msg,
    ], format=EXTRACT_FORMAT)
    log.info(f"stage2 raw (first 200): {raw_extract[:200]}")

    try:
        result = _parse_json(raw_extract)
        result["evidence_type"] = evidence_type  # include classification so the PWA can detect misclassification
        return result
    except ValueError:
        return {"error": "parse_failed", "evidence_type": evidence_type, "_raw": raw_extract[:500]}


# ── /chat ─────────────────────────────────────────────────
@app.post("/chat")
async def chat(req: ChatRequest):
    messages = [m.copy() for m in req.messages]
    if req.image_base64:
        last_user = next(
            (i for i in reversed(range(len(messages))) if messages[i].get("role") == "user"),
            None,
        )
        if last_user is not None:
            messages[last_user]["images"] = [req.image_base64]

    log.info(f"chat  model={MODEL}  turns={len(messages)}  image={'yes' if req.image_base64 else 'no'}")
    return {"content": await _ollama_chat(messages)}


# ── /ping /health ─────────────────────────────────────────
@app.get("/ping")
async def ping():
    return {"pong": True}


@app.get("/health")
async def health():
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            ollama_ok = r.status_code == 200
        except Exception:
            ollama_ok = False
    return {"status": "ok", "model": MODEL, "ollama": ollama_ok}
