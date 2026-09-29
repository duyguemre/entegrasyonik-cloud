# 0012 — Gezinme Modeli: URL'li Sekmeli Çalışma Alanı (tek kabuk rotası + ekran kayıt defteri)

## Durum
Kabul edildi (2026-09-27). ADR-0011 Açık Soru 3'ün tam kararıdır; kabuk (P1) göçü T4a bu ADR'ye dayanır. **Bağlayıcı kullanıcı yönlendirmesi** (ADR-0011 Açık Soru 3, 2026-09-27): sekmeli çalışma alanı modeli KORUNUR, tam router geçişi YAPILMAZ; (a) geri/ileri sekmeler üzerinden çalışır; (b) derin bağlantı / adres paylaşımı olur; (c) mevcut persist mekanizmaları keşfedilip referans alınır; (d) responsive/tablet/mobil zorunludur. Protokol 12 kapsamında insan onayı gerektiren adım YOKTUR (yalnızca frontend, geri alınabilir). Bu karar refactor'dür, yeniden yazım değildir (bkz. Gerekçe).

## Bağlam
`PRODUCT_SURFACES.md` §2.2: "iki paralel gezinme sistemi" — router rotaları var ama güvenli alan sekmelerle çalışıyor, URL değişmiyor; §2.8: sol menü `mouseover` ile açılıyor, mobil ikincil; §6.3/5: Tauri/Generative UI için bir yönlendirme sözleşmesi gerekiyor.

