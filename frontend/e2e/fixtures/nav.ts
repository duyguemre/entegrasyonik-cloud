// Faz 3 T1b — Sekmeli gezinme yardımcıları.
//
// ÖNEMLİ (ADR-0012 yönlendirmesi, 2026-09-27): Menü öğeleri Vuetify VListItem `:value="link.code"`
// ile işaretleniyor ama Vuetify bunu bir DOM attribute'u olarak YAYMIYOR (yalnızca dahili
// v-model eşleşmesi için kullanılıyor) — grep ile doğrulandı (node_modules/vuetify/lib/components/VList).
// Bu görev SIFIR uygulama kodu değişikliği içerdiği için NavigationMenu.vue'ya `data-menu-code`
// benzeri bir attribute EKLEYEMEDİK. Bu yüzden openScreen() menü öğesini görünen i18n metniyle
// DEĞİL, bu dosyada `MENU_SCREENS` altında merkezi olarak tanımlanan bir ikon sınıfıyla (mdi-*)
// seçiyor — ikon, fixture verisinin kendi ürettiği ve testler arasında paylaşılan tek bir
// kaynaktan geliyor, ekranda görünen çevrilmiş başlık metnine bağımlı değil.
// T4a (gezinme modeli göçü) NavigationMenu.vue'ya gerçek bir `data-menu-code` attribute'u
// eklerse, MENU_SCREENS ve openScreen() burada TEK YERDEN güncellenip o seçiciye geçmeli.

import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export interface MenuScreenDef {
  /** menuStore/views Map anahtarıyla birebir aynı leaf kod (component çözümü buna göre yapılıyor) */
  code: string
  /** NavigationMenu'de tıklanacak mdi ikon sınıfı (fixture menu verisiyle bire bir eşleşir); yalnızca ÜST DÜZEY (grupsuz) öğelerde kullanılır. */
  icon: string
  /** Alt öğeyse, önce açılması gereken üst grup öğesinin ikon sınıfı */
  groupIcon?: string
  /**
   * Alt öğenin, üst grubun `children` dizisindeki 0-tabanlı konumu.
   * GİZLİ DAVRANIŞ (araştırma bulgusu): NavigationMenu.vue alt (`sub-item-soft`) öğeler için
   * HİÇ İKON render etMİYOR (yalnızca üst düzey öğelerde `<template #prepend><v-icon>` var) —
   * bu yüzden alt öğeler ikonla seçilemiyor; kendi kontrolümüzdeki fixture sırasına göre
   * (metne/i18n'e bağlı olmayan) konumsal seçim kullanılıyor.
   */
  subIndex?: number
}

