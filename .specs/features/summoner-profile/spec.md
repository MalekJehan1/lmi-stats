# summoner-profile Specification

**Approved**: 2026-11-02 - user: "aprovo"

## Problem Statement

Jogadores de League of Legends querem ver rapidamente o desempenho de qualquer jogador (o próprio, aliados e adversários): elo, partidas recentes, como foi cada partida e com quais campeões ele joga bem. Esta feature entrega a primeira fatia da plataforma (estilo op.gg / deeplol.gg) sobre a Riot API, para todas as regiões, rodando dentro dos limites de uma Development key.

## Goals

- [ ] Um Riot ID válido e existente abre o perfil completo (perfil, elos, 20 partidas, estatísticas) na primeira busca.
- [ ] Um perfil já salvo abre sem nenhuma chamada à Riot API.
- [ ] Nenhuma chamada à Riot API excede os limites da Development key (20 req/1 s, 100 req/2 min por região de roteamento).

## Out of Scope

| Feature | Reason |
| --- | --- |
| Tier list / builds de campeões (meta agregado) | Feature seguinte `champion-meta` (AD-006); exige coleta em massa e chave Production |
| Partida ao vivo (spectator) | Não escolhida para o MVP |
| Leaderboard / ranking Challenger, GM, Master | Não escolhida para o MVP |
| Maestria de campeão | Não escolhida para o MVP |
| Página própria por partida (URL compartilhável) | Usuário escolheu detalhe inline |
| Abas extras no detalhe (build order, gráfico de ouro, timeline) | MVP só tem visão geral; exige match timeline |
| Temporadas anteriores | Estatísticas cobrem só a temporada atual |
| Contas de usuário, login, favoritos, buscas recentes | Não pedido |
| Outros idiomas além de pt-BR | Estrutura i18n pronta, catálogos depois (AD-005) |
| TFT, Valorant, outros jogos | Usuário: "para lol por enquanto" |
| Deploy / hospedagem | Fora desta feature; exige autorização explícita |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Escopo do MVP | Busca, perfil, histórico, detalhe, stats por campeão; tier list em `champion-meta` | user: "Sim: primeiro 'summoner-profile' ... depois 'champion-meta'" | y |
| Regiões | Todas as plataformas, BR1 padrão | user: "Todas as regiões, com seletor (BR1 padrão)" | y |
| Atualização | Dados no banco + botão "Atualizar", cooldown 2 min | user: "Igual op.gg ..." / "2 minutos" | y |
| Paginação do histórico | 20 por vez + "Mostrar mais" (+20) | user: "20 partidas por vez, com botão 'Mostrar mais' (+20)" | y |
| Filtros do histórico | Todas / Ranqueada Solo/Duo / Ranqueada Flex / Normal / ARAM | user escolheu as abas | y |
| Fonte das stats por campeão | Partidas ranqueadas salvas da temporada atual, Solo e Flex separados | user escolheu | y |
| Detalhe da partida | Expande inline, visão geral dos 10 jogadores | user escolheu | y |
| Design | Sem captura vinculante; tema escuro inspirado em op.gg/deeplol | user: "pode seguir o estilo op.gg/deeplol (tema escuro) como inspiração" | y |
| Larguras de tela suportadas | Responsivo: desktop a partir de 1280 px e celular a partir de 375 px (RESP-01) | user: "pode desde que fique responsivo, por enquanto ta tranquilo" | y |
| Nome da plataforma (vai no título e no aviso legal da Riot) | "LMI Stats" | user: "pode ser LMI stats ou algo assim mas com a tag LMI" | y |
| Filas da aba "Normal" | 400 (Escolha alternada), 430 (Às cegas), 480 (Swiftplay), 490 (Quickplay) | Filas normais de Summoner's Rift ativas | n |
| Outras filas (Arena, URF, eventos) | Aparecem só na aba "Todas", com o nome da fila | Não há aba para elas | n |
| Início da temporada atual | Data configurável `SEASON_START`; a Riot API não expõe a temporada | Sem fonte oficial na API | n |
| Partidas buscadas no "Atualizar" | Até 100 partidas novas desde a última salva (1 chamada de lista + 1 por partida nova) | Limite de `count` do match-v5; cabe no rate limit em poucas atualizações | n |
| Lista de stats por campeão longa | Mostra os 7 primeiros e "Ver todos" expande a lista completa | Padrão op.gg; evita painel gigante | n |
| Retenção de dados | Partidas e perfis ficam salvos sem expiração | Partidas são imutáveis; perfil é sobrescrito no "Atualizar" | n |
| Limite por IP | Até 10 atualizações por minuto por IP (HTTP 429 acima disso) | Protege a chave contra abuso sem login | n |
| Imagens | Data Dragon, versão mais recente, versão em cache por 24 h | CDN oficial e gratuito da Riot | n |

