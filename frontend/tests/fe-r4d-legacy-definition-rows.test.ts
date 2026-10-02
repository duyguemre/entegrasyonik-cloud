import { describe, expect, it } from 'vitest'
import { toDraft, useLegacyDefinitionRows, validateDraft, type LegacyDefinitionRow } from '@/components/definitions/legacyDefinitionRows'

/** fe-r4d D5 — definitions/*DefinitionView (Ürün hariç) satır eylemleri artık bağlı. */
const sample = (name: string): LegacyDefinitionRow => ({
  id: 1,
  customer: { name, email: 'a@b.com', phone: '0505' },
  address: { desc: 'Sokak', county: 'Merkez', state: 'Karabük', country: 'Türkiye' },
  customerType: { isCompany: true, tc: 12345678901, taxId: 444, taxIssuer: 'Ankara' },
})

describe('useLegacyDefinitionRows', () => {
  it('aynı id taşıyan satırlara ayrı sıra anahtarı verir; kaynak diziyi değiştirmez', () => {
    const src = [sample('A'), sample('B')]
    const rows = useLegacyDefinitionRows(src)
    expect(rows.items.value.map((r) => r._rowKey)).toEqual([0, 1])
    rows.items.value[0].customer.name = 'X'
    expect(src[0].customer.name).toBe('A')
  })

  it('eylemler: en çok 2 (Düzenle + Sil), tehlikeli olan sonda; işlevsiz değil', () => {
    const rows = useLegacyDefinitionRows([sample('A')])
    const actions = rows.actionsFor(rows.items.value[0])
    expect(actions.map((a) => a.action)).toEqual(['edit', 'delete'])
    actions[0].onClick()
    expect(rows.editing.open).toBe(true)
    expect(rows.editing.draft?.name).toBe('A')
    actions[1].onClick()
    expect(rows.deleting.open).toBe(true)
    expect(rows.deleting.row?.customer.name).toBe('A')
  })

  it('Düzenle → Kaydet yalnız o satırı günceller (diğer aynı-id satır etkilenmez)', () => {
    const rows = useLegacyDefinitionRows([sample('A'), sample('B')])
    rows.startEdit(rows.items.value[1])
    rows.editing.draft!.name = '  Yeni ad '
    rows.editing.draft!.isCompany = false
    rows.editing.draft!.tc = '111'
    expect(rows.saveEdit()).toBe(true)
    expect(rows.editing.open).toBe(false)
    expect(rows.items.value[1].customer.name).toBe('Yeni ad')
    expect(rows.items.value[1].customerType).toMatchObject({ isCompany: false, tc: '111' })
    expect(rows.items.value[0].customer.name).toBe('A')
  })

  it('geçersiz taslak kaydedilmez; diyalog açık kalır, alan hatası görünür', () => {
    const rows = useLegacyDefinitionRows([sample('A')])
    rows.startEdit(rows.items.value[0])
    rows.editing.draft!.name = ' '
    rows.editing.draft!.email = 'gecersiz'
    expect(rows.saveEdit()).toBe(false)
    expect(rows.editing.open).toBe(true)
    expect(rows.editing.errors.name).toMatch(/—/)
    expect(rows.editing.errors.email).toMatch(/—/)
    expect(rows.items.value[0].customer.name).toBe('A')
  })

  it('Vazgeç değişikliği bırakır', () => {
    const rows = useLegacyDefinitionRows([sample('A')])
    rows.startEdit(rows.items.value[0])
    rows.editing.draft!.name = 'Z'
    rows.cancelEdit()
    expect(rows.items.value[0].customer.name).toBe('A')
  })

  it('Sil → onay yalnız seçilen satırı kaldırır', () => {
    const rows = useLegacyDefinitionRows([sample('A'), sample('B'), sample('C')])
    rows.askDelete(rows.items.value[1])
    expect(rows.confirmDelete()?.customer.name).toBe('B')
    expect(rows.deleting.open).toBe(false)
    expect(rows.items.value.map((r) => r.customer.name)).toEqual(['A', 'C'])
  })
})

describe('validateDraft / toDraft', () => {
  it('boş e-posta serbest, geçerli taslak hatasız', () => {
    expect(validateDraft({ ...toDraft(sample('A')), email: '' })).toEqual({})
  })
})
