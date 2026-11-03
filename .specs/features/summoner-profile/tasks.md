# summoner-profile Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, the walk, check_proofs, the Verifier and the screens sub-agent).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/summoner-profile/design.md`
**Status**: Approved
**Approved**: 2026-11-02 - user: "aprovo, delege para sub agente"
**Build**: `pnpm typecheck; pnpm lint; pnpm build`
**Run unit**: `pnpm vitest run --reporter=verbose`

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec - confirm before Execute. Guidelines found: none - strong defaults applied.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| ---------- | ------------------ | -------------------- | ---------------- | ----------- |
| Domain / Business Logic (`src/server/riot/*`, `src/server/stats/*`, `src/server/matches/*`, `src/server/sync/*`, `src/i18n/*`) | unit | All branches; 1:1 to spec ACs; every listed edge case has a test | `tests/unit/**/*.test.ts` | `pnpm vitest run --reporter=verbose` |
| Repository / API Routes (`src/server/db/*`, `src/app/api/**/*`) | integration | Key query paths + happy + edge + error paths | `tests/integration/**/*.test.ts` | `pnpm vitest run --reporter=verbose` |
| UI Components & Screens (`src/components/*`, `src/app/**/*`) | unit | Component states, gestures, responsive layout & edge cases | `tests/ui/**/*.test.tsx` | `pnpm vitest run --reporter=verbose` |
| Entity / Config / Schema (`package.json`, `prisma/schema.prisma`, `docker-compose.yml`, `render.yaml`) | none | - (build gate only) | - | `pnpm typecheck` |

## Gate Check Commands

> Generated from codebase - confirm before Execute.

| Gate Level | When to Use | Command |
| ---------- | ----------- | ------- |
| Quick | After tasks with unit tests | `pnpm vitest run --reporter=verbose` |
| Full | After tasks with integration or UI tests | `pnpm vitest run --reporter=verbose` |
| Build | After phase completion or config/entity-only tasks | `pnpm typecheck; pnpm lint; pnpm build` |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Foundation & Riot Client

Setup Next.js + Prisma + Redis + i18n, Riot routing, Riot ID validation, rate-limiter, Riot API client and Data Dragon helper.

```
T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8
```

### Phase 2: Persistence, Sync Engine & API Routes

Repositories, pure stats & queue tabs, SyncService, portable SyncDispatcher (inline Vercel + worker Render/BullMQ), and Next.js API routes.

```
T9 → T10 → T11 → T12 → T13 → T14 → T15
```

### Phase 3: UI Components, Screens & Deployment Configs

Header, Footer, SearchBar, Profile header & Refresh button, Ranked cards, Champion stats panel, Match history & inline detail, pages, and Vercel/Render configs.

```
T16 → T17 → T18 → T19 → T20 → T21 → T22
```

---

## Task Breakdown

### T1: Scaffold Next.js TypeScript project, test runner and Docker/Prisma schema

**What**: Initialize `package.json`, TypeScript, Tailwind CSS, Vitest, ESLint, `docker-compose.yml` (Postgres + Redis) and `prisma/schema.prisma` with Summoner, LeagueEntry, Match, MatchParticipant and MatchTeam models.
**Where**: `prisma/schema.prisma`
**Depends on**: None
**Reuses**: None (initial scaffold)
**Requirement**: RIOT-07

**Done when**:

- [x] `package.json`, `tsconfig.json`, `vitest.config.ts`, `docker-compose.yml` and `prisma/schema.prisma` created
- [x] Prisma client generated and `pnpm typecheck` exits 0

**Tests**: none
**Gate**: build

---

### T2: Create pt-BR i18n dictionary and translation helper

**What**: Implement the pt-BR catalog and `t(key, vars)` helper so every UI string comes from the catalog and includes the Riot legal disclaimer and LMI Stats branding.
**Where**: `src/i18n/index.ts`
**Depends on**: T1
**Reuses**: None
**Requirement**: I18N-01, LEGAL-01, BRAND-01

**Done when**:

- [x] `t()` resolves all UI keys in pt-BR and interpolates variables
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 3+ tests pass

**Tests**: unit
**Gate**: quick

---

### T3: Implement Riot platform and regional routing module

**What**: Define the 15 Riot platforms (`BR1` default) and map each platform to its regional routing (`americas`, `europe`, `asia`, `sea`).
**Where**: `src/server/riot/routing.ts`
**Depends on**: T2
**Reuses**: None
**Requirement**: SRCH-02

**Done when**:

