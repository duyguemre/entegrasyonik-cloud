/**
 * frontend/src/design/vuetify-defaults.ts
 *
 * ADR-0015 Karar 3.1 — Vuetify global `defaults` (A1). Nötr-ağırlıklı,
 * kurumsal-premium tasarım diline göre bileşen ailesi başına TEK kaynak.
 * `plugins/vuetify.ts` yalnızca bu modülü import eder.
 *
 * **Neden burada, `vuetify.ts` içinde değil?** Karar 3.1'in tablosu büyük ve
 * yorum gerektiriyor; ayrı dosya `plugins/vuetify.ts`'i okunur tutar ve her
 * bileşen ailesinin gerekçesini TEK yerde belgeler.
 *
 * **`label` prop'u KORUNUR** (VTextField/VSelect/…): erişilebilir ad ve
 * Playwright `getByLabel(...)` spec çapasıdır (ADR-0015 Karar 5.1 Ek A).
 * Bu dosya hiçbir bileşenin `label`/`aria-*` davranışını DEĞİŞTİRMEZ — yalnızca
 * görünüm (`variant`/`density`/`elevation`/`color`) varsayılanlarıdır.
 *
 * DS-v2 (Aşama 1): renkler (`color: 'primary'` = uygulamada aksiyon/cobalt)
 * Vuetify teması üzerinden token'lardan gelir; radius/gölge/tooltip/menü/
 * tablo başlığı görünümü `vuetify-overrides.css` rol token'larıyla
 * (`--ek-radius-control|card|popover|dialog`, `--ek-shadow-card|popover`)
 * uygulanır — Vuetify `rounded`/`elevation` prop'ları KULLANILMAZ (SASS
 * `configFile` kapalı, ADR-0011).
 */
export const vuetifyDefaults = {
  // Ripple global kapalı (ADR-0015 Karar 1.1 — "hoplama-zıplama yok").
  global: {
    ripple: false,
  },
  VBtn: {
    variant: 'flat',
    elevation: 0,
  },
  VTextField: {
    variant: 'outlined',
    density: 'compact',
    color: 'primary',
    hideDetails: 'auto',
  },
  VSelect: {
    variant: 'outlined',
    density: 'compact',
    color: 'primary',
    hideDetails: 'auto',
  },
  VAutocomplete: {
    variant: 'outlined',
    density: 'compact',
    color: 'primary',
    hideDetails: 'auto',
  },
  VCombobox: {
    variant: 'outlined',
    density: 'compact',
    color: 'primary',
    hideDetails: 'auto',
  },
  VTextarea: {
    variant: 'outlined',
    density: 'compact',
    color: 'primary',
    hideDetails: 'auto',
  },
  VCheckbox: {
    color: 'primary',
    density: 'compact',
    hideDetails: 'auto',
  },
  VSwitch: {
    color: 'primary',
    density: 'compact',
    hideDetails: 'auto',
  },
  VRadioGroup: {
    color: 'primary',
    density: 'compact',
    hideDetails: 'auto',
  },
  VCard: {
    variant: 'flat',
    border: true,
    elevation: 0,
  },
  VDataTable: {
    hover: true,
    fixedHeader: true,
    density: 'compact',
  },
  VDataTableServer: {
    hover: true,
    fixedHeader: true,
    density: 'compact',
  },
  // Durum için çıplak VChip KULLANILMAZ (EkStatusChip kullanılır — Karar 3.3);
  // bu varsayılan, mandal (rawChip) dışında kalan meşru VChip kullanımları
  // (ör. filtre etiketi) için nötr bir taban sağlar.
  VChip: {
    size: 'small',
    variant: 'tonal',
  },
  VTabs: {
    density: 'compact',
    color: 'primary',
  },
  VDialog: {
    transition: 'fade-transition',
    scrollable: true,
  },
  // DS-v2: açılan katman tetikleyiciden 6px ayrık durur (gölge nefes alır).
  VMenu: {
    transition: 'fade-transition',
    offset: 6,
  },
  VTooltip: {
    openDelay: 400,
    location: 'bottom',
  },
  VList: {
    density: 'compact',
  },
  VAlert: {
    variant: 'tonal',
    density: 'compact',
  },
  VProgressLinear: {
    color: 'primary',
    height: 2,
  },
} as const
