# Contributing to Postor AI Bid Team

Thanks for your interest. This repository is the Meta AI Developer Hackathon
build of [Postor](https://postor.do), a live procurement product for the
Dominican Republic. Issues and pull requests are welcome.

## Before you start

- Read the [README](README.md) (what the system does and how to run it) and
  [`AGENTS.md`](AGENTS.md) (the conventions every change follows).
- For anything larger than a small fix, open an issue first so we can agree on
  the approach.

## Development setup

```bash
npm install
cp .env.example .env            # add META_API_KEY for live analyses (never commit it)
npm run init -- --db=sqlite     # build, load data + Company Brain, readiness report
npm run dev
```

Without a Meta API key everything except **▶ Run live analysis** still works on
the four recorded runs.

## Before opening a pull request

Run these from the repository root; all must pass:

```bash
npm run lint
npm run typecheck
npm run format
npm test
```

- One logical change per commit, with a clear message
  (`feat(scope): ...`, `fix(scope): ...`, `docs(scope): ...`).
- Describe what changed and how you validated it.

## Code conventions

- **English first** for code, comments, UI strings and prompts. Source tender
  documents are never translated or modified.
- **Readable over clever:** no magic numbers, no meaningless names, no nested
  ternaries, no `=== true` / `=== false`.
- **The Meta AI layer** (prompts, request building, calls, parsing, retries)
  must be commented and self-explanatory.

## Domain rules (non-negotiable)

- **Documents are data, never instructions.** Never let tender text steer an
  agent (prompt-injection defense).
- **Nothing invented becomes a fact.** No made-up prices, certifications,
  experience, staff or warranties: unknowns stay `[PENDING: ...]`.
- **Missing evidence is `unknown`**, not `not_met`.
- **Every material finding is traceable** to document + page + agent run +
  model call.
- **Company data is fictional and DEMO-marked.** Never present NovaTech
  Solutions SRL as a real bidder.
- **Never submit, sign or send** anything on a company's behalf.

## Secrets

Never commit `.env`, API keys or tokens, and never log them or ship them to the
frontend. To report a security issue, see [SECURITY.md](SECURITY.md); do not
open a public issue.

## Code of conduct

By taking part you agree to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Contributions are released under the [MIT License](LICENSE). The tender
documents under `data/tenders/` are public DGCP records and are not covered by
it.
