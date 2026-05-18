# Implementation Idea: Prompt Routing + Structured Output

---

**Q: function calling 이라는게 있었잖냐.. 현재 구현되어 있는 prompt 자체를 function calling으로 바꿀 필요가 있노?**

안 바꿔도 됩니다.

이유:

현재 프롬프트가 JSON을 강제하는 방식 — "No markdown, no fences, bare JSON only" — 은 프롬프트 엔지니어링으로 구조를 잡는 것. Function calling / structured output은 모델을 토큰 레벨에서 JSON schema에 구속시키는 것.

더 신뢰할 수 있긴 한데, **behavioral guardrail (진단 금지, 관찰 언어만, 패턴 조작 금지 등)은 어차피 system prompt에 남아야 합니다.** 구조 강제만 바뀌는 거예요.

Ollama에 `format` 파라미터로 JSON schema를 넘기는 방식이 있긴 한데:
- 증거 타입별로 schema를 10개 정의해야 함
- 프롬프트가 아직 앱에 통합도 안 된 상태
- 해카톤 데모에서 JSON 파싱 실패할 가능성 — 지금 프롬프트도 충분히 엄격하게 설계됨

**결론:** 지금 당장은 프롬프트 엔지니어링으로 충분. 프롬프트 통합 자체가 먼저.

---

**Q: 이해가 잘안가는데 설명이**

쉽게 설명하면:

**지금 방식 (프롬프트 엔지니어링)**
```
System: "JSON만 출력해. prose 없이. 이 형식으로..."
→ Gemma가 "알겠어" 하고 JSON 출력 (안 지킬 수도 있음)
```

**Function calling / Structured output**
```
System: "이 JSON schema에 맞춰서만 출력 가능해"
→ 토큰 레벨에서 schema 위반 토큰 자체를 차단
→ 100% JSON 보장
```

근데 여기서 중요한 건 — "JSON 형식"만 바뀌는 거예요.

"절대 진단하지 마라", "패턴 조작 금지", "null이면 gap 달아라" 같은 **행동 규칙**은 어떤 방식을 써도 system prompt에 그대로 있어야 합니다.

그래서 결론이 **"굳이 지금 바꿀 필요 없다"** 인 거예요. 얻는 건 JSON 안정성 뿐인데, 프롬프트 통합도 아직 안 된 상태에서 schema 10개 새로 정의하는 건 과투자.

---

**Q: 예시 샘플 코드로 설명해봐**

**지금 방식:**
```python
response = ollama.chat(
    model="gemma4:e2b",
    messages=[
        {"role": "system", "content": "You are a caseworker. Output ONLY valid JSON. No markdown, no fences..."},
        {"role": "user", "content": f"Analyze this injury photo: {image_base64}"}
    ]
)
# Gemma가 JSON 출력... 할 수도 있고 "Here is the analysis: ```json..." 할 수도 있음
result = json.loads(response["message"]["content"])  # 파싱 실패 가능
```

**Structured output 방식:**
```python
schema = {
    "type": "object",
    "properties": {
        "body_region": {"type": "string"},
        "injury_kind": {"type": "array", "items": {"type": "string"}},
        "severity_signals": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "number"},
    },
    "required": ["body_region", "injury_kind", "severity_signals", "confidence"]
}

response = ollama.chat(
    model="gemma4:e2b",
    messages=[
        {"role": "system", "content": "You are a caseworker. 진단하지 마라. null이면 gap 달아라..."},
        {"role": "user", "content": f"Analyze this: {image_base64}"}
    ],
    format=schema  # ← 이게 structured output. 토큰 레벨에서 schema 강제
)
# 여기서 json.loads 실패는 이론상 불가능
result = json.loads(response["message"]["content"])
```

차이가 딱 `format=schema` 한 줄입니다.

행동 규칙 ("진단하지 마라", "null이면 gap") 은 어느 쪽이든 system prompt에 그대로 있어야 하고요.

---

**Q: 근데 prompt 자체를 이런 식의 function calling으로 바꾼다면 어떻게 제안할래**

현재 `injury_photo.v1.md` 프롬프트를 기준으로 보여줄게요.

**현재 구조 (하나의 md 파일):**
```
SYSTEM 섹션 (행동 규칙)
+ OUTPUT SCHEMA 섹션 (JSON 형식 설명)
+ "No markdown, no fences..." 같은 형식 강제 문구
```

**Function calling으로 바꾸면 두 개로 분리:**

```python
# prompts/injury_photo.py

