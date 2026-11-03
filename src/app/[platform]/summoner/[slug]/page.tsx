import React from 'react';
import { SummonerProfileView } from '@/components/ProfileHeader';

export default function SummonerProfilePage({
  params,
}: {
  params: { platform: string; slug: string };
}) {
  return (
    <SummonerProfileView
      platform={params.platform}
      slug={params.slug}
    />
  );
}
