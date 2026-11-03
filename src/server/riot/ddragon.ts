export const DEFAULT_DDRAGON_VERSION = '14.22.1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const SUMMONER_SPELL_MAP: Record<number, string> = {
  1: 'SummonerBoost',
  3: 'SummonerExhaust',
  4: 'SummonerFlash',
  6: 'SummonerHaste',
  7: 'SummonerHeal',
  11: 'SummonerSmite',
  12: 'SummonerTeleport',
  13: 'SummonerMana',
  14: 'SummonerDot',
  21: 'SummonerBarrier',
  30: 'SummonerPoroRecall',
  31: 'SummonerPoroThrow',
  32: 'SummonerSnowball',
  39: 'SummonerSnowURFSnowball_Mark',
  2201: 'SummonerCherryHold',
  2202: 'SummonerCherryFlash',
};

const RUNE_ICON_MAP: Record<number, string> = {
  // Styles
  8000: 'Styles/7201_Precision.png',
  8100: 'Styles/7200_Domination.png',
  8200: 'Styles/7202_Sorcery.png',
  8300: 'Styles/7203_Whimsy.png',
  8400: 'Styles/7204_Resolve.png',
  // Precision Keystones
  8005: 'Styles/Precision/PressTheAttack/PressTheAttack.png',
  8008: 'Styles/Precision/LethalTempo/LethalTempoTemp.png',
  8021: 'Styles/Precision/FleetFootwork/FleetFootwork.png',
  8010: 'Styles/Precision/Conqueror/Conqueror.png',
  // Domination Keystones
  8112: 'Styles/Domination/Electrocute/Electrocute.png',
  8124: 'Styles/Domination/Predator/Predator.png',
  8128: 'Styles/Domination/DarkHarvest/DarkHarvest.png',
  9923: 'Styles/Domination/HailOfBlades/HailOfBlades.png',
  // Sorcery Keystones
  8214: 'Styles/Sorcery/SummonAery/SummonAery.png',
  8229: 'Styles/Sorcery/ArcaneComet/ArcaneComet.png',
  8230: 'Styles/Sorcery/PhaseRush/PhaseRush.png',
  // Resolve Keystones
  8437: 'Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png',
  8439: 'Styles/Resolve/VeteranAftershock/VeteranAftershock.png',
  8465: 'Styles/Resolve/Guardian/Guardian.png',
  // Inspiration Keystones
  8351: 'Styles/Inspiration/GlacialAugment/GlacialAugment.png',
  8360: 'Styles/Inspiration/UnsealedSpellbook/UnsealedSpellbook.png',
  8369: 'Styles/Inspiration/FirstStrike/FirstStrike.png',
};

export function profileIconImg(
  iconId: number | null | undefined,
  version: string = DEFAULT_DDRAGON_VERSION
): string | null {
  if (iconId === null || iconId === undefined || iconId < 0) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${iconId}.png`;
}

export function championImg(
  championName: string | null | undefined,
  version: string = DEFAULT_DDRAGON_VERSION,
  knownChampions?: Set<string>
): string | null {
  if (!championName) return null;
  const trimmed = championName.trim();
  if (!trimmed || !/^[A-Za-z0-9_']+$/i.test(trimmed)) return null;
  if (knownChampions && !knownChampions.has(trimmed)) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${trimmed}.png`;
}

export function itemImg(
  itemId: number | null | undefined,
  version: string = DEFAULT_DDRAGON_VERSION
): string | null {
  if (!itemId || itemId <= 0) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`;
}

export function spellImg(
  spellId: number | null | undefined,
  version: string = DEFAULT_DDRAGON_VERSION
): string | null {
  if (!spellId || spellId <= 0) return null;
  const spellKey = SUMMONER_SPELL_MAP[spellId];
  if (!spellKey) return null;
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${spellKey}.png`;
}

export function runeImg(runeId: number | null | undefined): string | null {
  if (!runeId || runeId <= 0) return null;
  const path = RUNE_ICON_MAP[runeId];
  if (!path) return null;
  return `https://ddragon.leagueoflegends.com/cdn/img/perk-images/${path}`;
}

export interface DataDragonOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
  fallbackVersion?: string;
  knownChampions?: Set<string>;
}

export class DataDragon {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly fallbackVersion: string;
  private readonly knownChampions?: Set<string>;
  private cachedVersion: string | null = null;
  private expiresAt = 0;

  constructor(options: DataDragonOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => Date.now());
    this.fallbackVersion = options.fallbackVersion ?? DEFAULT_DDRAGON_VERSION;
    this.knownChampions = options.knownChampions;
  }

  async getVersion(): Promise<string> {
    const currentMs = this.now();
    if (this.cachedVersion && currentMs <= this.expiresAt) {
      return this.cachedVersion;
    }

    try {
      const response = await this.fetchImpl(
        'https://ddragon.leagueoflegends.com/api/versions.json'
      );
      if (response.ok) {
        const versions = (await response.json()) as string[];
        if (Array.isArray(versions) && typeof versions[0] === 'string' && versions[0]) {
          this.cachedVersion = versions[0];
          this.expiresAt = currentMs + CACHE_TTL_MS;
          return this.cachedVersion;
        }
      }
    } catch {
      // Fall back to cached or default version
    }

    return this.cachedVersion ?? this.fallbackVersion;
  }

  profileIconUrl(
    iconId: number | null | undefined,
    version: string = this.cachedVersion ?? this.fallbackVersion
  ): string | null {
    return profileIconImg(iconId, version);
  }

  championUrl(
    championName: string | null | undefined,
    version: string = this.cachedVersion ?? this.fallbackVersion
  ): string | null {
    return championImg(championName, version, this.knownChampions);
  }

  itemUrl(
    itemId: number | null | undefined,
    version: string = this.cachedVersion ?? this.fallbackVersion
  ): string | null {
    return itemImg(itemId, version);
  }

  spellUrl(
    spellId: number | null | undefined,
    version: string = this.cachedVersion ?? this.fallbackVersion
  ): string | null {
    return spellImg(spellId, version);
  }

  runeUrl(runeId: number | null | undefined): string | null {
    return runeImg(runeId);
  }
}

export const defaultDataDragon = new DataDragon();
export const getVersion = () => defaultDataDragon.getVersion();
