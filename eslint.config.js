import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'node_modules/**', '**/*.cjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module', ecmaVersion: 'latest' }
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'complexity': ['warn', 10],
      'prefer-const': 'warn'
    }
  },
  {
    files: ['src/transform/cleanupRules/**/*.ts', 'src/services/markdownCleanupService.ts'],
    rules: {
      // Special rules for cleanup modules
      'complexity': ['error', 8], // Stricter complexity for cleanup rules
      '@typescript-eslint/explicit-function-return-type': 'warn'
    }
  }
];
