# summoner-profile verification

**Verdict**: PASS
**Proofs**: `proofs.md` at feaba55
**Verifier**: independent sub-agent (author != verifier)

## Checks

| Check | Test | Holds |
| --- | --- | --- |
| C1 | `tests/ui/search-and-profile.test.tsx` `SRCH-01 navigates to /{platform}/summoner/{gameName}-{tagLine}` | yes |
| C2 | `tests/unit/routing-and-riotid.test.ts` `SRCH-02 defaults to BR1 and lists all 15 Riot platforms` | yes |
| C3 | `tests/ui/search-and-profile.test.tsx` `SRCH-03 shows validation message without calling Riot API` | yes |
| C4 | `tests/integration/sync-and-routes.test.ts` `SRCH-04 fetches account, summoner, leagues and 20 matches and saves to DB` | yes |
| C5 | `tests/integration/sync-and-routes.test.ts` `SRCH-05 serves saved player from DB with zero Riot API calls` | yes |
| C6 | `tests/unit/routing-and-riotid.test.ts` `SRCH-06 matches gameName and tagLine case-insensitively` | yes |
| C7 | `tests/ui/search-and-profile.test.tsx` `SRCH-07 displays Jogador não encontrado with Riot ID and region` | yes |
| C8 | `tests/ui/search-and-profile.test.tsx` `SRCH-08 displays Jogador não encontrado nesta região` | yes |
| C9 | `tests/ui/search-and-profile.test.tsx` `SRCH-09 displays loading skeleton while lookup is in progress` | yes |
| C10 | `tests/ui/search-and-profile.test.tsx` `SRCH-10 displays timeout message when lookup exceeds 30s` | yes |
| C11 | `tests/ui/search-and-profile.test.tsx` `PROF-01 displays icon, level, Riot ID and region` | yes |
| C12 | `tests/ui/search-and-profile.test.tsx` `PROF-02 displays Solo/Duo and Flex tier, division, LP, wins, losses and rounded winrate` | yes |
| C13 | `tests/ui/search-and-profile.test.tsx` `PROF-03 displays Unranked when queue has no rank` | yes |
| C14 | `tests/ui/search-and-profile.test.tsx` `PROF-04 displays relative time since last update` | yes |
| C15 | `tests/integration/sync-and-routes.test.ts` `REFR-01 fetches profile, leagues and up to 100 new matches since last saved` | yes |
| C16 | `tests/ui/search-and-profile.test.tsx` `REFR-02 disables button and shows Atualizando... while refreshing` | yes |
| C17 | `tests/ui/search-and-profile.test.tsx` `REFR-03 disables button and shows remaining cooldown seconds` | yes |
| C18 | `tests/integration/sync-and-routes.test.ts` `REFR-04 returns HTTP 429 during cooldown without calling Riot API` | yes |
| C19 | `tests/integration/sync-and-routes.test.ts` `REFR-05 returns HTTP 429 when IP exceeds 10 refreshes per minute` | yes |
| C20 | `tests/integration/sync-and-routes.test.ts` `REFR-06 deduplicates concurrent refreshes for the same player` | yes |
| C21 | `tests/ui/search-and-profile.test.tsx` `REFR-07 updates profile, history and stats in place when refresh finishes` | yes |
| C22 | `tests/ui/search-and-profile.test.tsx` `REFR-08 preserves saved data and shows error message when refresh fails` | yes |
| C23 | `tests/integration/sync-and-routes.test.ts` `REFR-09 updates stored Riot ID and returns new slug when player renamed` | yes |
| C24 | `tests/ui/history-and-stats.test.tsx` `HIST-01 lists 20 most recent matches ordered newest to oldest` | yes |
| C25 | `tests/ui/history-and-stats.test.tsx` `HIST-02 renders all 5 queue tabs with Todas selected by default` | yes |
| C26 | `tests/unit/stats-and-tabs.test.ts` `HIST-03 filters matches by queue IDs for each tab` | yes |
| C27 | `tests/integration/sync-and-routes.test.ts` `HIST-04 loads next 20 matches and fetches missing ones from Riot API` | yes |
| C28 | `tests/ui/history-and-stats.test.tsx` `HIST-05 hides Mostrar mais when no more matches exist` | yes |
| C29 | `tests/ui/history-and-stats.test.tsx` `HIST-06 shows Nenhuma partida encontrada when tab is empty` | yes |
| C30 | `tests/ui/history-and-stats.test.tsx` `HIST-07 displays all required match summary fields and 7 item slots` | yes |
| C31 | `tests/unit/stats-and-tabs.test.ts` `HIST-08 computes kdaRatio and killParticipation accurately` | yes |
| C32 | `tests/ui/history-and-stats.test.tsx` `HIST-09 displays Perfeito when player has 0 deaths` | yes |
| C33 | `tests/ui/history-and-stats.test.tsx` `HIST-10 displays Remake with neutral badge when earlySurrender is true` | yes |
| C34 | `tests/ui/history-and-stats.test.tsx` `MATCH-01 expands inline detail with both teams on click` | yes |
| C35 | `tests/ui/history-and-stats.test.tsx` `MATCH-02 collapses inline detail when clicked again` | yes |
| C36 | `tests/ui/history-and-stats.test.tsx` `MATCH-03 renders all 10 players with full stats and 7 items` | yes |
| C37 | `tests/ui/history-and-stats.test.tsx` `MATCH-04 renders damage bar proportional to max damage in match` | yes |
| C38 | `tests/ui/history-and-stats.test.tsx` `MATCH-05 displays team result, kills, towers, dragons and barons` | yes |
| C39 | `tests/ui/history-and-stats.test.tsx` `MATCH-06 highlights the profile owner row` | yes |
| C40 | `tests/ui/history-and-stats.test.tsx` `MATCH-07 links each participant Riot ID to their profile in the same region` | yes |
| C41 | `tests/ui/history-and-stats.test.tsx` `MATCH-08 opens match detail using saved data with zero network calls` | yes |
| C42 | `tests/unit/stats-and-tabs.test.ts` `CHMP-01 aggregates games, wins, losses, winrate, avg K/D/A, KDA ratio and CS/min` | yes |
| C43 | `tests/unit/stats-and-tabs.test.ts` `CHMP-02 filters by selected ranked queue and SEASON_START` | yes |
| C44 | `tests/ui/history-and-stats.test.tsx` `CHMP-03 offers Solo/Duo and Flex tabs with Solo/Duo selected by default` | yes |
| C45 | `tests/unit/stats-and-tabs.test.ts` `CHMP-04 orders champions by games desc then winrate desc` | yes |
| C46 | `tests/unit/stats-and-tabs.test.ts` `CHMP-05 excludes remake matches from champion stats` | yes |
| C47 | `tests/ui/history-and-stats.test.tsx` `CHMP-06 shows top 7 champions and expands all on Ver todos` | yes |
| C48 | `tests/ui/history-and-stats.test.tsx` `CHMP-07 displays Baseado em N partidas salvas` | yes |
| C49 | `tests/ui/history-and-stats.test.tsx` `CHMP-08 displays Sem partidas ranqueadas nesta temporada when empty` | yes |
| C50 | `tests/unit/riot-client.test.ts` `RIOT-01 enforces 20 req/1s and 100 req/2min per routing and queues excess` | yes |
| C51 | `tests/unit/riot-client.test.ts` `RIOT-02 waits Retry-After on 429 and retries up to 3 times` | yes |
| C52 | `tests/unit/riot-client.test.ts` `RIOT-03 retries 5xx or timeout twice with exponential backoff then fails` | yes |
| C53 | `tests/unit/riot-client.test.ts` `RIOT-04 fails without retry on 401/403 and logs Riot API key inválida ou expirada` | yes |
| C54 | `tests/unit/riot-client.test.ts` `RIOT-05 reads RIOT_API_KEY from server env and never exposes it` | yes |
| C55 | `tests/unit/riot-client.test.ts` `RIOT-06 logs route, routing, status and latencyMs on every call` | yes |
| C56 | `tests/integration/sync-and-routes.test.ts` `RIOT-07 stores each matchId only once across multiple profiles` | yes |
| C57 | `tests/unit/riot-client.test.ts` `RIOT-08 caches version for 24h and builds asset URLs with fallback` | yes |
| C58 | `tests/unit/routing-and-riotid.test.ts` `I18N-01 resolves all UI copy from pt-BR catalog` | yes |
| C59 | `tests/ui/search-and-profile.test.tsx` `LEGAL-01 renders exact Riot legal disclaimer in footer` | yes |
| C60 | `tests/ui/search-and-profile.test.tsx` `BRAND-01 displays LMI Stats in header and title` | yes |
| C61 | `tests/ui/search-and-profile.test.tsx` `RESP-01 applies responsive layout without horizontal page overflow` | yes |

## Findings

None - Probed all 61 check assertions against spec criteria and Test Coverage Matrix layers, plus throwaway boundary tests on Riot ID length/slug limits (3..16 name, 3..5 tag, multi-hyphen gameName), SEASON_START inclusive boundary and 7-vs-8 champion slicing, and exact 120s cooldown / 60s IP sliding-window boundaries at HEAD.