- [x] Exports `PLATFORMS`, `DEFAULT_PLATFORM = 'BR1'`, `isPlatform`, and `regionalOf`
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 5+ tests pass

**Tests**: unit
**Gate**: quick

---

### T4: Implement Riot ID parser, normalizer and URL slug converter

**What**: Validate `gameName#tagLine` (1 `#`, name 3-16 chars, tag 3-5 chars), case-insensitive normalization, and URL-safe `gameName-tagLine` slug encoding/decoding.
**Where**: `src/server/riot/riot-id.ts`
**Depends on**: T3
**Reuses**: None
**Requirement**: SRCH-01, SRCH-03, SRCH-06

**Done when**:

- [x] `parseRiotId`, `normalizeRiotId`, `toSummonerSlug`, `fromSummonerSlug` handle spaces, accents and invalid inputs
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 10+ tests pass

**Tests**: unit
**Gate**: quick

---

### T5: Implement Redis sliding-window Riot API rate limiter

**What**: Enforce 20 req/1 s and 100 req/120 s per routing value with queuing and `Retry-After` pause support.
**Where**: `src/server/riot/rate-limiter.ts`
**Depends on**: T4
**Reuses**: None
**Requirement**: RIOT-01, RIOT-02

**Done when**:

- [x] `acquire(routing)` queues calls beyond 20/1s or 100/120s and `pause(routing, ms)` blocks subsequent calls
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 13+ tests pass

**Tests**: unit
**Gate**: quick

---

### T6: Implement Riot API HTTP client with retries, timeouts and structured logging

**What**: Implement `RiotClient` reading `RIOT_API_KEY` from env, calling Riot endpoints via `RateLimiter`, handling 429 (`Retry-After` up to 3x), 5xx/10s timeout (2 exponential retries), 401/403 (no retry + log error), and logging route, routing, status and latency ms.
**Where**: `src/server/riot/client.ts`
**Depends on**: T5
**Reuses**: `src/server/riot/rate-limiter.ts`
**Requirement**: RIOT-02, RIOT-03, RIOT-04, RIOT-05, RIOT-06

**Done when**:

- [x] `RiotClient` implements account-v1, summoner-v4, league-v4 `by-puuid`, and match-v5 methods with typed errors and structured logs
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 20+ tests pass

**Tests**: unit
**Gate**: quick

---

### T7: Implement Data Dragon version cache and asset URL builders

**What**: Fetch latest Data Dragon version with 24 h cache and build URLs for profile icons, champions, items, summoner spells and runes (returning `null` for unknown IDs).
**Where**: `src/server/riot/ddragon.ts`
**Depends on**: T6
**Reuses**: None
**Requirement**: RIOT-08

**Done when**:

- [x] Caches Data Dragon version for 24 h and returns CDN URLs or `null` for missing IDs
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 24+ tests pass

**Tests**: unit
**Gate**: quick

---

### T8: Implement pure stats calculators and queue tab filters

**What**: Implement `kdaRatio` (`"perfect"` when deaths=0), `killParticipation`, `csPerMin`, `winrate`, `isRemake`, queue tab mapping (`all`, `solo`, `flex`, `normal`, `aram`), and seasonal champion stats aggregation/sorting.
**Where**: `src/server/stats/calculators.ts`
**Depends on**: T7
**Reuses**: None
**Requirement**: PROF-02, HIST-02, HIST-03, HIST-08, HIST-09, HIST-10, CHMP-01, CHMP-02, CHMP-03, CHMP-04, CHMP-05, CHMP-06, CHMP-07, CHMP-08

**Done when**:

- [x] All formulas, remake exclusion, `SEASON_START` filter, sorting by games desc then winrate desc, and top-7 slicing work accurately
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 35+ tests pass

**Tests**: unit
**Gate**: quick

---

### T9: Implement Summoner and Match repository store

**What**: Implement persistence repository for upserting summoners, league entries, matches (deduped by `matchId`), querying match history by queue tab/cursor, and querying seasonal ranked matches for champion stats.
**Where**: `src/server/db/repository.ts`
**Depends on**: None (Phase 1 complete)
**Reuses**: `prisma/schema.prisma`, `src/server/stats/calculators.ts`
**Requirement**: SRCH-05, RIOT-07, MATCH-08

**Done when**:

- [x] Repository persists summoners, league entries and matches idempotently by `matchId` (with Prisma and in-memory adapter for fast deterministic tests)
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 40+ tests pass

**Tests**: integration
**Gate**: full

---

### T10: Implement refresh cooldown and per-IP rate-limit guards

