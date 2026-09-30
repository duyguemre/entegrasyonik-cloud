// DS-v2 Aşama 6b — Standart 10: EYLEM İKONU KAYIT DEFTERİ (tek kaynak).
//
// Kural: aynı iş = aynı ikon, aynı boyut (EkButton `sm` → 16px glif), aynı ton, aynı ipucu dili.
//   • Glif: tek aile MDI, outline tercih.
//   • Boyut: satır/araç çubuğu eylemleri `EkActionButton` (EkButton ghost sm, 32px kutu, 16px glif).
//   • Ton: nötr (`ghost`); YALNIZ `danger: true` olan eylemler tehlikeli tonda (hata rengi) ve ONAY ister.
//   • İpucu dili: "<Fiil>" ya da "<nesne> <fiil>" — ör. "Sil", "Siparişi görüntüle"; aria-label ile aynı.
// `aliases`: aynı işi yapan ESKİ glifler. `scripts/pattern-counts.js` (offRegistryIcon) bunları sayar ve mandal artışı
// engeller; `tests/action-icons.test.ts` kayıt defterinin tutarlılığını (tek glif ↔ tek iş, ad çakışması yok) korur.

export interface ActionIconDef {
  icon: string
  /** Varsayılan ipucu / aria-label fiili. */
  label: string
  /** Tehlikeli (geri alınamaz) eylem: hata tonu + onay diyaloğu zorunlu. */
  danger?: boolean
  /** Varsa klavye kısayolu (yalnız gösterim; dinleyici ekranın kendisindedir). */
  shortcut?: string
  /** Aynı iş için eskiden kullanılan glifler (mandal sayar; yeni kodda yasak). */
  aliases?: readonly string[]
}

export const ACTION_ICONS = {
  add: { icon: 'mdi-plus', label: 'Ekle', aliases: ['mdi-plus-circle', 'mdi-plus-box'] },
  edit: { icon: 'mdi-pencil-outline', label: 'Düzenle', aliases: ['mdi-pencil', 'mdi-note-edit-outline', 'mdi-file-document-edit-outline', 'mdi-pencil-box', 'mdi-pencil-box-outline', 'mdi-square-edit-outline'] },
  delete: { icon: 'mdi-trash-can-outline', label: 'Sil', danger: true, aliases: ['mdi-delete', 'mdi-delete-outline', 'mdi-delete-forever', 'mdi-delete-alert', 'mdi-delete-alert-outline', 'mdi-trash-can', 'mdi-delete-sweep', 'mdi-delete-sweep-outline', 'mdi-delete-empty'] },
  cancel: { icon: 'mdi-cancel', label: 'İptal et', danger: true },
  copy: { icon: 'mdi-content-copy', label: 'Kopyala' },
  view: { icon: 'mdi-eye-outline', label: 'Görüntüle', aliases: ['mdi-eye', 'mdi-table-eye'] },
  openExternal: { icon: 'mdi-open-in-new', label: 'Yeni pencerede aç', aliases: ['mdi-open-in-app'] },
  download: { icon: 'mdi-download-outline', label: 'İndir', aliases: ['mdi-download', 'mdi-cloud-download', 'mdi-cloud-download-outline'] },
  upload: { icon: 'mdi-upload-outline', label: 'Yükle', aliases: ['mdi-upload', 'mdi-cloud-upload', 'mdi-cloud-upload-outline', 'mdi-progress-upload'] },
  refresh: { icon: 'mdi-refresh', label: 'Yenile', shortcut: 'Alt+R', aliases: ['mdi-cached', 'mdi-autorenew', 'mdi-reload'] },
  sync: { icon: 'mdi-sync', label: 'Eşitle' },
  close: { icon: 'mdi-close', label: 'Kapat', aliases: ['mdi-window-close', 'mdi-close-thick'] },
  save: { icon: 'mdi-content-save-outline', label: 'Kaydet', aliases: ['mdi-content-save'] },
  search: { icon: 'mdi-magnify', label: 'Ara' },
  filter: { icon: 'mdi-filter-variant', label: 'Filtrele', aliases: ['mdi-filter-outline', 'mdi-filter'] },
  clearFilters: { icon: 'mdi-filter-remove-outline', label: 'Filtreleri temizle', aliases: ['mdi-filter-off-outline', 'mdi-filter-remove'] },
  more: { icon: 'mdi-dots-horizontal', label: 'Diğer işlemler', aliases: ['mdi-dots-vertical', 'mdi-dots-horizontal-circle-outline'] },
  print: { icon: 'mdi-printer-outline', label: 'Yazdır', aliases: ['mdi-printer'] },
  exportFile: { icon: 'mdi-file-export-outline', label: 'Dışa aktar', aliases: ['mdi-database-export-outline', 'mdi-export'] },
  importFile: { icon: 'mdi-file-import-outline', label: 'İçe aktar', aliases: ['mdi-database-import-outline', 'mdi-import'] },
  settings: { icon: 'mdi-cog-outline', label: 'Ayarlar', aliases: ['mdi-cog'] },
  info: { icon: 'mdi-information-outline', label: 'Bilgi', aliases: ['mdi-information'] },
  help: { icon: 'mdi-help-circle-outline', label: 'Yardım', aliases: ['mdi-help-circle'] },
  back: { icon: 'mdi-arrow-left', label: 'Geri' },
  approve: { icon: 'mdi-check', label: 'Onayla' },
  reject: { icon: 'mdi-close-circle-outline', label: 'Reddet', danger: true },
  send: { icon: 'mdi-send-outline', label: 'Gönder', aliases: ['mdi-send'] },
  link: { icon: 'mdi-link-variant', label: 'Bağlantı', aliases: ['mdi-link'] },
} as const satisfies Record<string, ActionIconDef>

