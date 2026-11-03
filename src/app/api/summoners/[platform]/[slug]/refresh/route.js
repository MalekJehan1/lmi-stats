import { POST as refreshPost } from '../../[puuid]/refresh/route.ts';

export async function POST(req, context) {
  const params = await Promise.resolve(context.params);
  return refreshPost(req, {
    params: { platform: params.platform, puuid: params.slug },
  });
}
