import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // Build output and dependencies are not ours to lint.
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The client returns parsed JSON. Until response bodies are modelled from
      // the OpenAPI spec, resource methods are generic over `any` by design —
      // forcing `unknown` here would push a cast onto every caller for no
      // safety gain, since nothing validates the shape either way.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',

      // Deliberately unused bindings are marked with a leading underscore —
      // the redaction guards destructure a credential out of a payload
      // precisely so it is dropped.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // Catches a forgotten await on the async client methods, which would
      // silently swallow a rejected request.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/require-await': 'error',
    },
  },

  {
    files: ['test/**/*.ts'],
    rules: {
      // Tests deliberately construct bad input to prove it is rejected.
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',

      // node:test's `test()` and `describe()` return promises that the runner
      // owns and awaits. Flagging every one of them produced 178 errors that
      // were all the same non-problem, which is how a linter gets ignored.
      // Floating promises inside src/ are still errors, where they matter.
      '@typescript-eslint/no-floating-promises': 'off',

      // Test doubles stand in for fetch and deliberately omit await.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
    },
  },

  {
    // Not covered by tsconfig's project service: the config files, and the
    // smoke script, which deliberately lives outside the TS build because it
    // exercises the compiled output rather than the sources.
    files: ['eslint.config.js', 'tsup.config.ts', 'scripts/**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      // Without the TS project service these files lose their lib types, so
      // the Node/web globals they legitimately use have to be declared.
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },
);
