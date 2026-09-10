/* Build the verification bundle, stubbing native-only modules. */
const esbuild = require('esbuild');
const fs = require('fs');

const stub = {
  name: 'stub-native',
  setup(build) {
    const natives = ['react-native', '@react-native-async-storage/async-storage', 'firebase', 'expo-location'];
    for (const m of natives) {
      build.onResolve({ filter: new RegExp('^' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }, (args) => ({
        path: args.path, namespace: 'stub',
      }));
    }
    build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: 'module.exports = new Proxy({}, { get: () => ({}), apply: () => ({}) });',
      loader: 'js',
    }));
  },
};

esbuild.build({
  entryPoints: ['scripts/verify-explore-pipeline.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  alias: { '@': '.' },
  loader: { '.jpg': 'dataurl', '.png': 'dataurl' },
  outfile: 'scripts/.verify-bundle.cjs',
  plugins: [stub],
  logLevel: 'error',
}).then(() => console.log('bundle ok')).catch((e) => { console.error(e.message); process.exit(1); });