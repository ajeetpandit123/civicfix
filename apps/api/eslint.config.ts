import type { Linter } from 'eslint';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const config: Linter.Config[] = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `_`-prefixed parameters are intentionally unused (Express arity, rest-omit).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  { ignores: ['dist/**', 'prisma/**'] },
];

export default config;
