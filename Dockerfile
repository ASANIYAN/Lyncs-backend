# Stage 1: Build
FROM node:20-alpine AS builder

ARG NODE_ENV=production

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine AS runner

ARG NODE_ENV=production
ARG THREADPOOL_SIZE=128
ARG PORT=3000

WORKDIR /app

# Set production environment
ENV NODE_ENV=${NODE_ENV}
# Senior Tip: Match the threadpool size we discussed in Phase 1
ENV UV_THREADPOOL_SIZE=${THREADPOOL_SIZE}
ENV PORT=${PORT}

# Install ONLY production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled code from builder
COPY --from=builder /app/dist ./dist

# Security: Don't run as root
USER node

# Fastify requires binding to 0.0.0.0 in Docker
EXPOSE ${PORT}

CMD ["node", "dist/main.js"]