**Keşif — bugünkü sekme mekanizması (kod okundu, 2026-09-27):**
1. **Sekme durumu yalnızca bileşen state'inde:** `layouts/SecureLayout.vue:152-157` — `tabs`, `tabSelectors`, `mySelectedTab`, `mySelectedTabParameters` yerel `ref`'ler; sekme kimliği modül düzeyinde bir sayaç (`var index = 0`, `:153`, `:311`). Pinia'da sekme durumu YOK. `composables/opentab.ts` (adına rağmen bir Pinia store'u) yalnızca `SecureLayout`'un `openTab` fonksiyonunu bir değişkende tutan bir köprü (`:4-10`; kayıt `SecureLayout.vue:256`).
2. **Sekme açma yolu:** ~15 çağrı noktası `eventBus.emit('openTab', link)` yayar (`NavigationMenu.vue:109`, `ApplicationBar.vue:314-334`, `StatisticsComponent.vue:150,180`, `ProductListView.vue:767,781`, `NavigationLinksComponent*.vue`, `communication.ts:12`, `context.ts:8` …); `SecureLayout.vue:277` dinler, `openTab` (`:286-320`) `link.code` ile tekilleştirir. `link` = `MenuService`'ten gelen menü düğümü (`stores/site/menu.ts:188`; backend `menu-service.ts` → ApplicationDB `menus` koleksiyonu `_id: "entegrator"`, tüm kullanıcılar için tek menü).
3. **Ekran kimliği:** menü düğümünün `id`'si **çalışma anında sıralı üretiliyor** (`menu.ts:208,216` `tempId++`) → URL'de KULLANILAMAZ. Kararlı anahtar `code` (+ `parent`): bileşen haritası `views` (`menu.ts:15-70`, `parent/code` anahtarlı 43 `defineAsyncComponent`).
4. **Parametreler paylaşılan menü nesnesine yazılıyor:** `link.parameters = {...}` doğrudan menü düğümüne (`StatisticsComponent.vue:165-178`, `ApplicationBar.vue:317-326`, `ProductListView.vue:773`) → aynı ekranın sonraki açılışına sızabilir. Görülen parametreler: `internalStatuses`, `status`, `transferStatuses`, `globalSearch` (**müşteri adı-soyadı dahil** — `ApplicationBar.vue:323`), `filter.globalSearch`, `productId`.
5. **Çok örnekli sekmeler:** `singleton == false` menü bağlantıları gruplanır (`SecureLayout.vue:159-187`); ürün düzenleme her ürün için klonlanmış bağlantıyla açılır (`code = 'ProductUpdateView_' + _id`, `ProductListView.vue:771-782`). `StatisticsComponent.vue:140-150` aynı deseni `orderList` için `productId` ile kullanıyor — anlamsız görünüyor, **ölü/hatalı olabilir, doğrulanamadı**.
6. **"Canlı tutma" (performans) mekanizması:** `<KeepAlive>` aslında etkisiz (tek, sabit `:key="1"` çocuk — `SecureLayout.vue:99-102`); gerçek mekanizma `WrapperComponent.vue:3-6`: açılmış her ekran `v-if="menuLink.isRendered"` ile MONTE KALIR, aktif olmayan `display:none` ile gizlenir. Ekran yaşam döngüsü sözleşmesi `defineExpose({ initialize, activate, destroy })` (`WrapperComponent.vue:22-43`; 10 view uyguluyor). Kapatmada 5 ağır liste (`ProductListView`, `ProductDefinitionView`, `OrderListView`, `MessageListView`, `ClaimListView`) bilinçli olarak monte bırakılır, yalnızca `isInitialized=false` olur (`SecureLayout.vue:338-343`). Kullanıcının "performans + çoklu-işlem sürekliliği" dediği şey budur ve KORUNUR.
7. **Kalıcılık (persist) envanteri:** sekme için **hiçbir kalıcılık YOK** — sayfa yenilemede tüm sekmeler, aktif sekme ve sekme içi durum kaybolur; `init()` yalnızca dashboard'u açar (`SecureLayout.vue:260-271`, menü yüklenene kadar 10 ms'lik yoklama). Projedeki tek istemci-tarafı persist `localStorage 'lang'` (`plugins/i18n.ts:20,37`); tek sunucu-tarafı kullanıcı tercihi persist'i **favoriler** (`menu.ts:98-129` → `MenuService/{retrieve,add,delete,sort}Favorites`, tenant DB `favorites`). Pinia persist eklentisi yok. Pencere boyutu/menü durumu da persist edilmiyor.
8. **Router:** `createWebHistory` (`router/index.ts:495-498`); güvenli çocuk rotalar (`:122-470`) `SecureLayout`'ta `<router-view>` olmadığından fiilen ölü (yalnızca `IntegrationsView.vue` içinde `<router-view>` var, o da sekmeden açılınca çalışmıyor). Guard (`:503-525`) kimlik doğrulanmamış kullanıcıyı `/login`'e atar ama **hedef adresi atar** (dönüş yok) — ADR-0010'un "login'e yönlendir, geri dön" beklentisiyle de çelişir. Giriş sonrası `router.push('/')` (`LoginComponent.vue:210,235`) → `/login` geçmişte kalır.
9. **Sunum:** `frontend/nginx.conf:7` `try_files $uri $uri/ /index.html` → SPA geri düşüşü (derin bağlantı) web'de hazır. Electron (`main.js:14`) dev'de `loadURL`, prod `loadFile` yorumda; Faz 4'te Tauri'ye geçiliyor (ADR-0007).
10. **Responsive:** `SecureLayout` mutlak konumlu (`top: 87px`, `:403,419`), tek `@media (max-width:600px)` (`:430`); sol menü `mouseover` + `event.clientX < 6` (`:2,375-378`) → dokunmatikte açılmaz; `NavigationMenu.vue:2` `temporary` drawer.

## Değerlendirilen Alternatifler

### A. Gezinme/URL modeli
1. **Tam router geçişi** (her ekran bir rota, `<router-view>` + `<KeepAlive>`) — Artı: standart. Eksi: kullanıcı tarafından REDDEDİLDİ; 30+ ekranın `initialize/activate/destroy` sözleşmesi ve çok örnekli sekmeler (`ProductUpdateView_<id>`) yeniden yazılır; `KeepAlive` `max`/anahtar yönetimi bugünkü "kapatılsa da monte kalsın" davranışını birebir vermez.
2. **Router'sız, doğrudan History API** — Artı: tam kontrol. Eksi: vue-router zaten kurulu ve `popstate`'i dinliyor (`/login` için) → iki geçmiş sahibi çakışır; auth guard'ı ikinci kez yazmak gerekir.
3. **Tüm açık sekmeler URL'de** (`?tabs=a,b,c&active=b`) — Artı: yer imi tüm çalışma alanını geri getirir. Eksi: paylaşılan bağlantı alıcıya GÖNDERENİN tüm sekmelerini açar (şaşırtıcı; alıcının menüsünde olmayan kodlar); aktif sekme değişmeden her aç/kapa URL'yi değiştirir; URL uzar; PII taşıyan parametre riski sekme sayısıyla çarpılır.
4. **Tek kabuk rotası: yol = AKTİF sekme (paylaşılabilir kanonik adres), açık sekme kümesi = `sessionStorage` (SEÇİLEN)** — Artı: bağlantı paylaşımı "bu ekranı aç" anlamına gelir (beklenen); yenilemede çalışma alanı döner; `SecureLayout` hiç yeniden monte edilmez (route değişimi yalnızca parametre değişimi) → canlı tutma mekanizması aynen korunur; mevcut auth guard kullanılır. Eksi: yer imi yalnızca aktif ekranı + (aynı tarayıcı sekmesindeyse) oturum çalışma alanını geri getirir; cihazlar/oturumlar arası çalışma alanı taşınmaz (eşik → sunucu persist).

