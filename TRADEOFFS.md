# Tradeoffs

This document captures deliberate engineering tradeoffs made in the project.

## 1) ID generation and short code length

We use **6-character Base62 short codes** (`0-9`, `a-z`, `A-Z`).

- Search space is `62^6 = 56,800,235,584` possible codes.
- For a small-to-medium project, this space is large enough that practical exhaustion is unlikely.
- Fixed-length codes keep URLs short and predictable.
- Storage/index sizing is more predictable due to bounded code length.

Tradeoff accepted:

- Shorter codes improve usability, but collision probability is higher than with longer codes.
- We mitigate this by collision checks and retry on generation.

## 2) Read vs write ratio assumptions

URL shorteners are naturally **read-heavy**:

- Many more redirect reads (`GET`) than create/update writes (`POST`/`PUT`/`DELETE`).
- This influenced caching strategy and query/index decisions.

Tradeoff accepted:

- We optimize hot read paths (redirect lookup, dashboard/profile snippets, analytics summaries).
- Write complexity is slightly higher due to cache invalidation/versioning.

## 3) Redirect semantics: 302 over 301

We intentionally return **302 redirects** instead of permanent 301 redirects.

Why:

- Browser/proxy-level permanent caching can bypass the backend on repeat visits.
- If requests bypass the backend, click analytics and traffic source tracking become incomplete.
- 302 keeps requests flowing through the service, preserving measurement quality.

Tradeoff accepted:

- Slightly less client/proxy cache efficiency in exchange for accurate analytics and user visibility.

## 4) Analytics ingestion: fire-and-forget with Redis Streams

Click analytics is handled asynchronously using Redis Streams and workers.

Why:

- Redirect response time should stay fast.
- Synchronous click writes on the redirect path would add avoidable latency and coupling.

Tradeoff accepted:

- Eventual consistency for analytics (small delay before metrics appear).
- Added operational complexity (worker lifecycle, queue health, retry/ack behavior).

## 5) Fastify over Express

We use **Fastify** as the Nest platform adapter.

Why:

- Better throughput and lower overhead for high-frequency endpoints (especially redirects).
- Faster JSON serialization and request lifecycle in many workloads.
- Good plugin ecosystem and strong TypeScript support.

Tradeoff accepted:

- Express ecosystem familiarity is broader in some teams.
- Some middleware patterns differ and may require Fastify-specific plugins or adaptation.