**What**: Enforce 120 s per-player refresh cooldown and 10 req/min per-IP refresh limit.
**Where**: `src/server/sync/guards.ts`
**Depends on**: T9
**Reuses**: None
**Requirement**: REFR-03, REFR-04, REFR-05

**Done when**:

- [x] Rejects refresh during 120 s cooldown or >10 requests/min from same IP with HTTP 429 metadata (`retryAfterSeconds`)
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 45+ tests pass

**Tests**: unit
**Gate**: quick

---

### T11: Implement SyncService for initial lookup, refresh and loadMore

**What**: Implement `lookup`, `refresh` (up to 100 new matches, Riot ID rename detection, preserves saved data on failure) and `loadMore` (20 matches per page, skips 404 matches, computes `hasMore`).
**Where**: `src/server/sync/sync-service.ts`
**Depends on**: T10
**Reuses**: `src/server/riot/client.ts`, `src/server/db/repository.ts`
**Requirement**: SRCH-04, SRCH-07, SRCH-08, REFR-01, REFR-08, REFR-09, HIST-01, HIST-04, HIST-05

**Done when**:

- [x] `lookup`, `refresh` and `loadMore` satisfy all Riot sync and error recovery rules
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 53+ tests pass

**Tests**: integration
**Gate**: full

---

### T12: Implement portable SyncDispatcher (Vercel inline + Render/BullMQ worker) with deduplication

**What**: Deduplicate concurrent sync requests for the same player (`REFR-06`) and support both `inline` execution (Vercel serverless) and `worker` queue mode (Render/Docker).
**Where**: `src/server/sync/dispatcher.ts`
**Depends on**: T11
**Reuses**: `src/server/sync/sync-service.ts`
**Requirement**: REFR-06, SRCH-10

**Done when**:

- [x] Concurrent calls for the same player share a single `RiotClient` execution and return the same result/job state
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 57+ tests pass

**Tests**: unit
**Gate**: quick

---

### T13: Implement Summoner lookup and Profile data API route

**What**: Create `/api/summoners/[platform]/[slug]` route that serves saved profile data from DB without calling Riot (`SRCH-05`), or triggers initial lookup with 30 s timeout handling (`SRCH-04`, `SRCH-10`).
**Where**: `src/app/api/summoners/[platform]/[slug]/route.ts`
**Depends on**: T12
**Reuses**: `src/server/sync/dispatcher.ts`, `src/server/db/repository.ts`
**Requirement**: SRCH-04, SRCH-05, SRCH-07, SRCH-08, SRCH-10

**Done when**:

- [x] Returns saved profile with 0 Riot calls, or runs initial lookup returning profile / 404 / 504 on 30 s timeout
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 62+ tests pass

**Tests**: integration
**Gate**: full

---

### T14: Implement Summoner refresh API route

**What**: Create `POST /api/summoners/[platform]/[puuid]/refresh` enforcing cooldown & IP guards, deduplicating concurrent refreshes, and returning updated profile data or friendly error while keeping saved data.
**Where**: `src/app/api/summoners/[platform]/[puuid]/refresh/route.ts`
**Depends on**: T13
**Reuses**: `src/server/sync/guards.ts`, `src/server/sync/dispatcher.ts`
**Requirement**: REFR-01, REFR-04, REFR-05, REFR-06, REFR-07, REFR-08, REFR-09

**Done when**:

- [x] Returns 429 on cooldown or IP limit, 503 with preserved data on Riot failure, and 200 with updated profile and new slug on Riot ID change
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 67+ tests pass

**Tests**: integration
**Gate**: full

---

### T15: Implement Match history pagination API route

**What**: Create `GET /api/summoners/[platform]/[puuid]/matches` filtering by queue tab (`all`, `solo`, `flex`, `normal`, `aram`) and loading 20 more matches on demand.
**Where**: `src/app/api/summoners/[platform]/[puuid]/matches/route.ts`
**Depends on**: T14
**Reuses**: `src/server/sync/sync-service.ts`, `src/server/db/repository.ts`
**Requirement**: HIST-01, HIST-03, HIST-04, HIST-05

**Done when**:

- [x] Returns 20 matches for the selected tab and `hasMore` flag
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 70+ tests pass

**Tests**: integration
**Gate**: full

---

### T16: Create Header, Footer and SearchBar components

**What**: Build the LMI Stats header, Riot legal footer, and `SearchBar` with region selector (`BR1` default + all 15 platforms) and inline Riot ID validation (`Nome#TAG`).
**Where**: `src/components/SearchBar.tsx`
**Depends on**: None (Phase 2 complete)
**Reuses**: `src/server/riot/routing.ts`, `src/server/riot/riot-id.ts`, `src/i18n/index.ts`
**Requirement**: SRCH-01, SRCH-02, SRCH-03, BRAND-01, LEGAL-01

