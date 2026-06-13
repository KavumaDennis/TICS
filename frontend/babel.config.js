module.exports = function (api) {
  api.cache(true);

  return {
    // `nativewind/babel` is a preset (it returns `{ plugins: [...] }`), not a plugin.
    presets: ['babel-preset-expo', 'nativewind/babel'],
    plugins: [
      'react-native-reanimated/plugin', // MUST be last
    ],
  };
};
