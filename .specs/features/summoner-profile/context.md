# summoner-profile Context

**Gathered:** 2026-11-02
**Spec:** `.specs/features/summoner-profile/spec.md`
**Status:** Ready for spec approval

---

## Feature Boundary

Buscar um jogador de LoL por Riot ID em qualquer região e ver perfil, elos, histórico de partidas, detalhe de cada partida e estatísticas por campeão, com dados salvos no banco e atualizados sob demanda pelo botão "Atualizar".

---

## Implementation Decisions

### Escopo do MVP

- Entram: busca por Riot ID + perfil (ícone, nível, elo Solo/Flex), histórico, detalhe da partida, estatísticas por campeão - user: "Busca por Riot ID ... Histórico de partidas ... Detalhe da partida ... Estatísticas por campeão do jogador".
- Tier list/builds vira a feature seguinte `champion-meta` - user: "Sim: primeiro 'summoner-profile' ... depois 'champion-meta'" (AD-006).

### Regiões

- Todas as plataformas, seletor com BR1 padrão - user: "Todas as regiões, com seletor (BR1 padrão)" (AD-003).

### Atualização de dados

- Dados salvos no banco; botão "Atualizar" com cooldown de 2 minutos por jogador - user: "Igual op.gg ..." e "2 minutos" (AD-002).

### Histórico

- 20 partidas por vez com "Mostrar mais" (+20) - user: "20 partidas por vez, com botão 'Mostrar mais' (+20)".
- Abas Todas / Ranqueada Solo/Duo / Ranqueada Flex / Normal / ARAM - user: "Abas: Todas / Ranqueada Solo/Duo / Ranqueada Flex / Normal / ARAM".

### Estatísticas por campeão

- Calculadas das partidas ranqueadas da temporada atual salvas no banco, Solo e Flex separados - user: "Calculadas a partir das partidas ranqueadas da temporada atual salvas no banco (Solo e Flex separados), crescendo conforme o jogador atualiza".

### Detalhe da partida

- Expande inline no histórico, visão geral dos 10 jogadores - user: "Detalhe expande inline no histórico (como op.gg), com aba de visão geral (10 jogadores: campeão, KDA, itens, runas, feitiços, dano, CS, ouro, visão)".

### Visual

- Sem design vinculante; op.gg/deeplol com tema escuro como inspiração - user: "Não tenho, pode seguir o estilo op.gg/deeplol (tema escuro) como inspiração".

### Stack, chave e idioma

- Next.js (TS) + PostgreSQL + Redis (AD-001); Development key (AD-004); pt-BR com i18n (AD-005).

### Nome e telas

- Nome da plataforma "LMI Stats" - user: "pode ser LMI stats ou algo assim mas com a tag LMI".
- Responsivo, desktop a partir de 1280 px e celular a partir de 375 px - user: "pode desde que fique responsivo, por enquanto ta tranquilo".

### Agent's Discretion

- Layout das telas, respeitando tema escuro e inspiração op.gg/deeplol.

### Declined / Undiscussed Gray Areas → Assumptions

- Ver a tabela Assumptions & Open Questions do spec (linhas com Confirmed? = n).

---

## Specific References

- op.gg e deeplol.gg - inspiração (não vinculante) - user: "pode seguir o estilo op.gg/deeplol (tema escuro) como inspiração".

---

## Deferred Ideas

- Partida ao vivo, leaderboard - não escolhidos para o MVP.
- Maestria de campeão - não escolhida.
- Página própria por partida (URL compartilhável) - não escolhida.

