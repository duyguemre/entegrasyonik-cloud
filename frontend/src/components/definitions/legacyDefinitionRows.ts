/**
 * fe-r4d D5 — `views/secure/definitions/*DefinitionView` (Marka/Etiket/Seçenek/Müşteri/Fatura/Sipariş/İade; Ürün HARİÇ)
 * satır eylemlerinin tek kaynağı. Bu yedi ekran B5-1'den beri sabit ÖRNEK satırlarla çizilir (backend uç noktası yok,
 * `help/pageHelp.ts` "sabit örnek veri; backend isteği yok"); eylemler önceden `onClick: () => {}` idi.
 *
 * Bağlantı (istek ATILMAZ — ekranın kendi örnek verisi üzerinde, sekme ömrü boyunca):
 *  - Düzenle → form diyaloğu satırın kopyasıyla açılır; Kaydet doğrular (ad zorunlu, e-posta biçimi), satırı günceller.
 *  - Sil     → tehlikeli onay ("'<ad>' satırı silinsin mi?"), onaylanınca satır listeden düşer.
 * Satırlar aynı `id`yi taşıyabildiği için (örnek veride hepsi 1) kimlik, satıra eklenen sıra anahtarıdır (`_rowKey`).
 */
import { reactive, ref } from 'vue'

export interface LegacyDefinitionRow {
  id: number
  customer: { name: string; email: string; phone: string }
  address: { desc: string; county: string; state: string; country: string }
  customerType: { isCompany: boolean; tc: number | string; taxId: number | string; taxIssuer: string }
}

export type KeyedRow = LegacyDefinitionRow & { _rowKey: number }

export interface LegacyRowDraft {
  name: string
  email: string
  phone: string
  desc: string
  county: string
  state: string
  country: string
  isCompany: boolean
  tc: string
  taxId: string
  taxIssuer: string
}

export interface RowActionItem {
  key: string
  action: 'edit' | 'delete'
  label: string
  onClick: () => void
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function toDraft(row: LegacyDefinitionRow): LegacyRowDraft {
  return {
    name: row.customer.name,
    email: row.customer.email,
    phone: row.customer.phone,
    desc: row.address.desc,
    county: row.address.county,
    state: row.address.state,
    country: row.address.country,
    isCompany: row.customerType.isCompany,
    tc: String(row.customerType.tc ?? ''),
    taxId: String(row.customerType.taxId ?? ''),
    taxIssuer: row.customerType.taxIssuer,
  }
}

/** Alan → hata metni ("<ne oldu> — <ne yapılmalı>"); boş nesne = geçerli. */
export function validateDraft(draft: LegacyRowDraft): Partial<Record<keyof LegacyRowDraft, string>> {
  const errors: Partial<Record<keyof LegacyRowDraft, string>> = {}
  if (!draft.name.trim()) errors.name = 'Ad boş olamaz — kaydı tanımlayan adı yazın.'
  if (draft.email.trim() && !EMAIL_RE.test(draft.email.trim())) errors.email = 'E-posta biçimi geçersiz — ad@alanadi.com biçiminde yazın.'
  return errors
}

export function useLegacyDefinitionRows(initial: LegacyDefinitionRow[]) {
  const items = ref<KeyedRow[]>(initial.map((row, index) => ({ ...clone(row), _rowKey: index })))

  const editing = reactive<{ open: boolean; key: number | null; draft: LegacyRowDraft | null; errors: Partial<Record<keyof LegacyRowDraft, string>> }>({
    open: false,
    key: null,
    draft: null,
    errors: {},
  })
  const deleting = reactive<{ open: boolean; row: KeyedRow | null }>({ open: false, row: null })

  const startEdit = (row: KeyedRow) => {
    editing.key = row._rowKey
    editing.draft = toDraft(row)
    editing.errors = {}
    editing.open = true
  }

  /** Doğrular; geçerliyse satırı günceller ve `true` döner. */
  const saveEdit = (): boolean => {
    const draft = editing.draft
    if (!draft || editing.key === null) return false
    editing.errors = validateDraft(draft)
    if (Object.keys(editing.errors).length) return false
    const key = editing.key
    if (!items.value.some((r) => r._rowKey === key)) return false
    // Satır nesnesi değiştirilir (yerinde değil): tablo öğe listesini dizi kimliğinden yeniden kurar.
    items.value = items.value.map((r) =>
      r._rowKey !== key
        ? r
        : {
            ...r,
            customer: { name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim() },
            address: { desc: draft.desc.trim(), county: draft.county.trim(), state: draft.state.trim(), country: draft.country.trim() },
            customerType: { isCompany: draft.isCompany, tc: draft.tc.trim(), taxId: draft.taxId.trim(), taxIssuer: draft.taxIssuer.trim() },
          },
    )
    editing.open = false
    return true
  }

  const cancelEdit = () => {
    editing.open = false
  }

  const askDelete = (row: KeyedRow) => {
    deleting.row = row
    deleting.open = true
  }

  /** Onaylanan satırı listeden çıkarır; çıkarılan satırı döner. */
  const confirmDelete = (): KeyedRow | null => {
    const row = deleting.row
    if (!row) return null
    items.value = items.value.filter((r) => r._rowKey !== row._rowKey)
    deleting.open = false
    return row
  }

  const actionsFor = (row: KeyedRow): RowActionItem[] => [
    { key: 'edit', action: 'edit', label: 'Düzenle', onClick: () => startEdit(row) },
    { key: 'delete', action: 'delete', label: 'Sil', onClick: () => askDelete(row) },
  ]

  return { items, editing, deleting, startEdit, saveEdit, cancelEdit, askDelete, confirmDelete, actionsFor }
}

export type LegacyDefinitionRowsController = ReturnType<typeof useLegacyDefinitionRows>