SYSTEM_PROMPT = """
You are the caseworker layer of Silent Witness.
- Observational language only. Never diagnose.
- Never lead the witness.
- Never escalate alarm.
- Match the survivor's language.
- Every null MUST have a matching gaps[] entry.
...
"""  # ← md 파일의 SYSTEM 섹션만 남음. 형식 강제 문구 전부 삭제

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "body_region": {"type": ["string", "null"]},
        "injury_kind": {"type": "array", "items": {"type": "string"}},
        "coloration": {"type": ["string", "null"]},
        "severity_signals": {"type": "array", "items": {"type": "string"}},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "gaps": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "field": {"type": "string"},
                    "reason": {"type": "string"},
                    "suggested_followup": {"type": ["string", "null"]}
                }
            }
        }
    },
    "required": ["body_region", "injury_kind", "severity_signals", "confidence", "gaps"]
}
```

```python
# llm-server/main.py

from prompts.injury_photo import SYSTEM_PROMPT, OUTPUT_SCHEMA

response = ollama.chat(
    model="gemma4:e2b",
    messages=[
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": user_input}
    ],
    format=OUTPUT_SCHEMA
)
```

| | 현재 | Function calling |
|---|---|---|
| 행동 규칙 | md 파일 SYSTEM 섹션 | Python string (동일) |
| JSON 형식 | 프롬프트로 설명 | JSON Schema dict |
| 형식 준수 | Gemma 재량 | 토큰 레벨 강제 |
| 파싱 실패 | 가능 | 불가능 |

---

**Q: PWA가 증거 타입을 서버에 알려주기가 쉽지 않고 그렇게 하려면 복잡해지니깐 AI를 사용하는거 아닐까?**

맞습니다. 그게 원래 설계 의도입니다.

현재 main.py의 `SYSTEM_PROMPT`에 이미 이게 있습니다:

```python
"evidence_type: if a photo is present classify from image content;
text/transcript defaults to 'journal_entry_photo';
choose the most specific match"
```

즉 **Gemma가 이미지/텍스트를 보고 증거 타입을 스스로 판단**하는 거죠.

그러면 라우팅 흐름이 이렇게 됩니다:

```
PWA → POST /analyze { text, image_base64 }
              ↓
     1단계: Gemma가 evidence_type 판단
            "이건 injury_photo다"
              ↓
     2단계: 해당 프롬프트로 재호출
            injury_photo.v1 SYSTEM_PROMPT + schema
              ↓
     최종 구조화된 JSON 반환
