// DS-v2 Aşama 3 — menü başlığı çözümleyicisi: ham i18n anahtarı (ör. `menu.user.user`) ekrana düşmez.
import { describe, expect, it } from 'vitest'
import tr from '../src/plugins/locales/tr.json'
import { humanizeKey, resolveMenuTitle } from '../src/navigation/menuTitle'

function lookup(key: string): unknown {
  return key.split('.').reduce<any>((node, part) => (node && typeof node === 'object' ? node[part] : undefined), tr)
}
const te = (key: string) => lookup(key) !== undefined
const t = (key: string) => {
  const v = lookup(key)
  return typeof v === 'string' ? v : key
}

describe('resolveMenuTitle', () => {
  it('menü anahtarı metinse onu kullanır', () => {
    expect(resolveMenuTitle({ code: 'OrderListView', parent: '', title: 'orderList', fullPath: 'menu.orderList' }, t, te)).toBe('Sipariş Yönetimi')
  })

  it('grup düğümünün `menu.user.user` anahtarı çevrilir (ham anahtar gösterilmez)', () => {
    expect(resolveMenuTitle({ code: 'user', parent: '', title: 'user', fullPath: 'menu.user.user' }, t, te)).toBe('Hesabım')
  })

  it('anahtar alt ağaçsa (nesne) metin varyantına düşer', () => {
    expect(resolveMenuTitle({ code: 'integrations', parent: '', title: 'integrations', fullPath: 'menu.integrations' }, t, te)).toBe('Entegrasyonlar')
  })

  it('menüde karşılığı olmayan ekran `screens.ts` titleKey ile, o da yoksa okunur yedekle adlandırılır', () => {
    expect(resolveMenuTitle({ code: 'StockHealthView', parent: '', title: 'bilinmeyen', fullPath: 'menu.bilinmeyen' }, t, te)).toBe('Stok Sağlığı')
    const title = resolveMenuTitle({ code: 'SomeNewScreenView', parent: '', title: 'someNewScreen', fullPath: 'menu.someNewScreen' }, t, te)
    expect(title).toBe('Some new screen')
    expect(title).not.toMatch(/menu\./i)
  })

  it('çok örnekli sekme kendi başlığını taşır', () => {
    expect(resolveMenuTitle({ code: 'ProductDefinitionsView', singleton: false, title: 'Pamuklu tişört' }, t, te)).toBe('Pamuklu tişört')
  })

  it('humanizeKey', () => {
    expect(humanizeKey('productDefinitions')).toBe('Product definitions')
    expect(humanizeKey('change_password')).toBe('Change password')
    expect(humanizeKey('AuditLogView')).toBe('Audit log')
  })
})
