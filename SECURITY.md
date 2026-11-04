# Security Policy

## Supported versions

| Version                  | Supported |
| ------------------------ | --------- |
| `main` (hackathon build) | Yes       |
| Older commits and forks  | No        |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report them privately through GitHub: open the repository's **Security** tab →
**Report a vulnerability**. Include what you found, the steps to reproduce it,
and its likely impact. You will get an acknowledgement within a few days.

Problems we especially want to hear about:

- An API key, token or secret exposed in the code, logs, history or frontend.
- A tender document or other input that steers an agent (prompt injection
  that gets past the guard).
- Access to the demo without its access token, or to data from another run.
- Any way to make Postor submit, sign or send something on a company's behalf.

## How the project handles secrets

- `META_API_KEY` and other secrets live only in `.env` (see
  [`.env.example`](.env.example)), which is gitignored. They are never logged
  and never sent to the frontend.
- A Meta API key pasted into the demo UI is used for that single run and never
  stored.
- Tender documents are treated as **data, never instructions**. Every page is
  screened by Llama Prompt Guard 2 before the agents read it, and Muse Spark
  confirms what it flags.
- All company data in this repository is fictional and DEMO-marked; there is
  no real customer data here.