### B. Geri/ileri (tarayıcı geçmişi) politikası
1. **Her etkileşim geçmişe** (filtre, sayfa, detay aç) — Eksi: geri tuşu filtre adımlarını tek tek geri alır, sekmeler arası dönüşü gömer; kullanıcıyı şaşırtır.
2. **Yalnızca sekme AÇMA/KAPAMA geçmişe, sekme değiştirme `replace`** — Eksi: URL aktif sekmeyi gösterdiği için A→B geçişi `replace` olunca geri tuşu, kullanıcının az önce gördüğü A yerine daha eski bir girdiye atlar (görünen geçiş ile geçmiş uyuşmaz); "kapama"yı geçmişe yazmak ise geri = "kapatılanı aç", ileri = "tekrar kapat" gibi tuhaf bir semantik üretir.
3. **Aktif sekme DEĞİŞİMİ (açma veya geçiş) `push`; kapama ve sekme-içi durum `replace`; mobil tam ekran katmanlar için dar bir istisna (SEÇİLEN)** — Artı: geri = "bir önce baktığım sekme" (tarayıcıdaki sayfa gezinmesiyle aynı zihinsel model); öngörülebilir; sekme-içi gürültü yok.

### C. Küçük ekran
1. **Masaüstü sekme çubuğunu her boyutta aynen göster (yatay kaydırma)** — Eksi: 375 px'te 1–2 sekme sığar, kapatma düğmeleri parmakla hedeflenemez, dikey alan kaybı.
2. **Mobilde sekmeleri kapat, tek ekran** — Eksi: yönlendirme (çoklu-işlem sürekliliği) ihlali.
3. **Kırılıma göre kademeli: masaüstü tam çubuk / tablet sıkı çubuk / mobil tek-görünür sekme + sekme değiştirici sayfası (SEÇİLEN).**

## Karar
Sekmeli çalışma alanı korunur ve vue-router'a **tek bir kabuk rotası** üzerinden bağlanır: **URL yolu yalnızca AKTİF sekmeyi** (kararlı slug + isteğe bağlı örnek kimliği + izinli, PII'siz parametreler) kodlar ve paylaşılabilir kanonik adrestir; **açık sekme kümesi Pinia `workspace` store'unda** tutulup kullanıcı+tenant kapsamlı `sessionStorage`'a yansıtılır; **aktif sekme değişimi `router.push`, kapama ve sekme-içi durum `router.replace`**; küçük ekranda sekme çubuğu yerini **tek-görünür sekme + sekme değiştirici sayfasına** bırakır.

