/**
 * frontend/src/navigation/screens.ts
 *
 * ADR-0012 Karar 2 — Ekran kayıt defteri (URL ↔ ekran eşlemesinin TEK
 * kaynağı). SAF TS (vue/vuetify/`@/` bileşen import'u YASAK — yalnızca tip
 * tanımları ve saf fonksiyonlar; bkz. ADR-0011 Karar 1 "tokens" ile aynı
 * disiplin).
 *
 * Her kayıt `menuStore`'un `views` Map anahtarıyla (`stores/site/menu.ts`)
 * birebir eşleşen bir `key` taşır: kök menü ögeleri (`parent === ''`) için
 * `code`, alt menü ögeleri için `'parent/code'`. Menü düğümünün çalışma-anı
 * `id`'si ve `title`'ı (i18n'e bağlı) URL'de ASLA kullanılmaz.
 *
 * KAPSAM (T4a, Faz 3 Parti 3): yalnızca P1 ekranları kayıtlı. Kayıtlı
 * OLMAYAN bir ekran URL senkronizasyonu OLMADAN (yalnızca sekme durumu ile,
 * ADR-0012 öncesi davranışla birebir) çalışmaya devam eder — kabuk/gezinme
 * mekanizması hiçbir ekranın kendisini bilmez, yalnızca bu kayıt defterine
 * bakar. T4b/T4c/T4d kendi P1/P2 ekranlarını taşırken buraya kayıt ekler.
 */

import { REGISTER_PLAN_CODES } from './registerIntent'

/** URL sorgu parametresi tanımı — PII/serbest-metin YASAK (yalnızca kapalı değer kümesi veya teknik kimlik). */
export interface ScreenUrlParam {
  /** Sekme parametresindeki (link.parameters) ve query string'teki adı — ilgili ekranın GERÇEKTEN okuduğu alan adıyla birebir (ör. `OrderListView`/`ClaimListView` → `internalStatuses`, `MessageListView` → `status`). */
  name: string
  /**
   * `enum`  → kapalı değer kümesi (durum kodları vb.), `allowed` ile sınırlanır (virgülle ayrılmış çoklu değer desteklenir).
   * `id`    → teknik kimlik (ör. `productId`) — serbest biçimli ama İÇERİK olarak kişi/adres/arama metni OLAMAZ.
   */
  kind: 'enum' | 'id'
  /** `kind: 'enum'` için izinli değerler; tanımsız/izinsiz değerler URL'den `replace` ile temizlenir. */
  allowed?: readonly string[]
  /** `true` ise ekranın okuduğu değer bir DİZİdir (ör. çoklu-seçim durum filtresi); URL'de virgülle ayrılmış tek değer olarak kodlanır, geri okunurken diziye açılır. */
  multi?: boolean
}

export interface ScreenDefinition {
  /** `menuStore.views` Map anahtarı (`stores/site/menu.ts`) — kararlı, i18n'den bağımsız. */
  key: string
  /** Kararlı, kebab-case İngilizce URL parçası (birden çok segment olabilir, ör. `integrations/marketplace`). */
  slug: string
  /** Çok örnekli ekranlarda (ör. ürün düzenleme) URL'nin `slug`'dan sonraki segmenti; örnek kimliğini taşır. */
  instanceParam?: string
  /** URL'ye yazılması izinli sorgu parametreleri. */
  urlParams?: ScreenUrlParam[]

