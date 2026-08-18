import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const tsFiles = ['**/*.{ts,tsx}'];
const vitestGlobals = globals.vitest || {
  afterAll: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  it: 'readonly',
  test: 'readonly',
  vi: 'readonly',
};
const playwrightGlobals = globals.playwright || {
  browser: 'readonly',
  context: 'readonly',
  expect: 'readonly',
  page: 'readonly',
  test: 'readonly',
};

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/playwright-report/**',
      '**/storybook-static/**',
      '**/landing/**',
      // Seed generation (auto-generated files)
      'test/seed-generation/**',
      'packages/db/prisma/seed-archives/**',
      'packages/db/prisma/seed.ts',
      'packages/db/prisma/seed.backup.ts',
      'packages/db/prisma/creds.ts',
      // Test results
      'test/results/**',
      'test-results/**',
      // Claude commands
      '.claude/**',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
  js.configs.recommended,
  {
    files: tsFiles,
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['packages/{api,mcp,db}/**/*.{ts,js}', 'test/**/*.{ts,js}', 'vitest.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        URL: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        RequestInit: 'readonly',
      },
    },
  },
  {
    files: [
      'test/**/*.{ts,tsx,js,jsx}',
      'packages/**/__tests__/**/*.{ts,tsx,js,jsx}',
      'test/**/*.spec.{ts,tsx,js,jsx}',
      'test/**/*.test.{ts,tsx,js,jsx}',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...vitestGlobals,
      },
    },
  },
  {
    files: ['test/e2e/**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...playwrightGlobals,
      },
    },
  },
  {
    files: ['scripts/**/*.{js,cjs,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  prettier,
];