export const MENU_SCREENS: Record<string, MenuScreenDef> = {
  DashboardView: { code: 'DashboardView', icon: 'mdi-home' },
  OrderListView: { code: 'OrderListView', icon: 'mdi-cart-outline' },
  ProductListView: { code: 'ProductListView', icon: 'mdi-magnify-scan', groupIcon: 'mdi-tag-outline', subIndex: 0 },
  MarketplaceView: { code: 'MarketplaceView', icon: 'mdi-storefront-outline', groupIcon: 'mdi-connection', subIndex: 0 },
  ECommerceView: { code: 'ECommerceView', icon: 'mdi-cart-variant', groupIcon: 'mdi-connection', subIndex: 1 },
  ShippingView: { code: 'ShippingView', icon: 'mdi-truck-outline', groupIcon: 'mdi-connection', subIndex: 2 },
  EInvoiceView: { code: 'EInvoiceView', icon: 'mdi-file-document-outline', groupIcon: 'mdi-connection', subIndex: 3 },
  ErpView: { code: 'ErpView', icon: 'mdi-chart-bar-stacked', groupIcon: 'mdi-connection', subIndex: 4 },
  // P2 (Faz 3 Parti — claim/customer/invoice/message göçü): menu.ts'te bu 4
  // kod da `parent === ''` (kök seviye, ProductListView gibi bir gruba
  // GÖMÜLÜ DEĞİL) — bu yüzden `groupIcon` YOK, ProductListView'un altında
  // DEĞİL, kendi üst-düzey ikonlarıyla seçiliyorlar (bkz. dosya başı seçici
  // stratejisi notu).
  ClaimListView: { code: 'ClaimListView', icon: 'mdi-undo-variant' },
  CustomerListView: { code: 'CustomerListView', icon: 'mdi-account-group-outline' },
  InvoiceListView: { code: 'InvoiceListView', icon: 'mdi-receipt-text-outline' },
  MessageListView: { code: 'MessageListView', icon: 'mdi-message-text-outline' },
  // ADR-0008 frontend SONUÇ (P1-yeni, ADR-0011 Karar 2): `menu.ts`'teki gerçek anahtar `user/SubscriptionView`
  // (parent='user', code='SubscriptionView') — kabuk/menü koduna DOKUNULMADI, yalnızca bu test fixture'ına
  // sentetik bir 'user' grubu EKLENDİ (bkz. aşağıdaki `menuFixture`).
  SubscriptionView: { code: 'SubscriptionView', icon: 'mdi-crown-outline', groupIcon: 'mdi-account-circle-outline', subIndex: 0 },
  // P2 (Faz 3 Parti — log listeleri göçü, T4g): menu.ts'te `LogListView` de
  // diğer P2 kodları gibi `parent === ''` (kök seviye) — kendi üst-düzey
  // ikonuyla seçiliyor (bkz. dosya başı seçici stratejisi notu).
  LogListView: { code: 'LogListView', icon: 'mdi-history' },
  // P2 (Faz 3 Parti — admin panel göçü, ADR-0011 Karar 2): `menu.ts`'te bu 3 ekranın anahtarı
  // `adminPanel/<Kod>` (parent === 'adminPanel'). Gerçek menü kaydı ApplicationDB `menus`
  // koleksiyonunda (repo dışı) — burada yalnızca `menuFixtureWithAdmin` (aşağıda) için sentetik
  // bir 'adminPanel' grubu kuruluyor; alt öğelerde ikon render EDİLMEDİĞİ için konumsal seçim.
  AdminClientListView: { code: 'AdminClientListView', icon: 'mdi-store-outline', groupIcon: 'mdi-shield-account-outline', subIndex: 0 },
  AdminTicketListView: { code: 'AdminTicketListView', icon: 'mdi-face-agent', groupIcon: 'mdi-shield-account-outline', subIndex: 1 },
  AdminSystemManagementView: { code: 'AdminSystemManagementView', icon: 'mdi-server-network-outline', groupIcon: 'mdi-shield-account-outline', subIndex: 2 },
  // ADR-0020 Aşama C (entegrasyon/motor ayar yönetimi) — gerçek menü ağacı kaydı (ApplicationDB
  // `menus`) bu görevin kapsamı DIŞI (bkz. `screens.ts`/`menu.ts` aynı satırdaki not); yalnız bu
  // sentetik grup (`menuFixtureWithIntegrationConfig`, aşağıda) `openScreen()`in İLK giriş noktasını
  // açması için var — Ayarlar/Motor/Etkin-yapılandırma ekranlarına geçiş `useOpenIntegrationConfigTab`
  // (derin bağlantı/klonlama, menüden BAĞIMSIZ) ile yapıldığı için yalnız liste ekranının burada
  // bir girişi var.
  IntegrationConfigListView: { code: 'IntegrationConfigListView', icon: 'mdi-cog-sync-outline', groupIcon: 'mdi-shield-account-outline', subIndex: 3 },
  // ADR-0015 B5-3 (kullanıcı/destek/finans ekranları, 2026-09-29): `menuStore.views`
  // (stores/site/menu.ts) anahtarlarıyla birebir. `AuthorizationListView`/`FinancialListView`/
  // `PrintoutListView`/`SettingListView` kök seviyededir (`parent===''`); `InvoiceInfoView`/
  // `ChangePasswordView`/`ExitView` mevcut 'user' grubunun (bkz. `SubscriptionView` girişi,
  // satır ~55) çocuklarıdır — `menuFixtureWithAccountSupport` (aşağıda) o grubu GENİŞLETİR.
  // `TicketListView` (destek talepleri, `supports/TicketListView`) kendi sentetik 'supports'
  // grubunda — `AdminTicketListView`'dan (admin panel) FARKLI bir ekran/kod.
  AuthorizationListView: { code: 'AuthorizationListView', icon: 'mdi-account-multiple-outline' },
  FinancialListView: { code: 'FinancialListView', icon: 'mdi-cash-multiple' },
  PrintoutListView: { code: 'PrintoutListView', icon: 'mdi-printer-outline' },
  SettingListView: { code: 'SettingListView', icon: 'mdi-cog-outline' },
  InvoiceInfoView: { code: 'InvoiceInfoView', icon: 'mdi-receipt-text-edit-outline', groupIcon: 'mdi-account-circle-outline', subIndex: 1 },
  ChangePasswordView: { code: 'ChangePasswordView', icon: 'mdi-lock-reset', groupIcon: 'mdi-account-circle-outline', subIndex: 2 },
  ExitView: { code: 'ExitView', icon: 'mdi-logout', groupIcon: 'mdi-account-circle-outline', subIndex: 3 },
  TicketListView: { code: 'TicketListView', icon: 'mdi-lifebuoy', groupIcon: 'mdi-lifebuoy', subIndex: 0 },
  // C1.1 stok sağlığı — kök seviye (sentetik menü: e2e/fixtures/stockHealth.ts `menuFixtureWithStockHealth`).
  StockHealthView: { code: 'StockHealthView', icon: 'mdi-scale-unbalanced' },
}

