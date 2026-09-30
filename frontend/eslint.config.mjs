// ESLint (flat config) — ADR-0017 §10 (CI/lint çıtası) + Karar 1.8 (frontend log/hata mimarisi).
// Strateji backend ile AYNI desen (`backend/eslint.config.mjs`): mevcut kod tabanı hata vermez;
// `no-console` UYARIdır ve dosya başına MANDALLIDIR (`scripts/check-no-console-baseline.js` /
// `npm run test:no-console-ratchet`) — mevcut sayı ARTAMAZ, azalma serbest. Tip-farkındalıklı
// (type-aware) linting KASITLI olarak açılmadı (vue-tsc zaten `typecheck` betiğinde ayrı çalışıyor;
// burada amaç yalnızca stil/`no-console` çıtası, derleme hızını/karmaşıklığı artırmamak).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.vite/**',
      'src/design/tokens/dist/**', // üretilmiş CSS/JS token çıktısı (site sözleşme yolu)
      'packages/ui/src/tokens/dist/**', // üretilmiş CSS token çıktısı
      'packages/ui/src/theme/theme-boot.js', // tarayıcı önyükleme betiği (public/ kopyalarıyla bayt bayt aynı)
      '*.config.js',
      '*.config.mjs',
      '*.config.cjs',
      '*.config.mts',
      'main.js', // Electron ana süreç — ayrı bir kurallar kümesi gerekir (bkz. rapor notu)
      'scripts/**', // operasyonel Node betikleri (CommonJS)
      'e2e/**', // Playwright — ayrı bir iş
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // `flat/essential` (yalnızca doğruluk/hata önleme kuralları) bilinçli tercih — `strongly-recommended`/
  // `recommended` katmanları (html-indent, max-attributes-per-line vb.) SAF STİL kuralları olup mevcut
  // ~1200 dosyada yüzlerce hataya yol açar; backend ile aynı "error kuralı = 0 ihlal" ilkesi (bkz. dosya
  // başlığı) bunu dışlar. Stil göçü ayrı bir iştir (ADR-0011 literal-stil mandalı zaten bu alanı kapsıyor).
  ...pluginVue.configs['flat/essential'],
  {
    files: ['src/**/*.vue', 'packages/ui/src/**/*.vue'],
    languageOptions: {
      parserOptions: {
        // `<script lang="ts">` / `<script setup lang="ts">` bloklarını `vue-eslint-parser`
        // TypeScript ayrıştırıcısına devretmeden ayrıştıramaz (aksi halde `interface`/`type`
        // gibi TS'e özgü sözdizimi "reserved keyword" parse hatası verir).
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ['src/**/*.ts', 'src/**/*.vue', 'packages/ui/src/**/*.ts', 'packages/ui/src/**/*.vue'],
    languageOptions: {
      parserOptions: {
        // Tip-farkındalıklı DEĞİL (yukarıdaki not); `.vue` dosyalarında `<script setup lang="ts">`
        // ayrıştırması için `vue-eslint-parser` (pluginVue essential config'i zaten kurar).
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // --- Hedef çıta (mevcut ihlaller mandallı uyarı; bkz. quality/no-console-baseline.json) ---
      'no-console': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],

      // --- Kod tabanının mevcut biçimiyle çatışan, düşük değerli/yüksek-ihlalli kurallar
      //     (bilinçli kapalı/uyarı — backend `eslint.config.mjs` ile aynı ilke) ---
      '@typescript-eslint/no-explicit-any': 'off', // geniş `any` kullanımı; ayrı bir göç konusu
      'vue/multi-word-component-names': 'off', // mevcut adlandırma kuralı bu değil
      'vue/no-v-html': 'warn',
      'vue/require-default-prop': 'off',
      // TS dosyalarında `no-undef` yanlış-pozitif üretir (global tipler/ambient bildirimler,
      // typescript-eslint resmi tavsiyesi: temel kural kapatılır — tsc zaten bunu denetler).
      'no-undef': 'off',
      'vue/no-mutating-props': 'warn', // Vuetify v-model + props deseni yaygın (mevcut ~195)
      'vue/no-unused-vars': 'warn',
      'vue/valid-v-slot': 'warn', // Vuetify eski `v-slot:x.y` deseni (görsel fark YOK, ayrı göç)
      'vue/require-v-for-key': 'warn',
      'vue/no-use-v-if-with-v-for': 'warn',
      'vue/valid-v-on': 'warn',
      'vue/valid-v-for': 'warn',
      'vue/valid-v-else': 'warn',
      'vue/valid-v-if': 'warn',
      'vue/no-side-effects-in-computed-properties': 'warn',
      'vue/no-useless-template-attributes': 'warn',
      'vue/no-ref-as-operand': 'warn',
      'vue/no-parsing-error': 'warn',
      'no-unsafe-finally': 'warn',
      'no-useless-catch': 'warn',
      'no-unsafe-optional-chaining': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-wrapper-object-types': 'warn',
      '@typescript-eslint/no-unused-expressions': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
      'no-empty': 'warn',
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
      'no-prototype-builtins': 'warn',
      'no-constant-condition': ['warn', { checkLoops: false }],
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
  {
    // logger.ts: `no-console`'un TEK meşru kaçış noktası (bkz. dosya başlığı yorumu).
    files: ['src/composables/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
