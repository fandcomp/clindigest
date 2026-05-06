# ClinDigest — FHIR Clinical Summary Generator

> **MCP server that transforms scattered FHIR patient data into actionable clinical summaries, tailored to the audience.**

Built for [Agents Assemble: The Healthcare AI Endgame Challenge](https://promptopinion.ai) — Path A: Build a Superpower (MCP Server).

---

## The Problem

Clinicians spend **1–2 hours per shift** reading through fragmented patient records across multiple systems. Critical information gets lost during shift handoffs, specialist referrals, and patient discharges — directly impacting patient safety and contributing to clinician burnout.

Rule-based systems can display raw data, but they cannot **prioritize**, **contextualize**, or **adapt** information for different audiences. A nurse needs different details than a cardiologist. A patient needs plain language, not medical jargon.

## The Solution

ClinDigest is an MCP server that exposes **4 tools** any agent on the Prompt Opinion platform can use:

| Tool | Purpose | Output |
|------|---------|--------|
| `get_patient_context` | Aggregate all FHIR R4 data for a patient | Structured clinical context (JSON) |
| `generate_handoff_summary` | Shift change handoff | SBAR narrative adapted to recipient role |
| `generate_referral_summary` | Specialist referral | Specialty-filtered referral letter |
| `generate_discharge_summary` | Patient discharge | Dual output: clinical record + patient instructions |

### Why GenAI?

This cannot be solved with rules alone. ClinDigest uses generative AI to:
- **Prioritize** information based on clinical relevance (not just recency)
- **Adapt** language and terminology to the audience (nurse vs. specialist vs. patient)
- **Synthesize** scattered data into coherent narratives
- **Contextualize** lab results and vital signs within the clinical picture

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Prompt Opinion Platform                  │
│                                                          │
│  Agent ──── MCP Protocol ────▶ ClinDigest MCP Server    │
│                                     │                    │
│              SHARP Headers ────────▶│                    │
│         (X-FHIR-Server-URL,        │                    │
│          X-FHIR-Access-Token,       │                    │
│          X-Patient-ID)              │                    │
└─────────────────────────────┬───────┘                    │
                              │                            │
                    ┌─────────▼──────────┐                 │
                    │   FHIR R4 Server   │◀── fetch ───────┘
                    │  (or fixtures)     │
                    └────────────────────┘
```

### SHARP Context Propagation

ClinDigest is built for the Prompt Opinion ecosystem. The platform handles SMART-on-FHIR authentication and forwards credentials via **SHARP headers**:

- `X-FHIR-Server-URL` — The FHIR R4 server base URL
- `X-FHIR-Access-Token` — Bearer token from SMART-on-FHIR launch
- `X-Patient-ID` — Current patient in context

The MCP server **never runs an OAuth dance itself** — it receives authenticated context from the platform.

### Dual LLM Mode

| Mode | When | Behavior |
|------|------|----------|
| **LLM mode** | `ANTHROPIC_API_KEY` is set | Tools call Claude API directly, return generated summaries |
| **Passthrough mode** | No API key | Tools return structured prompts; the calling agent generates the summary |

Both modes work seamlessly on Prompt Opinion.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Server | TypeScript + MCP SDK |
| Transport | Streamable HTTP (Express) |
| FHIR | Native fetch, FHIR R4 REST API |
| GenAI | Claude API (Anthropic) |
| Data | Synthetic patients (FHIR R4 bundles) |
| Deployment | Docker / Render / Railway |

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Install & Run (local)

```bash
git clone https://github.com/YOUR_USERNAME/clindigest.git
cd clindigest
npm install
npm run build

# Run in stdio mode (local dev / MCP Inspector)
npm run dev

# Run in HTTP mode (for deployment / Prompt Opinion)
TRANSPORT=http npm start

# Run with LLM-powered summaries
ANTHROPIC_API_KEY=sk-ant-... TRANSPORT=http npm start
```

### Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector
# Connect to: stdio, command: node dist/index.js
```

### Deploy to Render (one-click)

1. Push to GitHub
2. Connect repo in [Render Dashboard](https://dashboard.render.com)
3. Render auto-detects `render.yaml`
4. Set `ANTHROPIC_API_KEY` in environment variables
5. Deploy — your endpoint will be `https://YOUR-APP.onrender.com/mcp`

### Deploy with Docker

```bash
docker build -t clindigest .
docker run -p 3000:3000 -e TRANSPORT=http -e ANTHROPIC_API_KEY=sk-ant-... clindigest
```

## Synthetic Patients

Three FHIR R4 patient bundles are included for demos and testing:

| ID | Patient | Scenario | Key Data Points |
|----|---------|----------|-----------------|
| `synth-maria-001` | Maria Santos, 58F | DM2 + HTN + CKD | HbA1c 8.9% (critical), Cr 1.4, eGFR 62, 5 medications |
| `synth-john-002` | John Park, 70M | Post-CABG day 3 | INR 1.8 (sub-therapeutic), Hgb 10.2, AFib, morphine PRN |
| `synth-emma-003` | Emma Wilson, 76F | Pneumonia day 5 | CRP 28 (high), SpO2 95%, COPD, approaching discharge |

All data is **100% synthetic** — no real PHI.

## MCP Tools Reference

### `get_patient_context`

Aggregates 8 FHIR R4 resource types into a unified clinical view.

```json
{
  "patient_id": "synth-maria-001",
  "fhir_server_url": "https://hapi.fhir.org/baseR4",
  "include_history": false
}
```

### `generate_handoff_summary`

Generates SBAR (Situation, Background, Assessment, Recommendation) handoff summaries.

```json
{
  "patient_id": "synth-john-002",
  "shift_hours": 12,
  "recipient_role": "nurse",
  "priority_focus": "anticoagulation monitoring"
}
```

### `generate_referral_summary`

Generates specialty-filtered referral letters. Supports 9 specialties with custom focus areas.

```json
{
  "patient_id": "synth-maria-001",
  "target_specialty": "nephrology",
  "referral_reason": "Worsening CKD — creatinine rising, eGFR declining",
  "urgency": "urgent"
}
```

### `generate_discharge_summary`

Generates dual-output summaries: clinical record + patient-friendly instructions.

```json
{
  "patient_id": "synth-emma-003",
  "discharge_diagnosis": "Community-acquired pneumonia, resolved",
  "reading_level": "simple",
  "output_language": "en"
}
```

## Judging Alignment

### AI Factor ★★★★★
GenAI generates contextual narratives — not templates. Summaries adapt to audience (nurse vs specialist vs patient), prioritize information by clinical relevance, and synthesize scattered data into coherent stories. This fundamentally cannot be done with rule-based systems.

### Potential Impact ★★★★★
- Saves 1–2 hours per clinician per shift
- Reduces handoff-related medical errors (the #1 cause of adverse events)
- Patient-friendly discharge instructions improve medication compliance
- Specialty-filtered referrals reduce back-and-forth between providers

### Feasibility ★★★★
- Built on industry standards: FHIR R4, MCP, SHARP
- Uses only synthetic data — no PHI concerns
- Deployable today on any MCP-compatible platform
- Production caveat: would need clinical validation and regulatory review

## Project Structure

```
clindigest/
├── src/
│   ├── index.ts              # MCP server + 4 tool registrations
│   ├── types.ts              # FHIR R4 + PatientContext types
│   ├── constants.ts          # Configuration defaults
│   ├── fhir/
│   │   ├── client.ts         # FHIR REST client (with auth support)
│   │   ├── mapper.ts         # FHIR → PatientContext transformation
│   │   └── fixtures.ts       # Synthetic data loader
│   ├── prompts/
│   │   ├── shared.ts         # Clinical guardrails + serialization
│   │   ├── handoff.ts        # SBAR handoff template
│   │   ├── referral.ts       # Specialty-aware referral template
│   │   └── discharge.ts      # Dual-output discharge template
│   ├── tools/
│   │   ├── summarize.ts      # LLM / passthrough engine
│   │   └── shared.ts         # Common fetch + format helpers
│   └── utils/
│       ├── sharp.ts          # SHARP context extraction
│       ├── errors.ts         # Error handling
│       └── formatting.ts     # Date, name, age helpers
├── fixtures/                 # 3 synthetic FHIR patient bundles
├── Dockerfile
├── render.yaml
└── package.json
```

## License

MIT
