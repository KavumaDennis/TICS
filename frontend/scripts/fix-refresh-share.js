const fs = require('fs');

const files = [
  {
    path: 'frontend/src/screens/alerts/AlertsCenterScreen.tsx',
    patches: [
      {
        from: `      showRefreshAlert('Refresh failed', e?.message ?? 'Please try again.', [{ text: 'OK', style: 'primary' }]);`,
        to: `      if (e?.message === 'Unavailable' || e?.code === 'unavailable') {
        showRefreshAlert('Refresh limited', 'Could not reach server. Showing cached data.', [{ text: 'OK', style: 'primary' }]);
      } else {
        showRefreshAlert('Refresh failed', e?.message ?? 'Please try again.', [{ text: 'OK', style: 'primary' }]);
      }`,
      },
    ],
  },
  {
    path: 'frontend/src/screens/alerts/DisruptionAlertScreen.tsx',
    patches: [
      {
        from: `      await Share.share({ message: \`\${alert?.title ?? 'Alert'}\\n\${alert?.message ?? ''}\\n\\nShared via TICS\`, title: alert?.title ?? 'TICS Alert' }).catch(() => { });`,
        to: `      const fallback = [\`📍 \${trip?.title || 'Trip'}\`, \`\${alert?.title || 'Alert'}\`, alert?.message || '', '', 'Powered by TICS'].filter(Boolean).join('\\n');
      await Share.share({ message: fallback, title: alert?.title ?? 'TICS Alert' }).catch(() => { });`,
      },
    ],
  },
  {
    path: 'frontend/src/screens/lastMile/LastMileCoordinationScreen.tsx',
    patches: [
      {
        from: `      Alert.alert('Refresh failed', e?.message ?? 'Please try again.');`,
        to: `      if (e?.message === 'Unavailable' || e?.code === 'unavailable') {
        Alert.alert('Refresh limited', 'Could not reach server. Showing cached data.');
      } else {
        Alert.alert('Refresh failed', e?.message ?? 'Please try again.');
      }`,
      },
      {
        from: `      await Share.share({ message: \`Last-mile update for \${trip?.title}\`, title: trip?.title ?? 'TICS' }).catch(() => { });`,
        to: `      const fallback = [\`📍 \${trip?.title || 'Trip'}\`, \`From: \${trip?.from || 'Origin'} → To: \${trip?.to || 'Destination'}\`, '', 'Powered by TICS'].filter(Boolean).join('\\n');
      await Share.share({ message: fallback, title: trip?.title ?? 'TICS Trip' }).catch(() => { });`,
      },
    ],
  },
  {
    path: 'frontend/src/screens/monitoring/TravelMonitoringScreen.tsx',
    patches: [
      {
        from: `      showAlertModal('Refresh failed', e?.message ?? 'Please try again.', [{ text: 'OK', style: 'primary' }]);`,
        to: `      if (e?.message === 'Unavailable' || e?.code === 'unavailable') {
        showAlertModal('Refresh limited', 'Could not reach server. Showing cached data.', [{ text: 'OK', style: 'primary' }]);
      } else {
        showAlertModal('Refresh failed', e?.message ?? 'Please try again.', [{ text: 'OK', style: 'primary' }]);
      }`,
      },
      {
        from: `      showAlertModal('Share failed', e?.message ?? 'Could not generate share update.', [{ text: 'OK', style: 'primary' }]);`,
        to: `      const fallback = [\`📍 \${trip?.title || 'Trip'}\`, \`From: \${trip?.from || 'Origin'} → To: \${trip?.to || 'Destination'}\`, '', 'Powered by TICS'].filter(Boolean).join('\\n');
      try { await Share.share({ message: fallback, title: trip?.title ?? 'TICS Trip' }); } catch { }`,
      },
    ],
  },
  {
    path: 'frontend/src/screens/recommendations/RecommendationDetailsScreen.tsx',
    patches: [
      {
        from: `      await Share.share({ message: \`\${rec!.title}\\n\${rec!.message}\\n\\nShared via TICS\`, title: rec!.title }).catch(() => { });`,
        to: `      const fallback = [\`📍 \${rec?.title || 'Recommendation'}\`, rec?.message || '', '', 'Powered by TICS'].filter(Boolean).join('\\n');
      await Share.share({ message: fallback, title: rec?.title ?? 'TICS' }).catch(() => { });`,
      },
    ],
  },
];

let fixed = 0;
for (const file of files) {
  let content = fs.readFileSync(file.path, 'utf-8');
  let changed = false;
  for (const patch of file.patches) {
    if (content.includes(patch.from)) {
      content = content.replace(patch.from, patch.to);
      changed = true;
      console.log(`  ✓ Applied patch in ${file.path.split('/').pop()}`);
    } else {
      console.log(`  ✗ Patch NOT FOUND in ${file.path.split('/').pop()}`);
    }
  }
  if (changed) {
    fs.writeFileSync(file.path, content, 'utf-8');
    fixed++;
  }
}

console.log(`\nFixed ${fixed} files`);