// e2e/fixtures/menuData.ts ile aynı sırayı/ikonları kullanır (bkz. dosyanın altı).
export const menuFixture = [
  {
    group: 'dashboard',
    links: [
      { code: 'DashboardView', parent: '', title: 'dashboard', icon: MENU_SCREENS.DashboardView.icon, singleton: true },
    ],
  },
  {
    group: 'sale',
    links: [
      { code: 'OrderListView', parent: '', title: 'orderList', icon: MENU_SCREENS.OrderListView.icon, singleton: true },
      {
        code: 'productDefinitions',
        parent: '',
        title: 'productDefinitions',
        icon: MENU_SCREENS.ProductListView.groupIcon,
        children: [
          { code: 'ProductListView', parent: 'productDefinitions', title: 'productList', icon: MENU_SCREENS.ProductListView.icon, singleton: true },
        ],
      },
      { code: 'ClaimListView', parent: '', title: 'claimList', icon: MENU_SCREENS.ClaimListView.icon, singleton: true },
      { code: 'CustomerListView', parent: '', title: 'customerList', icon: MENU_SCREENS.CustomerListView.icon, singleton: true },
      { code: 'InvoiceListView', parent: '', title: 'invoiceList', icon: MENU_SCREENS.InvoiceListView.icon, singleton: true },
      { code: 'MessageListView', parent: '', title: 'messageList', icon: MENU_SCREENS.MessageListView.icon, singleton: true },
    ],
  },
  {
    group: 'integrations',
    links: [
      {
        code: 'integrations',
        parent: '',
        title: 'integrations',
        icon: MENU_SCREENS.MarketplaceView.groupIcon,
        children: [
          { code: 'MarketplaceView', parent: 'integrations', title: 'marketplace', icon: MENU_SCREENS.MarketplaceView.icon, singleton: true },
          { code: 'ECommerceView', parent: 'integrations', title: 'ecommerce', icon: MENU_SCREENS.ECommerceView.icon, singleton: true },
          { code: 'ShippingView', parent: 'integrations', title: 'shipping', icon: MENU_SCREENS.ShippingView.icon, singleton: true },
          { code: 'EInvoiceView', parent: 'integrations', title: 'einvoice', icon: MENU_SCREENS.EInvoiceView.icon, singleton: true },
          { code: 'ErpView', parent: 'integrations', title: 'erp', icon: MENU_SCREENS.ErpView.icon, singleton: true },
        ],
      },
    ],
  },
  {
    // ADR-0008 frontend SONUÇ: gerçek `menu.ts` anahtarı `user/SubscriptionView` — bu grup yalnızca TEST
    // fixture'ında var (kabuk/menü uygulama kodu DEĞİŞMEDİ; backend `MenuService` böyle bir 'user' grubu
    // döndürürse gerçek uygulamada da AYNI şekilde render olur, generic menü mekanizması hard-code değil).
    group: 'account',
    links: [
      {
        code: 'user',
        parent: '',
        title: 'user',
        icon: MENU_SCREENS.SubscriptionView.groupIcon,
        children: [
          { code: 'SubscriptionView', parent: 'user', title: 'subscription', icon: MENU_SCREENS.SubscriptionView.icon, singleton: true },
        ],
      },
    ],
  },
]