export type ActionKey = keyof typeof ACTION_ICONS

/** Kısa erişim: `icons.delete` → 'mdi-trash-can-outline'. */
export const icons = Object.fromEntries(Object.entries(ACTION_ICONS).map(([k, v]) => [k, v.icon])) as { [K in ActionKey]: (typeof ACTION_ICONS)[K]['icon'] }

/** Eski glif → kanonik glif (mandal/dönüşüm için). */
export const ICON_ALIAS_MAP: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.values(ACTION_ICONS).flatMap((d) => ((d as ActionIconDef).aliases ?? []).map((a) => [a, d.icon] as const)),
  ),
)

/** Eylem ipucu: "Sil" ya da nesneyle "Siparişi sil" — nesne verilirse fiil küçük harfle eklenir. */
export function actionLabel(action: ActionKey, object?: string): string {
  const verb = ACTION_ICONS[action].label
  return object ? `${object} ${verb.charAt(0).toLocaleLowerCase('tr-TR')}${verb.slice(1)}` : verb
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// A8 — İKON STİLİ STANDARDI (tüm uygulama)
//   • Set: YALNIZ MDI (`@mdi/font`), tek ağırlık (MDI 24px ızgarada 2px çizgi). Başka set (FA, Material Icons, SVG
//     çizim) yok — envanter: `scripts/icon-inventory.js`.
//   • Stil: ÇİZGİ (outline). Aynı glifin `-outline` sürümü varsa dolgu sürümü KULLANILMAZ; tek istisna
//     `STATE_FILLED` (dolgunun kendisi durum bildirir: favori yıldızı, işaretli kutu, nokta) ve çizgi
//     ilkelleri (`check`, `close`, `plus`, `menu`, `chevron-*`, `arrow-*` … — dolgusu olmayan şekiller).
//     Bekçi: `tests/icon-style.test.ts` (kaynakta dolgu+çizgi karışımı 0).
//   • Boyut: yazıyla orantılı rol ölçeği (`--ek-icon-xs…2xl`, DESIGN_SYSTEM §3). Üst bar: 20px glif / 36px dokunma
//     alanı (`SHELL_ICON_SIZE`), satır/araç çubuğu eylemleri 16px / 32px (`EkActionButton`).
//   • Renk: bulunduğu yüzeyin ikincil metin tonu (`content-muted`; üst barda `chrome-text-muted`); hover/etkin →
//     birincil metin tonu. Dolgu renkli ikon yalnız `EkIconTile` kapsülünde.
//   • Arka uçtan gelen menü ikonları (menü kaydı DB'de) görüntülenirken `outlineIcon()` ile normalize edilir.

/** Dolgu glif → aynı şeklin çizgi sürümü (kaynakta ve menü kaydında görülenler; hepsi @mdi/font'ta mevcut — test). */
export const FILLED_TO_OUTLINE: Readonly<Record<string, string>> = Object.freeze({
  'mdi-home': 'mdi-home-outline',
  'mdi-alert': 'mdi-alert-outline',
  'mdi-alert-circle': 'mdi-alert-circle-outline',
  'mdi-alert-decagram': 'mdi-alert-decagram-outline',
  'mdi-alert-octagon': 'mdi-alert-octagon-outline',
  'mdi-arrow-right-circle': 'mdi-arrow-right-circle-outline',
  'mdi-basket-check': 'mdi-basket-check-outline',
  'mdi-bell': 'mdi-bell-outline',
  'mdi-bookmark-check': 'mdi-bookmark-check-outline',
  'mdi-calendar': 'mdi-calendar-outline',
  'mdi-calendar-clock': 'mdi-calendar-clock-outline',
  'mdi-calendar-end': 'mdi-calendar-end-outline',
  'mdi-calendar-start': 'mdi-calendar-start-outline',
  'mdi-account': 'mdi-account-outline',
  'mdi-account-circle': 'mdi-account-circle-outline',
  'mdi-account-group': 'mdi-account-group-outline',
  'mdi-account-multiple': 'mdi-account-multiple-outline',
  'mdi-cart': 'mdi-cart-outline',
  'mdi-cart-variant': 'mdi-cart-outline',
  'mdi-check-circle': 'mdi-check-circle-outline',
  'mdi-check-decagram': 'mdi-check-decagram-outline',
  'mdi-checkbox-multiple-marked': 'mdi-checkbox-multiple-marked-outline',
  'mdi-clock': 'mdi-clock-outline',
  'mdi-clock-check': 'mdi-clock-check-outline',
  'mdi-close-box': 'mdi-close-box-outline',
  'mdi-close-circle': 'mdi-close-circle-outline',
  'mdi-close-octagon': 'mdi-close-octagon-outline',
  'mdi-database-import': 'mdi-file-import-outline',
  'mdi-email': 'mdi-email-outline',
  'mdi-file-cancel': 'mdi-file-cancel-outline',
  'mdi-file-clock': 'mdi-file-clock-outline',
  'mdi-file-document': 'mdi-file-document-outline',
  'mdi-file-excel-box': 'mdi-file-excel-box-outline',
  'mdi-filter-cog': 'mdi-filter-cog-outline',
  'mdi-flash': 'mdi-flash-outline',
  'mdi-folder-multiple-plus': 'mdi-folder-multiple-plus-outline',
  'mdi-heart': 'mdi-heart-outline',
  'mdi-image-off': 'mdi-image-off-outline',
  'mdi-label-variant': 'mdi-label-variant-outline',
  'mdi-layers-triple': 'mdi-layers-triple-outline',
  'mdi-message-reply-text': 'mdi-message-reply-text-outline',
  'mdi-message-text': 'mdi-message-text-outline',
  'mdi-palette': 'mdi-palette-outline',
  'mdi-palette-swatch': 'mdi-palette-swatch-outline',
  'mdi-pause-circle': 'mdi-pause-circle-outline',
  'mdi-play': 'mdi-play-outline',
  'mdi-printer-off': 'mdi-printer-off-outline',
  'mdi-receipt-text': 'mdi-receipt-text-outline',
  'mdi-receipt-text-check': 'mdi-receipt-text-check-outline',
  'mdi-receipt-text-plus': 'mdi-receipt-text-plus-outline',
  'mdi-rocket-launch': 'mdi-rocket-launch-outline',
  'mdi-shape': 'mdi-shape-outline',
  'mdi-shield-account': 'mdi-shield-account-outline',
  'mdi-store': 'mdi-store-outline',
  'mdi-store-check': 'mdi-store-check-outline',
  'mdi-store-clock': 'mdi-store-clock-outline',
  'mdi-store-remove': 'mdi-store-remove-outline',
  'mdi-storefront': 'mdi-storefront-outline',
  'mdi-tag': 'mdi-tag-outline',
  'mdi-tag-multiple': 'mdi-tag-multiple-outline',
  'mdi-tag-off': 'mdi-tag-off-outline',
  'mdi-toggle-switch': 'mdi-toggle-switch-outline',
  'mdi-truck': 'mdi-truck-outline',
  'mdi-truck-delivery': 'mdi-truck-delivery-outline',
  ...Object.fromEntries(Object.entries(ICON_ALIAS_MAP)),
})

/** Dolgunun kendisi DURUM bildirdiği için bilinçli dolgu kalan glifler (favori açık, işaretli kutu, durum noktası). */
export const STATE_FILLED: readonly string[] = ['mdi-star', 'mdi-checkbox-marked', 'mdi-circle', 'mdi-radiobox-marked', 'mdi-checkbox-blank-circle']

/** Görüntüleme normalizasyonu: bilinen dolgu glif → çizgi sürümü; bilinmeyen/boş aynen döner. */
export function outlineIcon<T extends string | undefined | null>(name: T): T {
  if (!name) return name
  return ((FILLED_TO_OUTLINE[name as string] ?? name) as T)
}

/** Üst bar (kabuk) ikonları — TEK standart: aynı set/ağırlık, 20px glif, 36px dokunma alanı, `chrome-text-muted` → hover `chrome-text`. */
export const SHELL_ICONS = {
  menu: 'mdi-menu',
  search: 'mdi-magnify',
  notifications: 'mdi-bell-outline',
  help: 'mdi-help-circle-outline',
  accountChevron: 'mdi-chevron-down',
} as const

export const SHELL_ICON_SIZE = { glyph: 20, hit: 36 } as const