**Done when**:

- [x] `SearchBar` defaults to BR1, lists all 15 platforms, blocks invalid Riot IDs with `"Digite o Riot ID no formato Nome#TAG"`, and navigates to `/{platform}/summoner/{gameName}-{tagLine}` on valid submit
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 75+ tests pass

**Tests**: unit
**Gate**: quick

---

### T17: Create ProfileHeader, RefreshButton and RankedCards components

**What**: Build `ProfileHeader` (icon, level, Riot ID, region, relative last-updated time, `RefreshButton` with updating state and live cooldown countdown) and `RankedCards` (Solo/Duo and Flex tier, division, LP, wins, losses, rounded winrate, or `"Unranked"`).
**Where**: `src/components/ProfileHeader.tsx`
**Depends on**: T16
**Reuses**: `src/i18n/index.ts`, `src/server/stats/calculators.ts`
**Requirement**: PROF-01, PROF-02, PROF-03, PROF-04, REFR-02, REFR-03, REFR-07, REFR-08

**Done when**:

- [x] Renders profile identity, relative timestamp, Solo/Flex cards (`Unranked` when absent), and refresh button states (idle, `"Atualizando..."`, cooldown seconds, error alert)
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 81+ tests pass

**Tests**: unit
**Gate**: quick

---

### T18: Create ChampionStatsPanel component

**What**: Build `ChampionStatsPanel` with `"Ranqueada Solo/Duo"` (default) and `"Ranqueada Flex"` tabs, top 7 champions + `"Ver todos"` expansion, `"Baseado em N partidas salvas"`, and empty state `"Sem partidas ranqueadas nesta temporada"`.
**Where**: `src/components/ChampionStatsPanel.tsx`
**Depends on**: T17
**Reuses**: `src/server/stats/calculators.ts`, `src/i18n/index.ts`
**Requirement**: CHMP-01, CHMP-03, CHMP-06, CHMP-07, CHMP-08

**Done when**:

- [x] Displays seasonal champion stats, switches Solo/Flex tabs, expands beyond 7 champions on `"Ver todos"`, and shows empty message when 0 matches
- [x] Gate check passes: `pnpm vitest run --reporter=verbose`
- [x] Test count: 86+ tests pass

**Tests**: unit
**Gate**: quick

---

### T19: Create MatchDetail inline component

**What**: Build `MatchDetail` showing both teams' objectives (result, kills, towers, dragons, barons) and all 10 players (champion, level, clickable Riot ID link in same region, spells, runes, K/D/A, KDA ratio, damage bar proportional to max match damage, gold, CS, vision score, 7 items, owner row highlighted) from already loaded match data without calling Riot API.
**Where**: `src/components/MatchDetail.tsx`
**Depends on**: T18
**Reuses**: `src/server/stats/calculators.ts`, `src/i18n/index.ts`
**Requirement**: MATCH-03, MATCH-04, MATCH-05, MATCH-06, MATCH-07, MATCH-08

**Done when**:

- [ ] Renders 2 team summaries and 10 player rows with proportional damage bars, highlighted owner row, and profile links
- [ ] Gate check passes: `pnpm vitest run --reporter=verbose`
- [ ] Test count: 91+ tests pass

**Tests**: unit
**Gate**: quick

---

### T20: Create MatchHistory component with queue tabs, inline expand and Load More

**What**: Build `MatchHistory` with 5 queue tabs (`Todas` default), match summary cards (`HIST-07`, `"Perfeito"` KDA when 0 deaths, `"Remake"` badge), click to expand/collapse `MatchDetail` inline (`MATCH-01`, `MATCH-02`), `"Mostrar mais"` pagination (`HIST-04`, `HIST-05`), and `"Nenhuma partida encontrada"` empty state (`HIST-06`).
**Where**: `src/components/MatchHistory.tsx`
**Depends on**: T19
**Reuses**: `src/components/MatchDetail.tsx`, `src/server/stats/calculators.ts`
**Requirement**: HIST-01, HIST-02, HIST-03, HIST-04, HIST-05, HIST-06, HIST-07, HIST-08, HIST-09, HIST-10, MATCH-01, MATCH-02

**Done when**:

