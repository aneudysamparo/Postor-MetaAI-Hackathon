# Postor AI Bid Team

A multi-agent AI system that takes a small business from a public procurement
opportunity to an honest, evidence-backed answer: **bid here, bid with
conditions, don't bid, or let a human decide** — plus a first draft of the
technical proposal when bidding makes sense.

Built for the Meta AI Developer Hackathon. All agent reasoning runs on
`muse-spark-1.3`; `sam-3.1` localizes visual regions on scanned pages.

## The demo

One fictional IT company (**NovaTech Solutions SRL** — every company record is
invented and DEMO-marked, never a real bidder) is evaluated against 4 real,
open Dominican public tenders (DGCP portal, unmodified originals):

| Case                           | Tender                                 | Verdict                |
| ------------------------------ | -------------------------------------- | ---------------------- |
| A · CNE software on Azure      | Fits experience, staff, and docs       | **GO**                 |
| B · INDOTEL Wi-Fi deployment   | Two fixable gaps before closing        | **GO_WITH_CONDITIONS** |
| C · UAF Microsoft 365 renewal  | Mandatory manufacturer letter missing  | **NO_GO**              |
| D · ISFODOSU network equipment | Ratios pass, contract ≈ 86% of revenue | **NEEDS_REVIEW**       |

The point: the same pipeline says _go_ and _don't go_ **for the right reasons**,
with every claim traced to a tender clause and a company document. The table
shows the verdicts the dataset was designed for; on the real documents cases B
and D turned out stricter and the system says so — see
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

## Quickstart (judges)

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

`npm run seed` validates the dataset offline (no key, no model calls);
`npm run doctor` diagnoses the environment. Tests: `npm test`.

## What runs where

| Step                            | Agent / module                                                                              | Model                         |
| ------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| Load tender + company           | orchestrator, `documents/` (per-page quality: text/mixed/scanned)                           | —                             |
| Opportunity fit                 | Opportunity agent                                                                           | `muse-spark-1.3`              |
| Requirements with page evidence | Tender Analyst (12-page windows, 4 in parallel)                                             | `muse-spark-1.3`              |
| Scanned pages                   | Visual reader: page render → `sam-3.1` region step → vision read                            | `sam-3.1`* + `muse-spark-1.3` |
| Requirement × Company Brain     | Compliance agent + **deterministic** verdict and financial ratios                           | `muse-spark-1.3`              |
| Item prices                     | Research & Pricing + deterministic guard (price must literally appear in a valid quotation) | `muse-spark-1.3`              |
| Proposal draft                  | Bid Writer → Bid Reviewer → one correction round → re-review                                | `muse-spark-1.3`              |
| Bid package                     | SNCC forms + the tender's own F.033 filled, `[PENDING]` where unknown                       | —                             |

\* `sam-3.1` segmentation is wired behind a fail-closed interface: its
region-box contract could not be verified on the hackathon account, so the
trace records the gap and pages are read whole and cited by page number —
never with invented coordinates.

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

## License

Code: [MIT](LICENSE). The tender documents under `data/tenders/` are public
records from the Dominican DGCP procurement portal, included unmodified for
traceability; they are not covered by this license. All company data
(NovaTech Solutions SRL) is fictional and DEMO-marked.