### Karar 1 — Router entegrasyonu (tek kabuk rotası)
- Güvenli alan: `path: '/'` altında `SecureLayout` + tek çocuk `path: ':screen(.*)*'` (bileşensiz; `SecureLayout` `<router-view>` render ETMEZ). Route değişimi yalnızca `route.params/query` değişimidir → `SecureLayout`/`WrapperComponent` yeniden monte edilmez, gizli-monte ekranlar yaşamaya devam eder. `/` → `/dashboard`'a `replace` yönlendirme.
- `router/index.ts:122-470`'teki ölü güvenli çocuk rotalar silinir (URL'ler hiç çalışmadığı için geriye uyumluluk gerekmez); `IntegrationsView` içindeki `<router-view>` sekme modelinde anlamsızdır, T4a entegrasyon ekranlarını (P1) taşırken sekme-içi seçim olarak ele alınır.
- **Ayrılmış ilk segmentler** (ekran slug'ı olamaz): `login`, `oauth`, `.well-known`, `api`, `mcp`, `assets` (ADR-0009/0010 uç noktaları ve statik dosyalarla çakışmasın).
- **Auth dönüşü:** guard kimlik doğrulanmamış erişimde `/login?redirect=<yol+query>` yapar; giriş sonrası `router.replace(redirect)` — `redirect` yalnızca `/` ile başlayan ve `//` ile başlamayan göreli yol ise kabul edilir (açık yönlendirme önlemi), aksi halde `/dashboard`. Giriş sonrası `push` → `replace` (`/login` geçmişte kalmaz). ADR-0010'un authorize→login→geri dönüş akışı aynı mekanizmayı kullanır.
- History modu `createWebHistory` kalır (nginx geri düşüşü hazır). Masaüstü kabuğu (Tauri) SPA geri düşüşü sağlayamazsa yalnızca o derlemede `createWebHashHistory`'ye geçilir — şema aynı kalır (Açık Soru 1).

### Karar 2 — URL şeması ve ekran kayıt defteri
- Yeni, frontend'e ait **ekran kayıt defteri** (`src/navigation/screens.ts`, saf TS): her kayıt `{ key: 'parent/code' (menu.ts views anahtarı), slug, instanceParam?, urlParams: {ad: tip} }`. URL ↔ ekran eşlemesinin TEK kaynağı budur; menü `id`'si ve `title` URL'de ASLA kullanılmaz (Bağlam 3).
- Biçim: **`/<slug>[/<örnekId>][?<izinli parametreler>]`**, slug kebab-case İngilizce, kararlı (menü başlığı/çeviri değişse de değişmez). Örnekler:
  - `/dashboard`, `/orders?status=APPROVED`, `/claims?status=WAITING,DELIVERED,SHIPPED`, `/messages?status=WAITING_SELLER`
  - `/products`, `/products/new`, `/products/66f1c0a2e4b0` (çok örnekli ürün düzenleme sekmesi; örnek kimliği = `productId`)
  - `/integrations/marketplace`, `/integrations/erp`, `/settings`, `/logs`, `/admin/clients`
  - Liste: P1 ekranları + menüde erişilebilen tüm `views` anahtarları; kalanların slug'ı kural gereği `code`'dan türetilir (`CustomerListView` → `customers`), T4a kayıt defterini tek seferde doldurur.
- **Parametre politikası (PII yasağı, KVKK/Protokol 7):** URL'ye yalnızca kayıtta `urlParams` olarak bildirilmiş, **kapalı değer kümeli veya teknik kimlik** parametreleri yazılır (durum enum'ları, `productId`, sayfa/sıralama). **Serbest metin arama (`globalSearch`, `filter.globalSearch`) ve kişi adı/telefon/adres içeren hiçbir değer URL'ye YAZILMAZ** (tarayıcı geçmişi, sunucu erişim günlükleri, `Referer` ile sızar; `ApplicationBar.vue:323` müşteri adı-soyadını parametre yapıyor). Bu parametreler yalnızca bellekteki sekme parametresi olarak yaşar; yenilemede kaybolması kabul edilir. Bilinmeyen/izinsiz query anahtarları yok sayılır ve `replace` ile URL'den temizlenir.
- **Çözümleme ve güvenlik:** URL'deki slug, yalnızca kullanıcıya yüklenmiş menüde (`MenuService`) karşılığı olan bir ekrana çözülür (bugünkü erişilebilirlikle aynı; URL yeni bir ekran açmaz). Karşılığı yoksa → `/dashboard`'a `replace` + "Ekran bulunamadı" bildirimi. Yetki sınırı backend RBAC'tir (ADR-0001), URL onu aşamaz. Çözümleme menü yüklenmesini bekler (bugünkü `sleep(10)` yoklaması yerine store'da `await menuStore.init()`).
- **Parametre sahipliği düzeltmesi (davranış korunarak):** parametreler paylaşılan menü düğümüne değil sekme örneğine aittir; `openTab` adaptörü gelen `link.parameters`'ı sekmeye kopyalar ve menü düğümünden siler (Bağlam 4'teki sızıntı). Görünür davranış aynı kalır; T1b kabuk spec'i önce yazılır.

