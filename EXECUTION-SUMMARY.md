# Execution summary — Postor AI Bid Team

Hackathon window: Oct 26 – Nov 4, 2026. Every number below comes from live
runs against the Meta Model API (`muse-spark-1.3`) on the 4 real DGCP
tenders, with the fictional company NovaTech Solutions SRL (DEMO).

## What works end to end

- **Orchestrator + 6 agents** (Opportunity, Tender Analyst, Compliance,
  Research & Pricing, Bid Writer, Bid Reviewer) plus a visual reader for
  scanned pages, all exchanging Zod-validated objects.
- **Evidence everywhere**: every requirement cites document + page; the UI
  opens the original, byte-identical PDF at that page.
- **Deterministic guards around the model**: the verdict, the financial
  ratios (solvency 2.68 / liquidity 1.80 / debt 0.60), contract concentration,
  price validation (a price survives only if it literally appears in a valid
  quotation) and mandatory-requirement coverage in the review are code, not
  model output.
- **Bid package**: the 6 SNCC forms and each tender's own SNCC.F.033 are
  filled from the company profile; offer prices, signatures and anything
  unknown stay `[PENDING: ...]`. Downloads require human validation. Nothing
  is ever submitted.
- **Agent Trace**: every model call stores and shows the prompt sent, the
  response, tokens in/out, duration and an estimated cost (tokens ×
  configurable rates, labeled as an estimate).

## Live results vs. the design oracle

`data/expected-results/scenarios.json` holds the verdicts the dataset was
designed for. The system judges the real tender documents, which turned out
stricter than the design in two cases. We kept the document-faithful verdict
instead of tuning prompts toward the oracle.

| Case                   | Oracle             | Live verdict | Decisive reasons cited by the system                                                                                                                                                                                                                                          |
| ---------------------- | ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A · CNE Azure software | GO                 | **GO** ✓     | 6 years, 2 reference letters, Azure CVs/cert, RPE/TSS/DGII current                                                                                                                                                                                                            |
| B · INDOTEL Wi-Fi      | GO_WITH_CONDITIONS | **NO_GO**    | pliego p25 (CUMPLE/NO CUMPLE): georeferenced fiber-coverage file the company lacks; 2 similar Wi-Fi projects required, 1 on file; certified structured-cabling engineer (only cert is an expired CCNA). The manufacturer/distributor letter is correctly a solvable condition |
| C · UAF Microsoft 365  | NO_GO              | **NO_GO** ✓  | factory authorization required (pliego p11, CUMPLE/NO CUMPLE p19); no Microsoft partner/CSP status; a distributor quotation does not substitute it                                                                                                                            |
| D · ISFODOSU network   | NEEDS_REVIEW       | **NO_GO**    | SNCC.F.047 manufacturer authorization mandatory (p18, p29); manufacturer-certified engineer (p31). Ratios pass and the ~86% revenue concentration is detected (0.857)                                                                                                         |

Run time per full pipeline: 9–19 minutes (A 544 s, B 638 s, C 628 s, D
1140 s; D's pliego + amendments yield ~300 requirements).

## Lite mode (live demo path, under 3 minutes)

The full pipeline reads entire pliegos (150–300 requirements, 10–19 min). For
live demos, **lite mode** runs the same agents, guards and trace on a curated
key-requirements dossier per tender (`data/lite/`, each requirement citing the
original file + page) and the 21 decisive Company Brain documents. The
dossiers were written alongside the design oracle, so the parser strips every
answer column ("Estado esperado", evidence notes, "Lectura del caso",
review-point rows) before any agent sees them (unit-tested on all four).
Opportunity runs beside the evidence lane; the draft is short with one
review.

| Case         | Lite time | Lite verdict     | Decisive reasons                                                  |
| ------------ | --------- | ---------------- | ----------------------------------------------------------------- |
| A · CNE      | 2:10      | **GO**           | references, Azure CV + cert, RPE/TSS/DGII; review `pass`          |
| B · INDOTEL  | 1:45      | **NO_GO**        | 2+ similar Wi-Fi projects required, 1 on file                     |
| C · UAF      | 1:13      | **NO_GO**        | Microsoft partner/CSP channel required; quotation ≠ authorization |
| D · ISFODOSU | 1:34      | **NEEDS_REVIEW** | all key requirements hold; contract = 86% of annual revenue       |

Lite mode is the default (`POSTOR_MODE`, or the mode selector on the ficha);
full mode stays one click away.

## Per-agent timings (average over live runs)

| Agent             | Wall time | Avg model call | Notes                                 |
| ----------------- | --------- | -------------- | ------------------------------------- |
| Opportunity       | 55 s      | 69 s           | metadata only, never reads the pliego |
| Tender Analyst    | 268 s     | 163 s          | 12-page windows, 4 in parallel        |
| Visual reader     | 21 s      | 13 s           | ≤2 scanned pages per run              |
| Compliance        | 343 s     | 46 s           | batches of 8, 4 in parallel           |
| Pricing           | 41 s      | 39 s           | one call + deterministic guard        |
| Writer + Reviewer | 130 s     | 63 / 93 s      | one correction round when needed      |

## Meta models in use

| Model                       | Where                              | Role                                                                   |
| --------------------------- | ---------------------------------- | ---------------------------------------------------------------------- |
| `muse-spark-1.3`            | Meta Model API                     | analyst, compliance, pricing, writer, vision reads                     |
| `muse-wonder-1.0`           | Meta Model API                     | Bid Reviewer (max-effort reasoning audits Spark's draft; 16 s live)    |
| `sam-3.1`                   | Meta Model API                     | localizes signatures/initials and logos on scanned pages (pixel boxes) |
| `muse-spark-1.3` (guard)    | Meta Model API                     | judges chunks a deterministic screen escalates for prompt injection    |
| `muse-voice-transcribe-1.0` | Meta Model API (`/asr/transcribe`) | transcribes voice answers to `[PENDING]` items (Spark maps them)       |

## Found by live runs (each fixed with a regression test)

1. Explicit `null`s and objects where strings were expected → lenient
   schemas + normalization (analyst, opportunity).
2. One invalid analyst window sank the whole step → windows fail
   independently; unread pages are flagged and the run lands on
   `needs_review`.
3. Sequential calls pushed case D past 20 min → bounded concurrency pool.
4. A manufacturer-or-distributor letter was treated as a blocker →
   compliance prompt v2 (obtainable letters are conditions).
5. Goods specifications were compared with company experience → v3 (specs
   describe the product to quote).
6. Blockers that might be met through a partner → v4 labels blockers
   `clear` / `disputed`; disputed-only blockers yield `needs_review`.
7. pdfjs rendered scanned JBIG2 pages washed out → wasm + fonts wired.

## Out of scope / P1

- **SAM 3.1 beyond marks**: SAM is live (Responses API, verified
  2026-11-03) and localizes signatures/initials and logos on scanned pages,
  cited by pixel coordinates. Concepts like "table" or "text" return no
  instances on document scans, so table regions are still read whole by Muse
  Spark; cropping SAM regions for targeted reads is P1.
- Embeddings: deterministic hash baseline behind the interface; multilingual
  transformer and pgvector are P1.
- External tender API (`ApiTenderSource`) is a stub; the demo reads fixtures.
- Postgres path validated by schema/migration diff; live demo runs on SQLite.
- Live runs take minutes; a production build would stream progress per
  requirement batch and cache unchanged tender analyses.