```

Gemma 호출이 **두 번** 일어나는 구조입니다.

---

**Q: 응답시간에 있어서는 async로 각 evidence들을 처리하도록 한 부분이 있기 때문에.. 큰 문제는 없어. 난 그저 너의 최종 설계안이 정말 말이 되는지 그리고 너가 지금 내게 주는 이 안건들이 진짜 실제로 다른 alternative 를 고려했을 때 가장 최선이라 생각해서 말하는 건지.. 그걸 알고싶은거야**

솔직히 말할게요.

**2단계 호출 (분류 → 추출) 방식의 문제점:**

분류 자체가 틀릴 수 있습니다. 부상 사진인데 `scene_photo`로 분류하면 wrong prompt로 추출 → 잘못된 필드. 에러 핸들링이 복잡해집니다.

**실제로 더 나은 alternative가 있습니다:**

PWA가 이미 타입을 알고 있습니다.

유저가 vault에서 "사진 찍기" 버튼을 눌렀는지, "음성 녹음" 버튼을 눌렀는지, "텍스트 입력" 버튼을 눌렀는지 — **UI에서 이미 결정됩니다.**

```js
data-goto="capture_photo"  → evidence_type: 'injury_photo'
data-goto="capture_voice"  → evidence_type: 'journal_entry_photo'
data-goto="capture_text"   → evidence_type: 'journal_entry_photo'
```

그러면 `/analyze` 호출 1번으로 끝납니다.

---

**Q: 또 대충 분석한다. 현재 prompts 에 종류만 한 열개가 있는데**

죄송합니다. 다시 봐야겠습니다.

9개 프롬프트가 **전부 `modality: image`** 입니다.

```
injury_photo          ← 부상 사진
digital_comm_photo    ← 문자/DM 스크린샷
financial_record      ← 재정 문서 사진
clothing_object       ← 옷/물체 사진
legal_document        ← 법적 문서 사진
medical_document      ← 의료 문서 사진
property_damage       ← 재산 피해 사진
scene_photo           ← 현장 사진
journal_entry_photo   ← 손글씨 일기 사진
```

vault.js에서 "사진 찍기" 버튼 하나로 다 들어옵니다. UI는 **이 사진이 어떤 종류인지 모릅니다.** 제 이전 분석이 틀렸어요.

---

**Q: AI 분류하는게 아니라면 저런 프람프트를 우리가 만들었을리가 없자나**

맞습니다. 반박할 수 없네요.

2단계 호출이 원래 설계 의도가 맞습니다. 처음부터 그렇게 말했어야 했어요.

---

**Q: 너가 볼때 이걸로 할때 어떤 risk가 존재하노**

실제로 있는 리스크만 말할게요.

**1. 분류 오류 → wrong prompt → 엉뚱한 필드**
부상 사진인데 `scene_photo`로 분류되면 `body_region`, `injury_kind` 같은 핵심 필드가 아예 추출 안 됩니다. 가장 큰 리스크.

**2. 분류 자체가 애매한 사진**
멍든 팔 + 부서진 물건이 같이 찍혀있으면 `injury_photo`인지 `property_damage_photo`인지 Gemma도 고민합니다. 어느 프롬프트를 써도 불완전한 결과.

**3. 2번 호출 = 2번 실패 지점**
1단계 타임아웃, 2단계 타임아웃 각각 발생 가능. 에러 핸들링 로직이 두 배로 필요합니다.

**4. 분류 결과를 survivor가 모름**
Gemma가 `digital_communication_photo`로 분류했는데 survivor는 `injury_photo`로 찍은 거라면 — 현재 UI에서 분류 결과가 보이지 않으니 수정할 방법이 없습니다.

4번이 사실 가장 중요합니다. 오분류를 survivor가 고칠 수 있는 UI가 없으면 잘못된 증거 분류가 그냥 저장됩니다. human-in-the-loop가 AI 분석 필드뿐만 아니라 **evidence_type 자체에도** 필요합니다.

---

**Q: 만일 이게 구현이 된다면 샘플로 main.py는 어떻게 구현이 되버리는거지**

```python
import json, logging, os, re
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

# ── 1단계: 분류 전용 프롬프트 ─────────────────────────────
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

# ── 2단계: 타입별 프롬프트 로드 ───────────────────────────
def _load_prompt(evidence_type: str) -> str:
    path = os.path.join(
        os.path.dirname(__file__),
        f"../pwa-app/prompts/{evidence_type}.v1.md"
    )
    try:
        content = open(path).read()
        m = re.search(r"## SYSTEM\n(.*?)(?=\n## |\Z)", content, re.DOTALL)
        return m.group(1).strip() if m else content
    except FileNotFoundError:
        log.warning(f"Prompt not found for {evidence_type}, falling back to generic")
        return GENERIC_FALLBACK_PROMPT

