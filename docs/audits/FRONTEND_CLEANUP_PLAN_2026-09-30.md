# Frontend Temizlik ve Yeniden Konumlandırma Planı — 2026-09-30

> Kapsam: `frontend/` (Vue 3 + Vuetify 3 + Pinia + TS). **Yalnız denetim ve plan; hiçbir kod değiştirilmedi** (git indeksine dokunulmadı).
> Yöntem: `knip` (npx, `-c` dış yapılandırma; bellek hatasıyla ikinci koşusu düştü, ilk sonuç geçerli), kendi betiklerim (import grafiği erişilebilirliği, "import edilmiş ama render edilmeyen", `v-for` anahtarları, şablon içi ağır hesap, store anahtar kullanımı, i18n), `jscpd`, `scripts/measure-bundle.js` (mevcut `dist/`, 2026-09-30 17:28), grep çapraz kontrolü. Dinamik kullanım (`defineAsyncComponent`, `views` haritası, `app.component`, `:is`) hesaba katıldı.
> Taban: denetim `cloud/ds-v2-a6b` (`c6354d2`) üzerinde başladı; **çalışma ağacı denetim sırasında `preview/fe-1` dalına geçti** (`55fcb6a9`: fe-breadcrumb + fe-a9 + fe-a10 + fe-a11 birleşmiş). Değişen 19 dosyayla ilgili bulgular (ProductListView, ProductVariantList*, EkListScreen…) yeni tabana göre yeniden doğrulandı; kalanı iki tabanda aynı.
> Önceki belgeler: `docs/FRONTEND_CODE_AUDIT.md` (2026-09-28, `cce6e96`) ve `docs/FRONTEND_GAP_ANALYSIS.md`. Aşağıda yalnız **hâlâ açık** olanlar ve **yeni** bulgular var; kapananlar §1'de tek tabloda.
> Değerlendirme ölçeği: getiri **Y/O/D** (yüksek/orta/düşük), risk **Y/O/D**, efor **S** (≤0,5 gün) / **M** (1–2) / **L** (3–5).

## 0. Kısa sonuç

| Kategori | Bulgu sayısı | Not |
|---|---|---|
| Ölü kod (D) | 15 | ≈ 5 100 satır / 27 dosya silinebilir küme (D-01..D-04) + üye/export/bağımlılık/i18n/varlık artıkları |
| Verimsizlik (V) | 14 | 1 açılış paketi regresyonu (Y), 1 tuş-başı API çağrısı (Y), gerisi O/D |
| Yeniden konumlandırma (X) | 13 | 4 somut çıkarım (X-01..X-04), 3 koşullu, 2 "yapma" |
| **Toplam** | **42** | tip hatası 0, jscpd kopya %2,67 (önceki denetimde %8,4) |

**Önceki denetime göre ilerleme:** ölü kod dalga 1, `restapi` hijyeni (T-01..T-04), tip mandalı 0, biçimleyici birleştirme (`composables/format.ts`, 81 dosya import eder), G-01 XSS, çıkışta store sıfırlama (`stores/resetRegistry.ts`), H-01 sabit müşteri, R13 `manualChunks`, ESLint + no-console mandalı, "Yakında" saplamaları kapandı. Açık kalanlar aşağıda.

### En değerli 10 eylem (getiri/efor sırasıyla)

1. **V-01** `main.ts` ECharts temasını kaydediyor → `vendor-echarts` (564 kB min / **193 kB gz**) açılışta yükleniyor. Açılış JS **409,5 kB gz** (R13 sonrası ölçülen 212 kB idi). Kaydı tembel tüketicilere taşı → ≈ −193 kB gz. (S, getiri Y, risk D)
2. **V-02** Liste aramalarında tuş başına API isteği (7 ekran, debounce ve bayat-yanıt koruması yok). (S, Y, D)
3. **D-01/02/03** Ölü ekran + bileşen kümesi: 21 dosya, ≈ 4 570 satır (7 sahte "Tanım" ekranı, `TEST.vue`, `AdminView.vue`, 9 yetim bileşen). Menü DB doğrulaması + ürün sahibi onayı gerekir. (M, O, D–O)
4. **V-03 + V-04** `integrationStore.getClient*` her çağrıda filter+sort (33 şablon çağrısı, ürün listesinde satır başına); `useIntegrations` aynı 2 isteği ikinci kez atıyor ve sonucu hiç kullanılmıyor. (S, O, D)
5. **X-01** `useListQuery`: 4 kopya filtre composable'ı (401 satır) + 14 ekranda tekrarlanan yükleme/hata/sayfa deseni; bayat yanıt yalnız 6 yerde korunuyor. (M, O, O)
6. **D-04** Sahte veri/oturum store kümesi (`context`, `theme`, `ecommerce`, `marketplace`, `loadingStore`, `composables/integrations`) + `SecureLayout`'ın 4 `provide`'ı. (S–M, O, D)
7. **V-05 + D-15** Derin izleyiciler ve kalan `console.log` (107): `ProductImagesComponent` her varyant değişiminde log + derin klon. (S, O, D)
8. **X-06** 20 saptama bileşeni (13–19 satır) + 4 `if/else if` zinciri → kod→kayıt haritası. (M, O, D)
9. **X-02 + X-03** Görsel taban adresi 7 dosyada sabit; 9 özdeş `formatCurrency` sarmalayıcısı. (S, O, D)
10. **D-11 + D-12 + V-07** Ölü i18n anahtarları (üst sınır 717/1672), gerçek müşteri logosu artık dosyası (`dalzi-…png`), `Intl` nesnelerinin her çağrıda üretilmesi. (S, D–O, D)

### Dalga listesi (ayrıntı §5)

| Dalga | İçerik | Dosya | Çakışma (fe-help, fe-breadcrumb, fe-a8, fe-a9, fe-a10/A12, fe-a11, fe-a13, fe-a14) |
|---|---|---|---|
| **F-CL1a** | Bağımsız güvenli silme | ≈ 13 | Yok — hemen |
| **F-CL1b** | Ölü ekran/bileşen kümesi | ≈ 25 | `stores/site/menu.ts` (fe-a10/A12) → **zincir sonrası** |
| **F-CL1c** | Store/`provide` kümesi | ≈ 9 | `layouts/SecureLayout.vue` (fe-help, fe-a14, fe-a8) → **zincir sonrası** |
| **F-CL1d** | Kullanılmayan export/üye süpürmesi | ≈ 24 | `navigation/*` (fe-a10/A12, fe-a14) hariç tutulursa yok |
| **F-CL2a** | Açılış paketi + `Intl` önbelleği | ≈ 8 | Yok — hemen (en yüksek getiri) |
| **F-CL2b** | `integrationStore` + ürün listesi hesapları | ≈ 5 | Yok (fe-a11 birleşti) |
| **F-CL2c** | Arama debounce + bayat yanıt | ≈ 9 | `CustomerListView` fe-a13 → o dosya sonra |
| **F-CL2d** | Derin izleyici + hata ayıklama günlüğü | ≈ 8 | Yok |
| **F-CL2e** | Şablon içi filtre + `v-for` anahtarları | ≈ 5 | Yok |
| **F-CL3a** | `useListQuery` pilotu (Sipariş, İade, Destek) | ≈ 10 | Yok |
| **F-CL3b** | `useListQuery` Müşteri/Mesaj/Fatura/Yetki | ≈ 8 | `CustomerListView`/`useCustomerFilters` fe-a13 → **zincir sonrası** |
| **F-CL3c** | Saf kural çıkarımı (Sipariş toplu kuralları, ürün listesi sayaçları) | ≈ 6 | Yok |
| **F-CL4a** | `imageUrl` + `formatCurrency` sarmalayıcıları | ≈ 14 | Yok (fe-a11 birleşti) |
| **F-CL4b** | Nitelik/görsel bileşen çekirdeği (L) | ≈ 10 | Yok; **karakterizasyon şart** |
| **F-CL5** | Entegrasyon saptama kaydı | ≈ 26 (2'ye bölünür) | Yok |
| **F-CL6** | `viewRegistry` + `useEventBus` | ≈ 25 | `menu.ts`, `SecureLayout`, `workspace.ts` → **zincir sonrası** |

**Birleştirme zinciri sonrası sıralananlar:** F-CL1b, F-CL1c, F-CL1d'nin `navigation/` kısmı, F-CL3b, F-CL6 (ve F-CL2c'nin `CustomerListView` adımı). Diğer 10 dalga şimdi başlayabilir ve birbirinden bağımsız birleşir (yalnız F-CL1a ↔ F-CL1c `restapi.ts` satırında ve F-CL1b ↔ F-CL1c `menu.ts`/`main.ts` satırında sıra farkı vardır, §5).

