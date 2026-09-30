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