- [ ] Switches tabs, toggles inline `MatchDetail`, loads 20 more matches, hides `"Mostrar mais"` when exhausted, and shows `"Nenhuma partida encontrada"` when empty
- [ ] Gate check passes: `pnpm vitest run --reporter=verbose`
- [ ] Test count: 98+ tests pass

**Tests**: unit
**Gate**: quick

---

### T21: Create Home page and Summoner Profile page (skeleton, not-found, responsive layout)

**What**: Assemble `/` (home with `SearchBar` and footer) and `/[platform]/summoner/[slug]` (loading skeleton `SRCH-09`, not-found states `SRCH-07`/`SRCH-08`, timeout state `SRCH-10`, responsive two-column layout `RESP-01` without horizontal page overflow from 375 px to 1920 px).
**Where**: `src/app/[platform]/summoner/[slug]/page.tsx`
**Depends on**: T20
**Reuses**: `src/components/SearchBar.tsx`, `src/components/ProfileHeader.tsx`, `src/components/ChampionStatsPanel.tsx`, `src/components/MatchHistory.tsx`
**Requirement**: SRCH-07, SRCH-08, SRCH-09, SRCH-10, RESP-01

**Done when**:

- [ ] Home and Summoner Profile pages render all states and responsive classes (`overflow-x-hidden`, responsive grid)
- [ ] Gate check passes: `pnpm vitest run --reporter=verbose`
- [ ] Test count: 103+ tests pass

**Tests**: unit
**Gate**: quick

---

### T22: Add standalone worker entry point and Vercel/Render deployment configs

**What**: Add `src/worker/index.ts` for dedicated worker deployments plus `vercel.json` and `render.yaml` Blueprint so the repository deploys out-of-the-box on both Vercel and Render.
**Where**: `render.yaml`
**Depends on**: T21
**Reuses**: `src/server/sync/dispatcher.ts`
**Requirement**: RIOT-01

**Done when**:

- [ ] `src/worker/index.ts`, `vercel.json` and `render.yaml` created
- [ ] Gate check passes: `pnpm typecheck; pnpm lint; pnpm build`

**Tests**: none
**Gate**: build

---

## Checks

**C1** - Submitting `Nome#TAG` navigates to `/{platform}/summoner/{gameName}-{tagLine}` for the selected platform (SRCH-01, AC 1)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > SearchBar and navigation > SRCH-01 navigates to /{platform}/summoner/{gameName}-{tagLine}

**C2** - Region selector defaults to `BR1` and lists all 15 Riot platforms (SRCH-02, AC 2)
Proof: run unit | ✓ tests/unit/routing-and-riotid.test.ts > Routing > SRCH-02 defaults to BR1 and lists all 15 Riot platforms

**C3** - Invalid Riot ID format displays `"Digite o Riot ID no formato Nome#TAG"` without calling the Riot API (SRCH-03, AC 3)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > SearchBar and navigation > SRCH-03 shows validation message without calling Riot API

**C4** - Opening an unsaved player URL fetches account, summoner, leagues and 20 matches from Riot API, saves to DB and displays the profile (SRCH-04, AC 4)
Proof: run unit | ✓ tests/integration/sync-and-routes.test.ts > Lookup and Sync > SRCH-04 fetches account, summoner, leagues and 20 matches and saves to DB

**C5** - Opening an already saved player URL serves profile from DB with zero Riot API calls (SRCH-05, AC 5)
Proof: run unit | ✓ tests/integration/sync-and-routes.test.ts > Lookup and Sync > SRCH-05 serves saved player from DB with zero Riot API calls

**C6** - Riot ID lookup matches `gameName` and `tagLine` case-insensitively (SRCH-06, AC 6)
Proof: run unit | ✓ tests/unit/routing-and-riotid.test.ts > RiotId > SRCH-06 matches gameName and tagLine case-insensitively

**C7** - Riot API 404 on account lookup displays `"Jogador não encontrado"` with the searched Riot ID and region (SRCH-07, AC 7)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > Profile states > SRCH-07 displays Jogador não encontrado with Riot ID and region

**C8** - Account without a summoner in the selected region displays `"Jogador não encontrado nesta região"` (SRCH-08, AC 8)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > Profile states > SRCH-08 displays Jogador não encontrado nesta região

**C9** - While the initial lookup is in progress, the page displays the profile loading skeleton (SRCH-09, AC 9)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > Profile states > SRCH-09 displays loading skeleton while lookup is in progress

**C10** - Initial lookup exceeding 30 s displays `"Muitas buscas no momento. Tente novamente em instantes."` (SRCH-10, AC 10)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > Profile states > SRCH-10 displays timeout message when lookup exceeds 30s