### Karar 3 — Çalışma alanı durumu ve persist
- **Pinia `workspace` store'u** (`stores/workspace.ts`) `SecureLayout.vue:152-373`'teki sekme mantığını (tabs, tabSelectors gruplama, aç/kapa, tekilleştirme, kapatılınca-monte-kalan 5 liste istisnası) **taşır — yeniden yazmaz**; `SecureLayout` yalnızca görünüm olur. Dashboard kapatılamaz kalır (bugün `id == 0`, `:69`).
- **Geriye uyum adaptörü:** `eventBus 'openTab'` ve `useTabStore().openTab(name, params)` API'leri AYNEN korunur ve store'a yönlendirilir → ~15 çağrı noktası toplu değiştirilmez (ekranlar kendi göçlerinde fırsatçı olarak `workspace.open(key, params)`'a geçer).
- **Persist (referans: `plugins/i18n.ts` localStorage deseni + favorilerin kullanıcı kapsamı):** anahtar `ek.ws.v1:<tenantId>:<userId>` altında `sessionStorage`'a yalnızca `{ v:1, tabs: [{ key, instanceId?, urlParams? }] }` yazılır — sıra = sekme çubuğu sırası. Aktif sekme YAZILMAZ (kaynak URL'dir). Form verisi, serbest metin, PII yazılmaz.
  - **Neden `sessionStorage`:** tarayıcı sekmesi başına ayrı çalışma alanı (iki tarayıcı sekmesi birbirinin sekmelerini ezmez), yenilemede hayatta kalır, tarayıcı kapanınca kendiliğinden temizlenir (paylaşılan bilgisayar riski düşük). Açık **çıkışta** (`ApplicationBar.vue:339`) anahtar silinir; oturum süresi dolması (`restapi.ts:20`) SİLMEZ — aynı kullanıcı yeniden girince çalışma alanı döner.
  - **Tembel geri yükleme:** yenilemeden sonra sekmeler çubukta görünür ama bileşenleri `isRendered=false` kalır; yalnızca URL'deki aktif sekme monte edilir, diğerleri ilk etkinleştirmede `initialize` edilir → yenileme N ekranın N API çağrısını birden tetiklemez.
  - Yenilemede **kaybolan** (bilinçli): sekme-içi URL'ye yazılmayan durum (serbest arama, kaydırma, açık diyalog, kaydedilmemiş form). Sunucu tarafı çalışma alanı persist'i YOK (eşik: Maliyet/Ölçek).

### Karar 4 — Geri/ileri politikası
| Olay | Geçmiş | Not |
|---|---|---|
| Yeni sekme açma (menü, arama, dashboard kısayolu, ekran içi bağlantı) | `push` | |
| Var olan sekmeye geçiş (sekme çubuğu, değiştirici) | `push` | aynı sekmeye tekrar tıklama girdi üretmez (tekilleştirme) |
| Sekme kapama | `replace` (yeni aktif sekmenin adresi) | kapama geçmişe yazılmaz |
| Sekme-içi URL-parametresi değişimi (durum filtresi, sayfa, sıralama) | `replace` | bağlantı güncel kalır, geri tuşu filtreleri geri almaz |
| Tarayıcı geri/ileri (`popstate`) | — | store URL'deki sekmeyi etkinleştirir; sekme kapatılmışsa **yeniden açılır** (URL parametreleriyle, taze `initialize`); asla sekme kapatmaz |
| Mobil (<768) tam ekran katman (ör. sipariş detayı diyaloğu) | aynı URL + `history.state.overlay` ile `push` | yalnızca bu dar istisna: Android/iOS geri hareketi katmanı kapatır; masaüstünde uygulanmaz. Ortak composable (`useBackDismiss`), ekranlar göç edildikçe benimser |
- Döngü koruması: store → URL yazımı yalnızca hedef adres mevcut `route.fullPath`'ten farklıysa; URL → store etkinleştirmesi `fromHistory` bayrağıyla yeniden `push` etmez.
- Kaydedilmemiş değişiklik uyarısı bu ADR'nin kapsamı dışıdır (bugün de yok); gerekirse ekran başına `beforeClose` kancası olarak eklenir.

