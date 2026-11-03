# Postor AI Bid Team — single container for the public demo (Dokploy/VPS).
# The API serves the built web app; SQLite lives on the /app/storage volume.
# glibc base (not alpine): pdfjs renders pages through @napi-rs/canvas.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json turbo.json tsconfig.base.json eslint.config.mjs ./
COPY apps ./apps
COPY packages ./packages
COPY data ./data
RUN npm ci --no-audit --no-fund
RUN node apps/api/prisma/derive-sqlite-schema.mjs \
  && npx prisma generate --schema=apps/api/prisma/schema.sqlite.prisma
RUN npx turbo run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    POSTOR_DB=sqlite \
    POSTOR_MODE=lite
COPY --from=build /app /app
COPY deploy/docker-entrypoint.sh /app/deploy/docker-entrypoint.sh
VOLUME ["/app/storage"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["sh", "/app/deploy/docker-entrypoint.sh"]
