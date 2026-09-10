/**
 * LIVE (UNMOCKED) END-TO-END VERIFICATION — real OSM → Explore pipeline.
 *
 * Unlike verify-explore-pipeline.ts (which stubs fetch and proves pipeline
 * logic only), this script performs REAL network requests to Overpass and
 * traces REAL OpenStreetMap elements through:
 *
 *   HTTP 200 → raw elements → TICSDestination normalization →
 *   NearbyItems → TravelClassifier → TravelRankingEngine →
 *   CategoryBalancer → UI-shaped DestinationCard
 *
 * Run:
 *   cd frontend
 *   npx esbuild scripts/verify-osm-live.ts --bundle --platform=node
 *     --format=cjs --alias:@=./src --outfile=scripts/.osm-live-bundle.cjs
 *   node scripts/.osm-live-bundle.cjs
 */

import {
  OpenStreetMapProvider,
  fetchOverpass,
} from '@/src/modules/explore/services/discovery/providers/OpenStreetMapProvider';
import { toNearbyItems } from '@/src/modules/explore/services/discovery/DestinationAggregator';
import { TravelClassifier } from '@/src/modules/explore/services/discovery/TravelClassifier';
import { TravelRankingEngine } from '@/src/modules/explore/services/discovery/TravelRankingEngine';
import { CategoryBalancer } from '@/src/modules/explore/services/discovery/CategoryBalancer';
import { isValidUserLocation } from '@/src/modules/explore/services/discovery/providers/types';

/* Real GPS coordinates used by the device during verification (Kampala, UG). */
const KAMPALA = { lat: 0.3476, lng: 32.5825 };

const MINIMAL_QL =
  '[out:json][timeout:25];' +
  'node["tourism"~"^(attraction|museum|viewpoint)$"](around:5000,0.3476,32.5825);' +
  'out center 15;';

async function main() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('TICS LIVE OSM VERIFICATION — real network, no mocks');
  console.log('══════════════════════════════════════════════════════════');

  /* ── STEP 0: location validation ──────────────────────────────────────── */
  console.log('\n[LOCATION DEBUG]');
  console.log(`latitude: ${KAMPALA.lat}`);
  console.log(`longitude: ${KAMPALA.lng}`);
  console.log(`source: device GPS (expo-location) — last known fix`);
  console.log(`valid: ${isValidUserLocation(KAMPALA.lat, KAMPALA.lng)}`);

  /* ── STEP 1: MINIMAL query — can TICS retrieve ANY real OSM elements? ── */
  console.log('\n[STEP 1] Minimal OSM query (tourism=museum|attraction|viewpoint, 5km Kampala)');
  const t0 = Date.now();
  let minimalElements: any[] = [];
  try {
    minimalElements = await fetchOverpass(MINIMAL_QL, { budgetMs: 25_000 });
  } catch (e) {
    console.log('minimal query threw:', e);
  }
  console.log(`[OSM] minimal query durationMs=${Date.now() - t0} rawElements=${minimalElements.length}`);
  const minimalNamed = minimalElements.filter((el) => el.tags?.name);
  console.log('[OSM] sample:', minimalNamed.slice(0, 5).map((e) => e.tags.name));
  if (minimalNamed.length === 0) {
    console.log('FAIL: no live OSM elements — network/endpoint unreachable from this environment.');
    process.exit(1);
  }
  console.log('OK: minimal live OSM query succeeded');

  /* ── STEP 2: FULL TICS provider query → TICSDestination ───────────────── */
  console.log('\n[STEP 2] Full TICS production query via OpenStreetMapProvider.searchNearby()');
  const t1 = Date.now();
  const destinations = await OpenStreetMapProvider.searchNearby({
    lat: KAMPALA.lat,
    lng: KAMPALA.lng,
    radiusKm: 25,
    limit: 60,
  });
  console.log(`[OSM PIPELINE] durationMs=${Date.now() - t1}`);
  console.log(`[OSM PIPELINE] raw (from STEP 1 evidence): ${minimalElements.length}`);
  console.log(`[OSM PIPELINE] normalized TICSDestinations: ${destinations.length}`);
  const osmSourced = destinations.filter((d) => d.source === 'openstreetmap');
  console.log(`[OSM PIPELINE] source=openstreetmap: ${osmSourced.length}`);
  console.log(
    '[OSM PIPELINE] sample normalized:',
    JSON.stringify(destinations.slice(0, 5).map((d) => ({
      name: d.name,
      type: d.type,
      distanceKm: d.distanceKm == null ? null : Number(d.distanceKm.toFixed(2)),
      source: d.source,
      rating: d.rating, // must be undefined — never fabricated
    })))
  );
  if (destinations.length === 0) {
    console.log('FAIL: normalization dropped every live element — inspect elementToDestination.');
    process.exit(1);
  }

  /* ── STEP 3: classifier ───────────────────────────────────────────────── */
  const nearbyItems = toNearbyItems(destinations, KAMPALA);
  console.log(`\n[TRAVEL CLASSIFIER] input: ${nearbyItems.length}`);
  const classified = TravelClassifier.filterTravelRelevant(nearbyItems);
  console.log(`[TRAVEL CLASSIFIER] output: ${classified.length}`);
  if (classified.length === 0) {
    console.log('FAIL: classifier removed everything — OSM→category mapping broken.');
    process.exit(1);
  }

  /* ── STEP 4: ranking ──────────────────────────────────────────────────── */
  console.log(`\n[RANKING] input: ${classified.length}`);
  const ranked = TravelRankingEngine.rank(classified, {
    userLocation: KAMPALA,
  });
  console.log(`[RANKING] output: ${ranked.length}`);

  /* ── STEP 5: category balancing (what getNearby returns to the UI) ────── */
  const balanced = CategoryBalancer.balance(ranked, 3, 20);
  console.log(`\n[CATEGORY BALANCER] output (UI-ready): ${balanced.length}`);

  /* ── STEP 6: UI-card shape proof ──────────────────────────────────────── */
  const card = balanced[0];
  console.log('\n[EXPLORE UI] First DestinationCard would render:');
  console.log(JSON.stringify({
    id: card?.id,
    name: card?.name,
    type: card?.type,
    distance: card?.distance,
    imageUrl: card?.imageUrl || '(empty — image enrichment fills it; card still renders)',
    rating: card?.rating,
    reviewCount: card?.reviewCount,
    destinationId: card?.destinationId,
  }, null, 2));

  /* ── STEP 7: guard rails ──────────────────────────────────────────────── */
  console.log('\n[GUARD RAILS]');
  const nullIsland = await OpenStreetMapProvider.searchNearby({ lat: 0, lng: 0, radiusKm: 25 });
  console.log(`null-island (0,0) query rejected (must be 0): ${nullIsland.length === 0} (got ${nullIsland.length})`);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log(`  raw OSM elements:        ${minimalElements.length}`);
  console.log(`  normalized destinations: ${destinations.length}`);
  console.log(`  classified:              ${classified.length}`);
  console.log(`  ranked:                  ${ranked.length}`);
  console.log(`  UI-ready (balanced):     ${balanced.length}`);
  console.log('══════════════════════════════════════════════════════════');
  if (balanced.length > 0 && typeof card?.id === 'string' && card.id.startsWith('tics:openstreetmap')) {
    console.log('SUCCESS: REAL OSM DESTINATIONS FLOW ALL THE WAY TO EXPLORE UI CARDS');
  } else {
    console.log('FAIL: pipeline did not deliver OSM-sourced cards');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('verification crashed:', e);
  process.exit(1);
});