### Karar 5 — Responsive (kırılımlar ADR-0011 token'larından: 768 / 1024)
Kırılım kararı Vuetify `display.thresholds`'a (600/960, ADR-0011 gereği değişmiyor) DEĞİL, `useDisplay().width` ile token sabitlerine (`breakpoint.tablet=768`, `breakpoint.desktop=1024`) bağlanır.
- **≥1024 (masaüstü):** yatay sekme çubuğu (bugünkü `v-tabs show-arrows`), sağ uçta "tüm sekmeler" taşma menüsü (sekme sayısı sığmadığında arama/kapatma); gezinme çekmecesi düğmeyle açılır, kenar-hover isteğe bağlı kısayol olarak kalabilir.
- **768–1023 (tablet):** aynı çubuk sıkı modda (ikon + kısaltılmış başlık, min. 44×44 px dokunma hedefi, kapatma düğmesi her zaman görünür — hover'a bağlı değil), yatay kaydırma + taşma menüsü; çekmece `temporary`, hamburger ile.
- **<768 (mobil):** sekme çubuğu GİZLİ. Üst çubukta aktif sekme başlığı + **sekme değiştirici düğmesi** (açık sekme sayısı rozeti) → `v-bottom-sheet` içinde açık sekmeler listesi (seç / kapat / "tümünü kapat"); tüm sekmeler canlı kalır (süreklilik korunur), yalnızca biri görünür. Gezinme menüsü hamburger ile tam ekran çekmece.
- Kabuk yerleşimi mutlak konumlamadan (`top:87px`) flex düzenine alınır; `mouseover` ile menü açma dokunmatik için tek yol olmaktan çıkar (ADR-0011 T4a kapsamıyla aynı).
- Erişilebilirlik: sekme çubuğu `role="tablist"`/`tab`, kapatma düğmelerinde `aria-label`, değiştirici sayfası klavye ile gezilebilir, etkin sekme değişiminde odak çalışma alanı başlığına taşınır.

### Karar 6 — Playwright (`openScreen()`) etkisi
ADR-0011'in "gezinme modeli değişirse yalnızca `openScreen()` güncellenir" varsayımı **büyük ölçüde doğru, üç düzeltmeyle**:
1. **İmza şimdiden kararlı anahtarla:** T1b `openScreen(page, key)` yardımcısını ekran anahtarıyla (`'OrderListView'` vb., menü `code`) yazmalı, menü başlık metniyle DEĞİL; T1b döneminde gövde "menüyü aç → erişilebilir adla bağlantıya tıkla"dır. T4a sonrası gövde `page.goto(screens[key].slug)`'a döner (daha hızlı, deterministik). Spec'lerin geri kalanı değişmez.
2. **Kabuk spec'i ayrıca değişir (bilinçli):** kabuk görünümü (mobil çubuk yerine değiştirici, hamburger) T4a'nın kasıtlı değişikliğidir → kabuk ekran görüntüleri 3 viewport'ta **yeniden tabanlanır**; menüden tıklama yolu bu spec'te "gerçek kullanıcı yolu" testi olarak korunur (tek spec, tüm ekranlarda değil). 375 px'te menü yolu zaten değişeceği için diğer ekran spec'leri menüye bağımlı kalmamalı.
3. **Yeni spec'ler (T4a'nın kabul kriteri):** derin bağlantı (`goto('/orders?status=APPROVED')` → doğru sekme + filtre), kimliksiz derin bağlantı → `/login?redirect=` → giriş → hedef, geri/ileri (A→B→geri = A; kapat→geri = yeniden aç), yenileme sonrası sekme listesi, PII'li parametrenin URL'de OLMADIĞI (`page.url()` kontrolü), bilinmeyen slug → dashboard. Fixture: `MenuService` sentetik yanıtı kayıt defterindeki `code`'ları içermeli.

## Gerekçe
- **Kullanıcı yönlendirmesi birebir karşılanır:** (a) geri/ileri sekme geçmişi üzerinden (Karar 4); (b) her aktif ekranın paylaşılabilir kanonik adresi var (Karar 2); (c) persist keşfedildi — sekme için hiç yoktu; i18n localStorage deseni ve favorilerin kullanıcı kapsamı referans alınarak oturum-kapsamlı persist eklendi (Karar 3); (d) üç kırılım için somut davranış (Karar 5).
- **Refactor, yeniden yazım değil:** sekme mantığı `SecureLayout`'tan store'a taşınır, `WrapperComponent`'in canlı-tutma mekanizması ve ekranların `initialize/activate/destroy` sözleşmesi, `eventBus 'openTab'` API'si aynen kalır. Audit'te bu modülün "çürümüş" olduğuna dair kanıt yok; sorun eksik özellik (URL/persist/responsive) — yeniden yazım kuralı (adr-writing skill) tetiklenmez.
- **"Yol = aktif sekme" neden "tüm sekmeler URL'de" değil:** paylaşımın doğal anlamı "şu ekrana bak"tır; alıcıya göndericinin 8 sekmesini açmak hatadır. Çalışma alanının kendisi kişisel ve oturumsaldır → `sessionStorage`'ın doğal yeri.
- **Maliyet bilinci:** yeni bağımlılık YOK (vue-router, Pinia, Vuetify mevcut), yeni backend uç noktası YOK, sunucu persist'i YOK. Tek haneli abone ölçeğinde cihazlar arası çalışma alanı senkronu getirisini karşılamaz.

