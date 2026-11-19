# DeutschLern AI — production image (Milestone 9)
#
# The frontend is plain HTML/CSS/ES modules: there is no bundler or build step.
# Only runtime dependencies are installed so no test tooling ships in the image.
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/app/data

# Install from the committed lockfile for reproducible, auditable builds.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application source. Tests, docs and local data are excluded via .dockerignore.
COPY server ./server
COPY frontend ./frontend
COPY content ./content

# The atomic JSON store and any dev secret live in DATA_DIR and must be writable
# by the unprivileged runtime user. In production set SESSION_SECRET explicitly
# so no dev secret file is ever created.
RUN mkdir -p /app/data && chown -R node:node /app /app/data
USER node

EXPOSE 3000

# Liveness only: readiness is a separate orchestrator probe so a missing
# SESSION_SECRET can be surfaced without needlessly restarting the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
