# INSTRUCCIONES PARA Muse — Integración del Company Brain Demo

> This package is ALREADY placed at the root of the `postor-meta-demo` repo as `company-brain-demo/`.
> (It was also delivered as a zip: `company-brain-demo-novatech.zip`.)
> This is the **second demo module** of the hackathon: the Go/No-Go Company Brain benchmark.
> It is INDEPENDENT from `seed/` (the docgen module with Soluciones Teckdom). Do not mix them.
> Spec: `en/PRD-Addendum-Company-Brain-RAG.md` (§23). Original ChatGPT draft: `reference/`.

## 1. What you are getting

```
company-brain-demo/
├── INSTRUCCIONES-MUSE.md          # this file
├── tender-shortlist.json          # how the 4 tenders were selected (+2 alternates)
├── company/
│   ├── company-profile.json       # NovaTech Solutions, SRL — structured Company Brain (FICTIONAL)
│   ├── docs-graph.json            # document → project → capability relations (56 nodes / 80 edges)
│   ├── dataset-manifest.json      # inventory of company docs
│   ├── BUILD-REPORT.md            # what was built + v1.1 tuning notes
│   ├── build_dataset.py           # reproducible generator (fpdf2)
│   ├── patch_v11.py               # tuning patch against the real pliegos
│   └── docs/                      # 41 FICTIONAL company documents (PDF/CSV/MD, all watermarked DEMO)
├── tenders/
│   ├── caso-A-desarrollo-software-cne/       # metadata.json + original/ (8 files) — design: GO
│   ├── caso-B-wifi-indotel/                  # metadata.json + original/ (11 files) — design: GO_WITH_CONDITIONS
│   ├── caso-C-licencias-microsoft-uaf/       # metadata.json + original/ (23 files) — design: NO_GO
│   └── caso-D-equipos-red-isfodosu/          # metadata.json + original/ (26 files) — design: NEEDS_REVIEW
└── expected-results/
    └── scenarios.json             # DESIGN OBJECTIVES per case (not ground truth)
```

**Golden rule:** tenders are REAL (Dominican DGCP portal, unmodified originals). The company is
FICTIONAL — every file under `company/` carries `"fictional": true` and a DEMO watermark.
Never present NovaTech as a real bidder, in UI, logs, or the video.

## 2. The 4 cases (verified against the real pliegos)

| Case | Tender | Closes (RD) | Design verdict | Why |
|---|---|---|---|---|
| A | CNE-DAF-CM-2026-0064, software on Azure, RD$2M | Nov 5, 15:00 | **GO** | 3+ yrs exp, 2 ref letters, Azure/DevOps CVs, RPE/TSS/DGII — all documented |
| B | INDOTEL-DAF-CM-2026-0041, Wi-Fi deployment, RD$2M | Nov 6, 14:30 | **GO_WITH_CONDITIONS** | 2 gaps: expired CCNA (no structured-cabling cert), no Wi-Fi manufacturer letter |
| C | UAF-CCC-CP-2026-0007, Microsoft 365 (CSP), RD$5.7M | Nov 11, 10:00 | **NO_GO** | Mandatory factory certification letter (pliego p11, CUMPLE/NO CUMPLE p19); 0 manufacturer authorizations on file |
| D | ISFODOSU-CCC-LPN-2026-0003, network equipment, RD$8.74M | Nov 10, 09:00 | **NEEDS_REVIEW** | Financial ratios pass (solvency 2.68, liquidity 1.8, debt 0.60) but contract ≈ 86% of annual revenue |

Case D `original/` includes 2 extra files prefixed `D-MENSAJE-PUBLICO-` — attachments from the
portal's public Q&A (not in the official document list). Parse them as amendments.

## 3. Integration tasks

1. **Company Brain loader** — parse `company/company-profile.json` as the structured metadata layer:
   every entity carries `verification_level`, `source`, issue/expiry dates, and `relations`.
   Index `company/docs/` with the per-extension readers (pdf/docx/xlsx/xls/txt/csv/md/img).
   `docs-graph.json` is the relation map: document → project → capability.
2. **Tender ingestion** — for each `tenders/*/`: read `metadata.json`, then `original/`.
   Identify the pliego (filenames containing "Pliego") and treat `D-MENSAJE-PUBLICO-*` as amendments.
3. **Agent run** — Opportunity → Tender Analyst → Compliance (vs Company Brain) → Research & Pricing
   → Bid Writer (only on GO / GO_WITH_CONDITIONS) → Bid Reviewer → Coordinator.
   Verdicts: `GO`, `GO_WITH_CONDITIONS`, `NO_GO`, `NEEDS_REVIEW`.
   Requirement states per requirement: `met` / `not_met` / `unknown` / `not_applicable`.
   Rule: absence of evidence is `unknown`, never `not_met` — except case C, where the pliego makes
   the factory letter a CUMPLE/NO CUMPLE admissibility criterion and the file is structurally absent.
4. **Eval** — compare each run against `expected-results/scenarios.json` (design objectives).
   Also verify the *reasons*: correct pliego clause cited, correct company doc cited.
5. **Agent Trace (§21)** — every decision must trace to: pliego page/section + company document ID +
   agent + model call. No magic scores.
6. **Demo flow** — Company Brain profile view → AI Bid Team → run the 4 cases → 4 verdict cards →
   drill into any verdict (compliance matrix, evidence both sides) → "Generate draft bid" on case A.
7. **i18n** — dev + UI in English. Bilingual runs `LANG=en|es`; **never translate the source documents**.

## 4. Definition of done

- [ ] `company-brain-demo/` at repo root, committed (fictional docs are fine to commit — watermarked).
- [ ] 4 cases run end-to-end; verdicts match `scenarios.json` design decisions **for the right reasons**.
- [ ] Case C verdict explains *why a distributor quote is not enough* (quotes ≠ manufacturer accreditation).
- [ ] Case B lists the 2 conditions with owner + deadline (tender closes Nov 6).
- [ ] Agent Trace shows pliego-page + doc-ID citations for every verdict.
- [ ] No UI/log/video frame presents NovaTech as a real company.

## 5. Out of scope / pending (do NOT do)

- Do not auto-submit anything to the SECP portal — Postor is read-only toward government systems.
- Do not invent chunking for long documents (verified: the codebase has none).
- The Meta Model API key (`agent/.env`) and the public repo creation are the owner's manual steps.
