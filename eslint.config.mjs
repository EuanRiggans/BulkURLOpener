import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typescriptFiles = ['**/*.ts', '**/*.tsx'];

export default defineConfig([
  globalIgnores([
    'node_modules/**',
    '.wxt/**',
    '.output/**',
    'app/**',
    'build/**',
    'dist/**',
    'main.js',
    'utilities/**',
    'test/spec.js',
  ]),
  {
    ...js.configs.recommended,
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: { globals: globals.node },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: typescriptFiles,
  })),
  {
    files: typescriptFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message: 'Use text nodes or Preact rendering, not raw HTML sinks.',
        },
        {
          selector: "MemberExpression[property.name='outerHTML']",
          message: 'Use text nodes or Preact rendering, not raw HTML sinks.',
        },
        {
          selector: "MemberExpression[property.name='insertAdjacentHTML']",
          message: 'Use text nodes or Preact rendering, not raw HTML sinks.',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message:
            'Raw HTML injection is not permitted in extension components.',
        },
      ],
    },
  },
  {
    files: ['test/characterization/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
]);