**C11** - Profile header displays summoner icon, level, Riot ID (`Nome#TAG`) and region (PROF-01, AC 1)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > ProfileHeader and RankedCards > PROF-01 displays icon, level, Riot ID and region

**C12** - Ranked cards display Solo/Duo and Flex tier, division, LP, wins, losses and rounded integer winrate % (PROF-02, AC 2)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > ProfileHeader and RankedCards > PROF-02 displays Solo/Duo and Flex tier, division, LP, wins, losses and rounded winrate

**C13** - Queue without rank displays `"Unranked"` (PROF-03, AC 3)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > ProfileHeader and RankedCards > PROF-03 displays Unranked when queue has no rank

**C14** - Profile displays relative time since last update such as `"Atualizado há 5 minutos"` (PROF-04, AC 4)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > ProfileHeader and RankedCards > PROF-04 displays relative time since last update

**C15** - Clicking `"Atualizar"` outside cooldown fetches profile, leagues and up to 100 new matches since the last saved match and saves to DB (REFR-01, AC 1)
Proof: run unit | ✓ tests/integration/sync-and-routes.test.ts > Refresh and Guards > REFR-01 fetches profile, leagues and up to 100 new matches since last saved

**C16** - While refresh is running, the button is disabled and displays `"Atualizando..."` (REFR-02, AC 2)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > RefreshButton > REFR-02 disables button and shows Atualizando... while refreshing

**C17** - During the 2-minute cooldown, the refresh button is disabled and displays remaining seconds (REFR-03, AC 3)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > RefreshButton > REFR-03 disables button and shows remaining cooldown seconds

**C18** - Server rejects a refresh request during the 120 s cooldown with HTTP 429 and zero Riot API calls (REFR-04, AC 4)
Proof: run unit | ✓ tests/integration/sync-and-routes.test.ts > Refresh and Guards > REFR-04 returns HTTP 429 during cooldown without calling Riot API

**C19** - Server rejects more than 10 refresh requests per minute from the same IP with HTTP 429 and zero Riot API calls (REFR-05, AC 5)
Proof: run unit | ✓ tests/integration/sync-and-routes.test.ts > Refresh and Guards > REFR-05 returns HTTP 429 when IP exceeds 10 refreshes per minute

**C20** - Concurrent refresh requests for the same player execute a single Riot API fetch and return the same result to both callers (REFR-06, AC 6)
Proof: run unit | ✓ tests/integration/sync-and-routes.test.ts > Refresh and Guards > REFR-06 deduplicates concurrent refreshes for the same player

**C21** - When refresh finishes, the page updates profile, match history and champion stats without a full page reload (REFR-07, AC 7)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > RefreshButton > REFR-07 updates profile, history and stats in place when refresh finishes

**C22** - If Riot API fails during refresh, saved data is preserved and `"Não foi possível atualizar agora. Tente novamente em instantes."` is shown (REFR-08, AC 8)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > RefreshButton > REFR-08 preserves saved data and shows error message when refresh fails

**C23** - When refresh detects a new Riot ID for the same PUUID, it updates the stored Riot ID and navigates to the new URL slug (REFR-09, AC 9)
Proof: run unit | ✓ tests/integration/sync-and-routes.test.ts > Refresh and Guards > REFR-09 updates stored Riot ID and returns new slug when player renamed

**C24** - Match history lists the 20 most recent saved matches for the selected tab ordered newest to oldest (HIST-01, AC 1)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchHistory > HIST-01 lists 20 most recent matches ordered newest to oldest

**C25** - Match history offers tabs `"Todas"`, `"Ranqueada Solo/Duo"`, `"Ranqueada Flex"`, `"Normal"` and `"ARAM"`, with `"Todas"` selected by default (HIST-02, AC 2)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchHistory > HIST-02 renders all 5 queue tabs with Todas selected by default

**C26** - Selecting a queue tab filters matches to that tab's queues (Solo 420, Flex 440, Normal 400/430/480/490, ARAM 450) (HIST-03, AC 3)
Proof: run unit | ✓ tests/unit/stats-and-tabs.test.ts > Queue Tabs > HIST-03 filters matches by queue IDs for each tab

**C27** - Clicking `"Mostrar mais"` appends the next 20 matches for the active tab, fetching missing matches from the Riot API (HIST-04, AC 4)
Proof: run unit | ✓ tests/integration/sync-and-routes.test.ts > Match Pagination > HIST-04 loads next 20 matches and fetches missing ones from Riot API