**Open questions:** none - all resolved or logged above.

---

## User Stories

### P1: Buscar jogador por Riot ID ⭐ MVP

**User Story**: Como jogador, quero buscar qualquer jogador pelo Riot ID e região para abrir o perfil dele.

**Why P1**: Porta de entrada de toda a plataforma.

**Acceptance Criteria**:

1. WHEN o usuário submete "Nome#TAG" na busca THEN the system SHALL navegar para `/{platform}/summoner/{gameName}-{tagLine}` usando a região selecionada - SRCH-01
2. The system SHALL iniciar o seletor de região em BR1 e listar todas as plataformas da Riot (BR1, NA1, LA1, LA2, EUW1, EUN1, TR1, RU, ME1, KR, JP1, OC1, SG2, TW2, VN2) - SRCH-02
3. IF o texto não tem exatamente um "#", ou o nome tem menos de 3 ou mais de 16 caracteres, ou a tag tem menos de 3 ou mais de 5 caracteres THEN the system SHALL exibir "Digite o Riot ID no formato Nome#TAG" sem chamar a Riot API - SRCH-03
4. WHEN a URL de um jogador não salvo é aberta THEN the system SHALL buscar conta, invocador, elos e as 20 partidas mais recentes na Riot API, salvar no banco e exibir o perfil - SRCH-04
5. WHEN a URL de um jogador já salvo é aberta THEN the system SHALL exibir os dados do banco sem chamar a Riot API - SRCH-05
6. The system SHALL comparar nome e tag sem diferenciar maiúsculas de minúsculas - SRCH-06
7. IF a Riot API responde 404 para o Riot ID THEN the system SHALL exibir "Jogador não encontrado" com o Riot ID e a região buscados - SRCH-07
8. IF a conta existe mas não tem invocador na região selecionada THEN the system SHALL exibir "Jogador não encontrado nesta região" - SRCH-08
9. WHILE a primeira busca de um jogador está em andamento the system SHALL exibir o esqueleto de carregamento do perfil - SRCH-09
10. IF a primeira busca não termina em 30 s THEN the system SHALL exibir "Muitas buscas no momento. Tente novamente em instantes." - SRCH-10

**Independent Test**: Buscar um Riot ID existente em BR1 abre o perfil; buscar "abc" mostra o erro de formato; buscar um Riot ID inexistente mostra "Jogador não encontrado".

---

### P1: Perfil e elos ⭐ MVP

**User Story**: Como jogador, quero ver quem é o jogador e o elo dele em cada fila ranqueada.

**Why P1**: Informação mais consultada em sites de estatística.

**Acceptance Criteria**:

1. WHEN o perfil é exibido THEN the system SHALL mostrar ícone de invocador, nível, Riot ID (Nome#TAG) e região - PROF-01
2. WHEN o perfil é exibido THEN the system SHALL mostrar, separadamente para Ranqueada Solo/Duo e Ranqueada Flex, tier, divisão, PdL, vitórias, derrotas e taxa de vitória como percentual inteiro arredondado - PROF-02
3. IF o jogador não tem elo em uma fila THEN the system SHALL exibir "Unranked" naquela fila - PROF-03
4. The system SHALL exibir o tempo desde a última atualização em formato relativo, por exemplo "Atualizado há 5 minutos" - PROF-04

**Independent Test**: Abrir um jogador com elo só em Solo/Duo mostra o elo em Solo/Duo e "Unranked" em Flex.

---

### P1: Atualizar dados ⭐ MVP

**User Story**: Como jogador, quero atualizar os dados de um perfil para ver as partidas mais recentes.

**Why P1**: Com dados salvos no banco (AD-002), é o único caminho para dados novos.

**Acceptance Criteria**:

1. WHEN o usuário clica em "Atualizar" fora do cooldown THEN the system SHALL buscar perfil, elos e até 100 partidas novas desde a última salva na Riot API e salvar no banco - REFR-01
2. WHILE a atualização está em andamento the system SHALL desabilitar o botão e exibir "Atualizando..." - REFR-02
3. WHILE faltam segundos para o fim do cooldown de 2 minutos desde a última atualização the system SHALL desabilitar o botão e exibir os segundos restantes - REFR-03
4. IF o servidor recebe uma atualização durante o cooldown THEN the system SHALL responder HTTP 429 sem chamar a Riot API - REFR-04
5. IF um mesmo IP envia mais de 10 atualizações em 1 minuto THEN the system SHALL responder HTTP 429 sem chamar a Riot API - REFR-05
6. WHEN duas atualizações do mesmo jogador chegam ao mesmo tempo THEN the system SHALL fazer uma única busca na Riot API e devolver o mesmo resultado às duas - REFR-06
7. WHEN a atualização termina THEN the system SHALL exibir perfil, histórico e estatísticas novos sem recarregar a página - REFR-07
8. IF a Riot API falha durante a atualização THEN the system SHALL manter os dados salvos e exibir "Não foi possível atualizar agora. Tente novamente em instantes." - REFR-08
9. WHEN a atualização recebe um Riot ID diferente para o mesmo PUUID THEN the system SHALL salvar o novo Riot ID e trocar a URL para a do novo Riot ID - REFR-09

**Independent Test**: Clicar "Atualizar" traz uma partida jogada depois da última atualização; clicar de novo em menos de 2 minutos mostra o contador e não chama a Riot API.

---

### P1: Histórico de partidas ⭐ MVP

**User Story**: Como jogador, quero ver as partidas recentes do jogador, filtradas por fila.

**Why P1**: Núcleo da análise de desempenho.

**Acceptance Criteria**:

1. WHEN o perfil é exibido THEN the system SHALL listar as 20 partidas salvas mais recentes da aba selecionada, da mais nova para a mais antiga - HIST-01
2. The system SHALL oferecer as abas "Todas", "Ranqueada Solo/Duo", "Ranqueada Flex", "Normal" e "ARAM", com "Todas" selecionada ao abrir o perfil - HIST-02
3. WHEN o usuário seleciona uma aba THEN the system SHALL listar só partidas das filas da aba: Solo/Duo 420, Flex 440, Normal 400/430/480/490, ARAM 450 - HIST-03
4. WHEN o usuário clica em "Mostrar mais" THEN the system SHALL acrescentar as próximas 20 partidas da aba, buscando na Riot API as que não estão salvas - HIST-04
5. IF a Riot API devolve menos partidas que as pedidas THEN the system SHALL ocultar "Mostrar mais" naquela aba - HIST-05
6. IF a aba não tem partidas THEN the system SHALL exibir "Nenhuma partida encontrada" - HIST-06
7. The system SHALL exibir em cada partida: campeão, nível do campeão, resultado, nome da fila, tempo desde o fim, duração em mm:ss, K/D/A, razão KDA com 2 casas, CS, CS/min com 1 casa, participação em abates em %, 2 feitiços, runa principal, árvore secundária e os 7 espaços de item - HIST-07
8. The system SHALL calcular a razão KDA como (abates + assistências) / mortes e a participação em abates como (abates + assistências) / abates do time - HIST-08
9. IF o jogador não morreu na partida THEN the system SHALL exibir "Perfeito" no lugar da razão KDA - HIST-09
10. WHEN a partida terminou em remake THEN the system SHALL exibir "Remake" como resultado com cor neutra - HIST-10

**Independent Test**: Abrir um perfil, trocar para "ARAM" mostra só partidas da fila 450; "Mostrar mais" acrescenta 20 partidas.

---

### P1: Detalhe da partida ⭐ MVP

**User Story**: Como jogador, quero abrir uma partida do histórico e ver os 10 jogadores.

**Why P1**: Pedido no MVP; explica por que a partida foi ganha ou perdida.

**Acceptance Criteria**:

1. WHEN o usuário clica em uma partida do histórico THEN the system SHALL expandir abaixo dela o detalhe com os dois times - MATCH-01
2. WHEN o usuário clica em uma partida expandida THEN the system SHALL recolher o detalhe - MATCH-02
3. WHEN o detalhe é exibido THEN the system SHALL mostrar para cada um dos 10 jogadores: campeão, nível, Riot ID, feitiços, runa principal, árvore secundária, K/D/A, razão KDA, dano a campeões, ouro, CS, placar de visão e 7 itens - MATCH-03
4. WHEN o detalhe é exibido THEN the system SHALL mostrar o dano a campeões com uma barra proporcional ao maior dano da partida - MATCH-04
5. WHEN o detalhe é exibido THEN the system SHALL mostrar para cada time: resultado, total de abates, torres, dragões e barões - MATCH-05
6. The system SHALL destacar no detalhe a linha do dono do perfil - MATCH-06
7. WHEN o usuário clica no Riot ID de outro jogador do detalhe THEN the system SHALL abrir o perfil dele na mesma região - MATCH-07
8. The system SHALL montar o detalhe com os dados da partida já salvos, sem nova chamada à Riot API - MATCH-08

**Independent Test**: Clicar em uma partida mostra 10 jogadores com os dados acima; clicar em um Riot ID abre o perfil desse jogador.

---

### P1: Estatísticas por campeão ⭐ MVP

**User Story**: Como jogador, quero ver o desempenho do jogador com cada campeão na temporada ranqueada.

**Why P1**: Pedido no MVP; mostra os campeões principais do jogador.

**Acceptance Criteria**:

1. WHEN o perfil é exibido THEN the system SHALL listar por campeão: partidas, vitórias, derrotas, taxa de vitória, média de abates, mortes e assistências, razão KDA e CS/min médio - CHMP-01
2. The system SHALL calcular as estatísticas só com partidas salvas da fila selecionada iniciadas a partir de `SEASON_START` - CHMP-02
3. The system SHALL oferecer as abas "Ranqueada Solo/Duo" e "Ranqueada Flex", com "Ranqueada Solo/Duo" selecionada ao abrir o perfil - CHMP-03
4. The system SHALL ordenar os campeões por partidas, decrescente, e desempatar por taxa de vitória, decrescente - CHMP-04
5. The system SHALL excluir remakes das estatísticas - CHMP-05
6. WHEN a lista tem mais de 7 campeões THEN the system SHALL mostrar os 7 primeiros e o botão "Ver todos", que expande a lista completa - CHMP-06
7. The system SHALL exibir "Baseado em N partidas salvas" com o total de partidas usadas - CHMP-07
8. IF não há partidas ranqueadas salvas na temporada naquela fila THEN the system SHALL exibir "Sem partidas ranqueadas nesta temporada" - CHMP-08

**Independent Test**: Com 3 partidas Solo/Duo salvas de Ahri (2 vitórias) e 1 de Lux, a lista mostra Ahri 3 partidas 67% e Lux 1 partida.

---

### P1: Integração com a Riot API ⭐ MVP

**User Story**: Como operador da plataforma, quero que todas as chamadas à Riot API respeitem os limites e falhem de forma previsível.

**Why P1**: Exceder o limite bloqueia a chave e derruba a plataforma inteira.

**Acceptance Criteria**:

1. The system SHALL enviar toda chamada à Riot API por um único cliente que limita a 20 req/1 s e 100 req/2 min por valor de roteamento e enfileira o excedente - RIOT-01
2. IF a Riot API responde 429 THEN the system SHALL esperar o tempo do header `Retry-After` e repetir a chamada, até 3 tentativas - RIOT-02
3. IF a Riot API responde 5xx ou não responde em 10 s THEN the system SHALL repetir até 2 vezes com espera exponencial e então falhar com erro tipado - RIOT-03
4. IF a Riot API responde 401 ou 403 THEN the system SHALL falhar sem repetir e registrar "Riot API key inválida ou expirada" no log - RIOT-04
5. The system SHALL ler a chave da variável de ambiente `RIOT_API_KEY` e nunca enviá-la ao navegador - RIOT-05
6. The system SHALL registrar no log cada chamada à Riot API com rota, roteamento, status e latência em ms - RIOT-06
7. The system SHALL salvar cada partida uma única vez por matchId, mesmo que apareça em vários perfis - RIOT-07
8. The system SHALL carregar imagens de ícones, campeões, itens, feitiços e runas do Data Dragon na versão mais recente, guardando a versão em cache por 24 h - RIOT-08

**Independent Test**: Um teste com a Riot API simulada respondendo 429 com `Retry-After: 1` mostra uma espera de 1 s e a repetição; 25 chamadas seguidas saem em no mínimo 2 janelas de 1 s.

---

### P1: Idioma e aviso legal ⭐ MVP

**User Story**: Como operador, quero a interface em pt-BR pronta para outros idiomas e em conformidade com a política da Riot.

**Why P1**: AD-005 e exigência da Riot para apps com a API.

**Acceptance Criteria**:

1. The system SHALL obter todo texto da interface de um catálogo pt-BR por uma camada de i18n - I18N-01
2. The system SHALL exibir no rodapé de toda página o aviso legal da Riot: "LMI Stats isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc." - LEGAL-01
3. The system SHALL usar "LMI Stats" como nome da plataforma no título das páginas e no cabeçalho - BRAND-01
4. The system SHALL exibir todas as telas sem rolagem horizontal da página em larguras de 375 px a 1920 px - RESP-01

**Independent Test**: Nenhum texto visível está fixo no código dos componentes; o rodapé mostra o aviso em toda página; o perfil em 375 px não rola na horizontal.

---

## Edge Cases

- IF o Riot ID tem espaços ou caracteres acentuados THEN the system SHALL codificar o nome na URL e encontrá-lo normalmente (coberto por SRCH-01 e SRCH-06).
- IF uma partida da lista de IDs não existe mais na Riot API (404) THEN the system SHALL pular essa partida e continuar com as demais.
- IF o jogador tem menos de 20 partidas na história THEN the system SHALL mostrar as que existem e ocultar "Mostrar mais" (HIST-05).
- WHEN o Data Dragon ainda não tem a imagem de um item ou campeão novo THEN the system SHALL mostrar um espaço vazio no lugar da imagem.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| SRCH-01 | P1: Buscar jogador | Phase 1 (T4), Phase 3 (T16) | In Progress (T4 done) |
| SRCH-02 | P1: Buscar jogador | Phase 1 (T3), Phase 3 (T16) | In Progress (T3 done) |
| SRCH-03 | P1: Buscar jogador | Phase 1 (T4), Phase 3 (T16) | In Progress (T4 done) |
| SRCH-04 | P1: Buscar jogador | Phase 2 (T11, T13) | In Tasks |
| SRCH-05 | P1: Buscar jogador | Phase 2 (T9, T13) | In Tasks |
| SRCH-06 | P1: Buscar jogador | Phase 1 (T4) | Verified |
| SRCH-07 | P1: Buscar jogador | Phase 2 (T11, T13), Phase 3 (T21) | In Tasks |
| SRCH-08 | P1: Buscar jogador | Phase 2 (T11, T13), Phase 3 (T21) | In Tasks |
| SRCH-09 | P1: Buscar jogador | Phase 3 (T21) | In Tasks |
| SRCH-10 | P1: Buscar jogador | Phase 2 (T12, T13), Phase 3 (T21) | In Tasks |
| PROF-01 | P1: Perfil e elos | Phase 3 (T17) | In Tasks |
| PROF-02 | P1: Perfil e elos | Phase 1 (T8), Phase 3 (T17) | In Tasks |
| PROF-03 | P1: Perfil e elos | Phase 3 (T17) | In Tasks |
| PROF-04 | P1: Perfil e elos | Phase 3 (T17) | In Tasks |
| REFR-01 | P1: Atualizar dados | Phase 2 (T11, T14) | In Tasks |
| REFR-02 | P1: Atualizar dados | Phase 3 (T17) | In Tasks |
| REFR-03 | P1: Atualizar dados | Phase 2 (T10), Phase 3 (T17) | In Tasks |
| REFR-04 | P1: Atualizar dados | Phase 2 (T10, T14) | In Tasks |
| REFR-05 | P1: Atualizar dados | Phase 2 (T10, T14) | In Tasks |
| REFR-06 | P1: Atualizar dados | Phase 2 (T12, T14) | In Tasks |
| REFR-07 | P1: Atualizar dados | Phase 2 (T14), Phase 3 (T17) | In Tasks |
| REFR-08 | P1: Atualizar dados | Phase 2 (T11, T14), Phase 3 (T17) | In Tasks |
| REFR-09 | P1: Atualizar dados | Phase 2 (T11, T14) | In Tasks |
| HIST-01 | P1: Histórico | Phase 2 (T11, T15), Phase 3 (T20) | In Tasks |
| HIST-02 | P1: Histórico | Phase 1 (T8), Phase 3 (T20) | In Tasks |
| HIST-03 | P1: Histórico | Phase 1 (T8), Phase 2 (T15), Phase 3 (T20) | In Tasks |
| HIST-04 | P1: Histórico | Phase 2 (T11, T15), Phase 3 (T20) | In Tasks |
| HIST-05 | P1: Histórico | Phase 2 (T11, T15), Phase 3 (T20) | In Tasks |
| HIST-06 | P1: Histórico | Phase 3 (T20) | In Tasks |
| HIST-07 | P1: Histórico | Phase 3 (T20) | In Tasks |
| HIST-08 | P1: Histórico | Phase 1 (T8), Phase 3 (T20) | In Tasks |
| HIST-09 | P1: Histórico | Phase 1 (T8), Phase 3 (T20) | In Tasks |
| HIST-10 | P1: Histórico | Phase 1 (T8), Phase 3 (T20) | In Tasks |
| MATCH-01 | P1: Detalhe da partida | Phase 3 (T20) | In Tasks |
| MATCH-02 | P1: Detalhe da partida | Phase 3 (T20) | In Tasks |
| MATCH-03 | P1: Detalhe da partida | Phase 3 (T19) | In Tasks |
| MATCH-04 | P1: Detalhe da partida | Phase 3 (T19) | In Tasks |
| MATCH-05 | P1: Detalhe da partida | Phase 3 (T19) | In Tasks |
| MATCH-06 | P1: Detalhe da partida | Phase 3 (T19) | In Tasks |
| MATCH-07 | P1: Detalhe da partida | Phase 3 (T19) | In Tasks |
| MATCH-08 | P1: Detalhe da partida | Phase 2 (T9), Phase 3 (T19) | In Tasks |
| CHMP-01 | P1: Estatísticas por campeão | Phase 1 (T8), Phase 3 (T18) | In Tasks |
| CHMP-02 | P1: Estatísticas por campeão | Phase 1 (T8) | In Tasks |
| CHMP-03 | P1: Estatísticas por campeão | Phase 1 (T8), Phase 3 (T18) | In Tasks |
| CHMP-04 | P1: Estatísticas por campeão | Phase 1 (T8) | In Tasks |
| CHMP-05 | P1: Estatísticas por campeão | Phase 1 (T8) | In Tasks |
| CHMP-06 | P1: Estatísticas por campeão | Phase 1 (T8), Phase 3 (T18) | In Tasks |
| CHMP-07 | P1: Estatísticas por campeão | Phase 1 (T8), Phase 3 (T18) | In Tasks |
| CHMP-08 | P1: Estatísticas por campeão | Phase 1 (T8), Phase 3 (T18) | In Tasks |
| RIOT-01 | P1: Integração Riot API | Phase 1 (T5), Phase 3 (T22) | In Tasks |
| RIOT-02 | P1: Integração Riot API | Phase 1 (T5, T6) | In Tasks |
| RIOT-03 | P1: Integração Riot API | Phase 1 (T6) | In Tasks |
| RIOT-04 | P1: Integração Riot API | Phase 1 (T6) | In Tasks |
| RIOT-05 | P1: Integração Riot API | Phase 1 (T6) | In Tasks |
| RIOT-06 | P1: Integração Riot API | Phase 1 (T6) | In Tasks |
| RIOT-07 | P1: Integração Riot API | Phase 1 (T1), Phase 2 (T9) | In Progress (T1 done) |
| RIOT-08 | P1: Integração Riot API | Phase 1 (T7) | In Tasks |
| I18N-01 | P1: Idioma e aviso legal | Phase 1 (T2) | Verified |
| LEGAL-01 | P1: Idioma e aviso legal | Phase 1 (T2), Phase 3 (T16) | In Progress (T2 done) |
| BRAND-01 | P1: Idioma e aviso legal | Phase 1 (T2), Phase 3 (T16) | In Progress (T2 done) |
| RESP-01 | P1: Idioma e aviso legal | Phase 3 (T21) | In Tasks |

**Coverage:** 61 total, 61 mapped to tasks, 0 unmapped ✅

---

## Implicit-Requirement Sweep

| Dimension | Resolution |
| --- | --- |
| Input validation & bounds | SRCH-03, SRCH-06 |
| Failure / partial-failure states | SRCH-07, SRCH-08, SRCH-10, REFR-08, edge case de partida 404 |
| Idempotency / retry / duplicate handling | RIOT-02, RIOT-03, RIOT-07, REFR-06 |
| Auth boundaries & rate limits | REFR-04, REFR-05, RIOT-01, RIOT-05; sem contas de usuário (Out of Scope) |
| Concurrency / ordering | REFR-06, HIST-01 |
| Data lifecycle / expiry | Assumption "Retenção de dados"; RIOT-08 (cache da versão) |
| Observability | RIOT-04, RIOT-06 |
| External-dependency failure | RIOT-02, RIOT-03, RIOT-04, REFR-08 |
| State-transition integrity | REFR-02, REFR-03 (ocioso → atualizando → cooldown → ocioso) |

---

## Sources

- Pedido do usuário (2026-11-02) e respostas às perguntas - escopo, regiões, chave, atualização, stack, idioma.
- op.gg, deeplol.gg - non-binding - user: "pode seguir o estilo op.gg/deeplol (tema escuro) como inspiração"
- Riot Developer Portal - limites da Development key, roteamento por plataforma/região, account-v1, summoner-v4, league-v4, match-v5.

---

## Success Criteria

- [ ] Primeira busca de um jogador com 20 partidas completa em menos de 5 s com a Development key livre.
- [ ] Perfil já salvo abre em menos de 1 s sem chamar a Riot API.
- [ ] Zero respostas 429 da Riot API causadas pela plataforma em uso normal.