---

## 1. Önceki denetimde kapananlar (tekrar edilmedi)

| Önceki ID | Durum | Kanıt |
|---|---|---|
| Ölü dalga 1 (24 dosya, 12 render edilmeyen bileşen) | Kapalı | `IntegrationProductSelectBoxComponent`, `PageComponent`, `ProductBatchPlatformMenuComponent`, `NewProductView`… yok; render edilmeyen import 73 → 4 (D-08) |
| T-01..T-04, 15 vue-tsc hatası | Kapalı | `typecheck-baseline.json` `errorCount: 0`; `restapi.ts` `postImageUpload` dışa verilmiş |
| C-05 biçimleyici kopyaları | Büyük kısmı kapalı | `composables/format.ts` (`formatMoney/Date/DateTime/Duration/Relative/Phone`), 81 import; 22 → 9 yerel sarmalayıcı (X-03) |
| G-01 `v-html` XSS | Kapalı | `components/layout/messageParts.ts`, `utils/escapeHtml.ts` |
| T-15 çıkışta store sıfırlama | Kapalı | `stores/resetRegistry.ts`, `user.ts` `registerStoreReset('userSession')`, `e2e/specs/session-isolation.spec.ts` |
| H-01 sabit müşteri adı/logosu | Kod kapalı, **varlık açık** | `StoreLogoAvatar.vue`; ama PNG hâlâ `public/` içinde (D-12) |
| C-11 bildirim polling'i durmuyor | Kapalı | `notificationDrawer.ts` `stopPolling` + görünürlük yönetimi |
| P-01/P-02 `manualChunks` | Kapalı, **bir kısmı tekrar bozuldu** | `vite.config.mts` doğru; ama `main.ts` echarts'i statik çekiyor (V-01) |
| C-08 e-ticaret/kargo/e-fatura saptamaları | Kısmen | md5-aynı 2 516 satır → 13–19 satırlık sarmalayıcılar (X-06) |
| jscpd | %8,4 → %2,67 (72 klon, 3 673 satır) | bu denetim, `--min-lines 15 --min-tokens 120` |
| R14 lint mandalları | Kapalı | `npm run lint`, `test:no-console-ratchet` (103 tabanı, kaynakta 107 çağrı) |
| ADR-0015 R13 açılış JS hedefi (212 kB gz) | **Aşıldı** | ölçüm 409,5 kB gz (V-01) |

Hâlâ açık ve bu belgeye alınanlar: C-02 (X-01), C-09 (X-12), C-10 (V-11), C-12 (V-04, D-04), T-08 (D-14/X-10), T-09 (D-04), T-11 (D-02), P-03/P-04 (V-14), P-09 (V-05), P-10 (V-08/V-10), G-04 (D-13), H-03 (X-02), R2 (D-01), i18n (D-11).

---

## 2. Bulgular — ölü kod (D)

