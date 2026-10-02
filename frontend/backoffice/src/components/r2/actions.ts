/**
 * BO2-50 — backoffice EYLEM SÖZLÜĞÜ (tek kaynak). Aynı iş her sayfada aynı ikon + aynı etiket + aynı varyantla çizilir.
 * İkonlar ortak paketin kayıt defterinden (`@entegrasyonik/ui/icons` ACTION_ICONS) türetilir; backoffice'e özgü fiiller
 * (yeniden dene, ayrıntı, bağlantı) burada eklenir. Ekran ikon/ton SEÇMEZ: `<BoAction kind="refresh" … />`.
 *
 * Varyant kuralı (CONSOLE_IDENTITY ilke 5): sayfa başlığı eylemleri `secondary`; ekranın TEK ana işi `primary`
 * (ör. "Yeni duyuru"); satır eylemleri `ghost` (ikon düğme); yıkıcı iş `danger-quiet` (onay diyaloğu açar, ayraçla ayrık).
 */
import { ACTION_ICONS } from '@entegrasyonik/ui/icons'

export type BoActionTone = 'primary' | 'secondary' | 'ghost' | 'danger-quiet'

export interface BoActionDef {
  icon: string
  label: string
  tone: BoActionTone
  /** Yıkıcı: onay diyaloğu (DangerActionDialog / GuardedDialog) zorunlu; satırda ayraçla ayrılır. */
  danger?: boolean
  /** Klavye kısayolu ipucu (varsa). */
  shortcut?: string
}

export const BO_ACTIONS = {
  refresh: { icon: ACTION_ICONS.refresh.icon, label: 'Yenile', tone: 'secondary', shortcut: 'Alt+R' },
  edit: { icon: ACTION_ICONS.edit.icon, label: 'Düzenle', tone: 'secondary' },
  delete: { icon: ACTION_ICONS.delete.icon, label: 'Sil', tone: 'danger-quiet', danger: true },
  discard: { icon: ACTION_ICONS.delete.icon, label: 'At', tone: 'danger-quiet', danger: true },
  cancel: { icon: ACTION_ICONS.cancel.icon, label: 'İptal et', tone: 'danger-quiet', danger: true },
  detail: { icon: 'mdi-arrow-right', label: 'Ayrıntı', tone: 'secondary' },
  view: { icon: ACTION_ICONS.view.icon, label: 'Görüntüle', tone: 'secondary' },
  export: { icon: ACTION_ICONS.exportFile.icon, label: 'Dışa aktar', tone: 'secondary' },
  download: { icon: ACTION_ICONS.download.icon, label: 'İndir', tone: 'secondary' },
  retry: { icon: 'mdi-replay', label: 'Yeniden dene', tone: 'secondary' },
  add: { icon: ACTION_ICONS.add.icon, label: 'Ekle', tone: 'primary' },
  copy: { icon: ACTION_ICONS.copy.icon, label: 'Kopyala', tone: 'ghost' },
  link: { icon: ACTION_ICONS.link.icon, label: 'Bağlantı', tone: 'secondary' },
  filter: { icon: ACTION_ICONS.filter.icon, label: 'Filtrele', tone: 'secondary' },
  clearFilters: { icon: ACTION_ICONS.clearFilters.icon, label: 'Filtreleri temizle', tone: 'ghost' },
  openExternal: { icon: ACTION_ICONS.openExternal.icon, label: 'Yeni pencerede aç', tone: 'ghost' },
  more: { icon: ACTION_ICONS.more.icon, label: 'Diğer işlemler', tone: 'ghost' },
  save: { icon: ACTION_ICONS.save.icon, label: 'Kaydet', tone: 'primary' },
  // bo-r2b: sayfa taşımalarında çıkan backoffice fiilleri (yerel EkButton kalmasın).
  send: { icon: ACTION_ICONS.send.icon, label: 'Gönder', tone: 'secondary' },
  rollback: { icon: 'mdi-restore', label: 'Geri al', tone: 'secondary' },
  enable: { icon: 'mdi-check-circle-outline', label: 'Etkinleştir', tone: 'secondary' },
  reset: { icon: 'mdi-lock-reset', label: 'Sıfırla', tone: 'danger-quiet', danger: true },
  flush: { icon: 'mdi-broom', label: 'Boşalt', tone: 'danger-quiet', danger: true },
} as const satisfies Record<string, BoActionDef>

export type BoActionKind = keyof typeof BO_ACTIONS

/**
 * "Sil" ya da nesneyle "Duyuruyu sil" — nesne verilirse fiil küçük harfle eklenir (erişilebilir ad).
 * `detail` bir isimdir ("Ayrıntı"), fiil değil: nesneyle "<nesne> ayrıntılarını aç" olur (bo-wdg; eski "X ayrıntı"
 * Türkçe değildi). Nesne tamlayan ekiyle verilir: "Poyraz Outdoor aboneliğinin" → "Poyraz Outdoor aboneliğinin
 * ayrıntılarını aç". Satır bağlantılarında nesne satıra özgü olmalı (aynı adlı bağlantı listesi yasak).
 */
export function boActionLabel(kind: BoActionKind, object?: string): string {
  const verb = BO_ACTIONS[kind].label
  if (!object) return verb
  if (kind === 'detail') return `${object} ayrıntılarını aç`
  return `${object} ${verb.charAt(0).toLocaleLowerCase('tr-TR')}${verb.slice(1)}`
}