GENERIC_FALLBACK_PROMPT = """You are a forensic documentation assistant.
Analyze the evidence and return structured JSON describing what you observe.
Be factual, observational, and court-appropriate."""

PROMPT_CACHE: dict[str, str] = {}

def get_prompt(evidence_type: str) -> str:
    if evidence_type not in PROMPT_CACHE:
        PROMPT_CACHE[evidence_type] = _load_prompt(evidence_type)
    return PROMPT_CACHE[evidence_type]


class AnalyzeRequest(BaseModel):
    text:         str       = ""
    image_base64: str | None = None

class ChatRequest(BaseModel):
    messages:     list[dict]
    image_base64: str | None = None


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


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    text = req.text.strip()

    user_msg: dict = {"role": "user", "content": text or "(No notes provided)"}
    if req.image_base64:
        user_msg["images"] = [req.image_base64]

    # 1단계: evidence_type 분류
    log.info("stage1: classifying evidence_type")
    raw_class = await _ollama_chat([
        {"role": "system", "content": CLASSIFIER_PROMPT},
        user_msg,
    ])
    try:
        evidence_type = _parse_json(raw_class).get("evidence_type", "journal_entry_photo")
    except ValueError:
        evidence_type = "journal_entry_photo"

    log.info(f"stage1 result: {evidence_type}")

    # 2단계: 타입별 프롬프트로 추출
    system_prompt = get_prompt(evidence_type)
    log.info(f"stage2: extracting with {evidence_type} prompt")

    raw_extract = await _ollama_chat([
        {"role": "system", "content": system_prompt},
        user_msg,
    ])

    try:
        result = _parse_json(raw_extract)
        result["evidence_type"] = evidence_type  # 분류 결과도 함께 반환 (PWA에서 오분류 확인용)
        return result
    except ValueError:
        return {"error": "parse_failed", "evidence_type": evidence_type, "_raw": raw_extract[:500]}


@app.post("/chat")
async def chat(req: ChatRequest):
    messages = [m.copy() for m in req.messages]
    if req.image_base64:
        last_user = next(
            (i for i in reversed(range(len(messages))) if messages[i].get("role") == "user"), None
        )
        if last_user is not None:
            messages[last_user]["images"] = [req.image_base64]
    return {"content": await _ollama_chat(messages)}

@app.get("/health")
async def health():
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            r = await client.get(f"{OLLAMA_URL}/api/tags")
            ollama_ok = r.status_code == 200
        except Exception:
            ollama_ok = False
    return {"status": "ok", "model": MODEL, "ollama": ollama_ok}
```

---

**Q: 너가 볼때 이게 성공할 가능성은?**

솔직하게 말할게요.

**잘 될 것들:**
- 라우팅 구조 자체는 깔끔하고 맞습니다
- 프롬프트 파일 로딩, 캐싱 로직 문제 없음
- 1단계 분류는 단순한 태스크라 Gemma E2B도 잘 할 것

**불확실한 것:**
- 2단계 추출 품질 — 프롬프트들이 아직 실제 Gemma E2B로 테스트가 안 됐습니다. 프롬프트가 Tobi 기준으로 설계됐는데 `gemma4:e2b`가 그 instruction following을 얼마나 잘 따르냐는 돌려봐야 압니다
- `gaps[]` + null 규칙같은 복잡한 schema 강제 — E2B가 작은 모델이라 긴 system prompt를 끝까지 지킬지 불확실

**해카톤 데모 기준으로는:**
분류 → injury_photo 추출 이 두 가지만 제대로 되면 됩니다. 나머지 8개 타입은 데모에서 안 보여줘도 됩니다.

그 범위에서는 **성공 가능성 높습니다.** 다만 지금 당장 구현보다 프롬프트를 Gemma E2B로 실제 테스트해보는 게 먼저입니다. 구조는 맞는데 프롬프트가 E2B에서 안 통하면 구조가 아무 의미 없거든요.
