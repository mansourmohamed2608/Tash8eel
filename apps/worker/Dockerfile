# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for monorepo
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/agent-sdk/package*.json ./packages/agent-sdk/
COPY apps/worker/package*.json ./apps/worker/

# Install all dependencies
RUN npm ci

# Copy source files
COPY packages/shared ./packages/shared
COPY packages/agent-sdk ./packages/agent-sdk
COPY apps/worker ./apps/worker
COPY tsconfig.json ./

# Build packages first, then Worker
RUN npm run build -w @tash8eel/shared -w @tash8eel/agent-sdk
RUN npm run build -w @tash8eel/worker

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/agent-sdk/package*.json ./packages/agent-sdk/
COPY apps/worker/package*.json ./apps/worker/

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/agent-sdk/dist ./packages/agent-sdk/dist
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

# Set ownership
RUN chown -R nestjs:nodejs /app

USER nestjs

ENV NODE_ENV=production

CMD ["node", "apps/worker/dist/main.js"]
