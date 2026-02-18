# Docker Configuration - Environment Variables

This document outlines how all Docker-related configuration has been refactored to use environment variables instead of hardcoded values.

## Summary of Changes

All hardcoded values in Docker files have been replaced with environment variables from `.env.docker`, making the setup fully configurable without modifying source files.

---

## 1. **docker-compose.yml** - Fully Parameterized

### API Service
```yaml
api:
  build:
    context: .
    target: runner
    args:
      - NODE_ENV=${NODE_ENV:-development}
      - THREADPOOL_SIZE=${UV_THREADPOOL_SIZE:-128}
      - PORT=${PORT:-3000}
  ports:
    - '${PORT:-3000}:3000'
  env_file:
    - .env.docker
  environment:
    - NODE_ENV=${NODE_ENV:-development}
```

**Variables Used:**
- `NODE_ENV` - Application environment (development/production)
- `PORT` - Port number (default: 3000)
- `UV_THREADPOOL_SIZE` - Thread pool size (default: 128)

### Database Service
```yaml
db:
  image: postgres:15-alpine
  environment:
    - POSTGRES_USER=${DB_USERNAME}
    - POSTGRES_PASSWORD=${DB_PASSWORD}
    - POSTGRES_DB=${DB_NAME}
  ports:
    - '${DB_PORT}:5432'
  healthcheck:
    test: ['CMD-SHELL', 'pg_isready -U ${DB_USERNAME} -d ${DB_NAME}']
```

**Variables Used:**
- `DB_USERNAME` - PostgreSQL user (default: postgres)
- `DB_PASSWORD` - PostgreSQL password
- `DB_NAME` - Database name (default: url_shortener)
- `DB_PORT` - Database port (default: 5432)

### Redis Service
```yaml
redis:
  image: redis:7-alpine
  ports:
    - '${REDIS_PORT:-6379}:6379'
```

**Variables Used:**
- `REDIS_PORT` - Redis port (default: 6379)

---

## 2. **Dockerfile** - Build Arguments

### Stage 1: Builder
```dockerfile
FROM node:20-alpine AS builder
ARG NODE_ENV=production
```

### Stage 2: Runtime
```dockerfile
FROM node:20-alpine AS runner
ARG NODE_ENV=production
ARG THREADPOOL_SIZE=128
ARG PORT=3000

ENV NODE_ENV=${NODE_ENV}
ENV UV_THREADPOOL_SIZE=${THREADPOOL_SIZE}
ENV PORT=${PORT}

EXPOSE ${PORT}
```

**Build Arguments:**
- `NODE_ENV` - Environment type (default: production)
- `THREADPOOL_SIZE` - UV thread pool size (default: 128)
- `PORT` - Application port (default: 3000)

---

## 3. **.env.docker** - Docker Environment Configuration

```bash
# Application
NODE_ENV=development
PORT=3000
AUTH_SALT_ROUNDS=12

# Database (PostgreSQL) - Docker service name
DB_HOST=db
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=0000
DB_NAME=url_shortener

# Redis - Docker service name
REDIS_URL=redis://redis:6379
REDIS_PORT=6379

# Security (JWT)
JWT_ACCESS_SECRET=f9dc6aced1a495e974d8cd09b754b6f7655ac6a54413fc163c85232ea86593dc
JWT_REFRESH_SECRET=cf1be440d5d82e6af67b0d90f60f3e340f6c884428c68b4bb014e56d078f8b90

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## 4. **.env** - Local Development Configuration

For local development (without Docker):
- `DB_HOST=localhost` (instead of `db`)
- `REDIS_URL=redis://localhost:6379` (instead of `redis://redis:6379`)

---

## Usage

### Building with Custom Configuration
```bash
docker-compose build --build-arg NODE_ENV=production --build-arg THREADPOOL_SIZE=256
```

### Running with Different Ports
```bash
PORT=8080 DB_PORT=5433 REDIS_PORT=6380 docker-compose up
```

### Environment Overrides
All variables in `.env.docker` can be overridden by:
1. Setting environment variables before running docker-compose
2. Creating a `.env.local` file (if using env_file in docker-compose)
3. Command-line argument `--env-file <filename>`

---

## Benefits

✅ **No Hardcoded Values** - All configuration comes from environment files
✅ **Easy to Customize** - Change ports, credentials, and settings without editing files
✅ **Safe for Production** - Credentials and secrets come from environment, not code
✅ **Development Friendly** - Different configurations for `.env` and `.env.docker`
✅ **Scalable** - Easy to deploy to different environments (staging, production)

---

## Security Notes

⚠️ **Important:**
- `.env` and `.env.docker` files contain sensitive information
- Add these files to `.gitignore` (they should already be ignored)
- Never commit secrets to version control
- In production, use proper secret management (e.g., Docker Secrets, environment variables)

**Change the default password `0000` before deployment!**

---

## Variables Reference

| Variable | File | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | `.env.docker` | development | Application environment |
| `PORT` | `.env.docker` | 3000 | API server port |
| `AUTH_SALT_ROUNDS` | `.env.docker` | 12 | Bcrypt salt rounds |
| `DB_HOST` | `.env.docker` | db | Database hostname |
| `DB_PORT` | `.env.docker` | 5432 | Database port |
| `DB_USERNAME` | `.env.docker` | postgres | Database user |
| `DB_PASSWORD` | `.env.docker` | 0000 | Database password |
| `DB_NAME` | `.env.docker` | url_shortener | Database name |
| `REDIS_URL` | `.env.docker` | redis://redis:6379 | Redis connection URL |
| `REDIS_PORT` | `.env.docker` | 6379 | Redis port |
| `JWT_ACCESS_SECRET` | `.env.docker` | (64-char hex) | JWT access token secret |
| `JWT_REFRESH_SECRET` | `.env.docker` | (64-char hex) | JWT refresh token secret |
| `RATE_LIMIT_WINDOW_MS` | `.env.docker` | 60000 | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | `.env.docker` | 100 | Max requests per window |
