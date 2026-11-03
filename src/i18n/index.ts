export const ptBR = {
  'brand.name': 'LMI Stats',
  'brand.subtitle': 'Estatísticas e Histórico de League of Legends',
  'legal.disclaimer':
    "LMI Stats isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.",
  'search.placeholder': 'Nome#TAG',
  'search.regionLabel': 'Região',
  'search.submit': 'Buscar',
  'search.invalidFormat': 'Digite o Riot ID no formato Nome#TAG',
  'error.playerNotFound': 'Jogador não encontrado',
  'error.playerNotInRegion': 'Jogador não encontrado nesta região',
  'error.searchTimeout': 'Muitas buscas no momento. Tente novamente em instantes.',
  'profile.level': 'Nível {level}',
  'profile.updatedAgo': 'Atualizado {time}',
  'profile.updatedMinutesAgo': 'Atualizado há {minutes} minutos',
  'refresh.idle': 'Atualizar',
  'refresh.loading': 'Atualizando...',
  'refresh.cooldown': '{seconds}s',
  'refresh.error': 'Não foi possível atualizar agora. Tente novamente em instantes.',
  'ranked.soloTitle': 'Ranqueada Solo/Duo',
  'ranked.flexTitle': 'Ranqueada Flex',
  'ranked.unranked': 'Unranked',
  'ranked.lp': '{lp} PdL',
  'ranked.record': '{wins}V {losses}D',
  'ranked.winrate': '{winrate}% Taxa de vitória',
  'tabs.all': 'Todas',
  'tabs.solo': 'Ranqueada Solo/Duo',
  'tabs.flex': 'Ranqueada Flex',
  'tabs.normal': 'Normal',
  'tabs.aram': 'ARAM',
  'history.loadMore': 'Mostrar mais',
  'history.loadingMore': 'Carregando...',
  'history.empty': 'Nenhuma partida encontrada',
  'history.perfectKda': 'Perfeito',
  'history.remake': 'Remake',
  'history.victory': 'Vitória',
  'history.defeat': 'Derrota',
  'history.killParticipation': 'P/Abates {kp}%',
  'champions.title': 'Estatísticas por Campeão',
  'champions.showAll': 'Ver todos',
  'champions.basedOnMatches': 'Baseado em {count} partidas salvas',
  'champions.empty': 'Sem partidas ranqueadas nesta temporada',
  'champions.games': '{games} jogos',
  'detail.blueTeam': 'Time Azul',
  'detail.redTeam': 'Time Vermelho',
  'detail.kills': 'Abates',
  'detail.towers': 'Torres',
  'detail.dragons': 'Dragões',
  'detail.barons': 'Barões',
  'detail.damage': 'Dano',
  'detail.gold': 'Ouro',
  'detail.cs': 'CS',
  'detail.vision': 'Visão',
  'detail.items': 'Itens',
  'skeleton.loadingProfile': 'Buscando dados do jogador...',
} as const;

export type TranslationKey = keyof typeof ptBR;
export type Catalog = typeof ptBR;

export function t(
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const template: string = ptBR[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`
  );
}

const QUEUE_NAMES: Record<number, string> = {
  420: 'Ranqueada Solo/Duo',
  440: 'Ranqueada Flex',
  400: 'Normal',
  430: 'Normal',
  480: 'Normal',
  490: 'Normal',
  450: 'ARAM',
  720: 'ARAM Clash',
  2400: 'ARAM: Desordem',
  700: 'Clash',
  900: 'URF',
  1700: 'Arena',
  1900: 'URF',
};

export function getQueueName(queueId: number): string {
  return QUEUE_NAMES[queueId] ?? `Fila ${queueId}`;
}

export function formatRelativeTime(
  target: Date | number,
  nowMs: number = Date.now()
): string {
  const targetMs = typeof target === 'number' ? target : target.getTime();
  const diffSec = Math.max(0, Math.floor((nowMs - targetMs) / 1000));
  if (diffSec < 60) {
    return 'há poucos segundos';
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) {
    return 'há 1 minuto';
  }
  if (diffMin < 60) {
    return `há ${diffMin} minutos`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours === 1) {
    return 'há 1 hora';
  }
  if (diffHours < 24) {
    return `há ${diffHours} horas`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) {
    return 'há 1 dia';
  }
  return `há ${diffDays} dias`;
}
