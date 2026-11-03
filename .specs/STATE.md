# STATE

## Decisions

### AD-001
- **Decision**: Stack is Next.js (TypeScript) full-stack + PostgreSQL (persistence) + Redis (cache and Riot API rate limiting).
- **Reason**: user chose it - "Next.js (TypeScript) full-stack + PostgreSQL + Redis (cache/rate limit)"; one deployable, one language.
- **Trade-off**: no separate backend service; background crawling/aggregation will need workers added later.
- **Scope**: all features
- **Date**: 2026-11-02
- **Status**: active

### AD-002
- **Decision**: Player data is persisted in PostgreSQL and served from the database; it is refreshed from the Riot API on first lookup and when the user clicks "Atualizar", with a per-player cooldown.
- **Reason**: user chose it - "Igual op.gg: dados ficam salvos no banco e o usuário clica em 'Atualizar' (com cooldown, ex. 2 min)"; keeps Riot API usage within dev-key limits.
- **Trade-off**: data can be stale until the user refreshes.
- **Scope**: all player-facing features
- **Date**: 2026-11-02
- **Status**: active

### AD-003
- **Decision**: All Riot platforms are supported through a region selector, BR1 as default; platform routing (br1, na1, euw1...) and regional routing (americas, europe, asia, sea) are both modelled.
- **Reason**: user chose it - "Todas as regiões, com seletor (BR1 padrão)".
- **Trade-off**: every URL, cache key and DB row carries the platform.
- **Scope**: all features
- **Date**: 2026-11-02
- **Status**: active

### AD-004
- **Decision**: Development until further notice runs on a Riot Development API key (20 req/1s, 100 req/2min, expires every 24h); all Riot calls go through one rate-limited client that honours the limits and `Retry-After`, and the key is read from the environment.
- **Reason**: user chose it - "Development key por enquanto ... vou pedir Personal/Production depois".
- **Trade-off**: low throughput; large-scale crawling (meta/tier list) is not viable on this key.
- **Scope**: all features calling the Riot API
- **Date**: 2026-11-02
- **Status**: active

### AD-005
- **Decision**: UI ships in pt-BR with all strings behind an i18n layer from day one.
- **Reason**: user chose it - "Português (pt-BR), com estrutura pronta para i18n depois".
- **Trade-off**: small overhead per string.
- **Scope**: all UI
- **Date**: 2026-11-02
- **Status**: active

### AD-006
- **Decision**: The platform is delivered as separate features: `summoner-profile` (Riot ID search, profile, ranked, match history, match detail, per-champion stats) first, then `champion-meta` (tier list and builds).
- **Reason**: the user's MVP list mixes per-player data (fetched on demand) with aggregated meta (needs bulk match collection); they have different data pipelines and different API-key needs.
- **Trade-off**: tier list ships after the profile.
- **Scope**: roadmap
- **Date**: 2026-11-02
- **Status**: active

### AD-007
- **Decision**: Riot API calls run only in a separate worker process consuming a BullMQ queue on Redis; the Next.js web process enqueues jobs (deterministic jobId per player/action) and the browser polls job status.
- **Reason**: user chose option B - "Next.js (web) + worker separado com fila BullMQ no Redis"; Development key limits make syncs take longer than an HTTP request can wait.
- **Trade-off**: two processes to run and deploy; polling adds up to 1 s of latency.
- **Scope**: all features calling the Riot API
- **Date**: 2026-11-02
- **Status**: active (refines AD-001 trade-off: workers are added now)

### AD-008
- **Decision**: Prisma is the ORM and migration tool for PostgreSQL.
- **Reason**: user chose it - "Prisma - migrations e tipos gerados, mais popular, ótimo DX".
- **Trade-off**: heavier client and engine than Drizzle; raw SQL for complex aggregations.
- **Scope**: all persistence
- **Date**: 2026-11-02
- **Status**: active

### AD-009
- **Decision**: Local development and tests run PostgreSQL and Redis through Docker Compose; tests never call the real Riot API - they use a local fake Riot HTTP server selected by `RIOT_API_BASE_URL`.
- **Reason**: user chose Docker Compose; deterministic tests without spending the dev key.
- **Trade-off**: fixtures must be kept in sync with the real API.
- **Scope**: all features, all tests
- **Date**: 2026-11-02
- **Status**: active

## Handoff

