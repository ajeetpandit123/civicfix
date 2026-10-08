import type { Linter } from 'eslint';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const config: Linter.Config[] = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { ignores: ['dist/**'] },
];

export default config;
