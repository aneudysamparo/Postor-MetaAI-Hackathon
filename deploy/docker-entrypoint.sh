#!/bin/sh
# Idempotent boot for the demo container:
# 1. create the SQLite schema on the storage volume (first boot only);
# 2. load the fictional Company Brain when the database has no company;
# 3. import the recorded demo runs (skips runs already present);
# 4. start the API (which also serves the web app).
set -e
cd /app
mkdir -p storage
export DATABASE_URL="file:/app/storage/postor.sqlite"

if [ ! -f storage/postor.sqlite ]; then
  echo "[postor] creating SQLite schema"
  npx prisma db push --skip-generate --schema=apps/api/prisma/schema.sqlite.prisma
fi

COMPANIES=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.company.count().then(n=>{console.log(n);return p.\$disconnect()})")
if [ "$COMPANIES" = "0" ]; then
  echo "[postor] loading Company Brain"
  node packages/cli/dist/brain-load.js --db=sqlite
fi

echo "[postor] importing recorded demo runs"
node apps/api/dist/demo/demo-cli.js import || echo "[postor] demo import skipped"

echo "[postor] starting API on port ${PORT:-3000}"
exec node apps/api/dist/main.js
