import js from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'tools/desktop/node_modules/**', 'release/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['**/*.{ts,tsx}'], rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'no-eval': 'error', 'no-new-func': 'error' } },
  { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' } } },
  { files: ['**/*.cjs'], languageOptions: { globals: { require: 'readonly', module: 'readonly', __dirname: 'readonly', Buffer: 'readonly', process: 'readonly', console: 'readonly', URL: 'readonly', Response: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly' } }, rules: { '@typescript-eslint/no-require-imports': 'off' } },
  { files: ['desktop/ui/*.js'], languageOptions: { globals: { window: 'readonly', document: 'readonly', setInterval: 'readonly', console: 'readonly' } } },
  { files: ['src/core/**', 'src/contracts/**'], rules: { 'no-restricted-imports': ['error', { patterns: ['node:*', '../host/*', '../adapters/*', '../ui/*', '../files/*', '../store/*'] }] } }
);