  // ---- ADR-0015 Karar 2.4 — YALNIZCA SUNUM alanları (A3). Erişilebilirliğin
  // kaynağını DEĞİŞTİRMEZ (o `MenuService`'ten gelmeye devam eder); bu alanlar
  // yalnızca breadcrumb/komut paleti gibi sunum yüzeylerinin okuduğu METADATA'dır. ----
  /** `navigation/sections.ts` `SectionDefinition.id`; tanımsızsa sunum yüzeyleri "Diğer"e düşürür (ASLA gizlemez). */
  section?: string
  /** Bölüm içinde sıralama ipucu (küçük önce); tanımsızsa liste sırası kullanılır. */
  order?: number
  /** Komut paleti/breadcrumb için mdi ikon sınıfı — menüden gelen `link.icon` varsa O ESAS ALINIR, bu yalnızca menüde YOKKEN (ör. gelecekteki `menuSource:'registry'` ekranı) yedek. */
  icon?: string
  /** i18n anahtarı — menüden gelen `link.fullPath` varsa O ESAS ALINIR (Karar 2.3 "başlık = sekme başlığı" kuralı); bu yalnızca menüde YOKKEN yedek. */
  titleKey?: string
  /**
   * `'registry'` → bu ekran `MenuService`'e BAĞLI DEĞİLDİR, yalnızca kayıt defterinden ve
   * kullanıcının rolünden (bkz. ADR Karar 2.4 `minRole` ipucu — henüz TANIMLANMADI, B4'ün işi)
   * görünürlük kazanır. Tanımsız/`'menu'` → bugünkü gibi yalnızca `MenuService` menüsünde varsa
   * görünür (P1/P2 ekranlarının TAMAMI budur — A3 hiçbirini `'registry'`ye ÇEVİRMEZ, yalnızca
   * B4'ün kullanacağı alan tipini/altyapısını hazırlar).
   */
  menuSource?: 'menu' | 'registry'
}

/**
 * P1 ekranları (ADR-0011 Karar 2 tablosu). Sıra önemsiz; `resolveScreenBySlug`/
 * `resolveScreenByKey` O(n) arar (n küçük, performans kaygısı yok).
 */
