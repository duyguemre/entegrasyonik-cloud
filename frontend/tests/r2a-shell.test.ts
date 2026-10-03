// fe-r2a — FR2-SHELL madde 2/3/7/8/9 + FR2-HELP 16 bekçileri (model birim testi + statik sözleşme).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { HOISTED_CODES, isRetiredLink, shapeGroupLinks } from '../src/navigation/menuShape'

// Windows çalışma kopyasında CRLF olabilir; desenler LF bekler.
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8').replace(/\r\n/g, '\n')

const settingsGroup = () => ({
  code: 'settings',
  parent: '',
  title: 'settings',
  children: [
    { code: 'AuthorizationListView', parent: 'settings', title: 'authorizationList' },
    { code: 'SettingListView', parent: 'settings', title: 'settingList' },
    { code: 'LogListView', parent: 'settings', title: 'logList' },
  ],
})

describe('menü biçimi (madde 7/8)', () => {
  it('Eğitim Merkezi kodla ve başlıkla emekli', () => {
    expect(isRetiredLink({ code: 'EducationView' })).toBe(true)
    expect(isRetiredLink({ code: 'X', title: 'educationCenter' })).toBe(true)
    expect(isRetiredLink({ code: 'X', title: 'support_school' })).toBe(true)
    expect(isRetiredLink({ code: 'TicketListView', title: 'ticketList' })).toBe(false)
  })

  it('Uygulama Ayarları grubundan çıkar, grubun ÖNÜNE üst seviyeye yerleşir; girdi değişmez', () => {
    const group = settingsGroup()
    const out = shapeGroupLinks<any>([group])
    expect(out.map((l) => l.code)).toEqual(['SettingListView', 'settings'])
    expect(out[1].children.map((c: any) => c.code)).toEqual(['AuthorizationListView', 'LogListView'])
    // Aynı düğüm nesnesi (sekme/favori/başlık çözümü) ve özgün ağaç dokunulmamış.
    expect(out[0]).toBe(group.children[1])
    expect(group.children).toHaveLength(3)
    expect(HOISTED_CODES.has('SettingListView')).toBe(true)
  })

  it('çocukları tükenen grup düşer; emekli çocuk grup içinden de çıkar', () => {
    const out = shapeGroupLinks<any>([
      { code: 'supports', title: 'support_ticket_list', children: [{ code: 'EducationView', title: 'educationCenter' }] },
      { code: 'settings', children: [{ code: 'SettingListView' }] },
      { code: 'user', children: [{ code: 'SubscriptionView' }, { code: 'EducationView' }] },
      { code: 'EducationView', title: 'educationCenter' },
      { code: 'DashboardView' },
    ])
    expect(out.map((l) => l.code)).toEqual(['SettingListView', 'user', 'DashboardView'])
    expect(out[1].children.map((c: any) => c.code)).toEqual(['SubscriptionView'])
  })

  it('bileşen çözümü iç içe kaydı koda düşürür; EducationView haritada ve destek kısayolunda yok', () => {
    const store = read('src/stores/site/menu.ts')
    expect(store).toMatch(/const resolveView = \(link: any\) =>/)
    expect(store).toMatch(/menuLink\.component = resolveView\(menuLink\)/)
    expect(store).not.toMatch(/EducationView|educationCenter/)
    expect(read('src/components/layout/useShellMenu.ts')).toMatch(/shapeGroupLinks<any>\(group\.links\)/)
  })

  it('hesap menüsü "Uygulama ayarları" kodla açar ve erişim yoksa gizlenir', () => {
    const bar = read('src/components/layout/ApplicationBar.vue')
    expect(bar).toMatch(/getMenuLinkWithCode\?\.\('SettingListView'\)/)
    expect(bar).toMatch(/settingsLink\.value \? \[\{ key: 'settings', label: 'Uygulama ayarları'/)
    expect(bar).not.toMatch(/openByTitle\('settingList'\)/)
  })
})

describe('kabuk (madde 3, 9)', () => {
  it('çalışma alanı kaydırma kabı: belge kaymaz, ana sekmeler sabit', () => {
    const shell = read('src/layouts/SecureLayout.vue')
    const rule = shell.slice(shell.indexOf('.workplace-area {\n  top:'))
    expect(rule.slice(0, rule.indexOf('}'))).toMatch(/overflow-y: auto;[\s\S]*overscroll-behavior: contain;/)
  })

  it('sekme taşması: ok düğmeleri yok, "daha fazla" listesi var', () => {
    const tabs = read('packages/ui/src/components/EkWorkspaceTabs.vue')
    expect(tabs).not.toMatch(/ek-tabs__arrow/)
    expect(tabs).toMatch(/data-tabs-more/)
    // FR3 madde 4: "+N" ve toplam düğmesi TEK düğme — erişilebilir ad toplamı ve gizli sayısını söyler.
    expect(tabs).toMatch(/:aria-label="allLabel"/)
    expect(tabs).toMatch(/şeritte görünmüyor/)
  })
})

describe('sayfa hakkında (madde 16)', () => {
  const bar = read('src/components/page/EkPageBar.vue')
  it('rehber kartı: başlık + kapat, numaralı ipuçları, modern bağlantılar; ışık düğmesinden YÜZEN kart (Esc / dışarı tık kapatır)', () => {
    expect(bar).toMatch(/class="ek-about__title">\{\{ title \}\} hakkında</)
    expect(bar).toMatch(/aria-label="Sayfa hakkında bilgiyi kapat"/)
    expect(bar).toMatch(/<ol class="ek-page-bar__tips">/)
    expect(bar).toMatch(/class="ek-link ek-page-bar__read" data-page-help-read/)
    // Sayfa içi panel yerine bağlam menüsü gibi yüzen kart (v-menu: Esc ve dışarı tıklama yerleşik kapatır).
    expect(bar).toMatch(/<v-menu v-model="aboutOpen"/)
    expect(bar).not.toMatch(/<EkCollapse :id="panelId"/)
    expect(bar).not.toMatch(/text-decoration: underline/)
  })
})
