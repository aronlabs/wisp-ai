import { getLatestRelease } from '../../release.server.ts';
import { site } from '../../site.ts';

export async function GET() {
  const release = await getLatestRelease();
  // A temporary redirect keeps browsers from pinning a particular release.
  // If GitHub's manifest is unavailable, visitors can still reach the latest release.
  return new Response(null, {
    status: 307,
    headers: {
      Location: release?.download ?? `${site.repository}/releases/latest`,
      'Cache-Control': 'no-store',
    },
  });
}
