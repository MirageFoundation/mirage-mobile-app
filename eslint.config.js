// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      'reference/**',
      'ios/**',
      'android/**',
      '.expo/**',
      'tools/pow-test/**',
    ],
  },
  {
    // eslint-config-expo 56 ships the react-hooks v6 "compiler" preset.
    // Those rules are incompatible with idiomatic Reanimated shared-value
    // usage (sv.value writes, refs during render for animation handles), so
    // keep the classic rules-of-hooks/exhaustive-deps baseline instead.
    rules: {
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/set-state-in-render': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/component-hook-factories': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/incompatible-library': 'off',
      'react-hooks/globals': 'off',
      'react-hooks/unsupported-syntax': 'off',
      'react-hooks/gating': 'off',
      'react-hooks/config': 'off',
      // New in the upgraded config; keep the previous lint baseline.
      'react/no-unescaped-entities': 'off',
      'import/no-named-as-default': 'off',
    },
  },
]);