**C28** - When the Riot API returns fewer matches than requested, `"Mostrar mais"` is hidden for that tab (HIST-05, AC 5)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchHistory > HIST-05 hides Mostrar mais when no more matches exist

**C29** - When the active tab has no matches, `"Nenhuma partida encontrada"` is displayed (HIST-06, AC 6)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchHistory > HIST-06 shows Nenhuma partida encontrada when tab is empty

**C30** - Each match card displays champion, level, result, queue name, relative end time, mm:ss duration, K/D/A, 2-decimal KDA ratio, CS, 1-decimal CS/min, kill participation %, 2 spells, keystone rune, secondary tree and 7 item slots (HIST-07, AC 7)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchHistory > HIST-07 displays all required match summary fields and 7 item slots

**C31** - KDA ratio is computed as `(kills + assists) / deaths` and kill participation as `(kills + assists) / teamKills` (HIST-08, AC 8)
Proof: run unit | ✓ tests/unit/stats-and-tabs.test.ts > Calculators > HIST-08 computes kdaRatio and killParticipation accurately

**C32** - When deaths equal 0, `"Perfeito"` is displayed instead of a numeric KDA ratio (HIST-09, AC 9)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchHistory > HIST-09 displays Perfeito when player has 0 deaths

**C33** - Remake matches display `"Remake"` with neutral styling (HIST-10, AC 10)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchHistory > HIST-10 displays Remake with neutral badge when earlySurrender is true

**C34** - Clicking a match row expands the inline detail with both teams below it (MATCH-01, AC 1)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchDetail > MATCH-01 expands inline detail with both teams on click

**C35** - Clicking an expanded match row collapses the inline detail (MATCH-02, AC 2)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchDetail > MATCH-02 collapses inline detail when clicked again

**C36** - Expanded match detail shows all 10 players with champion, level, Riot ID, spells, keystone, secondary tree, K/D/A, KDA ratio, damage to champions, gold, CS, vision score and 7 items (MATCH-03, AC 3)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchDetail > MATCH-03 renders all 10 players with full stats and 7 items

**C37** - Each player's damage to champions is rendered with a bar proportional to the highest damage in the match (MATCH-04, AC 4)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchDetail > MATCH-04 renders damage bar proportional to max damage in match

**C38** - Each team header in match detail displays result, total kills, towers, dragons and barons (MATCH-05, AC 5)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchDetail > MATCH-05 displays team result, kills, towers, dragons and barons

**C39** - The profile owner's row is visually highlighted in the match detail table (MATCH-06, AC 6)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchDetail > MATCH-06 highlights the profile owner row

**C40** - Clicking another player's Riot ID in match detail links to that player's profile in the same region (MATCH-07, AC 7)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchDetail > MATCH-07 links each participant Riot ID to their profile in the same region

**C41** - Opening match detail uses already saved match data without triggering any Riot API request (MATCH-08, AC 8)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > MatchDetail > MATCH-08 opens match detail using saved data with zero network calls

**C42** - Champion stats list games, wins, losses, winrate %, average kills/deaths/assists, KDA ratio and average CS/min per champion (CHMP-01, AC 1)
Proof: run unit | ✓ tests/unit/stats-and-tabs.test.ts > ChampionStats > CHMP-01 aggregates games, wins, losses, winrate, avg K/D/A, KDA ratio and CS/min

**C43** - Champion stats include only saved matches from the selected ranked queue started on or after `SEASON_START` (CHMP-02, AC 2)
Proof: run unit | ✓ tests/unit/stats-and-tabs.test.ts > ChampionStats > CHMP-02 filters by selected ranked queue and SEASON_START

**C44** - Champion stats panel offers `"Ranqueada Solo/Duo"` and `"Ranqueada Flex"` tabs with `"Ranqueada Solo/Duo"` selected by default (CHMP-03, AC 3)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > ChampionStatsPanel > CHMP-03 offers Solo/Duo and Flex tabs with Solo/Duo selected by default

**C45** - Champions are ordered by games played descending, breaking ties by winrate descending (CHMP-04, AC 4)
Proof: run unit | ✓ tests/unit/stats-and-tabs.test.ts > ChampionStats > CHMP-04 orders champions by games desc then winrate desc

**C46** - Remake matches are excluded from champion stats calculations (CHMP-05, AC 5)
Proof: run unit | ✓ tests/unit/stats-and-tabs.test.ts > ChampionStats > CHMP-05 excludes remake matches from champion stats

**C47** - When more than 7 champions exist, the panel shows the first 7 and a `"Ver todos"` button that expands the full list (CHMP-06, AC 6)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > ChampionStatsPanel > CHMP-06 shows top 7 champions and expands all on Ver todos

