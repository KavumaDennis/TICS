/**
 * NearMe live-path verification: NearMeService.searchNearby (OSM mode).
 * Run: node scripts/build-verify.cjs is wired for the main entry; this is a
 * standalone probe bundled the same way.
 */
import { NearMeService } from '@/src/modules/explore/services/nearme/NearMeService';

const realFetch = global.fetch;
let handler: (url: string) => { status: number; body: any } = () => ({ status: 200, body: { elements: [] } });
(global as any).fetch = async (url: string, init: any = {}) => {
  const res = handler(url);
  return {
    ok: res.status >= 200 && res.status < 300,
    status: res.status,
    json: async () => res.body,
    text: async () => JSON.stringify(res.body),
  } as any;
};

function osmElement(id: number, lat: number, lon: number, tags: Record<string, string>) {
  return { type: 'node', id, lat, lon, tags };
}
const ELEMENTS = [
  osmElement(1, 0.3476, 32.5825, { name: 'Uganda Museum', tourism: 'museum' }),
  osmElement(2, 0.3350, 32.5600, { name: 'Kasubi Tombs', tourism: 'attraction' }),
  osmElement(3, 0.3600, 32.5700, { name: 'City Gardens', leisure: 'park' }),
];

async function main() {
  handler = () => ({ status: 200, body: { version: 0.6, elements: ELEMENTS } });
  console.log('[NearMeProbe] calling NearMeService.searchNearby (Google disabled → OSM mode)...');
  const t = Date.now();
  try {
    const result = await NearMeService.searchNearby(0.3476, 32.5825, { radius: 5000 });
    console.log(`[NearMeProbe] places=${result.places.length} durationMs=${Date.now() - t}`);
    for (const p of result.places.slice(0, 5)) {
      console.log(`  - ${p.name} cat=${p.category} image=${p.imageUrl ? p.imageUrl.slice(0, 60) : '(none)'}`);
    }
    if (result.places.length === 0) {
      console.log('[NearMeProbe] FAIL: 0 places');
      process.exit(1);
    }
    console.log('[NearMeProbe] OK');
  } catch (e: any) {
    console.log('[NearMeProbe] CRASH:', e?.message, e?.stack?.split('\n')[1]);
    process.exit(1);
  }
  process.exit(0);
}
main();