/**
 * P2 (Faz 3 Parti — log listeleri göçü, T4g): `menuFixture` + `LogListView` bağlantısı.
 *
 * NEDEN `menuFixture`'a EKLENMEDİ (araştırma bulgusu, kanıtlı): `LogListView`'ı paylaşılan
 * `menuFixture`'ın 'sale' grubuna eklemek `title: 'logList'` ile dashboard'daki
 * `NavigationLinksComponentBottom.vue` hızlı-erişim kartlarına YENİ bir "İŞLEMLER" kartı
 * (`codes = ['logList', 'marketplace', ...]`, satır 39) ekliyor — bu kart tablet/mobil
 * genişlikte `dashboard`/`shell` ekran görüntülerinin (3 tabanın 3'ünde: tablet dashboard,
 * tablet+mobil shell) piksellerini kaydırıyor. Karşılaştırmalı doğrulandı: `menuFixture`
 * DEĞİŞTİRİLMEDEN o 3 test geçiyor; değiştirilince geçmiyor. İlgisiz P1 ekranlarının
 * tabanlarını YENİDEN-TABANLAMAK yerine (blast radius), log ekranı YALNIZCA kendi
 * spec'inde bu genişletilmiş menüyü `MenuService` override'ıyla kullanıyor.
 */
export const menuFixtureWithLogs = menuFixture.map((group) =>
  group.group === 'sale'
    ? {
        ...group,
        links: [
          ...group.links,
          { code: 'LogListView', parent: '', title: 'logList', icon: MENU_SCREENS.LogListView.icon, singleton: true },
        ],
      }
    : group,
)

/**
 * P2 (Faz 3 Parti — admin panel göçü): `menuFixture` + sentetik bir 'adminPanel' grubu (3 alt ekran:
 * mağaza yönetimi / destek yönetimi / sistem yönetimi). Paylaşılan `menuFixture`'a EKLENMEDİ —
 * `menuFixtureWithLogs` ile aynı gerekçe (dashboard `NavigationLinksComponentBottom` kartları ve
 * drawer yüksekliği ilgisiz P1/P2 ekran görüntüsü tabanlarını kaydırabilir); yalnızca
 * `admin-*.spec.ts` dosyaları bu menüyü `MenuService` override'ıyla kullanır.
 * Başlık anahtarları `plugins/locales/tr.json` → `menu.adminPanel.*` ile birebir.
 */
export const menuFixtureWithAdmin = [
  ...menuFixture,
  {
    group: 'applicationAdministration',
    links: [
      {
        code: 'adminPanel',
        parent: '',
        title: 'adminPanel',
        icon: MENU_SCREENS.AdminClientListView.groupIcon,
        children: [
          { code: 'AdminClientListView', parent: 'adminPanel', title: 'adminClientlist', icon: MENU_SCREENS.AdminClientListView.icon, singleton: true },
          { code: 'AdminTicketListView', parent: 'adminPanel', title: 'adminTicketList', icon: MENU_SCREENS.AdminTicketListView.icon, singleton: true },
          { code: 'AdminSystemManagementView', parent: 'adminPanel', title: 'adminSystemManagement', icon: MENU_SCREENS.AdminSystemManagementView.icon, singleton: true },
        ],
      },
    ],
  },
]

/**
 * ADR-0020 Aşama C — `menuFixtureWithAdmin` + Entegrasyonlar (liste) girişi. `admin-clients.spec.ts`
 * ile AYNI gerekçeyle (satır ~159 notu) paylaşılan `menuFixture`'a EKLENMEDİ, yalnızca
 * `admin-integration-config-*.spec.ts` bu genişletilmiş menüyü kullanır. Ayarlar/Motor/Etkin-
 * yapılandırma ekranları menüde YOK (kasıtlı — `useOpenIntegrationConfigTab` ile açılırlar).
 */
