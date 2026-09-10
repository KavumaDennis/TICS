/**
 * COLD-START IMAGE DEBUG (temporary diagnostic)
 * ─────────────────────────────────────────────────────────────────────────────
 * Reproduces the `npx expo start -c` cold-start path in Node with ZERO caches:
 *  1. Fresh Firestore read of the `destinations` collection (no persistence).
 *  2. Runs the REAL production resolver `resolveDestinationImage()` on every doc.
 *  3. Verifies the deterministic fallback URL is actually reachable via fetch.
 *
 * Run:  npx esbuild scripts/cold-start-image-debug.ts --bundle --platform=node
 *       --format=cjs --alias:@=./src --outfile=scripts/.cold-start-debug.cjs
 *       node scripts/.cold-start-debug.cjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, getDocs, limit } from 'firebase/firestore';
import {
  resolveDestinationImage,
  getDestinationPrimaryImage,
  DESTINATION_FALLBACK_IMAGE,
} from '@/src/modules/explore/utils';

// Read Expo env vars the same way the app does (esbuild does not inject EXPO_PUBLIC_*).
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  resolveDestinationImage,
  getDestinationPrimaryImage,
  DESTINATION_FALLBACK_IMAGE,
} from '@/src/modules/explore/utils';

const PROJECT_ID = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'tics-455d5';

function findCredential() {
  const saEnvVar = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  console.log(`[debug] GOOGLE_APPLICATION_CREDENTIALS=${saEnvVar ?? '(unset)'}`);
  if (saEnvVar && fs.existsSync(saEnvVar)) {
    console.log(`[debug] using env credential: ${saEnvVar}`);
    return cert(require(saEnvVar));
  }
  for (const dir of [path.join(os.homedir(), 'Downloads'), path.join(os.homedir(), 'Desktop'), __dirname, process.cwd()]) {
    try {
      const files = fs.readdirSync(dir);
      const keyFile = files.find((f) => f.endsWith('.json') && f.includes('firebase-adminsdk'));
      if (keyFile) {
        console.log(`[debug] using discovered credential: ${path.join(dir, keyFile)}`);
        return cert(require(path.join(dir, keyFile)));
      }
    } catch {}
  }
  console.log('[debug] NO service account credential found');
  return null;
}

async function main() {
  console.log('════════════════════════════════════════════════════════');
  console.log('COLD-START IMAGE DEBUG (no app cache, no module cache)');
  console.log('════════════════════════════════════════════════════════');

  // 1. Fallback URL reachability (real fetch, fresh socket).
  console.log(`\n[1] Checking fallback URL reachability: ${DESTINATION_FALLBACK_IMAGE}`);
  try {
    const res = await fetch(DESTINATION_FALLBACK_IMAGE, { method: 'GET' });
    const buf = await res.arrayBuffer();
    console.log(`    status=${res.status} contentType=${res.headers.get('content-type')} bytes=${buf.byteLength}`);
  } catch (e: any) {
    console.log(`    ❌ UNREACHABLE: ${e?.message ?? e}`);
  }

  // 2. Fresh Firestore read (cold — no persistence layer).
  if (getApps().length === 0) {
    const credential = findCredential();
    if (!credential) {
      console.log('\n[2] ⚠️  No firebase-adminsdk service account found — skipping Firestore step.');
      return;
    }
    initializeApp({ credential, projectId: PROJECT_ID });
  }
  const db = getFirestore();
  console.log('\n[2] Fresh Firestore read of `destinations` (cold, no cache)...');
  const snap = await getFirestore().collection('destinations').limit(25).get();
  const docs = snap.docs;
  console.log(`    docs fetched: ${snap.size}\n`);

  let withImage = 0;
  let fallback = 0;
  docs.forEach((d, i) => {
    const raw = d.data();
    console.log(`────────────────────────────────────────────────────────`);
    console.log(`DOC ${i + 1}/${docs.length}`);
    const resolved = resolveDestinationImage({ id: d.id, ...raw } as any);
    const primary = getDestinationPrimaryImage({ id: d.id, ...raw, images: [] } as any);
    if (resolved) withImage++; else fallback++;
    console.log(
      `[SUMMARY] destinationId=${d.id}\n  resolvedImage: ${resolved}\n  primaryImage (what the card renders): ${primary}\n  isFallback: ${primary === DESTINATION_FALLBACK_IMAGE}`
    );
  });

  console.log('\n════════════════════════════════════════════════════════');
  console.log(`RESULT: resolved=${withImage} fallbackOnly=${fallback} total=${docs.length}`);
  console.log('Compare with warm launch: same resolver + same docs ⇒ same result.');
  console.log('If cold shows fallbackOnly>0 but warm showed images, check normalized images cache.');
  console.log('════════════════════════════════════════════════════════');
  process.exit(0);
}

main().catch((e) => { console.error('DEBUG HARNESS ERROR:', e); process.exit(1); });
