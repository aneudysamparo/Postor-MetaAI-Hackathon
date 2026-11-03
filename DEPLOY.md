# Deploying the public demo (Dokploy / any Docker host)

One container serves the API and the web app. SQLite lives on a volume; the
first boot creates the schema, loads the fictional Company Brain and imports
the four recorded runs, so the demo is explorable before anyone runs a live
analysis. Every boot is idempotent.

## Build & run

```bash
docker build -t postor-demo .
docker run -d --name postor-demo -p 3000:3000 \
  -v postor-storage:/app/storage \
  -e META_BASE_URL=https://api.meta.ai/v1 \
  -e DEMO_ACCESS_TOKEN='<long random token for judges>' \
  -e POSTOR_REQUIRE_USER_KEY=true \
  postor-demo
```

Health check: `GET /api/health`. First boot takes ~1 minute (Brain load + import).

## Dokploy (Docker Compose — recommended)

1. **Create → Compose** service: this GitHub repo, branch `main`, compose
   path `./compose.dokploy.yml`.
2. **Environment** tab: the variables in the table below (Dokploy writes them
   to the compose `.env`). Do not set `META_API_KEY` if visitors bring their
   own key.
3. **Domains**: `demo.postor.do` → service `app`, container port `3000`,
   HTTPS on (Let's Encrypt). The compose file publishes no host port; Traefik
   routes the domain. HTTPS matters: the access cookie is `Secure` behind
   HTTPS and visitor keys travel in a header.
4. Deploy. The named volume `postor-storage` (mounted at `/app/storage`) keeps
   the SQLite database, rendered pages and generated files across deploys.
5. Open the domain, enter the access token, and browse the recorded runs.

Alternative: a Dokploy **Application** with build type **Dockerfile**, a volume
at `/app/storage` and the same variables and domain.

## Environment

| Variable                                                         | Purpose                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `META_BASE_URL`                                                  | `https://api.meta.ai/v1`                                                     |
| `DEMO_ACCESS_TOKEN`                                              | Gate for the whole app (judges get it with the submission). Unset = open.    |
| `POSTOR_REQUIRE_USER_KEY`                                        | `true`: live analysis uses ONLY the visitor's Meta key (never the server's). |
| `META_API_KEY`                                                   | Optional server key (leave unset on a public demo).                          |
| `POSTOR_MODE`                                                    | Default analysis mode, `lite` (≈2 min) or `full`.                            |
| `META_COST_INPUT_USD_PER_MTOK` / `META_COST_OUTPUT_USD_PER_MTOK` | Optional cost-estimate rates for the Trace.                                  |

## How the visitor key is handled

The ficha shows a "Tu Meta API key" field when the deployment requires it.
The key stays in that browser tab (sessionStorage) and is sent only with
`POST /api/workflows`; the server uses it for that run through an
async-local context and never stores, logs or returns it.

## Reset between judges

The feed has **↺ Reiniciar demo**: it hides earlier analyses (nothing is
deleted) so each judge can run a tender from a clean card.

## Document guard

By default the guard needs no setup: a deterministic screen looks for
AI-directed language in every tender page and Muse Spark judges what it
escalates. Check it with
`npm run guard:check -- data/guard-fixtures/pliego-trampa-DEMO.txt`.

### Optional: Meta Llama Prompt Guard 2 on Modal

Scores every chunk with Meta's open-weights classifier instead. The model is
gated on Hugging Face: your account must be granted access first.

1. Accept the license of `meta-llama/Llama-Prompt-Guard-2-86M` on Hugging Face.
2. Install the Modal CLI (`uv tool install modal` or `pip install modal`) and run `modal setup`.
3. Create the secrets and deploy:

   ```bash
   modal secret create huggingface-secret HF_TOKEN=hf_...
   modal secret create postor-guard GUARD_TOKEN=<long random token>
   modal deploy deploy/modal/prompt_guard.py
   ```

4. Set `POSTOR_GUARD_URL` (the `…modal.run` URL Modal prints) and
   `POSTOR_GUARD_TOKEN` in the app environment.
5. Check it: `npm run guard:check -- data/guard-fixtures/pliego-trampa-DEMO.txt`
   (a DEMO file with a hidden "ignore your instructions" note) should flag it.
