// The rules the code is held to on top of strict TypeScript: the recommended sets, nothing about formatting (the
// house style is by hand, and a reformat would fight everyone's branches), unused code left to `tsc --noEmit`.
import js from '@eslint/js';
import ts from 'typescript-eslint';

export default ts.config(
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'assets-src/**', 'tools/**', '*.config.*'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
