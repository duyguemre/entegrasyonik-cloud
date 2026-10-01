// fe-r3d — K49 onaylı P06 / P11: menü sunum düzeni (saf; menü verisi backend'de, erişim kaynağı değişmez).
import { describe, expect, it } from 'vitest'
import { inheritedIcon, regroupMenu, shapeGroupLinks, SETTINGS_GROUP_ID } from '../src/navigation/menuShape'

const L = (code: string, extra: Record<string, unknown> = {}) => ({ code, title: code, ...extra })

describe('P11 — Ayarlar bölümü', () => {
  const menu = [
    { group: 'dashboard', links: [L('DashboardView')] },
    { group: 'management', links: [L('AuthorizationListView')] },
    { group: 'finance', links: [L('FinancialListView'), L('PrintoutListView'), L('SettingListView')] },
    { group: 'supports', links: [L('supports', { children: [L('TicketListView')] })] },
  ]

  it('Mağaza ayarları, Çıktılar, Yetkilendirme tek "settings" grubunda (bu sırayla); finans yalnız finans', () => {
    const out = regroupMenu(menu as any)
    const groups = out.map((g) => g.group)
    expect(groups).toEqual(['dashboard', SETTINGS_GROUP_ID, 'finance', 'supports'])
    expect(out.find((g) => g.group === SETTINGS_GROUP_ID)!.links!.map((l: any) => l.code)).toEqual(['SettingListView', 'PrintoutListView', 'AuthorizationListView'])
    expect(out.find((g) => g.group === 'finance')!.links!.map((l: any) => l.code)).toEqual(['FinancialListView'])
  })

  it('bağlantı nesneleri aynı kalır (sekme/favori çözümü) ve girdi değişmez', () => {
    const out = regroupMenu(menu as any)
    expect(out.find((g) => g.group === SETTINGS_GROUP_ID)!.links![0]).toBe(menu[2].links[2])
    expect(menu[2].links).toHaveLength(3)
  })

  it('alt öğe olarak gelen ekran da taşınır; boşalan üst öğe düşer; ayarlar ekranı yoksa menü aynen döner', () => {
    const nested = [{ group: 'x', links: [L('grp', { children: [L('PrintoutListView')] }), L('OrderListView')] }]
    const out = regroupMenu(nested as any)
    expect(out[0].links!.map((l: any) => l.code)).toEqual(['OrderListView'])
    expect(out[1].links!.map((l: any) => l.code)).toEqual(['PrintoutListView'])
    const plain = [{ group: 'x', links: [L('OrderListView')] }]
    expect(regroupMenu(plain as any)).toBe(plain)
  })
})

describe('P06 — tek yapraklı destek grubu düzleşir', () => {
  it('TicketListView üst seviyeye çıkar, grubun ikonunu devralır', () => {
    const child = L('TicketListView')
    const out = shapeGroupLinks([L('supports', { icon: 'mdi-lifebuoy', children: [child] })] as any)
    expect(out).toEqual([child])
    expect(out[0]).toBe(child)
    expect(inheritedIcon(child)).toBe('mdi-lifebuoy')
  })

  it('başka tek yapraklı gruplar (onay bekleyen P-R3A-5) olduğu gibi kalır', () => {
    const out = shapeGroupLinks([L('productDefinitions', { children: [L('ProductListView')] })] as any)
    expect((out[0] as any).code).toBe('productDefinitions')
  })
})