export const SCREENS: readonly ScreenDefinition[] = [
  { key: 'DashboardView', slug: 'dashboard', section: 'general', order: 0 },
  // `internalStatuses`: OrderListView.vue/ClaimListView.vue'nin GERÇEKTEN okuduğu (`parameters?.internalStatuses`)
  // çoklu-seçim durum filtresi alanı (bkz. dosya başı yorumu) — uydurma bir isim DEĞİL.
  { key: 'OrderListView', slug: 'orders', urlParams: [{ name: 'internalStatuses', kind: 'enum', multi: true }], section: 'orders', order: 0 },
  {
    key: 'productDefinitions/ProductListView',
    slug: 'products',
    section: 'catalog',
    order: 0,
    // NOT: ProductListView.vue şu an `parameters` prop'undan HİÇBİR filtre okumuyor (yalnızca
    // `ProductUpdateView` klonlama akışında `productId` üretiyor, bkz. ADR-0012 Açık Soru 2) —
    // bu yüzden burada `urlParams` YOK (var olmayan bir parametreyi URL'ye yazmak yanıltıcı olur).
    // `productId` ile çok-örnekli ürün düzenleme derin bağlantısı, klonlama mantığının sahibi olan
    // T4b (ProductListView göçü) kapsamında eklenecek — bkz. BACKLOG.md.
  },
  { key: 'ClaimListView', slug: 'claims', urlParams: [{ name: 'internalStatuses', kind: 'enum', multi: true }], section: 'orders', order: 1 },
  // `status`: MessageListView.vue'nin okuduğu (`parameters?.status`) TEKİL (multi DEĞİL) durum filtresi.
  { key: 'MessageListView', slug: 'messages', urlParams: [{ name: 'status', kind: 'enum' }], section: 'orders', order: 4 },
  { key: 'CustomerListView', slug: 'customers', section: 'orders', order: 2 },
  // NOT (Faz 3 P2 göçü): InvoiceListView.vue `defineExpose({initialize,activate,destroy})`
  // UYGULAMIYOR (yalnızca `onMounted` ile yükleniyor) ve `parameters` prop'undan HİÇBİR
  // filtre okumuyor — bu yüzden `urlParams` YOK (ProductListView ile aynı gerekçe, satır 59-63).
  { key: 'InvoiceListView', slug: 'invoices', section: 'orders', order: 3 },
  // NOT (Faz 3 P2 göçü, T4g): LogListView (+ ExportLogList/ImportLogList
  // sekmeleri) `parameters` prop'undan HİÇBİR filtre okumuyor ve
  // `defineExpose({initialize,activate,destroy})` UYGULAMIYOR (yalnızca
  // `onMounted` ile yükleniyor) — InvoiceListView ile aynı gerekçe, `urlParams` YOK.
  { key: 'LogListView', slug: 'logs', section: 'integrations', order: 5 },
  // NOT (Faz 3 P2 göçü, admin panel): platformAdmin-only ekranlar (ADR-0001 OPERATION_POLICY
  // platformAdmin katmanı; menü kaydı ApplicationDB `menus` koleksiyonunda). Üçü de `parameters`
  // prop'undan HİÇBİR filtre okumuyor ve `defineExpose({initialize,activate,destroy})`
  // UYGULAMIYOR (yalnızca `onMounted` ile yükleniyor) — LogListView/InvoiceListView ile aynı
  // gerekçe, `urlParams` YOK (mağaza/talep no gibi tanımlayıcılar URL'ye HİÇ yazılmaz — PII/tenant
  // kimliği sızıntısı riski; ADR-0012 Karar 2 parametre politikası). Yetki sınırı backend RBAC'dir;
  // URL bu ekranları yetkisiz kullanıcıya açmaz (menüde karşılığı yoksa çözümlenmez).
  // `adminPanel/AdminView` KAYDEDİLMEDİ: bu dosya MessageListView'ın kopyasıdır ve göç edilmedi
  // (bkz. BACKLOG.md admin panel "sonraki parti" maddesi).
  { key: 'adminPanel/AdminClientListView', slug: 'admin/clients', section: 'admin', order: 0 },
  { key: 'adminPanel/AdminTicketListView', slug: 'admin/tickets', section: 'admin', order: 1 },
  { key: 'adminPanel/AdminSystemManagementView', slug: 'admin/system', section: 'admin', order: 2 },
  // ADR-0020 Aşama C (entegrasyon/motor ayar yönetimi, `platformAdmin`) — gerçek menü kaydı
  // (ApplicationDB `menus`, "admin.integrations" grubu) diğer admin ekranlarıyla AYNI gerekçeyle
  // (satır 109 notu) bu görevin kapsamı DIŞI; BACKLOG'a yazıldı. `code`/`target` teknik entegrasyon
  // kodudur (kapalı küme — `enum`), PII/serbest metin DEĞİL.
  {
    key: 'adminPanel/IntegrationConfigListView', slug: 'admin/integrations', section: 'admin', order: 3,
  },
  {
    key: 'adminPanel/IntegrationSettingsView', slug: 'admin/integrations/settings', section: 'admin', order: 4,
    urlParams: [{ name: 'code', kind: 'enum', allowed: ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap'] }],
  },
  { key: 'adminPanel/EngineSettingsView', slug: 'admin/engine-settings', section: 'admin', order: 5 },
  {
    key: 'adminPanel/EffectiveConfigView', slug: 'admin/effective-config', section: 'admin', order: 6,
    urlParams: [{ name: 'code', kind: 'enum', allowed: ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap', '_engine'] }],
  },
  // ADR-0014 S4b: kayıt sonrası abonelik ekranı derin bağlantısı (`/subscription?plan=<kod>`). `plan` YALNIZCA
  // kapalı, izinli plan kodu kümesidir (registerIntent.ts; seed ile testle eşit) — PII/serbest metin YOK.
  { key: 'user/SubscriptionView', slug: 'subscription', urlParams: [{ name: 'plan', kind: 'enum', allowed: REGISTER_PLAN_CODES }], section: 'finance', order: 1 },
  { key: 'integrations/MarketplaceView', slug: 'integrations/marketplace', section: 'integrations', order: 0 },
  { key: 'integrations/ECommerceView', slug: 'integrations/ecommerce', section: 'integrations', order: 1 },
  { key: 'integrations/ShippingView', slug: 'integrations/shipping', section: 'integrations', order: 2 },
  { key: 'integrations/EInvoiceView', slug: 'integrations/einvoice', section: 'integrations', order: 3 },
  { key: 'integrations/ErpView', slug: 'integrations/erp', section: 'integrations', order: 4 },
] as const

/** URL'nin ilk segmenti hiçbir zaman bir ekran slug'ı OLAMAZ (ADR-0012 Karar 1 — başka uç noktalar/statikler ile çakışmasın). */
export const RESERVED_FIRST_SEGMENTS: readonly string[] = ['login', 'oauth', '.well-known', 'api', 'mcp', 'assets']

export function resolveScreenByKey(key: string): ScreenDefinition | undefined {
  return SCREENS.find((s) => s.key === key)
}

/** `menuLink.parent`/`menuLink.code` çiftinden `screens.ts`/`menuStore.views` anahtarını üretir. */
export function screenKeyForLink(link: { code: string; parent?: string }): string {
  return link.parent ? `${link.parent}/${link.code}` : link.code
}

export interface ResolvedScreenPath {
  screen: ScreenDefinition
  instanceId?: string
}

/**
 * `pathSegments` (örn. `['orders']`, `['integrations','marketplace']`,
 * `['products','66f1c0a2e4b0']`) içinden kayıtlı bir ekranı çözer.
 * Çok segmentli slug'lar (`integrations/marketplace`) TAM eşleşme ister;
 * `instanceParam` taşıyan kayıtlarda `slug`'dan SONRAKİ tek segment örnek
 * kimliği olarak kabul edilir.
 */
export function resolveScreenPath(pathSegments: string[]): ResolvedScreenPath | undefined {
  if (pathSegments.length === 0) return undefined
  if (RESERVED_FIRST_SEGMENTS.includes(pathSegments[0])) return undefined

  const fullPath = pathSegments.join('/')
  // 1. Tam slug eşleşmesi (örnek kimliği YOK).
  const exact = SCREENS.find((s) => !s.instanceParam && s.slug === fullPath)
  if (exact) return { screen: exact }

  // 2. `slug/instanceId` eşleşmesi.
  const withInstance = SCREENS.find((s) => s.instanceParam)
  if (withInstance) {
    const slugSegments = withInstance.slug.split('/')
    const matchesSlug = slugSegments.every((seg, i) => pathSegments[i] === seg)
    if (matchesSlug && pathSegments.length === slugSegments.length + 1) {
      return { screen: withInstance, instanceId: pathSegments[slugSegments.length] }
    }
  }

  return undefined
}

/** Bir ekranın (+ isteğe bağlı örnek kimliği) kanonik yolunu üretir (query HARİÇ). */
export function buildScreenPath(screen: ScreenDefinition, instanceId?: string): string {
  const suffix = screen.instanceParam && instanceId ? `/${instanceId}` : ''
  return `/${screen.slug}${suffix}`
}

/**
 * `rawParams` (sekme parametreleri) içinden yalnızca `screen.urlParams`'ta
 * bildirilmiş, izinli (enum ise `allowed` kümesinde) alanları query-string'e
 * uygun `Record<string,string>` olarak döndürür. PII/serbest-metin (ör.
 * `globalSearch`) hiçbir zaman buradan geçmez çünkü kayıtta YOKTUR.
 */
export function pickUrlParams(screen: ScreenDefinition, rawParams: Record<string, any> | undefined): Record<string, string> {
  const result: Record<string, string> = {}
  if (!rawParams || !screen.urlParams) return result
  for (const def of screen.urlParams) {
    const value = rawParams[def.name]
    if (value === undefined || value === null || value === '') continue
    const strValue = String(value)
    if (def.kind === 'enum' && def.allowed && def.allowed.length > 0) {
      const parts = strValue.split(',').filter((p) => def.allowed!.includes(p))
      if (parts.length === 0) continue
      result[def.name] = parts.join(',')
    } else {
      result[def.name] = strValue
    }
  }
  return result
}

/**
 * Ters yön: query string (`route.query`) → sekme parametresi nesnesi (`link.parameters`).
 * `multi: true` alanlar virgülle ayrılmış tek query değerinden DİZİYE açılır (ilgili ekranın
 * gerçekte okuduğu şekle — ör. `internalStatuses` — geri döner); diğerleri tekil string kalır.
 * Kayıtta olmayan/izinsiz sorgu anahtarları YOK SAYILIR (Karar 2 "bilinmeyen query anahtarları").
 */
export function parseUrlParams(screen: ScreenDefinition, query: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  if (!screen.urlParams) return result
  for (const def of screen.urlParams) {
    const raw = query[def.name]
    if (raw === undefined || raw === null || raw === '') continue
    const strValue = Array.isArray(raw) ? String(raw[0] ?? '') : String(raw)
    if (!strValue) continue
    if (def.kind === 'enum') {
      let parts = strValue.split(',').filter(Boolean)
      if (def.allowed && def.allowed.length > 0) parts = parts.filter((p) => def.allowed!.includes(p))
      if (parts.length === 0) continue
      result[def.name] = def.multi ? parts : parts[0]
    } else {
      result[def.name] = strValue
    }
  }
  return result
}
