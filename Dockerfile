# ── Builder Stage ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies required for sharp and prisma
RUN apk add --no-cache libc6-compat openssl

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── Production Stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies for sharp and prisma
RUN apk add --no-cache curl libc6-compat openssl

COPY package.json package-lock.json* ./
# Install only production dependencies
RUN npm ci --omit=dev

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist

# Copy startup script
COPY scripts/start.sh ./scripts/start.sh
RUN chmod +x ./scripts/start.sh

# Set default writable upload directory for Render free tier
ENV UPLOAD_DIR=/tmp/uploads
RUN mkdir -p /tmp/uploads

# Pre-download and bundle Tesseract English language data to avoid runtime network/memory spikes
RUN node -e "require('tesseract.js').createWorker('eng').then(w => w.terminate())"

# Ensure node user owns app files and temp upload directory
RUN chown -R node:node /app /tmp/uploads

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["./scripts/start.sh"]
