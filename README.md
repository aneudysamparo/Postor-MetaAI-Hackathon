# Postor AI Bid Team

A multi-agent AI system that takes a small business from a public procurement
opportunity to an honest, evidence-backed answer: **bid here, bid with
conditions, don't bid, or let a human decide** — plus a first draft of the
technical proposal when bidding makes sense.

Built for the Meta AI Developer Hackathon (Startup track, _Build for Your
World_) with **four Meta models**, each with one job: **Muse Spark** reads,
judges and drafts (and screens every document for prompt injection), **Muse
Wonder** audits the draft, **SAM 3.1** localizes official marks on scanned
pages, and **Muse Voice Transcribe** lets the bid manager answer open
`[PENDING]` items by voice.

## For judges — start here

1. **Try it live:** **https://demo.postor.do** (access token in our
   submission). The four tenders already show real recorded runs; to run a new
   analysis, paste your own Meta API key in the ficha (it is used for that run
   only, never stored).
2. **Follow the 3-minute walkthrough** below.
3. **See how each Meta model is used** in the map and table below (also in the
   app: **Cómo funciona**).
4. **Run it locally** (optional): see [Run it locally](#run-it-locally).

### 3-minute walkthrough

| #   | Where                                                                  | What to look at                                                                                                                                                             |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Oportunidades**                                                      | 4 real DGCP tenders with verdict, match level, amount and close date.                                                                                                       |
| 2   | **Company Brain**                                                      | The fictional bidder: certifications with expiry dates, projects, finances, known gaps.                                                                                     |
| 3   | Case A → **Ver ficha** → modo _Rápido_ → **▶ Correr análisis en vivo** | Live progress per step and a clock (≈1.5–2.5 min).                                                                                                                          |
| 4   | **Análisis**                                                           | Verdict, conditions with owner + deadline, financial ratios, document safety (injection guard).                                                                             |
| 5   | **Requisitos** → click any `pliego pN`                                 | The cited page of the ORIGINAL PDF, rendered, with the requirement text.                                                                                                    |
| 6   | **Productos** → open a scanned page                                    | SAM 3.1 boxes over the original page + Muse Spark's reading.                                                                                                                |
| 7   | **Traza**                                                              | Every model call: model, prompt sent, response, tokens, duration, estimated cost.                                                                                           |
| 8   | **Formularios** → F.033 · **Tiendas (DEMO)**                           | The economic offer: cost from fictional stores or NovaTech's hourly rates, one markup to ~97% of the budget, ITBIS, total and amount in words. Signature stays `[PENDING]`. |
| 9   | **Documentos** → 🎙 Grabar respuesta                                    | Answer a `[PENDING]` by voice: Muse Voice Transcribe + Muse Spark map it, shown as "declarado", never as proof.                                                             |
| 10  | Cases C and D → **Análisis**                                           | Same system, different verdicts: NO GO (manufacturer authorization) and NEEDS REVIEW (contract ≈ 86% of revenue).                                                           |

### Meta models in the pipeline

```mermaid
flowchart LR
  P["Real tender<br/>(DGCP pliego + amendments)"] --> G{{"Injection guard<br/>screen + Muse Spark judge"}}
  P --> AN["Tender Analyst<br/>requirements + page"]
  P --> V["Visual reader"]
  V --> S["SAM 3.1<br/>signatures · logos (boxes)"]
  V --> SV["Muse Spark vision<br/>reads scanned page"]
  B["Company Brain<br/>(fictional SMB)"] --> C
  AN --> C["Compliance<br/>met / not met / unknown"]
  C --> D{"Deterministic verdict<br/>+ financial ratios"}
  AN --> PR["Pricing<br/>+ price guard"]
  D --> W["Bid Writer"]
  PR --> W
  W --> R["Bid Reviewer<br/>Muse Wonder"]
  R --> F["SNCC forms + F.033<br/>[PENDING] for humans"]
  F --> VO["Voice answers<br/>Muse Voice Transcribe"]
  VO --> VM["Map to [PENDING]<br/>Muse Spark"]
  O["Opportunity fit"] -.-> D

  classDef spark fill:#e4eefb,stroke:#1d5fb8,color:#10294d;
  classDef wonder fill:#efe7fb,stroke:#6b3fb8,color:#2a1050;
  classDef sam fill:#fde7f1,stroke:#e11d74,color:#5a0a2c;
  classDef voice fill:#fdf1dc,stroke:#c77700,color:#4a2a00;
  classDef code fill:#f2f2f2,stroke:#777,color:#222;
  class AN,SV,C,PR,W,O,G,VM spark;
  class R wonder;
  class S sam;
  class VO voice;
  class D,F code;
```

Blue = Muse Spark · purple = Muse Wonder · pink = SAM 3.1 · amber = Muse Voice
Transcribe · grey = deterministic code (no model).

| Meta model                  | Hosted                             | Used by                                                                                                 | How                                                                                                                                                                                                                                     | Code                                                                   |
| --------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `muse-spark-1.3`            | Meta Model API                     | Opportunity, Tender Analyst (full mode), Compliance, Pricing, Bid Writer, vision reads of scanned pages | JSON-only prompts validated with Zod (one schema retry); 12-page windows and requirement batches run 4 in parallel                                                                                                                      | `apps/api/src/agents/*`, `apps/api/src/models/meta-model.service.ts`   |
| `muse-wonder-1.0`           | Meta Model API                     | Bid Reviewer                                                                                            | A different model audits the draft Muse Spark wrote: omissions, unsupported claims, contradictions (live: ~16 s)                                                                                                                        | `apps/api/src/agents/reviewer/reviewer.agent.ts`                       |
| `sam-3.1`                   | Meta Model API (`/responses`)      | Visual reader                                                                                           | One concept per call ("handwritten signature", "logo") on the rendered page; returns pixel boxes drawn over the original in the UI                                                                                                      | `apps/api/src/agents/visual/visual-evidence.service.ts`                |
| `muse-spark-1.3` (guard)    | Meta Model API                     | Document guard                                                                                          | A deterministic screen finds AI-directed language in every pliego chunk; Muse Spark (`document-guard-v1`) judges only those. Flagged text is shown, never obeyed. Live: the DEMO trap → 99%; 1 of 566 real chunks escalated and cleared | `apps/api/src/models/document-guard.service.ts`                        |
| `muse-voice-transcribe-1.0` | Meta Model API (`/asr/transcribe`) | Voice answers                                                                                           | The bid manager dictates answers to `[PENDING]` items; the WAV is transcribed (Spanish bias, acronyms as keywords) and Muse Spark (`voice-note-v1`) maps each statement to its item as a user declaration                               | `apps/api/src/workflow/voice-note.service.ts`, `apps/web/src/voice.ts` |

**Deep dive:** [`META-MODELS.md`](META-MODELS.md) explains how each model is
called, validated, guarded, traced and what happens when it fails.

What is deliberately **not** a model: the Go/No-Go verdict, financial ratios
and revenue concentration, price validation, the offer price (markup, ITBIS,
totals, amount in words), mandatory-requirement coverage, and form filling
are deterministic code, so the model can never invent a price or flip a
verdict on its own.

**The economic offer (SNCC.F.033).** Each tender's items are transcribed
from the pliego with their page (`data/tenders/*/items.json`). The pricing
agent (Muse Spark, `pricing-v2`) picks the cheapest valid product for each
good from five fictional stores (`data/suppliers/tiendas-DEMO.json`, also
shown in the app under **Tiendas (DEMO)**) and, for services, only estimates
hours per role. Code then checks every cost literally against the catalog,
computes services as hours × NovaTech's rate card, and applies the company's
pricing policy (`data/company-brain/pricing-policy.json`): total with ITBIS at
97% of the reference budget (band 95–99%), never under a 10% margin, with
incomplete, over-budget or unusually high-margin offers flagged. Live: case D
→ RD$ 8,481,486.60 (97%, 21% margin, every line under the entity's own
estimate); case A → RD$ 1,940,000.00.

## The demo

One fictional IT company (**NovaTech Solutions SRL** — every company record is
invented and DEMO-marked, never a real bidder) is evaluated against 4 real,
open Dominican public tenders (DGCP portal, unmodified originals):

| Case                           | Design intent      | Live verdict     | Why (cited by the system)                                                       |
| ------------------------------ | ------------------ | ---------------- | ------------------------------------------------------------------------------- |
| A · CNE software on Azure      | GO                 | **GO**           | experience, 2 reference letters, Azure CV + certification, RPE/TSS/DGII current |
| B · INDOTEL Wi-Fi deployment   | GO_WITH_CONDITIONS | **NO_GO**        | the real pliego (p25) requires 2+ similar Wi-Fi projects; the company has 1     |
| C · UAF Microsoft 365 renewal  | NO_GO              | **NO_GO**        | Microsoft partner/CSP authorization required; a distributor quote is not one    |
| D · ISFODOSU network equipment | NEEDS_REVIEW       | **NEEDS_REVIEW** | ratios pass (2.68 / 1.8 / 0.60) but the contract ≈ 86% of annual revenue        |

The point: the same pipeline says _go_ and _don't go_ **for the right reasons**,
with every claim traced to a tender clause and a company document. Where the
real pliego is stricter than the dataset's design (case B), the system follows
the document: the design counted PROJECT-005 as a second Wi-Fi project, but its
record is general IT support (GLPI, AnyDesk, Zabbix) with no Wi-Fi scope, so
only PROJECT-004 (14 Wi-Fi 6 APs) qualifies — see
[`EXECUTION-SUMMARY.md`](EXECUTION-SUMMARY.md).

## Why this matters (Dominican Republic)

Figures from Postor's market research (Oct 2026), built on DGCP official
data; each is labeled with its origin.

- **The market:** the public procurement system (SECP) transacted
  **RD$262,654 M in 2024** (≈ US$4.3 B, own calculation) across **64,851
  processes** and **173,004 offers** — _official, DGCP 2024 bulletin_.
- **The funnel is the problem:** **129,813** companies are registered as state
  suppliers, but only **38,943** participate actively (_press, 2025_); **14,536**
  bid in 2024 and **11,672** won at least once (_official_). Most registered
  businesses never turn registration into a bid.
- **SMBs are the policy target:** MIPYMES won **34.42%** of the 2024 amount
  (RD$90,419 M, _official_). Law 47-25 (in force Jan 2026) raises the MIPYME
  reserve to **30%** and removes the bid-security guarantee for them — more
  small businesses will be invited to compete.
- **Bids are lost on paperwork:** DGCP returns ~**1 in 5** supplier
  registrations and ~**1 in 3** updates for documentation problems, and its
  monitoring flags expired legal documents and suppliers bidding outside their
  registered activity as recurring errors (_official, DGCP 2025 report_).
- **No tooling for the bidder:** existing tools are official discovery apps;
  the research found no documented Dominican product that analyzes a pliego
  against a company's own evidence.

**Postor's answer:** read the real tender, check it against the company's own
documents (validity dates included), say _go / go with conditions / no go /
needs review_ with page-level evidence, and pre-fill the official forms —
leaving prices, signatures and anything unproven to a human.

## How it works

A Bid Orchestrator coordinates six specialized agents — Opportunity, Tender
Analyst, Compliance, Research & Pricing, Bid Writer, Bid Reviewer — over a
private Company Brain (structured profile as source of truth, documents as
evidence, hybrid retrieval). Agents exchange Zod-validated objects, never free
text, and nothing invented ever becomes a fact: unknowns are `[PENDING: ...]`.

Every AI call is logged and inspectable in the **Trace** view: prompt sent,
response received, tokens, duration, and cost estimate. No black boxes.

## Run it locally

Requirements: Node 22+ (`.nvmrc`), npm. Docker is optional (Postgres); without
it everything runs on a disposable local SQLite database.

```bash
npm install
cp .env.example .env            # paste META_API_KEY (handed over by the team)
npm run init -- --db=sqlite     # builds, loads data + Company Brain, live smoke test, readiness report
npm run dev                     # API on :3000 + web on http://localhost:5173
```

Then: **Oportunidades** → pick a case → **Ver ficha** → **▶ Correr análisis en
vivo** (mode **Rápido**: the key-requirements dossier, ~1–2 min; **Completo**: the
whole pliego, 10–20 min) and watch each agent step complete (real 2 s polling, no fake
animations). When it finishes, walk the tabs: Análisis (verdict, conditions
with owner + deadline), Requisitos (click any `pliego pN` to open the cited
page of the original PDF), Productos/Costos (prices only from company
quotations), **Traza** (every model call: prompt sent, response, tokens,
duration, estimated cost), Formularios/Documentos (filled SNCC forms and the
tender's own F.033, downloadable after human validation).

**No API key?** Run `npm run init -- --db=sqlite --offline` instead: it skips
the key check and loads real recorded runs of all four tenders
(`data/demo-runs/snapshot.json`), so the feed, verdicts, evidence, SAM regions
and the full Trace are explorable; only **Correr análisis en vivo** needs a key.

**Public demo deployment:** see [`DEPLOY.md`](DEPLOY.md) (single Docker
container, access token, visitors bring their own Meta key).

`npm run seed` validates the dataset offline (no key, no model calls);
`npm run doctor` diagnoses the environment. Tests: `npm test`.

## Repository layout

```text
apps/api/            # NestJS: orchestrator, agents, documents, brain, observability
apps/web/            # React + Vite: opportunities, live analysis, results, trace
packages/contracts/  # Shared Zod-validated agent contracts
data/                # Local fixtures: company-brain/ tenders/ templates/ expected-results/
storage/             # Generated by seed (gitignored)
```

Tenders ship as local fixtures for the demo; in production they arrive through
an external procurement API behind the same `TenderSource` interface.

## Rules the system lives by

- Real tender documents, fictional company — never mixed up, never mislabeled.
- Evidence or it didn't happen: findings cite document + page.
- Missing evidence means `unknown`, not failure (unless the tender makes the
  document a pass/fail admissibility criterion).
- Drafts stay drafts until a human reviews them. Postor never submits or signs.

## Status

Hackathon build (Oct 26 – Nov 4, 2026). See [`EXECUTION-SUMMARY.md`](EXECUTION-SUMMARY.md)
for live results per case, per-agent timings, and what remained out of scope.

## Disclosures

- **Built during the event.** All code in this repository was written between
  Oct 26 and Nov 4, 2026; no pre-existing code was reused. Development used AI
  coding assistance (Claude Code; commits are co-authored accordingly). The
  web UI was rebuilt in TypeScript from a UI mock-up made for this project
  during the event (not included in the repo).
- **Third-party data.** The tender documents under `data/tenders/` are public
  records downloaded from the Dominican DGCP procurement portal, unmodified.
  Market figures in "Why this matters" come from DGCP publications and
  Dominican press, each labeled with its source type.
- **Generated data.** The company (NovaTech Solutions SRL), its documents and
  the lite-mode key-requirement dossiers (`data/lite/`) are fictional and were
  produced for this demo with scripts and AI assistance (Muse); they are
  DEMO-marked and never presented as real.
- **Libraries.** Open-source npm packages (NestJS, React, Vite, Prisma,
  pdf.js, docx tooling, Zod, …) under their own licenses, installed from npm.
  The optional Prompt Guard 2 backend uses Meta's Llama Prompt Guard 2 under
  the Llama 4 Community License.

## License

Code: [MIT](LICENSE). The tender documents under `data/tenders/` are public
records from the Dominican DGCP procurement portal, included unmodified for
traceability; they are not covered by this license. All company data
(NovaTech Solutions SRL) is fictional and DEMO-marked.
