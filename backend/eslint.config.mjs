// ESLint (flat config) — Faz 0 / B-R4 (ADR-0017 §10: CI/lint çıtası).
// Strateji: MEVCUT kod tabanı hata vermez; her kural ya 'error' ve 0 ihlalli ya da 'warn' ve MANDALLI
// (quality/baseline.json — `npm run ratchet`: kural başına ihlal sayısı ARTAMAZ, azalırsa baseline güncellenir).
// `no-console` uyarıdır ve dosya başına mandallıdır (mevcut sayı artamaz; ADR-0017 §Karar A.3).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'dev-tools/**', // operasyonel Node betikleri (CommonJS JS) — ayrı bir kurallar kümesi gerekir
      '*.config.js',
      '*.config.mjs',
      '*.config.cjs',
      '.dependency-cruiser.cjs',
      'tests/setup/**', // jest setupFiles (CommonJS JS)
      'tests/tools/**', // test çalıştırıcı betikleri (CommonJS JS; docs/TESTING.md)
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['entegrasyonik.ts', 'src/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // --- Yeni kod için hedeflenen çıta (mevcut ihlaller mandallı uyarı) ---
      'no-console': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': ['warn', { checksVoidReturn: { arguments: false, attributes: false } }],
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],

      // --- Kod tabanının mevcut biçimiyle çatışan, düşük değerli kurallar (bilinçli kapalı/uyarı) ---
      '@typescript-eslint/no-explicit-any': 'off', // ≥1886 satır `any`; şema/Zod göçüyle azalacak (audit MM-16)
      '@typescript-eslint/no-require-imports': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-namespace': 'warn',
      '@typescript-eslint/no-wrapper-object-types': 'warn',
      'no-useless-catch': 'warn', // `catch (e) { throw e }` deseni ≥139 yerde (audit); RPC sınıflarında try/catch sarmalayıcıları
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
      'no-case-declarations': 'warn',
      'no-async-promise-executor': 'warn',
      'no-control-regex': 'warn',
      'no-inner-declarations': 'warn',
      'no-constant-condition': ['warn', { checkLoops: false }], // `while (true)` orkestratör döngüleri (audit MM-13)
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
  {
    // ADR-0024 P4 / F-06: `src/api/**` console kullanımı sıfıra indi (yapılandırılmış `eventLog`); geri dönüş engellenir.
    files: ['src/api/**/*.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    // Testler: yazım kolaylığı için gevşek; yalnızca gerçek hata sınıfı kurallar.
    files: ['tests/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-empty': 'off',
      'no-useless-catch': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      'no-useless-escape': 'off',
      'no-prototype-builtins': 'off',
      'no-var': 'off',
      'prefer-const': 'off',
      'no-control-regex': 'off',
      'no-unexpected-multiline': 'off',
    },
  },
);