export const menuFixtureWithIntegrationConfig = menuFixtureWithAdmin.map((group) =>
  group.group === 'applicationAdministration'
    ? {
        ...group,
        links: group.links.map((link: any) =>
          link.code === 'adminPanel'
            ? {
                ...link,
                children: [
                  ...link.children,
                  { code: 'IntegrationConfigListView', parent: 'adminPanel', title: 'adminIntegrationConfigList', icon: MENU_SCREENS.IntegrationConfigListView.icon, singleton: true },
                  // ARAŞTIRMA BULGUSU (bu görevde bulundu, rapora yazıldı): `workspace.ts` her
                  // `mySelectedTab` değişiminde URL'i senkronlar (`watch(mySelectedTab, ...)`) VE
                  // route değişimini AYRICA izler (`resolveActiveFromRoute`) — o da
                  // `findLinkByScreenKey` ile hedefi MENÜ AĞACINDA arar; menüde YOKSA "erişiminiz
                  // yok" uyarısıyla `/dashboard`'a GERİ ATIYOR. Yani `useOpenIntegrationConfigTab`
                  // (derin bağlantı/klonlama) ile açılan bir sekme bile, ayakta KALABİLMESİ için
                  // hedefinin menü ağacında (`code`+`parent` eşleşmesi yeter, görünürlük ayrı)
                  // BULUNMASINI gerektiriyor — yalnızca liste ekranini menüye eklemek YETMİYORDU
                  // (ilk denemede tüm alt ekranlar sessizce panoya düşüyordu). Bu, GERÇEK ortamda da
                  // 4 ekranın TAMAMININ ApplicationDB `menus`'a kaydedilmesi gerektiği anlamına gelir
                  // (yalnızca liste değil) — BACKLOG'a yazıldı.
                  { code: 'IntegrationSettingsView', parent: 'adminPanel', title: 'adminIntegrationSettings', icon: 'mdi-tune', singleton: false },
                  { code: 'EngineSettingsView', parent: 'adminPanel', title: 'adminEngineSettings', icon: 'mdi-engine-outline', singleton: false },
                  { code: 'EffectiveConfigView', parent: 'adminPanel', title: 'adminEffectiveConfig', icon: 'mdi-table-eye', singleton: false },
                ],
              }
            : link,
        ),
      }
    : group,
)

/**
 * ADR-0015 B5-3 (kullanıcı/destek/finans ekranları, 2026-09-29) — `menuFixture`'a EKLENMEDİ,
 * `menuFixtureWithLogs`/`menuFixtureWithAdmin` ile AYNI gerekçe (satır ~141/~166 notları): blast
 * radius, ilgisiz P1/P2 ekranlarının ekran görüntüsü tabanlarını etkilememek için yalnızca bu
 * görevin kendi spec dosyaları (`user-account-forms.spec.ts`, `authorization.spec.ts`,
 * `support-tickets.spec.ts`, `financial.spec.ts`, `printouts.spec.ts`, `app-settings.spec.ts`)
 * bu genişletilmiş menüyü kullanır. Mevcut 'account' grubunun 'user' çocuğu (`SubscriptionView`)
 * KORUNUR, yalnızca yanına yeni çocuklar eklenir; kök seviyeye 3 yeni grup eklenir.
 */
export const menuFixtureWithAccountSupport = menuFixture
  .map((group) =>
    group.group === 'account'
      ? {
          ...group,
          links: group.links.map((link: any) =>
            link.code === 'user'
              ? {
                  ...link,
                  children: [
                    ...link.children,
                    { code: 'InvoiceInfoView', parent: 'user', title: 'invoiceInfo', icon: MENU_SCREENS.InvoiceInfoView.icon, singleton: true },
                    { code: 'ChangePasswordView', parent: 'user', title: 'changePassword', icon: MENU_SCREENS.ChangePasswordView.icon, singleton: true },
                    { code: 'ExitView', parent: 'user', title: 'exit', icon: MENU_SCREENS.ExitView.icon, singleton: true },
                  ],
                }
              : link,
          ),
        }
      : group,
  )
  .concat([
    {
      group: 'management',
      links: [
        { code: 'AuthorizationListView', parent: '', title: 'authorization', icon: MENU_SCREENS.AuthorizationListView.icon, singleton: true },
      ],
    },
    {
      group: 'finance',
      links: [
        { code: 'FinancialListView', parent: '', title: 'financialList', icon: MENU_SCREENS.FinancialListView.icon, singleton: true },
        { code: 'PrintoutListView', parent: '', title: 'printoutList', icon: MENU_SCREENS.PrintoutListView.icon, singleton: true },
        { code: 'SettingListView', parent: '', title: 'settingList', icon: MENU_SCREENS.SettingListView.icon, singleton: true },
      ],
    },
    {
      group: 'supports',
      links: [
        {
          code: 'supports',
          parent: '',
          title: 'support_ticket_list',
          icon: MENU_SCREENS.TicketListView.groupIcon,
          children: [
            { code: 'TicketListView', parent: 'supports', title: 'support_ticket_list', icon: MENU_SCREENS.TicketListView.icon, singleton: true },
          ],
        },
      ],
    },
  ])

