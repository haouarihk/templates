# ---- build: install with Bun, prerender every route to dist/ ----------------
FROM oven/bun:1 AS build
WORKDIR /app

# Dependencies first so edits to src/ don't invalidate the install layer.
# package-lock.json is migrated by Bun when no bun.lock is present, which keeps
# the image pinned to the same versions CI installs.
COPY package.json bun.lock* package-lock.json ./
RUN bun install

COPY . .

# Two steps of `build.static`, invoked directly because the package script
# shells out to npm, which these images don't carry: the client bundle, then
# the static adapter that walks the routes and writes flat HTML into dist/.
RUN bun run build.client \
  && bun run build.server

# ---- runtime: Bun serving the prerendered output ---------------------------
FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    SITE_ROOT=/app/dist

# Static output plus the server script — no node_modules, nothing to install.
COPY --from=build /app/dist ./dist
COPY serve.ts ./

USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT??3000)+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["bun", "serve.ts"]
