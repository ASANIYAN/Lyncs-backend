# URL Shortener Backend

A high-performance backend service for shortening URLs, redirecting users, and exposing per-link analytics.

## What this project does

- Authenticates users (JWT + refresh tokens + OTP flows)
- Creates unique short codes for long URLs
- Redirects short codes to original URLs
- Tracks clicks asynchronously for analytics
- Provides dashboard and analytics endpoints
- Applies safety checks to links in the background

## Architecture

This project follows a **modular monolith** architecture in NestJS.

### Core modules

- `AuthModule`: registration, login, refresh/logout, profile, OTP
- `UrlModule`: URL creation, redirection, dashboard, deletion, safety checks
- `AnalyticsModule`: click ingestion, stream workers, analytics queries
- `common/*`: shared infrastructure (Redis, rate limiting, interceptors, mailer)

### Runtime topology

- **HTTP app process** handles API and redirect traffic
- **Worker process** (`start:worker`) consumes Redis streams for background jobs

## Patterns used

- **Layered pattern (Controller -> Service -> Repository)**
  - Keeps transport logic thin and business logic centralized.
- **Repository pattern (TypeORM)**
  - Data access is abstracted through injected repositories.
- **Event-driven / async processing (Redis Streams)**
  - Click tracking and safety checks are queued and processed by workers.
- **Cache-aside pattern (Redis)**
  - Hot reads (redirect lookup, profile, dashboard, analytics) use cache with DB fallback.
- **Policy-based cross-cutting concerns**
  - Rate limiting is defined declaratively via decorators and enforced globally by a guard.
- **Soft delete pattern**
  - URLs are deactivated (`is_active=false`) instead of hard-deleted.

## Major tools and why

- **NestJS**: strong module system, DI, and maintainable backend structure
- **Fastify (Nest adapter)**: lower overhead and better throughput than Express for latency-sensitive APIs
- **TypeORM + PostgreSQL**: relational consistency, migrations, indexing, and familiar ORM workflow
- **Redis (ioredis)**: low-latency cache + stream queues for async work
- **JWT + bcrypt**: standard auth and password hashing primitives
- **Joi + class-validator**: robust env and request validation
- **Swagger/OpenAPI**: live API documentation for faster integration

## Project setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create `.env.local` (or `.env`) with required variables:

- `DATABASE_URL` **or** all of: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`

Optional tuning:

- `AUTH_SALT_ROUNDS`, `OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`
- `DB_POOL_*`
- `GOOGLE_WEB_RISK_API_KEY`
- `RATE_<POLICY_NAME>_MAX`, `RATE_<POLICY_NAME>_WINDOW`

### 3. Run migrations

```bash
npm run migration:run
```

### 4. Start application

```bash
# development
npm run start:dev

# production build and run
npm run build
npm run start:prod

# worker-only process (no HTTP listener)
npm run start:worker
```

### 5. API docs

Once running, open:

- `http://localhost:3000/api/docs`

## Testing

```bash
npm run test
npm run test:e2e
npm run test:cov
```

## Notes

- Redirect endpoint uses **302** to ensure requests still hit the backend for analytics.
- Click analytics and safety checks are intentionally asynchronous to protect request latency.
- Additional implementation decisions are documented in `TRADEOFFS.md`.