## Maliyet/Ölçek Notu
- **Maliyet:** yalnızca frontend işi (T4a içinde tahmini: store taşıma + kayıt defteri + guard dönüşü + responsive kabuk); ek servis/operasyon yükü yok. Risk: `popstate` ↔ store döngüleri ve geri yüklemede tembel başlatma — Playwright geri/ileri spec'leriyle korunur.
- **Yeniden değerlendirme eşikleri:**
  - En az **2 ödeyen müşteri** cihazlar/oturumlar arası çalışma alanı geri yükleme isterse → favoriler desenindeki gibi sunucu tarafı (tenant DB) çalışma alanı persist'i ADR'si.
  - Mobil emülasyonda (375×812, 4× CPU yavaşlatma) **5 açık sekmede** JS heap **>250 MB** veya sekme geçişinde INP **>200 ms** ölçülürse → mobilde gizli-monte sekmeler için LRU sınırı (ör. en fazla 3 monte; fazlası kapatılmadan `unmount`, yeniden etkinleşince `initialize`).
  - **3'ten fazla** ekranın sekme-içi durumu için "geri tuşu bunu geri alsın" talebi/ihtiyacı doğarsa (ör. liste→detay sayfası) → kayıt defterine ekran başına `historyPush` bayrağı eklenir (Karar 4 genişletilir).
  - Tek oturumdaki ortalama açık sekme sayısı ürün analitiğinde **>12** çıkarsa → sekme grupları/sabitleme özelliği değerlendirilir.
  - Masaüstü kabuğu SPA geri düşüşü sağlayamazsa → o derlemede hash history (Açık Soru 1).

## Etki Alanı
- Yeni: `frontend/src/navigation/screens.ts` (kayıt defteri, saf TS — Faz 4'te Tauri kabuğu ve Generative UI hedefleme için de kaynak), `frontend/src/stores/workspace.ts`, `useBackDismiss` composable'ı, `frontend/e2e/` gezinme spec'leri.
- Değişen: `router/index.ts` (ölü çocuk rotalar → tek kabuk rotası, `redirect` dönüşü), `layouts/SecureLayout.vue` (görünüme iner; responsive kabuk), `components/WrapperComponent.vue` (parametre kaynağı sekme örneği), `composables/opentab.ts` (store'a adaptör), `stores/site/menu.ts` (paylaşılan düğüme parametre yazımı kalkar; `init` beklenebilir), `components/layout/NavigationMenu.vue` + `ApplicationBar.vue` (hamburger, değiştirici, çıkışta persist temizliği), `components/login/LoginComponent.vue` (`replace` + `redirect`).
- Değişmeyen: backend, `MenuService` sözleşmesi, ekranların `initialize/activate/destroy` sözleşmesi, `eventBus 'openTab'` çağrı noktaları, `nginx.conf`.
- Faz 4: Tauri kabuğu / bildirim tıklaması / MCP Generative UI "ekranı aç" eylemi aynı slug şemasını hedefler (PRODUCT_SURFACES §6.3/5 kapanır).

## Açık Sorular (fabrikayı durdurmaz)
1. **Masaüstü kabuğunda history modu:** Tauri'nin özel protokolünün bilinmeyen yollar için `index.html` geri düşüşü Faz 4 adım 1'de doğrulanır; sağlanmazsa yalnız o derlemede `createWebHashHistory`. Electron prod `loadFile` zaten yorumda (kullanılmıyor).
2. **`StatisticsComponent.vue:140-150`** (`orderList`'i `productId` ile klonlayan `openEditProduct`) ölü mü hatalı mı — doğrulanamadı; T4a kayıt defterini doldururken çağrıldığı yer aranır, ölü ise BACKLOG'a "incelenmesi gereken davranış" olarak yazılır, kendimiz silmeyiz.
3. **Service worker:** PRODUCT_SURFACES'teki SW `addAll` hatası düzeltilirken SW navigasyon geri düşüşünün derin bağlantıları `index.html`'e yönlendirdiği doğrulanmalı (aksi halde çevrimdışı önbellekten 404).