/**
 * Tam kenar menünün (`NavigationMenu.vue`, `.soft-nav`) GERÇEKTEN ekranda olup olmadığını
 * kontrol eder (ADR-0015 A3 — kalıcı/daraltılabilir kabuk).
 *
 * ADR-0015 Karar 2.1/2.2'den beri kabukta İKİ olası kenar-menü sunumu var, AYNI ANDA en fazla
 * biri DOM'da: (a) `NavigationRail.vue` (`.soft-rail`, 64px ikon-sadece ray — masaüstünde
 * kullanıcı tercihiyle, tablette VARSAYILAN) veya (b) `NavigationMenu.vue` (`.soft-nav`, 248px
 * tam menü — masaüstünde varsayılan/kalıcı, tablet "üst katman"/mobil çekmecede GEÇİCİ). Bu
 * yüzden `.soft-nav` her zaman hemen mevcut OLMAYABİLİR (ör. tablet varsayılanı ray'dir) —
 * önce `count()==0` durumunu (henüz render edilmemiş) HIZLICA eler, yalnızca mevcutsa konum
 * kontrolü (temporary drawer'ın kapalıyken bile `display:none` OLMADAN, yalnızca
 * `transform:translateX(-100%)` ile ekran dışına kayması — GİZLİ DAVRANIŞ, BACKLOG.md) yapılır.
 */
async function isDrawerOpen(page: Page): Promise<boolean> {
  const drawer = page.locator('.v-navigation-drawer.soft-nav')
  if ((await drawer.count()) === 0) return false
  const box = await drawer.boundingBox().catch(() => null)
  return !!box && box.x > -10
}

/**
 * Tam kenar menüyü (`.soft-nav`) açar (gerçek kullanıcı yolu). ADR-0015 A3 — sunuma göre üç
 * olası tetikleyici: masaüstü varsayılanı zaten AÇIKTIR (hiçbir şey tıklanmaz); ray gösteriliyorsa
 * (masaüstü daraltılmış TERCİH veya tablet varsayılanı) rayın genişlet düğmesi tıklanır; mobilde
 * (ray hiç YOK) `ApplicationBar`'daki hamburger (`aria-label="Menüyü aç"`, ADR Karar 5.1 izinli
 * değişiklik 1) tıklanır.
 */
export async function openDrawer(page: Page) {
  const drawer = page.locator('.v-navigation-drawer.soft-nav')
  if (await isDrawerOpen(page)) return
  const railExpandBtn = page.locator('.rail-logo-btn')
  if ((await railExpandBtn.count()) > 0) {
    await railExpandBtn.click()
  } else {
    await page.getByRole('button', { name: 'Menüyü aç' }).click()
  }
  await expect(drawer).toBeVisible()
  await expect(async () => {
    if (!(await isDrawerOpen(page))) throw new Error('drawer henüz ekrana kaymadı')
  }).toPass({ timeout: 5000 })
}

/**
 * Menüden tıklayarak bir ekrana ulaşır (sekmeli çalışma alanı — gerçek kullanıcı yolu, ADR-0011 Karar 4).
 * Seçici stratejisi için dosya başındaki notu bkz.
 */
