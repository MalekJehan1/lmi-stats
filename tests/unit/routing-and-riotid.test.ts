import { describe, it, expect } from 'vitest';
import { t, ptBR, getQueueName, formatRelativeTime } from '@/i18n';
import {
  PLATFORMS,
  DEFAULT_PLATFORM,
  isPlatform,
  regionalOf,
  normalizePlatform,
} from '@/server/riot/routing';

describe('i18n', () => {
  it('I18N-01 resolves all UI copy from pt-BR catalog', () => {
    expect(t('brand.name')).toBe('LMI Stats');
    expect(t('legal.disclaimer')).toBe(
      "LMI Stats isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc."
    );
    expect(t('search.invalidFormat')).toBe('Digite o Riot ID no formato Nome#TAG');
    expect(t('error.playerNotFound')).toBe('Jogador não encontrado');
    expect(t('error.playerNotInRegion')).toBe('Jogador não encontrado nesta região');
    expect(t('error.searchTimeout')).toBe('Muitas buscas no momento. Tente novamente em instantes.');
    expect(t('refresh.idle')).toBe('Atualizar');
    expect(t('refresh.loading')).toBe('Atualizando...');
    expect(t('refresh.error')).toBe('Não foi possível atualizar agora. Tente novamente em instantes.');
    expect(t('ranked.unranked')).toBe('Unranked');
    expect(t('tabs.all')).toBe('Todas');
    expect(t('tabs.solo')).toBe('Ranqueada Solo/Duo');
    expect(t('tabs.flex')).toBe('Ranqueada Flex');
    expect(t('tabs.normal')).toBe('Normal');
    expect(t('tabs.aram')).toBe('ARAM');
    expect(t('history.loadMore')).toBe('Mostrar mais');
    expect(t('history.empty')).toBe('Nenhuma partida encontrada');
    expect(t('history.perfectKda')).toBe('Perfeito');
    expect(t('history.remake')).toBe('Remake');
    expect(t('champions.showAll')).toBe('Ver todos');
    expect(t('champions.empty')).toBe('Sem partidas ranqueadas nesta temporada');
    expect(Object.keys(ptBR).length).toBeGreaterThanOrEqual(25);
  });

  it('interpolates dynamic variables in catalog strings', () => {
    expect(t('champions.basedOnMatches', { count: 14 })).toBe('Baseado em 14 partidas salvas');
    expect(t('profile.updatedAgo', { time: 'há 5 minutos' })).toBe('Atualizado há 5 minutos');
    expect(t('refresh.cooldown', { seconds: 42 })).toBe('42s');
  });

  it('resolves queue names and relative time in pt-BR', () => {
    expect(getQueueName(420)).toBe('Ranqueada Solo/Duo');
    expect(getQueueName(440)).toBe('Ranqueada Flex');
    expect(getQueueName(450)).toBe('ARAM');
    expect(getQueueName(400)).toBe('Normal');
    const now = 1_700_000_000_000;
    expect(formatRelativeTime(now - 5 * 60 * 1000, now)).toBe('há 5 minutos');
    expect(formatRelativeTime(now - 2 * 3600 * 1000, now)).toBe('há 2 horas');
  });
});

describe('Routing', () => {
  it('SRCH-02 defaults to BR1 and lists all 15 Riot platforms', () => {
    expect(DEFAULT_PLATFORM).toBe('BR1');
    expect(PLATFORMS).toEqual([
      'BR1',
      'NA1',
      'LA1',
      'LA2',
      'EUW1',
      'EUN1',
      'TR1',
      'RU',
      'ME1',
      'KR',
      'JP1',
      'OC1',
      'SG2',
      'TW2',
      'VN2',
    ]);
    expect(PLATFORMS).toHaveLength(15);
  });

  it('maps each platform to its regional cluster', () => {
    expect(regionalOf('BR1')).toBe('americas');
    expect(regionalOf('NA1')).toBe('americas');
    expect(regionalOf('LA1')).toBe('americas');
    expect(regionalOf('LA2')).toBe('americas');
    expect(regionalOf('EUW1')).toBe('europe');
    expect(regionalOf('EUN1')).toBe('europe');
    expect(regionalOf('TR1')).toBe('europe');
    expect(regionalOf('RU')).toBe('europe');
    expect(regionalOf('ME1')).toBe('europe');
    expect(regionalOf('KR')).toBe('asia');
    expect(regionalOf('JP1')).toBe('asia');
    expect(regionalOf('OC1')).toBe('sea');
    expect(regionalOf('SG2')).toBe('sea');
    expect(regionalOf('TW2')).toBe('sea');
    expect(regionalOf('VN2')).toBe('sea');
  });

  it('validates and normalizes platform identifiers', () => {
    expect(isPlatform('BR1')).toBe(true);
    expect(isPlatform('KR')).toBe(true);
    expect(isPlatform('INVALID')).toBe(false);
    expect(normalizePlatform('br1')).toBe('BR1');
    expect(normalizePlatform('euw1')).toBe('EUW1');
    expect(normalizePlatform('xyz')).toBeNull();
  });
});

