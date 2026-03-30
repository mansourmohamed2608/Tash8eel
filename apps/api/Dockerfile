# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files for monorepo
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/agent-sdk/package*.json ./packages/agent-sdk/
COPY apps/api/package*.json ./apps/api/

# Install all dependencies
RUN npm ci

# Copy source files
COPY packages/shared ./packages/shared
COPY packages/agent-sdk ./packages/agent-sdk
COPY apps/api ./apps/api
COPY tsconfig.json ./

# Build packages first, then API
RUN npm run build -w @tash8eel/shared -w @tash8eel/agent-sdk
RUN npm run build -w @tash8eel/api

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/agent-sdk/package*.json ./packages/agent-sdk/
COPY apps/api/package*.json ./apps/api/

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/agent-sdk/dist ./packages/agent-sdk/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy migrations
COPY apps/api/migrations ./apps/api/migrations

# Set ownership
RUN chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

ENV NODE_ENV=production

CMD ["node", "apps/api/dist/main.js"]

