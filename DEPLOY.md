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

## Dokploy

1. New **Application** → source: this GitHub repo, branch `main`, build type **Dockerfile**.
2. **Environment** (see table below). Do not set `META_API_KEY` if visitors bring their own key.
3. **Volumes**: mount a volume at `/app/storage`.
4. **Domains**: `demo.postor.do` → container port `3000`, HTTPS on (Let's Encrypt).
   HTTPS matters: the access cookie is `Secure` behind HTTPS and visitor keys travel in a header.
5. Deploy, then open the domain, enter the access token, and browse the recorded runs.

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