**C48** - Champion stats panel displays `"Baseado em N partidas salvas"` with the total matches counted (CHMP-07, AC 7)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > ChampionStatsPanel > CHMP-07 displays Baseado em N partidas salvas

**C49** - When no ranked matches exist in the season for the selected queue, `"Sem partidas ranqueadas nesta temporada"` is displayed (CHMP-08, AC 8)
Proof: run unit | ✓ tests/ui/history-and-stats.test.tsx > ChampionStatsPanel > CHMP-08 displays Sem partidas ranqueadas nesta temporada when empty

**C50** - Riot rate limiter enforces 20 req/1 s and 100 req/2 min per routing value and queues excess calls (RIOT-01, AC 1)
Proof: run unit | ✓ tests/unit/riot-client.test.ts > RateLimiter and RiotClient > RIOT-01 enforces 20 req/1s and 100 req/2min per routing and queues excess

**C51** - On HTTP 429 from Riot API, the client waits `Retry-After` seconds and retries up to 3 attempts (RIOT-02, AC 2)
Proof: run unit | ✓ tests/unit/riot-client.test.ts > RateLimiter and RiotClient > RIOT-02 waits Retry-After on 429 and retries up to 3 times

**C52** - On HTTP 5xx or 10 s timeout from Riot API, the client retries up to 2 times with exponential backoff and then throws `RiotUnavailableError` (RIOT-03, AC 3)
Proof: run unit | ✓ tests/unit/riot-client.test.ts > RateLimiter and RiotClient > RIOT-03 retries 5xx or timeout twice with exponential backoff then fails

**C53** - On HTTP 401 or 403 from Riot API, the client fails immediately without retry and logs `"Riot API key inválida ou expirada"` (RIOT-04, AC 4)
Proof: run unit | ✓ tests/unit/riot-client.test.ts > RateLimiter and RiotClient > RIOT-04 fails without retry on 401/403 and logs Riot API key inválida ou expirada

**C54** - `RIOT_API_KEY` is read exclusively on the server and never exposed in client-side bundles or responses (RIOT-05, AC 5)
Proof: run unit | ✓ tests/unit/riot-client.test.ts > RateLimiter and RiotClient > RIOT-05 reads RIOT_API_KEY from server env and never exposes it

**C55** - Every Riot API call logs route template, routing value, HTTP status and latency in ms (RIOT-06, AC 6)
Proof: run unit | ✓ tests/unit/riot-client.test.ts > RateLimiter and RiotClient > RIOT-06 logs route, routing, status and latencyMs on every call

**C56** - Saving the same `matchId` across multiple players stores a single match record without duplication (RIOT-07, AC 7)
Proof: run unit | ✓ tests/integration/sync-and-routes.test.ts > Repository > RIOT-07 stores each matchId only once across multiple profiles

**C57** - Data Dragon helper fetches the latest version, caches it for 24 h, and builds icon/champion/item/spell/rune URLs with graceful `null` fallback for unknown IDs (RIOT-08, AC 8)
Proof: run unit | ✓ tests/unit/riot-client.test.ts > DataDragon > RIOT-08 caches version for 24h and builds asset URLs with fallback

**C58** - All UI strings are resolved from the pt-BR i18n catalog (I18N-01, AC 1)
Proof: run unit | ✓ tests/unit/routing-and-riotid.test.ts > i18n > I18N-01 resolves all UI copy from pt-BR catalog

**C59** - Footer on every page renders the exact Riot legal disclaimer with `"LMI Stats"` (LEGAL-01, AC 2)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > Branding and Legal > LEGAL-01 renders exact Riot legal disclaimer in footer

**C60** - Page titles and header display `"LMI Stats"` as the platform brand (BRAND-01, AC 3)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > Branding and Legal > BRAND-01 displays LMI Stats in header and title

**C61** - Pages and profile layouts render with responsive classes and `overflow-x-hidden` so there is no horizontal page overflow from 375 px to 1920 px (RESP-01, AC 4)
Proof: run unit | ✓ tests/ui/search-and-profile.test.tsx > Branding and Legal > RESP-01 applies responsive layout without horizontal page overflow

---

## Handoff

**Settled mid-build:** none
**Dispatched:** Batch 1 (Phase 1: T1-T8) returned at dc9fb1f; Batch 2 (Phase 2: T9-T15) returned at d801b18; Batch 3 (Phase 3: T16-T22) at d801b18
**Walked:** none