export async function openScreen(page: Page, screenCode: keyof typeof MENU_SCREENS) {
  const def = MENU_SCREENS[screenCode]
  if (!def) throw new Error(`MENU_SCREENS içinde tanımsız ekran: ${String(screenCode)}`)

  await openDrawer(page)
  const drawer = page.locator('.v-navigation-drawer.soft-nav')

  if (def.groupIcon) {
    // Vuetify VListGroup activator'ı 'v-list-group__header' sınıfını taşır; grup gövdesi
    // (`v-list-group__items`) header'ın kardeşi olarak aynı `.v-list-group` kapsayıcısı
    // içindedir (bkz. dosya başı notu — alt öğelerde ikon YOK, bu yüzden konumsal seçim).
    const group = drawer.locator('.v-list-group').filter({ has: page.locator(`.v-list-group__header .${def.groupIcon}`) })
    const groupItem = group.locator('.v-list-group__header')
    const subItem = group.locator('.sub-item-soft').nth(def.subIndex ?? 0)
    if (!(await subItem.isVisible().catch(() => false))) {
      await groupItem.click()
      await expect(subItem).toBeVisible()
    }
    await subItem.click()
  } else {
    const item = drawer.locator('.soft-item').filter({ has: page.locator(`.${def.icon}`) }).first()
    await item.click()
  }

  // ADR-0015 A3 — kalıcı (masaüstü/tam) sunumda menü seçimden SONRA AÇIK KALIR (Karar 2.1,
  // kasıtlı davranış değişikliği: bugünkü "her zaman geçici, seçince kapanır" yerine). Yalnızca
  // GEÇİCİ sunumlarda (mobil çekmece / tablet üst katmanı) kapanma beklenir; hangi sunumda
  // olduğumuzu viewport'tan DEĞİL, `NavigationMenu`'nun kendi `temporary` durumundan (kapanma
  // davranışının kaynağı) anlıyoruz: kalıcıysa kapanma hiç gerçekleşmeyecektir, bu yüzden burada
  // sabit bir bekleme YERİNE "ya kapandı ya da hâlâ kalıcı olarak açık" ikisini de kabul ederiz —
  // asıl davranış iddiası (doğru ekranın açıldığı) çağıran spec'te ayrıca doğrulanır.
  await page.waitForTimeout(200)
}

/** Kabuğun gerçekten mount olup dashboard sekmesinin otomatik açıldığını bekler (SecureLayout init()). */
export async function waitForShellReady(page: Page) {
  // İlk `vite dev` derlemesi (SecureLayout + dashboard alt-bileşenleri) ağır olabildiği için
  // cömert bir zaman aşımı kullanılıyor; KeepAlive/Transition geçişi de birkaç yüz ms sürebiliyor.
  //
  // NOT (araştırma bulgusu, gizli davranış): `.workplace-area`'nın doğrudan çocukları
  // (Transition/KeepAlive/WrapperComponent kök `<div>`'leri) hiçbir yerde yükseklik almıyor
  // (`height` tanımsız, flex/grid yok) — bu yüzden `.dashboard` kökünün gerçek
  // `getBoundingClientRect()` yüksekliği SPA içi (router.push) geçişlerinde 0 ölçülüyor
  // (içerik `overflow:visible` sayesinde yine de EKRANDA görünüyor — bkz. ekran görüntüsü
  // tabanları). Bu yüzden burada kutu-tabanlı `.dashboard` görünürlüğü yerine, gerçekte
  // boyutu olan bir metin düğümünü bekliyoruz. BACKLOG.md'ye "incelenmesi gereken davranış"
  // olarak eklendi — düzeltilmedi.
  await expect(page.locator('.workplace-tabs')).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('İŞLETME PERFORMANSI')).toBeVisible({ timeout: 20000 })
  // ADR-0011 Açık Soru 1 (Inter göçü) — self-hosted `@fontsource/inter` `font-display: swap`
  // ile yükleniyor; ilk boyamada kısa bir yedek-font (FOUT) anı olabilir, ardından Inter
  // yüklenince metin YENİDEN DÜZENLENİYOR (reflow) — bu, `toHaveScreenshot` yakalamasını iki
  // farklı (ama her ikisi de "kararlı") görsel duruma denk getirip taban karşısında düşük
  // oranlı (~%3-5) piksel farkına yol açabiliyordu (kanıt: bu görevin doğrulama koşusunda
  // gözlemlendi). `document.fonts.ready` ile Inter'in TAMAMEN yüklendiğinden emin olunduktan
  // SONRA ekran görüntüsü/etkileşim adımlarına geçiliyor — davranış/kod DEĞİŞMEDİ, yalnızca
  // test determinizmi artırıldı.
  await page.evaluate(() => document.fonts.ready)
}

/**
 * GİZLİ DAVRANIŞ (araştırma bulgusu, font göçünden BAĞIMSIZ, düzeltilmedi — BACKLOG.md):
 * Dashboard'daki `MarketplaceLinksComponent` ("ENTEGRASYON DURUMU" paneli) `sortablejs-vue3`
 * (`<Sortable>`) ile render oluyor; bu kütüphane mount sırasında kendi DOM düğümlerini
 * senkronize ediyor ve `integrationStore`'un (Pinia) veri gelişiyle EŞ ZAMANLI kısa bir anda
 * `.platform-node` sayısı GEÇİCİ OLARAK KARARSIZ olabiliyor (ör. bir öğe iki kez, sonra bir kez
 * görünüyor) — bu, `waitForShellReady`'nin beklediği "İŞLETME PERFORMANSI" metninden TAMAMEN
 * BAĞIMSIZ bir widget'ta olduğu için oradaki bekleme bunu yakalamıyor. Ekran görüntüsü
 * tabanlarının (`dashboard.png`, `shell-dashboard.png`) bu geçici duruma denk gelmemesi için
 * DOM'un gerçekten durulduğu (iki ardışık ölçümde aynı sayı) doğrulanıyor — davranış/kod
 * DEĞİŞMEDİ, yalnızca test determinizmi artırıldı.
 */
