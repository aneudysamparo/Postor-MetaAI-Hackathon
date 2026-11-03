# `data/` — Local demo fixtures

This folder holds the demo inputs, reorganized from the original
`company-brain-demo/` drop (migration verified byte-identical, 128/128 SHA-256).

```text
data/
├── company-brain/      # FICTIONAL NovaTech Solutions SRL: structured profile,
│                       # docs-graph.json, docs/ (41 DEMO-marked files), builders
├── tenders/            # 4 REAL DGCP tenders (unmodified originals) + metadata
│                       # each case: metadata.json + original/
│                       # shortlist.json = selection rationale
├── templates/          # Bid document templates (.docx, Spanish originals)
└── expected-results/   # Design verdicts + requirement states (eval reference)
```

## Rules

- **Tenders are real and read-only.** Never modify, translate, or "fix" files under
  `tenders/*/original/`. In production these arrive through an external procurement
  API; this folder is the demo stand-in behind the `TenderSource` interface.
- **The company is 100% fictional.** Every file under `company-brain/` carries
  `"fictional": true` and physical documents are DEMO-watermarked. Never present
  NovaTech as a real bidder.
- **Raw inputs stay pristine.** Derived artifacts (indexes, chunks, caches) go to
  `storage/` (gitignored), built by `npm run seed`.
- The integration notes formerly at `company-brain-demo/INSTRUCCIONES-MUSE.md`
  now live at `docs/INSTRUCCIONES-MUSE.md` (internal-only, not published).
- JSON keys in English; tender *documents* keep their real Spanish originals;
  currency DOP; dates in `America/Santo_Domingo`.
