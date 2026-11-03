import { GET as matchesGet } from '../../[puuid]/matches/route.ts';

export async function GET(req, context) {
  const params = await Promise.resolve(context.params);
  return matchesGet(req, {
    params: { platform: params.platform, puuid: params.slug },
  });
}
