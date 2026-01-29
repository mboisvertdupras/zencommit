import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsFiles = ['**/*.ts'];
const tsConfigs = tsPlugin.configs['flat/recommended-type-checked'].map((config) => ({
  ...config,
  files: tsFiles,
}));

export default [
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**'] },
  {
    languageOptions: {
      globals: {
        ...globals.es2022,
        ...globals.node,
        Bun: 'readonly',
      },
    },
  },
  js.configs.recommended,
  ...tsConfigs,
  {
    files: tsFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
    },
  },
  prettierConfig,
];