| ID | Dosya:satır | Sorun (kanıt) | Önerilen eylem | Getiri | Risk | Efor |
|---|---|---|---|---|---|---|
| **D-01** | `views/secure/definitions/{Brand,Customer,Hashtag,Invoice,Option,Order,Return}DefinitionView.vue` (2 203 sat.), `views/secure/productDefinitions/TEST.vue` (528), `views/secure/adminPanel/AdminView.vue` (672); `stores/site/menu.ts:17,22,43-49` harita girişleri | 7 "Tanım" ekranı sahte sabit müşteri tablosu (`restApi` 0 çağrı; jscpd 194 satır çift eşleşme); `TEST.vue` hata ayıklama artığı; `AdminView` = `MessageListView` kopyası (jscpd 105). E2E dışında hiçbir yerden açılmaz: `e2e/specs/legacy-definition-placeholders.spec.ts` (sentetik menüyle) ve `e2e/fixtures/definitionsMenu.ts`. `TEST`/`AdminView` için e2e referansı 0. `screens.ts:117` "AdminView kaydedilmedi, göç edilmedi" der. Backend `src`'de menü tohumu yok → gerçek menü `menus` belgesinde | **Ön koşul:** (1) `menus` belgesinde (`entegrasyonik*` DB, yalnız okuma) bu kodların geçmediği doğrulaması — **doğrulanamadı, ek inceleme gerekiyor**; (2) ürün sahibi onayı (`AdminView`, 7 tanım ekranı — BACKLOG "ürün kararı"). Sonra 9 dosya + harita girişleri + `legacy-definition-placeholders.spec.ts` + fixture + `-snapshots` silinir. `CategoryDefinitionView`, `ProductDefinitionView`, `ProductUpdateView` **KALIR** | O | D–O | M |
| **D-02** | `components/{ScrollComponent,HorizontalScrollComponent,PaginationComponent,CustomDialogComponent}.vue` (598), `components/utility/{ReportMenu,BatchMenu,Expand}Component.vue` (135), `components/layout/BatchProcessMenu.vue` (168), `components/productDefinitions/crud/CategoryNameComponent.vue` (74); `main.ts:29-34,56-61` `app.component` kayıtları | D-01 silinince kalan tek tüketici kayıp: `Scroll`/`Pagination` yalnız sahte ekranlarda; `CustomDialog/HorizontalScroll/ReportMenu/BatchMenu` yalnız `TEST.vue`; `BatchProcessMenu` yalnız `AdminView`; `Expand` yalnız `Scroll`; `CategoryName` yalnız `TEST`. Erişilebilirlik betiği (`reach.cjs`) bunu doğruladı: silme sonrası yetim = tam bu 3 dosya + 6 global bileşen | D-01 ile aynı PR: dosyalar + `main.ts` kayıtları + `communication.ts` sadeleştirme (D-14/V-11) | O | D | S |
| **D-03** | `components/layout/DividerComponent.vue` (33; `lang="ts"` yok), `components/layout/EmptyState.vue` (78; `EkEmptyState` yerine geçti), `components/productDefinitions/products/ProductAdvancedSearchComponent.vue` (81) | `main.ts`'ten erişilemeyen; `src`'de import/etiket 0. E2E'de yalnız yorum: `products.spec.ts:75`, `admin-clients.spec.ts:38` | Sil | D | D | S |
| **D-04** | `stores/context.ts` (46), `stores/theme.ts` (21), `stores/ecommerce.ts` (172), `stores/marketplace.ts` (202), `stores/loadingStore.ts` (28), `composables/integrations.ts` (54); `layouts/SecureLayout.vue:90-93,109-112` 4 `provide`; `views/secure/productDefinitions/CategoryListView.vue:51`, `definitions/CategoryDefinitionView.vue:57` (`inject('useContextStore')` atanır, hiç kullanılmaz); `components/adminPanel/AdminClientDetailComponent.vue:313-427` (yalnız logo yolu için `getMarketplaces()`); `composables/restapi.ts:3,209` (`loadingStore` atanır, kullanılmaz) | Pinia olmayan sabit/sahte veri fabrikaları (`marketplace.ts` sahte `products:'200'`…), `context.ts` gövdesi boş (kendi başlık notu "hiçbir yerden okunmuyor"), `loadingStore` `console.log` içerir ve tüketicisi yok, `theme.toggleTheme` gövdesi yorum | Tüketicileri kaldır → `AdminClientDetailComponent` `integrationStore.getIntegrationImagePathByCode` kullanır; `provide`/`inject` satırlarını ve 5 dosyayı sil (`ecommerce/marketplace` yalnız D-01 ekranlarında da kullanılıyor: önce D-01) | O | D | S–M |
| **D-05** | `components/ds/EkPagination.vue` (105), `ds/templates/EkWizardTemplate.vue` (188), `ds/templates/EkReadonlyPanelTemplate.vue` (88) | Hiçbir SFC/TS import etmez (yalnız yorumda/belgede: `EkListPage.vue:7,25`, `EffectiveConfigView.vue:4`). `docs/PRODUCT_VALUE_PLAN.md:60,228,294` sihirbaz/salt-okunur panel için planlı | **Silme, işaretle:** planlı kullanım var (onboarding sihirbazı, toplu değişiklik). `EkPagination` için `EkPagerBar` varken karar: DESIGN_SYSTEM §6 kataloğundan çıkar veya tut | D | — | — |
| **D-06** | `composables/useOnboarding.ts` (133), `package.json` `driver.js` | knip: kullanılmayan dosya; tek tüketici (`ProductVariantsComponent`) gitti. `docs/PRODUCT_VALUE_PLAN.md:215` N12 "kurulum rehberi" olarak yeniden kullanmayı planlıyor | Karar (ürün sahibi): N12 başlamıyorsa dosya + `driver.js` kaldırılır. **Şimdilik dokunma** | D | — | S |
| **D-07** | Dış kullanımı olmayan üyeler (betik `storekeys.cjs`; dosya içi kullanım ayrıca doğrulanmalı): `stores/site/menu.ts` {`getMenuLink, systemMenu, supportMenu, getFavoriteLinks, isFavoriteLink, deleteFavoriteLink, addFavoriteLink, getFavorites, sortFavorites`}; `integrationStore.ts` {`getIntegrationImagePathWithIntegrationCode, getIntegrationCategories, isClientHasIntegration, sortClientMarketplaces`}; `staticsStore.ts` {`PRODUCT_INTEGRATION_STATUS, TICKET_TYPE, TICKET_TYPE_DESCRIPTIONS, TICKET_STATUS`}; `categoriesStore.ts` 3, `choicesStore.ts` 3, `hashtagsStore.ts` 5, `notificationDrawer.ts` 5 (`getDrawer…fetchNotifications`), `workspace.ts` 3 (`tabSelectors, menuLinkCode, resolveActiveFromRoute`), `user.ts` `getResources`, `formrules.ts` 9 kural (`numberRules, barcodeRules, ipRules, urlRules, specialRule, length_1_4, length_4_250, length_4_15, length_2_32`), `composables/integrations.ts` `getPlatform, folderPaths` | "Dış kullanım yok" ≠ "ölü": aynı dosyada iç çağrı olabilir (`getFavorites` gibi); `tests/` da tarandı | Her üyeyi elle doğrula; yalnız iç çağrısı da olmayanları sil. `formrules` kuralları için `tests/`'e bak | D | D | S–M |
| **D-08** | `views/secure/adminPanel/integrations/IntegrationConfigListView.vue`, `views/secure/FinancialListView.vue`, `views/secure/integrations/IntegrationHealthView.vue` (`EkButton`), `views/secure/OrderListView.vue` (`EkContextMenu`) | Import edilmiş, şablon/script'te kullanılmıyor (betik; `/* ESLint no-unused-vars */` yakalamıyor: `vue-tsc` ihlal saymıyor) | 4 import satırını sil | D | D | S |
| **D-09** | knip: 30 kullanılmayan export, 23 kullanılmayan tip. Örnek: `composables/useAuditLogApi.ts` (11 export), `adminPanel/integrations/settingsCatalogMirror.ts` (5+7 tip), `design/tokens/*`, `navigation/registerIntent.ts:REGISTER_INTERVALS`, `navigation/sections.ts`, `types/*_STATUS_COLORS`, `PLATFORM_PROCESS_ICONS`, `plugins/i18n.ts:SUPPORT_LOCALES/loadLocaleMessages`, `composables/logger.ts:useLogger` | Çoğu `export` anahtar kelimesi fazlası (aynı dosyada iç kullanım var). `types/*` renk sabitleri `status-map.ts` ile çift kaynaklı olabilir | `export` kaldır (silme değil); `types/*_COLORS` ve `i18n.ts` artıkları için `status-map.ts` ile tekleştirme. **Bekçi:** knip'i CI'a değil, tek seferlik betik olarak kullan (yeni araç ekleme) | D | D | S |
| **D-10** | `package.json` | knip: `driver.js` (D-06), `electron-squirrel-startup` (`main.js` `require` etmiyor; `forge.config.js:17` maker-squirrel ister — **doğrulanamadı**), 5 `@electron-forge/maker-*` (**yanlış pozitif**: `forge.config.js` dizgeyle çağırır). `bson` yalnız `ProductDefinitionView.vue:99` (tek `new ObjectId()`; lazy chunk 64 kB içinde); `uuid` yalnız `IdeasoftComponent.vue:60`; `jsbarcode` yalnız `BarcodePrintComponent.vue:37` | `bson` → 24-hex üretici (`ProductUpdateView` zaten elle üretiyor); ObjectId biçim uyumu backend ile doğrulanmalı. `uuid` → `crypto.randomUUID()` (yalnız OAuth `state`: güvenlik açısından eşdeğer) | D | D | S |
| **D-11** | `plugins/locales/tr.json` (1 672 anahtar), `en.json` (428) | Literal referansı olmayan: tr **717**, en **105** (**üst sınır**: dinamik `t('…'+x)`/şablon anahtarları var — `integrationCoverage.count.*`, `subscriptionBanner.*`, `menu.*` (`navigation/menuTitle.ts:53-55`) — yanlış pozitif üretir). Gerçek aday: `productDefinitions.*` **242/309** anahtar referanssız (110 kullanım 29 dosyada). en.json tr'nin %26'sı: dil desteği ürün kararı | Test tabanlı budama: dinamik önek listesiyle "kullanılmayan anahtar" Vitest'i yaz, önce `productDefinitions.*`. EN parity'si ayrı ürün kararı | D | O (dinamik anahtar) | S |
| **D-12** | `public/assets/images/dalzi-ayakkabi-canta-ith-ihr-ltd-sti_1695973096.png` (14 kB), `public/icons/screenshot.png` (760 kB; `manifest.json:22`), `main.ts:7` `import '../public/assets/css/site.css'` (13,5 kB) | Gerçek müşteri logosu dosyası kodda artık referanssız ama `dist/`'e ve imaja giriyor (ADR-0014: izin belgelenmemiş). `screenshot.png` PWA kurulum görseli (3820×1886) ağır. `public/` altından CSS import'u Vite uyarısı üretir | PNG'yi sil; `screenshot.png` → WebP ≤150 kB; `site.css` → `src/design/` (görsel-taban riski: `style-baseline` ratchet ve ekran görüntüsü kapısı) | D | D | S |
| **D-13** | `composables/restapi.ts:100-125,207-211` (`getExternalService`, `getExternal`), `:203-205` `processResponse` (boş gövde; `mode`/`message` parametreleri işlevsiz), `:209` `loadingStore` | `getExternal` çağıranı 0 (G-04 tuzağı: global `withCredentials` ile dış URL'ye çerez sızdırır); `postImageServiceIdentityUpload` dışa verilmiş ama çağıranı 0 | 4 kalemi sil; `restApi.get/post` imzaları (`mode`, `message` konumsal parametreleri) çağıranlar için **korunur** | D | D | S |
| **D-14** | `stores/site/menu.ts:95-113,65,22` | Ölü gövde: `data = {"duyguServ11ice"…}` (95-104), boş `supportMenu/systemMenu` (107-112), `'user/EducationView'` → `SubscriptionView` haritası (LGS adı; kısayolu yanlış ekrana bağlayabilir, DB doğrulaması D-01 ile), `'productDefinitions/TEST'`; 5 özyinelemeli arama kopyası (X-10) | D-01/F-CL1b ile aynı PR | D | D | S |
| **D-15** | 107 `console.*` (mandal tabanı 103): `ProductVariantAttributesComponent` 8, `ProductVariantImagesComponent` 8, `ProductImagesComponent` 7, `ProductListView` 6, `choicesStore` 6, `ProductBatchVariantAttributesComponent` 6, `ProductDefinitionView` 6, `ProductUpdateView` 4 (`:304,384,488,501`) | Hata ayıklama artığı; bir kısmı sıcak yolda (izleyici içinde `console.log(choiceIds)`, `ProductImagesComponent.vue:272-280`) | V-05/F-CL2d ile birlikte sil; `test:no-console-ratchet --write` ile tabanı düşür | D | D | S |

---

## 3. Bulgular — verimsizlik (V)

| ID | Dosya:satır | Sorun (kanıt) | Önerilen eylem | Getiri | Risk | Efor |
|---|---|---|---|---|---|---|
| **V-01** | `src/main.ts:43-46` (`import * as echarts from 'echarts/core'` + `registerTheme('entegrasyonik', …)`); tüketiciler yalnız tembel: `logListView/DetailedExportLogReport.vue:142`, `DetailedImportLogReport.vue:112`, `views/secure/adminPanel/AdminSystemManagementView.vue:71-451` (`theme="entegrasyonik"`) | `dist/index.html` 3 `modulepreload`: `vendor-vue`, `vendor-vuetify`, **`vendor-echarts` (564 kB min / 193 kB gz)**. `measure-bundle.js`: **açılış JS 409,5 kB gz** (R13 sonrası hedef/ölçüm 212 kB). Kök neden: `main.ts` echarts çekirdeği + zrender'ı statik import ediyor. Dashboard grafikleri zaten kendi teması için tembel `ensureDashboardChartTheme()` (`dashboard/chartTheme.ts:14`) kullanır — aynı desen | `ensureSiteChartTheme()` (tek seferlik kayıt, `design/echarts-theme.ts` yanına veya `components/charts/`) yaz; 3 tembel tüketici modül kapsamında çağırır; `main.ts` 43-46 silinir. Beklenen: açılış ≈ 216 kB gz (−193 kB, −%47), açılış CSS/JS istek sayısı 1 azalır | **Y** | D | S |
| **V-02** | `components/ds/templates/EkListScreen.vue:38,58` (`update:search` her tuşta); tüketiciler: `OrderListView.vue:496`, `ClaimListView.vue:279`, `CustomerListView.vue:230`, `InvoiceListView.vue:255`, `MessageListView.vue:317`, `supports/TicketListView.vue:308`, `user/AuthorizationListView.vue:247` | Hepsi `onSearchInput(v){ form.globalSearch=v; getX(true) }` → **her tuş vuruşunda sunucu isteği**, iptal/son-istek-kazanır yok (`requestSeq` yalnız 6 yerde: `FinancialCargoInvoicesTab/PayoutsTab/SummaryTab`, `PayoutDetailSheet`, `ShellSearch`, `AuditLogView`). Yavaş yanıt hızlıyı ezebilir (yarış). Debounce yalnız `ShellSearch.vue` (`useDebounceFn`, `@vueuse/core` zaten bağımlılık) | `composables/useDebouncedSearch(fn, 350)` (ya da doğrudan `useDebounceFn`) + her `getX`'e `requestSeq` koruması (X-01 gelince orada olur). **EkListScreen'e dokunma** (fe-a8 alanı); çözüm görünüm tarafında. Enter/`search-submit` anında çalışsın | **Y** | D (davranış: gecikme 350 ms; e2e beklemeleri) | S |
| **V-03** | `stores/integrationStore.ts:255-293` (`getClientPlatforms/Marketplaces/Erps/Shipments/ECommerces`), `:311` `isClientHasIntegration`; şablon çağrıları 33 (`getClientMarketplaces()` vb.); `views/secure/productDefinitions/ProductListView.vue:179,346-374` (`getCountSummary(row.variants)` şablonda satır başına + içinde `getClientPlatforms()`) | Her çağrı `filter` + `sort` + (platformda) 3 dizi birleştirir; ürün listesinde satır × varyant × platform. `getClientPlatforms` `integrationList` boşken `[...undefined]` **TypeError** riski (ilk render öncesi) | Store'da `computed` (`clientMarketplaces` …); mevcut `getClient*()` işlevleri computed `.value` döndürür → çağıran değişmez. `getCountSummary` → `computed` Map (ürün id → özet) veya saf `productListModel.ts` (X-05) | O | D | S |
| **V-04** | `composables/integrations.ts:9-30`; `components/productDefinitions/products/ProductBatchProcessComponent.vue:125,137` | `useIntegrations()` `IntegrationService/integrationTypes` + `IntegrationService` isteklerini **`integrationStore.init` ile aynı** ikinci kez atar; sonuç `const integrations = useIntegrations()` ile atanıp **hiç kullanılmaz**; modül-düzeyi durum çıkışta sıfırlanmaz | İmport + kullanım + dosyayı sil (D-04) | O | D | S |
| **V-05** | `views/secure/productDefinitions/ProductListView.vue:317-334` (`selectedVariantsMap` derin izleyici, her varyant tık'ında tüm haritayı dolaşır), `components/productDefinitions/crud/ProductImagesComponent.vue:258-282` (`props.productInfoForm.variants` derin + `immediate`, içinde `console.log`), `components/CategorySyncComponent.vue:257` (`selectedCategoryModel` derin → `reset()`), `logListView/DetailedImportLogReport.vue:333-335` (`allImpactedCategories` computed üstünde derin izleyici; computed zaten yenisini üretir), `ChoicesSyncComponent.vue:238` (yorum içi) | 4 canlı derin izleyici. `ProductListView` seçim durumu: `selectedProducts.includes` + `gridSelectedKeys`/`indeterminateKeys` `products.filter(...)` her render'da O(n) (`:663-664`). *(ProductVariantListComponent'in derin izleyicisi fe-a11 yeniden yazımında kalktı.)* | `ProductListView`: seçim durumunu `Set`/`Map` + olay tabanlı güncelle (izleyici yerine `onProductSelectionUpdate` içinde). Diğerleri: hedef alanları izle (`() => x.id`/`.length`) ya da `computed` türet. **Ölçüm yok** — gerçek veri hacmiyle kanıtlanmadı, yalnız kod kanıtı | O | O (ürün formu davranışı) | M |
| **V-06** | `views/secure/adminPanel/AdminSystemManagementView.vue:1062,1074`, `stores/notificationDrawer.ts:89-116`, `stores/subscriptionBanner.ts:56-63` | Yoklayıcılar: `notificationDrawer` (30 sn, görünürlükte durur ✓), `subscriptionBanner` (15 dk; durdurulur ✓), Admin `autoRefresh` (10 sn; belge gizliyken **durmaz**) | Yalnız Admin ekranına görünürlük duraklatması ekle (`useDocumentVisibility` @vueuse). **`usePolling` composable'ı YAZMA** — 2 gerçek yoklayıcıdan biri zaten doğru; soyutlama getirisi yok (kullanıcı yönergesi) | D | D | S |
| **V-07** | `composables/format.ts:39-70` | `new Intl.NumberFormat`/`DateTimeFormat` **her çağrıda** oluşturulur (`formatMoney/Number/Percent/Date/DateTime`, 81 dosya import eder; tablo hücrelerinde satır×sütun) | `(locale,options)` başına modül düzeyi önbellek (`Map`) veya sabit örnekler; `tests/format.test.ts` çıktıyı korur | O | D | S |
| **V-08** | `components/productDefinitions/variants/ProductVariantAttributesComponent.vue:124,228,331`, `ProductBatchVariantAttributesComponent.vue:117,214`; anahtarsız gerçek listeler: `ChoicesSyncComponent.vue:141`, `ProductTransferComponent.vue:121`, `…Attributes…:54,82,59,87` (`<li v-for="choice of …">`) | `v-for="attribute of platformAttributes.get(code).filter(…)"` **şablonda** (3+2 yerde, her render'da yeniden filtre + anahtar yok) | Bileşende `computed` (`variantAttributes`, `requiredAttributes`) + `:key="attribute._id"`; F-CL4b ile örtüşür ama bağımsız yapılabilir | D–O | D | S |
| **V-09** | `stores/integrationStore.ts:10,15,52-60` (`integrationCategories`/`integrationCategoryAttributes` = `ref(new Map())`), `:14-34` `processCategories` (girdiyi mutasyona uğratır, `childSearch` dizileri O(n·derinlik)), `getIntegrationCategory2/3` doğrusal `find` | Pazaryeri kategori ağaçları (binlerce düğüm) derin reaktif Map içinde; her erişim proxy üretir. **Gerçek boyut/etki ölçülmedi — doğrulanamadı, ek inceleme gerekiyor** | Ölçmeden yapma. Ölçüm (Chrome Performance, Trendyol/HB kategori seçici açılışı) gösterirse `shallowRef` + `markRaw` + id→düğüm Map | D | O | S–M |
| **V-10** | 235 `v-for`: 32 anahtarsız (20'si `n in item.raw.level` girinti aralığı — zararsız; 6 gerçek liste V-08'de), 38 indeks-anahtar (çoğu iskelet/aralık `n in 3`; durumlu olan: `claim/ClaimDetailComponent.vue:42,89`, `logListView/Detailed{Export,Import}LogReport`, `adminPanel/AdminChatComponent.vue:21`, `productDefinitions/variants/ProductVariantListTooltipComponent.vue:41,73`, `order/BarcodePrintComponent.vue:5`) | Hepsi salt-okunur, yeniden sıralanmayan listeler → yanlış DOM yeniden kullanımı riski **düşük**. Sürükle-bırak (sortablejs) listeleri (`ProductImagesComponent`, `ProductVariantImagesComponent`) doğru anahtar kullanıyor (`v-for` 1 yer) | Eylem yok; yalnız V-08'deki 6 yer. (Önceki denetimin P-10 riski büyük ölçüde geçersiz) | D | D | S |
| **V-11** | `composables/site/communication.ts:9,50-53` | `initialized` her çağrıda `false` → `window.addEventListener('resize', …)` her `useCommunication` çağrısında eklenir, `onUnmounted`'da kaldırılmaz. Çağıranlar: `SecureLayout` (bir kez) + 3 ölü bileşen (`CustomDialog`, `Expand`, `TEST`) | D-02 sonrası tek çağıran kalır → sorun kendiliğinden biter; yine de `initialized` değişkenini sil, dinleyici `onBeforeUnmount`'ta kaldırılsın | D | D | S |
| **V-12** | `views/secure/user/SubscriptionView.vue:215` ↔ `stores/subscriptionBanner.ts:35,50-58` ↔ `composables/subscriptionStatus.ts:38` | Aynı `BillingService/getMySubscription` iki yerde (store + görünüm), ekran açıldığında ayrıca sorgular | Görünüm `subscriptionBanner.response` + `refresh()` kullanır (mevcut inflight koruması var) | D | D | S |
| **V-13** | `composables/user.ts:10-15,25-32,117-144` | `initApp` girişte 4 katalog (`categories/brands/choices/hashtags`) + `getResources/getSettings/getProductStatistics` + `MenuService` isteklerini ateşler — hangi ekrana gidilirse gidilsin (ürünsüz/sadece sipariş kullanan kiracıda gereksiz) | Yalnız gözlem: tembel katalog yüklemesi (`retrieve` ilk kullanımda) kazancı ölçülmedi. **Yapma** (önce ölç, yönerge: somut risk yok) | D | O | M |
| **V-14** | `stores/integrationStore.ts:6` (`import { get } from 'sortablejs'`), `views/secure/definitions/ProductDefinitionView.vue:99,217` (`bson`) | `get` hiç kullanılmıyor (otomatik içe aktarma kalıntısı); `sortablejs` başlangıç zincirine bağlanır. `bson` tembel chunk'ta (64 kB) | İlkini sil (F-CL2a); `bson` D-10 | D | D | S |

**Pozitif kontroller (bulgu değil):** tüm rotalar/menü görünümleri tembel (`router/index.ts`, `menu.ts` `defineAsyncComponent`); `lodash/moment/dayjs/date-fns` yok; `EventSource`/`WebSocket` yok; interval'lar temizleniyor (`EkRefreshButton`, `MessageListView:223-224`, `NotificationCenterView:524-526`, Admin, iki store); `VariantGrid` pencereli (`windowRows`), `useVariantSheet` DOM'dan bağımsız; `quill` (168 kB) tembel chunk'ta; tip hatası 0.

---

## 4. Bulgular — yeniden konumlandırma (X) ve karar kuralı

### 4.1 Karar kuralı (repoya uyarlanmış)

| Hedef | Ne zaman | Bu kod tabanından örnek | Bu kod tabanında YAPILMAYACAK |
|---|---|---|---|
| **Saf util / model** (`*.ts`, `vue` import etmez) | Durumsuz; girdi→çıktı; test edilebilir; birden çok yerde ya da bileşen içinde kuralla karışık | `composables/format.ts`, `components/ds/listStandard.ts`, `variants/variantListModel.ts`, `useLifecycle` çekirdeği | Bileşene sıkı bağlı 1 yerde kullanılan 5 satırlık yardımcı |
| **Composable** (`use*.ts`) | Durum bileşen/ekran ömrüne bağlı; `ref/watch/onScopeDispose` gerekir; **≥3 tüketicide** aynı kalıp; iptal/temizlik içerir | `useListQuery` (X-01), `useToast`, `useVariantSheet`, `useSavedViews` | Tek tüketicili "her şeyi composable'a çek"; `useBusy`/`useConfirmDialog` gibi 55–116 kullanımı tek seferde göç ettirmek |
| **Pinia store** | Uygulama genelinde paylaşılan sunucu-türevi/oturum durumu veya **önbellek**; çıkışta sıfırlanmalı → `registerStoreReset` | `integrationStore`, `workspace`, `notificationDrawer`, `subscriptionBanner`, katalog önbellekleri | Modül düzeyi `ref` tekilleri (`composables/integrations.ts`); Pinia olmayan "store" fabrikaları (`context/theme/…`) |
| **API çağrısı** | Tek kapı `restApi.post/get` (op adı **literal**: backend `operation-policy.test.ts` tarar). Bileşen içi çağrı, yalnız o ekrana özgüyse kalır | 239 `restApi` çağrısı | Op adını dinamikleştirme; per-servis sarmalayıcı katmanı (ADR-0019 `restApi.call` ile yeniden yazılacak → boşa iş) |

Eşik: bir kalıp **≥3 yerde** tekrar ediyor **ve** somut bir kusur taşıyor (bayat yanıt, sızıntı, tutarsız çıktı) ise çıkarılır; yalnızca "tekrar var" yetmez.

### 4.2 Bulgular

| ID | Dosya:satır | Sorun | Hedef | Getiri | Risk | Efor |
|---|---|---|---|---|---|---|
| **X-01** | `components/{order,claim,ticket,customer}/composables/use{Order,Claim,Ticket,Customer}Filters.ts` (100/99/96/106 = 401 satır), 14 liste ekranı (`isRequestError`: Order, Claim, Customer, Invoice, Message, Ticket, Authorization, Choice, Hashtag, ExportLog, ImportLog, AdminClient, AdminTicket, Financial) | Üç desenin kopyası: `pagination{limit,page,totalNumberOfPages,totalNumberOfRecords}`, `sortBy→{field,direction}`, `formattedStartDate/EndDate` (`toLocaleDateString('tr-TR',…)`), `resetFilters`, `handlePageChange`, `prepareFilterPayload`; fark yalnız alan adı/enum (`diff` ile doğrulandı). Yükleme/hata/`loadProblem` + bayat yanıt koruması (`requestSeq`) yalnız 6 yerde | **Composable** `composables/useListQuery.ts`: `{ filters, page, limit, sortBy, items, total, status, error, payload(), reload(reset), onSort, setPage, cancel }` — `payload()` bugünkü `{pagination:{page,limit},sort:{field,direction},filter}` sözleşmesini **bayt-özdeş** üretir; son-istek-kazanır + V-02 debounce'u içerir. Pilot: Order → Claim → Ticket; sonra Customer (fe-a13 sonrası). Hata=boş davranışı korunur (`isRequestError` ayrımı `listStandard.ts`'te) | O | O | M |
| **X-02** | `crud/ProductImagesComponent.vue:151`, `products/ProductImageComponent.vue:12`, `variants/ProductBatchVariantAttributesComponent.vue:359`, `ProductVariantAttributesComponent.vue:484`, `ProductVariantImageComponent.vue:12`, `ProductVariantImageEditComponent.vue:11`, `ProductVariantImagesComponent.vue:182` | `ref('https://images.entegrasyonik.com/products/')` + `+ 'temp/'` 7 dosyada; `config/env.ts` `VITE_IMAGE_BASE_URL` var ama kullanılmıyor → staging/yerel yanlış sunucu | **Saf util** `config/imageUrl.ts` (`productImageUrl(id, {temp})`, kaynağı `config/env.ts`); `restApi.getImage()` ile aynı taban | O | D (URL biçimi aynı kalmalı; e2e ürün görsel spec'leri) | S |
| **X-03** | `variants/platformInfos/{Hepsiburada,Ideasoft,N11,Trendyol}VariantInfoComponent.vue`, `platformInfos/VariantInfoComponent.vue:110`, `ProductDetailsComponent.vue:81`, `ProductSingleVariantComponent.vue:122`, `ProductVariantListTooltipComponent.vue:137`, `views/secure/FinancialListView.vue:476` | 8 özdeş `const formatCurrency = (n) => formatMoney(Number(n))` + Financial'da `parseFloat(...).toLocaleString('tr-TR',{minimumFractionDigits:2})` (farklı çıktı: `1.234,50` vs `₺1.234,50`) | **Saf util** (zaten var): şablonlarda doğrudan `formatMoney`; Tooltip'in `0 → ₺0,00` özel durumu ve Financial'ın çıktı farkı **bilinçli karar** (`format.test.ts` ile) | D–O | D | S |
| **X-04** | `views/secure/OrderListView.vue:444` (`bulkActionCounts`), `:532` (`isOrderLocked`), `:588` (`triggerBulkAction`), `composables/useLifecycle.ts` | Toplu eylem uygunluğu ve 2 dk kilit kuralı görünüm içinde; `useLifecycle` ile ayrışık (önceki denetim C-07 "iki sürüm": INVOICE `[APPROVED,SHIPPED]` toplu vs `+DELIVERED` tekil). **Bugün kural testi yok** | **Saf util** `components/order/orderRules.ts` + Vitest (tablo güdümlü, bugünkü iki sürümü ayrı adlı sabitler); değer hizalaması ürün kararı, bu adım **davranış değiştirmez** | O | D | S–M |
| **X-05** | `views/secure/productDefinitions/ProductListView.vue:346-374` (`getCountSummary`), `:288-334` (seçim/indeterminate kuralı), `variants/variantListModel.ts` (fe-a11 saf model) | Platform aktarım durumu sayacı ve varyant seçim kuralı görünüm içinde; sayaçlar şablonda | **Saf util** `productListModel.ts` (`variantListModel.ts` yanına, `tests/variant-list-model.test.ts` gibi) + V-03/V-05 computed'ları | O | D | S |
| **X-06** | `components/integrations/{ecommerce,shipment,einvoice}/*.vue` (20 dosya, 13–19 satır: `<IntegrationComingSoonPanel platform-name=… category=… alternative-capability=…/>`), `views/secure/integrations/{Shipping,ECommerce,EInvoice,Erp,Marketplace}View.vue` (`code == 'x'` `template v-else-if` zincirleri: Shipping 9 dal, ECommerce 8) | 20 aynı biçimli dosya + 5 zincir; yeni platform = 1 dosya + 1 dal + 1 import | Veri odaklı kayıt: `integrations/registry.ts` (`code → { component } | { comingSoon:{name,category,alternative} }`), görünüm `<component :is>`; canlı bileşenler (`Ideasoft`, `Bizimhesap`, 4 pazaryeri) aynen kalır. `docs/INTEGRATIONS_REGISTRY.md` ile hizala | O | O (e2e `integrations-common/einvoice` snapshot'ları) | M |
| **X-07** | `variants/ProductVariantAttributesComponent.vue` ↔ `ProductBatchVariantAttributesComponent.vue` (jscpd **504 satır** script + 141 html + 109 css), `ProductVariantImagesComponent` ↔ `crud/ProductImagesComponent` (193/116/102/97) | Kopya çekirdek: `platformAttributes`, `checkCategoryPlatformMapping`, `platformInfoComponentsMap` (`:511-515` ↔ `:384-388`), görsel yükleme | **Composable** `usePlatformAttributes()` (durum ekrana bağlı) + ortak alt bileşen; **karakterizasyon şart**: bu bileşenlerde birim testi 0, e2e `product-variants/product-variant-dialogs` smoke düzeyinde. Test yazılmadan taşıma YOK | O | Y | L |
| **X-08** | `views/secure/{OrderListView:267,ClaimListView:156}.vue`, `adminPanel/AdminTicketListView.vue:161`, `supports/TicketListView.vue:172`, `user/SubscriptionView.vue:157` + `useClaimActions/useCustomerActions/useOrderActions/useOrderCancel/useTicketActions` | `confirmDialog = reactive({show,title,subtitle,message,icon,color,confirmIcon,confirmText,onConfirm,onCancel})` 5 kopya; composable'lar diyalog nesnesini parametre alır | **Koşullu** `useConfirmDialog()` (`confirm({…}): Promise<boolean>`) — yalnız bu görünümlere dokunulurken. Toplu göç **yapma** | D–O | O | M |
| **X-09** | `composables/user.ts:10-15` (modül düzeyi `userContext/resources/settings/stores/productStatistics/activeClientId`), 24 `useUser()` çağrısı, her çağrıda 6 store | T-15(a) kalanı; çıkış sıfırlaması `registerStoreReset('userSession')` ile çözüldü | **Yapma** (Pinia `auth` store'a taşıma somut hata kapatmıyor; yönerge) | — | — | — |
| **X-10** | `stores/site/menu.ts:154-197,385-420,451-470` (5 özyinelemeli arama: `findByCodeInMenu`, `retrieveMenuLink*`, `createConstantMenu`, `getViewComponent`), `views` haritası 60+ satır (`:15-88`) | Aynı ağaç dolaşımı 5 kez; harita ile mantık bir arada; sunucu verisi mutasyonu | **Saf util** `navigation/viewRegistry.ts` (harita; anahtarlar DB ile **aynı**) + tek `findLink(pred)`. fe-a10/A12 alanı → zincir sonrası | O | O | M |
| **X-11** | `composables/opentab.ts`, `SecureLayout.vue:104-112` | `mitt()` `SecureLayout` içinde yaratılıyor; 24 `inject('eventBus')` | Bkz. X-12 | — | — | — |
| **X-12** | `layouts/SecureLayout.vue:104-112`; 38 `inject(` çağrısı (24 `eventBus`, 3 `useContextStore`, 4 `useMenuStore`, 2 `useMarketplaceStore`, 1 `useECommerceStore`, …), 17 `emit('openTab')` | Global Pinia store'lar `provide/inject` ile dağıtılıyor; `inject` tipsiz `any`. D-04 sonrası kalan: `eventBus` + `useMenuStore` | **Koşullu** `useEventBus()` tekil composable (`'openTab'` API'si AYNEN — ADR-0012 kırmızı çizgi) + `useMenuStore`'u doğrudan import et. `SecureLayout`/fe-help/fe-a14 alanı → F-CL6 | O | O | M |
| **X-13** | `composables/useTenantDataApi.ts:105` (`axios.get` blob), `composables/clientLogTransport.ts:223` (`fetch`) | `restApi` dışı doğrudan HTTP: tenant dışa aktarım indirmesi (blob, aynı global `axios` → 401 interceptor + `withCredentials` geçerli); istemci log taşıyıcısı (bilinçli: log hatası `restApi` interceptor'ına/yeniden yönlendirmeye girmemeli) | **Kabul et.** Tek ek: `restapi.ts:121` `getExternalService` (D-13) silinsin. Yeni doğrudan çağrı eklenmez (ESLint `no-restricted-imports: axios` — F-CL1a'ya opsiyonel) | — | — | — |

---

## 5. Dalga planı

**Ortak kapı komutları** (`frontend/` içinde; her dalga ilgili olanları koşar):

- Tip: `npx vue-tsc --noEmit` ve `npm run test:typecheck-ratchet` (tavan 0; artamaz)
- Birim: `npx vitest run` (tam ≈ 32 dosya) veya `npx vitest run tests/<ilgili>.test.ts`
- Mandallar: `npm run lint`, `npm run test:no-console-ratchet`, `npm run test:style-ratchet`, `npm run test:pattern-ratchet`, `npm run test:contract-paths`
- Derleme: `npm run build && node scripts/measure-bundle.js` (açılış gz karşılaştırması), `npm run test:preview-smoke`
- e2e: `npx playwright test e2e/specs/<spec> --project=chromium-desktop --workers=2` (tam takım gerekiyorsa 3 proje; yerel makinede 4 worker flaky). **Görsel taban yerelde (Windows) onaylanır** (bulutta yalnız `--update-snapshots=missing`)
- Backend: `operation-policy.test.ts` (FE literal op adlarını tarar) — op adı içeren dosya silinen dalgalarda (D-01, D-02, X-02)
- Silme dalgalarında ek: `node scripts/measure-bundle.js` chunk sayısı azaldı mı; `npx knip -c <dış config>` ikinci koşu (yalnız tavsiye)

Her dalga ≤ ~25 dosya, tek dalda, bağımsız birleşir. Git kuralları (CLAUDE.md): yol yol `git add`, `git add -A` yok.

### F-CL1 — Güvenli ölü kod silme

**F-CL1a — Bağımsız silmeler (≈ 13 dosya, çakışma yok, hemen)**
- İçerik: D-03 (3 dosya), D-04'ün yalnız `composables/integrations.ts` + `ProductBatchProcessComponent.vue` import/kullanım satırı (V-04), D-13 (`restapi.ts` 4 kalem), D-08 (4 import satırı: `IntegrationConfigListView`, `FinancialListView`, `IntegrationHealthView`, `OrderListView`), D-12 (PNG silme; `screenshot.png` WebP), D-07'nin `staticsStore` 4 anahtarı, D-11 `productDefinitions.*` için önce test (Vitest: dinamik önek listesi), `tr.json` budaması (isteğe bağlı, ayrı commit).
- Doğrulama: `npx vue-tsc --noEmit`; `npx vitest run`; `npm run lint`; `npm run build`; `npx playwright test e2e/specs/{orders,financial,integration-health,admin-integration-config-list,products}.spec.ts --project=chromium-desktop --workers=2`; backend `operation-policy.test.ts`.
- Çakışma: yok. Risk: `restapi.ts` D-04 ile aynı dosya → F-CL1a önce.

**F-CL1b — Ölü ekran/bileşen kümesi (≈ 25 dosya) — birleştirme zinciri sonrası**
- İçerik: D-01 + D-02 + D-14 (+ V-11 `communication.ts`): 9 ekran + 9 bileşen + `main.ts` 6 kayıt/import + `menu.ts` harita girişleri ve ölü gövde + `screens.ts:117` yorumu + `e2e/specs/legacy-definition-placeholders.spec.ts` + `e2e/fixtures/definitionsMenu.ts` + `-snapshots/`.
- **Ön koşullar (bloke edici):** (1) `menus` belgesinde (yalnız okuma) `definitions/*`, `productDefinitions/TEST`, `adminPanel/AdminView`, `user/EducationView` kodlarının bulunmadığı doğrulanır — **ek inceleme gerekiyor**; (2) ürün sahibi `AdminView` ve 7 tanım ekranı silme onayı (BACKLOG "ürün kararı"). İki adıma bölünebilir: (i) `TEST` + 9 bileşen + `main.ts` + `communication.ts` (onay gerektirmez, DB doğrulaması yeter), (ii) `AdminView` + 7 tanım ekranı + e2e (onay gerekir).
- Doğrulama: vue-tsc, vitest, build (chunk sayısı düşmeli), `npx playwright test e2e/specs/{navigation,shell,admin-*,category-definition,product-definitions,messages}.spec.ts --project=chromium-desktop --workers=2`, `node scripts/check-contract-paths.js`, backend `operation-policy.test.ts`.
- Çakışma: `stores/site/menu.ts` (fe-a10/A12 sol menü + ana sekmeler) → **zincir sonrası**; `SecureLayout` yok.

**F-CL1c — Store/`provide` kümesi (≈ 9 dosya) — birleştirme zinciri sonrası**
- İçerik: D-04 kalanı: `stores/{context,theme,ecommerce,marketplace,loadingStore}.ts` sil; `layouts/SecureLayout.vue` 4 `provide`/import; `productDefinitions/CategoryListView.vue:51`, `definitions/CategoryDefinitionView.vue:57` inject satırı; `AdminClientDetailComponent.vue` logo yolu `integrationStore`'dan; `restapi.ts` `loadingStore` import/atama.
- Ön koşul: F-CL1b (`ecommerce/marketplace` D-01 ekranlarında da kullanılıyor).
- Doğrulama: vue-tsc, vitest, `npx playwright test e2e/specs/{shell,shell-dsv2,shell-v2,session-isolation,admin-clients,category-definition}.spec.ts --project=chromium-desktop --workers=2`.
- Çakışma: `SecureLayout.vue` (fe-help, fe-a14 klavye, fe-a8 üst bar) → **zincir sonrası**.

**F-CL1d — Kullanılmayan export/üye süpürmesi (≈ 24 dosya)**
- İçerik: D-07 (elle doğrulanmış üyeler), D-09 (`export` kaldırma), D-10 (`bson`→hex, `uuid`→`crypto.randomUUID`, `driver.js` kararı), D-15 (isteğe bağlı).
- Doğrulama: vue-tsc + `npx vitest run` + lint + `test:no-console-ratchet`.
- Çakışma: `navigation/{registerIntent,sections,screens}.ts` ve `workspace.ts` (fe-a10/A12/fe-a14) **hariç tutulur → zincir sonrası ikinci parça**; `menu.ts` üyeleri F-CL6'da.

### F-CL2 — Verimsizlik düzeltmeleri

**F-CL2a — Açılış paketi + `Intl` önbelleği (≈ 8 dosya, en yüksek getiri, çakışma yok, hemen)**
- İçerik: V-01 (`main.ts`, yeni `ensureSiteChartTheme`, `DetailedExportLogReport`, `DetailedImportLogReport`, `AdminSystemManagementView`), V-07 (`format.ts` + `tests/format.test.ts`), V-14 (`integrationStore.ts:6`).
- Doğrulama: `npm run build && node scripts/measure-bundle.js` — **beklenen açılış JS ≤ ~220 kB gz, `modulepreload` 2**; `npm run test:preview-smoke`; `npx vitest run tests/format.test.ts`; e2e `logs.spec`, `logs-characterization.spec`, `admin-system.spec` (grafik renkleri/görsel taban: tema kaydı tüketici modül kapsamında yapıldığı için aynı olmalı), `dashboard.spec`.
- Risk: tema tüketici oluşturulmadan kaydolmalı (modül kapsamında çağrı; `dashboard/OrderStatusCard.vue:75` `ensureDashboardChartTheme()` deseni).

**F-CL2b — `integrationStore` + ürün listesi hesapları (≈ 5 dosya)**
- İçerik: V-03 (`getClient*` → `computed`, `integrationList` boşken güvenli), X-05 (`productListModel.ts` + `ProductListView.vue` `getCountSummary` computed/Map + `gridSelectedKeys/indeterminateKeys`), V-12 (`SubscriptionView` store'dan).
- Doğrulama: vue-tsc, `npx vitest run` (yeni `tests/product-list-model.test.ts`), e2e `products.spec`, `product-batch-actions.spec`, `subscription.spec`.
- Çakışma: yok (fe-a11 `55fcb6a9` ile birleşti; yine de `ProductListView` fe-a13/a8'de değiştirilmiyorsa güvenli — **birleştirme öncesi `git diff` ile ProductListView tekrar kontrol**).

**F-CL2c — Arama debounce + bayat yanıt (≈ 9 dosya)**
- İçerik: V-02: `composables/useDebouncedSearch.ts` (+ Vitest, sahte zamanlayıcı), 6 görünümde `onSearchInput` (Order, Claim, Invoice, Message, Ticket, Authorization); `getX` içine son-istek-kazanır. **`CustomerListView.vue` fe-a13'ten sonra** ayrı adım. X-01 gelirse bu iş oraya taşınır (tekrar yazılmaz).
- Doğrulama: vue-tsc, vitest, e2e `orders,claims,invoices,messages,support-tickets,authorization,list-standard` (arama yazan testlerde beklemeler).
- Çakışma: `EkListScreen`/`EkFilterPanel`'e **dokunulmaz** (fe-a8).

**F-CL2d — Derin izleyici + hata ayıklama günlüğü (≈ 8 dosya)**
- İçerik: V-05 (`ProductListView:317-334` seçim olayı tabanlı, `ProductImagesComponent:258-282`, `CategorySyncComponent:257`, `DetailedImportLogReport:333`), D-15 (bu dosyalardaki `console.log`), `choicesStore` günlükleri.
- Doğrulama: vue-tsc, `npm run test:no-console-ratchet` (`--write` ile düşüş), e2e `product-variants,product-variant-dialogs,product-definition-parts,products,logs,category-definitions`.
- Çakışma: `CategorySyncComponent` kategori seçici fe-a9 (birleşti) — güvenli; yine de tekrar kontrol.

**F-CL2e — Şablon içi filtre + `v-for` anahtarları (≈ 5 dosya)**
- İçerik: V-08 (`ProductVariantAttributesComponent`, `ProductBatchVariantAttributesComponent`, `ChoicesSyncComponent`, `ProductTransferComponent`), V-06 (Admin görünürlük duraklatması).
- Doğrulama: vue-tsc, e2e `product-variants,product-variant-dialogs,admin-system`.
- Çakışma: yok. **F-CL4b ile aynı dosyalara dokunur → F-CL2e önce, F-CL4b sonra.**

### F-CL3.. — Composable/store/util çıkarımı (alan bazlı)

**F-CL3a — `useListQuery` pilotu: Sipariş, İade, Destek (≈ 10 dosya)**
- İçerik: X-01: yeni `composables/useListQuery.ts` + `tests/use-list-query.test.ts` (payload sözleşmesi bayt-özdeş, iptal, sıfırlama); `use{Order,Claim,Ticket}Filters.ts` ince adaptör olarak kalır veya sil; `OrderListView`, `ClaimListView`, `TicketListView` (+ `AdminTicketListView` sonraki adım). V-02 debounce buraya taşınır.
- Doğrulama: vue-tsc, vitest, e2e `orders,claims,support-tickets,admin-tickets,list-standard` (3 proje).
- Çakışma: yok.

**F-CL3b — `useListQuery` Müşteri/Mesaj/Fatura/Yetki (≈ 8 dosya) — birleştirme zinciri sonrası**
- `CustomerListView`/`useCustomerFilters` fe-a13 (müşteri kartı) ile aynı alan → sonra.

**F-CL3c — Saf kural çıkarımı (≈ 6 dosya)**
- İçerik: X-04 (`orderRules.ts` + Vitest; iki toplu/tekil sürüm **ayrı adlı** korunur), `OrderListView` çağrıları.
- Doğrulama: vitest (tablo güdümlü), e2e `orders`. Çakışma: yok. Hizalama (INVOICE/DELIVERED) ürün kararı, bu dalgada **değer değişmez**.

**F-CL4a — `imageUrl` + `formatCurrency` sarmalayıcıları (≈ 14 dosya)**
- İçerik: X-02 (`config/imageUrl.ts` + 7 dosya), X-03 (8 sarmalayıcı + Financial farkı karar). 
- Doğrulama: vue-tsc, vitest (`format.test.ts` + yeni `image-url.test.ts`), e2e `product-variant-list,product-variants,product-variant-dialogs,financial`, backend `operation-policy.test.ts` (görsel yükleme op adları `postImageUpload` değişmez).
- Çakışma: `ProductVariantListTooltipComponent` fe-a11 (birleşti) — güvenli.

**F-CL4b — Nitelik/görsel bileşen çekirdeği (≈ 10 dosya, L)**
- İçerik: X-07. **Ön koşul: karakterizasyon testleri** (`tests/` + e2e: nitelik eşleme, görsel yükleme isteği atılıyor) — bu bileşenlerde birim testi 0. Sonra ortak `usePlatformAttributes` + alt bileşen.
- Doğrulama: yeni Vitest'ler, e2e `product-variants,product-variant-dialogs,product-form-bodies,product-definition-parts`.
- Çakışma: yok; F-CL2e sonrası.

**F-CL5 — Entegrasyon saptama kaydı (≈ 26 dosya → 2 parça)**
- 5a: e-ticaret 7 + e-fatura 4 saptama + `ECommerceView`, `EInvoiceView` + `integrations/registry.ts`. 5b: kargo 9 + `ShippingView` (+ `MarketplaceView`/`ErpView` sadeleştirme). Canlı bileşenlere dokunulmaz.
- Doğrulama: vue-tsc, e2e `integrations-common,integrations-einvoice,integration-forms` (snapshot **0 fark**), vitest.
- Çakışma: yok.

**F-CL6 — `viewRegistry` + `useEventBus` (≈ 25 dosya) — birleştirme zinciri sonrası**
- İçerik: X-10 (`navigation/viewRegistry.ts`, `menu.ts`), X-12 (`useEventBus`, 24 `inject('eventBus')` → composable; `'openTab'` API'si aynen), `communication.ts`.
- Doğrulama: `tests/a10-shell-nav-tabs.test.ts`, `menu-title.test.ts`, `shell-shortcuts.test.ts`, e2e `navigation,shell,shell-dsv2,shell-v2` (ADR-0012 kırmızı çizgi).
- Çakışma: `menu.ts`, `SecureLayout`, `workspace.ts` (fe-a10/A12, fe-help, fe-a14) → **en son**.

### Önerilen sıra

1. Hemen (çakışmasız, paralel): **F-CL2a** → F-CL1a → F-CL2b → F-CL2c(Customer hariç) → F-CL2d → F-CL2e → F-CL3a → F-CL3c → F-CL4a → F-CL5 (a/b) → F-CL4b.
2. Zincir sonrası: F-CL1b → F-CL1c → F-CL1d(navigation kısmı) → F-CL3b (+F-CL2c Customer) → F-CL6.
Bağımsız birleşme: her dalga kendi doğrulamasını geçirir; dosya örtüşmeleri yalnız (F-CL1a↔F-CL1c `restapi.ts`), (F-CL1b↔F-CL1c/F-CL1d `menu.ts`,`main.ts`), (F-CL2e↔F-CL4b nitelik bileşenleri), (F-CL2b↔F-CL4a yok). Bu sıralama örtüşmeyi çözer.

---

## 6. Yapılmaması gerekenler (yönerge: overengineering yok)

- `useBusy`/`LoadingComponent` göçü (61 dosyada 116 `info()/remove()`; bileşen DS-v2'de zaten `EkLoadingOverlay`'e bağlandı; tek tek hata yolu bulunmadan toplu göç getirisiz).
- `usePolling` soyutlaması (V-06) — iki gerçek yoklayıcıdan biri zaten doğru.
- `useUser` → Pinia `auth` (X-09) ve `api/` katmanı yeniden yazımı (ADR-0019 `restApi.call` gelecek).
- Toplu `shallowRef`/`markRaw` dönüşümü (V-09 ölçmeden yapılmaz); liste sanallaştırma (`v-virtual-scroll` 0 ama sayfalı sunucu listeleri; `VariantGrid` zaten pencereli).
- Adlandırma/klasör toplu taşıma, i18n'in toplu sabit-Türkçe göçü (ürün kararı, EN parity: en 428 / tr 1 672).
- `useOnboarding.ts` ve `EkWizardTemplate/EkReadonlyPanelTemplate` silme (planlı kullanım: `docs/PRODUCT_VALUE_PLAN.md`).

## 7. Doğrulanamayanlar / ek inceleme gerekiyor

1. Menü DB (`menus`, `entegrasyonik*`) içeriği: D-01/D-14 için `definitions/*`, `productDefinitions/TEST`, `adminPanel/AdminView`, `user/EducationView` kodlarının varlığı. Kural gereği bu denetimde DB'ye dokunulmadı.
2. `electron-squirrel-startup` gerçekten gerekli mi (D-10): `main.js` `require` etmiyor, `forge.config.js` maker-squirrel kullanıyor.
3. V-09 (kategori ağacı boyutu/etkisi), V-05 (derin izleyici maliyeti), V-13 (eager katalog yüklemesi): gerçek veri hacmiyle **ölçülmedi**.
4. `bson` → hex üreticisi (D-10): backend ObjectId biçim uyumu.
5. D-11 i18n: dinamik anahtar önekleri tam listelenmedi; 717 sayısı üst sınırdır.
6. `knip` ikinci koşusu bellek hatasıyla düştü (`oxc-parser ArrayBuffer`); ilk koşu (dosya/bağımlılık/export) ve elle betikler tutarlı.
7. `fe-help`, `fe-a8`, `fe-a13`, `fe-a14`, A12 bulut dallarının dokunduğu dosya listesi bu denetime verilmedi; çakışma işaretleri alan adından (`ds/EkListScreen|EkFilterPanel|EkRefreshButton|ApplicationBar`, `components/customer/*`, `SecureLayout`/`shortcuts`) çıkarıldı — birleştirme öncesi gerçek `git diff --name-only` ile doğrulanmalı.