/**
 * [Orkestratör düzeltmesi, 2026-09-28] Önceki sürüm yalnızca `.platform-node` SAYISININ
 * kararlılığını kontrol ediyordu — ama Sortable.js'in mount sırasındaki geçici yeniden-sıralaması
 * SAYIYI değiştirmeden SIRAYI değiştirebiliyor (ekran görüntüsü tabanıyla farklı sırada aynı
 * öğeler → diff'te "hayalet" metin ikilenmesi, `dashboard`/`shell` P2 partisi sonrası tam takım
 * koşusunda tekrarlanır biçimde gözlendi, izole 2-spec koşusunda gözlenmedi — daha fazla menü
 * öğesi Sortable.js'in yeniden-sıralama penceresini genişletiyor). Artık `data-id` sırasının da
 * (sayı YANINDA) iki ardışık ölçümde aynı kaldığı doğrulanıyor — davranış/uygulama kodu DEĞİŞMEDİ.
 */
export async function waitForPlatformListStable(page: Page) {
  const locator = page.locator('.platform-node')
  const snapshot = async () => {
    const count = await locator.count()
    const ids = await locator.evaluateAll((els) => els.map((el) => el.getAttribute('data-id')))
    return { count, ids: ids.join(',') }
  }
  await expect(async () => {
    const first = await snapshot()
    await page.waitForTimeout(150)
    const second = await snapshot()
    if (first.count !== second.count) throw new Error(`.platform-node sayısı kararsız: ${first.count} → ${second.count}`)
    if (first.ids !== second.ids) throw new Error(`.platform-node sırası kararsız: ${first.ids} → ${second.ids}`)
  }).toPass({ timeout: 10000 })
}

/** Mock'lu oturumla köke gider ve kabuğun (SecureLayout + dashboard sekmesi) hazır olmasını bekler. */
export async function gotoAuthed(page: Page) {
  await page.goto('/')
  await waitForShellReady(page)
}

/**
 * ADR-0012 T4a — `waitForShellReady`'nin dashboard-BAĞIMSIZ hâli: derin bağlantı (`page.goto`
 * doğrudan `/orders` vb. bir ekrana) veya yenileme sonrası aktif sekme dashboard OLMAYABİLİR —
 * bu durumlarda "İŞLETME PERFORMANSI" metnini beklemek hiçbir zaman gerçekleşmeyen bir koşulu
 * bekler. Yalnızca kabuğun (sekme çubuğu) gerçekten mount olduğunu doğrular.
 */
export async function waitForWorkplaceReady(page: Page) {
  await expect(page.locator('.workplace-tabs')).toBeVisible({ timeout: 20000 })
}

/**
 * Bir sekmenin AKTİF (kullanıcıya görünen) sekme olduğunu doğrular.
 *
 * `.dashboard`/`.marketplaceView`/`.productListView`/... gibi ekran kök `<div>`'lerinin çoğu
 * `position:absolute` KULLANMIYOR (yalnızca `OrderListView`/`OrderDetailComponent` kullanıyor) —
 * bu yüzden nav.ts başındaki `waitForShellReady` notunda açıklanan 0-yükseklik zinciri onları da
 * etkiliyor ve kutu-tabanlı `.toBeVisible()` yanlış negatif verebiliyor. `WrapperComponent.vue`
 * aktif OLMAYAN sekmelere `hide-tab-component` (`display:none!important`) sınıfı uyguluyor —
 * bu, geometriye değil CSS SINIFINA dayandığı için güvenilir bir "aktif sekme mi" kontrolüdür.
 */
export async function expectScreenOpen(page: Page, rootSelector: string) {
  const active = page.locator(`${rootSelector}:not(.hide-tab-component)`)
  await expect(active).toHaveCount(1, { timeout: 10000 })
}
