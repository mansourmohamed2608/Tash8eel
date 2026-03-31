# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Build-time variables consumed by Next.js during `next build`
ARG API_BASE_URL=http://api:3000
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_WS_URL=
ARG NEXT_PUBLIC_WS_ENABLED=true
ENV API_BASE_URL=${API_BASE_URL}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL}
ENV NEXT_PUBLIC_WS_ENABLED=${NEXT_PUBLIC_WS_ENABLED}

# Copy workspace manifests so npm can honor root lockfile/workspaces
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/worker/package*.json ./apps/worker/
COPY apps/portal/package*.json ./apps/portal/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/agent-sdk/package*.json ./packages/agent-sdk/

# Install only portal workspace deps in deterministic mode
RUN npm ci --workspace apps/portal --ignore-scripts

# Copy portal source and build it
COPY apps/portal ./apps/portal
RUN mkdir -p ./apps/portal/public
RUN npm run build -w apps/portal

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy workspace manifests for runtime dependency install
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/worker/package*.json ./apps/worker/
COPY apps/portal/package*.json ./apps/portal/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/agent-sdk/package*.json ./packages/agent-sdk/

# Install production dependencies for portal workspace
RUN npm ci --omit=dev --workspace apps/portal --ignore-scripts

# Copy built portal output
COPY --from=builder /app/apps/portal/.next ./apps/portal/.next
COPY --from=builder /app/apps/portal/public ./apps/portal/public
COPY --from=builder /app/apps/portal/next.config.js ./apps/portal/next.config.js

# Set ownership
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["npm", "run", "start", "-w", "apps/portal"]
