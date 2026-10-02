# FE-R4 Şerit A — kabuk ve pencereler (REPORT)

Dal: `cloud/fe-r4a` · Taban: `origin/main` = `199628a5` (faz3-arayuz @ b68ae6f7) · Sözleşme: `docs/cloud-contracts/FE_FEEDBACK_R4_2026-10-02.md` Şerit A (K61).
Okunanlar: CLAUDE.md (kural 7, 8), `docs/adr/USER_DECISIONS.md` (K61 + "Yüzeyler ve tasarım"), `premium-ui-standards`, `web-design-guidelines` (+ `guidelines.md`), `frontend/DESIGN_SYSTEM.md`, `frontend/docs/APP_IDENTITY.md`.

> **Süreç notu (dürüstlük):** Oturumun ilk bölümünde dal yanlışlıkla bayat bir `origin/main` ref'inden (d9160fff) açıldı; bu yüzden
> sözleşme/USER_DECISIONS "yok" sanıldı ve kullanıcıya bu yönde bir bildirim gitti (sonradan düzeltme bildirimi gönderildi).
> Hata fark edilince dal doğru tabandan (199628a5) **yeniden kuruldu**, önce/sonra görüntüleri ve karakterizasyon yeniden alındı,
> iş gerçek sözleşmeye göre yapıldı. Uzak dal `--force-with-lease` ile güncellendi; eski 6 commit yerelde `backup/fe-r4a-stale-base`.

## Yapılanlar

| # | Sözleşme | Ne yapıldı | Dosyalar |
|---|---|---|---|
| A1 | Üst bar çok koyu, biraz aç; açık+koyu temada token üzerinden; AA | 5 yeni token rolü (EKLEME): `chrome-soft`, `chrome-soft-end`, `chrome-soft-raised`, `chrome-soft-border`, `chrome-soft-text-muted` + `--ek-gradient-chrome-soft`. Light: navy-900→600 yerine **navy-700→500**; dark: bir kademe aydınlık (`chromeSoftDark`). `chrome-text` ve `chrome-soft-text-muted` üç zeminde AA (≥5.1:1) — `roles.ts` kontrast çiftlerine eklendi, iki temada test edilir. `EkAppHeader tone="soft"` (ek prop, varsayılan `brand` = eski görünüm) bileşen kapsamında `chrome*`→`chrome-soft*` yeniden bağlar; arama alanı, Otopilot girişi ve kabuk tutamağı aynı tonu alır. | `packages/ui/src/tokens/{palette,semantic,roles,render}.ts`, `EkAppHeader.vue`, `ApplicationBar.vue`, `ShellChromeHandle.vue`, `tests/theme/theme-snapshot.baseline.json` (+5 anahtar, bilinçli) |
| A2 | Profildeki koyu bölümü kaldır; sade, arka planla uyumlu | `tone="soft"`'ta profil düğmesi zeminsiz/çerçevesiz; avatar yuvarlak kabuk-kontrol tonunda (koyu temada AA — axe ile yakalanıp düzeltildi); hover'da hafif zemin. Hesap menüsü başlığındaki mağaza monogramı üst bar avatarıyla aynı (iki harf, aksiyon tonu). Koyu kapsül yalnız Otopilot girişinde. | `EkAppHeader.vue`, `StoreLogoAvatar.vue` |
| A3 | Bildirim penceresi baştan; gruplama, okunmamış vurgusu, tür ikon/tonları, toplu okundu, boş/yükleme/hata, klavye/a11y, mobil; merkezle aynı dil | Yüzen panel (kenarlardan 8px, dialog radius/gölge; <600px tam genişlik). Başlık: "Bildirimler" + okunmamış sayaç hapı + bağlantı durumu; eylemler okundu · ⋯ │ kapat. Gün grupları sayılı yapışkan başlık. Satır: ikon kapsülü (katalog/ton token'dan), göreli **zaman sağda** (üzerine gelince/odakta yerini okundu/sil düğmelerine bırakır), okunmamış = nokta + kalın başlık (kritikte nokta hata tonu), kritik = ince hata kenarı + "Kritik" çipi (eski 3px şerit kalktı), "Zorunlu" etiketi, işlem özeti **metrik şeridi**, kanal · kategori + "Detayları gör" tek alt satır. **Yeni durumlar:** ilk açılış iskeleti (store `loading` artık gerçekten set ediliyor) ve **hata durumu** (`EkProblemState` + Tekrar dene; store `listError`). Merkez: aynı "Zorunlu" etiketi (dil uyumu). | `NotificationDrawerComponent.vue`, `stores/notificationDrawer.ts`, `NotificationCenterView.vue` |
| A4 | Otopilot penceresi baştan; işlev/sözleşmeler (onay kartı, kill-switch, kota, kurulum) korunur | `ChatPanel appearance="refined"` (EK prop; varsayılan eski görünüm → **backoffice değişmez**) → `.ek-chat--refined` katmanı (`chat.css` sonunda yalnız ek kurallar): degrade Otopilot işareti (başlık, mesaj avatarı, karşılama), ortalı karşılama + **öneri kart ızgarası** (dar panelde 2 kolon), yüzen composer (yuvarlak gönder; görsel sayaç sınıra yaklaşınca görünür, ekran okuyucu sayacı hep var), yumuşak kullanıcı balonu, ince tonlu onay kartı, kurulum karşılaması nefes alır. Dock zemini `surface-raised`. DOM, metin, eylem ve durum makinesi aynı. | `packages/chat/src/components/ChatPanel.vue`, `packages/chat/src/styles/chat.css`, `src/chat/OtopilotDock.vue`, `src/views/secure/OtopilotView.vue` |
| A5 | Akıllı arama sonuç listeleri + satır context menüsü | `EkSmartSearch` ek proplar: `appearance="refined"`, `itemMenu`, `holdOpen`, `panelMaxWidth`; ek olay `item-menu` (varsayılanlar eski görünüm/davranış). Refined: bantsız grup başlığı + sade sayı (ekran okuyucuya "n sonuç"), tek satır başlık (taşan "…", tür rozeti satırda kalır), "Etiket değer ·" düz meta (çerçeveli çipler yok, satır sonunda "…"), etkin satır yalnız seçim zemini + `Enter` ipucu, eşleşme vurgusu aksiyon tonunda, 640px panel, alt şeritte "Shift+F10 işlemler" ve toplam. **Bağlam menüsü** (sağ tık / Shift+F10 / Menü tuşu / ⋯): türe göre "aç" (Enter ile aynı iş), ikincil gezinme (iade → ilgili sipariş, sipariş → müşterinin siparişleri), kopyala (sipariş no, ürün adı, e-posta, telefon, talep no, ekran bağlantısı) → toast; "Otopilot'a sor". Menü açıkken sonuçlar açık kalır; Esc odağı aramaya döndürür. Arama değeri yine URL'ye yazılmaz (ADR-0012). | `packages/ui/src/components/EkSmartSearch.vue`, `src/components/layout/ShellSearch.vue` |

Belge: `frontend/DESIGN_SYSTEM.md` §34.

## Kararlar

1. **Paylaşılan paketlere yalnız EKLEME.** `chrome*` token'ları backoffice'te de kullanıldığı için değerleri değiştirilmedi; yeni `chrome-soft*` rolleri eklendi. `EkAppHeader`, `EkSmartSearch`, `ChatPanel` için yeni proplar varsayılanda eski görünümü korur. Değiştirme gerektiren bir şey kalmadı.
2. **A1 "biraz aç" = iki kademe** (navy-900→600 ⇒ 700→500), beyaz/çok açık bar değil — kimlik degradesi korunur, metin AA kalır.
3. **A2:** koyu kapsül yalnız Otopilot girişinde bırakıldı (kullanıcının "koyu blok zaten Otopilot'ta var" sözü) — üst barda tek vurgulu öğe.
4. **A3 okunmamış vurgusu:** renkli satır zemini denendi, koyu temada ağır bulundu (1. eleştiri turu) → nokta + kalın başlık.
5. **A3 hata/yükleme:** store'daki kullanılmayan `loading` bayrağı bağlandı; `listError` eklendi. İstek/yanıt gövdeleri değişmedi (birim testi sabitler).
6. **A5 ⋯ düğmesi** seçenek (`role=option`) içinde etkileşimli öğe olmasın diye `aria-hidden` span; klavye karşılığı Shift+F10 / Menü tuşu (guidelines "gesture alternative" kuralı karşılanır).
7. **Merkezdeki başlık bağlantısının alt çizgisi korundu** (APP_IDENTITY §3: "hover'da ince alt çizgi dolar").
8. **Bildirim merkezi** yalnız dil uyumu (etiket); yerleşimi liste standardına ait olduğu için dokunulmadı.

## Öz-eleştiri turları (≥2)

- **Tur 1:** okunmamış zemin tonu koyu temada blok gibi → kaldırıldı; meta satırının kenarda yalnız kalması → alt satır birleştirildi; arama 390'da tür rozeti satır kırıyordu ve meta çiftleri tek tek kesiliyordu → başlık tek satır + satır sonu "…"; Otopilot öneri kartları tek kolon uzun yığın → 2 kolon ızgara.
- **Tur 2:** koyu temada avatar kontrastı (axe `color-contrast`) → düzeltildi; Otopilot kurulum başlığı açıklamaya yapışıktı → aralık + başlık rolü; ham `--ek-duration-*` kullanımı (hareket tek kaynak testi) → `--ek-motion-feedback`; inceleme görüntüsünde giriş ipucu panel başlığını örtüyordu → görüntü betiği düzeltildi.

## İnceleme rotaları (`npm run dev` → http://localhost:3020)

- http://localhost:3020/dashboard — üst bar (A1), profil düğmesi + hesap menüsü (A2), zil → bildirim penceresi (A3), Ctrl+K → arama; sonuçta sağ tık / Shift+F10 (A5)
- http://localhost:3020/notifications — bildirim merkezi (dil uyumu)
- Otopilot: üst bardaki "Otopilot" / Ctrl+J (≥1280 yan panel, 768–1279 üstüne biner, <768 tam sayfa) ; tam sayfa: http://localhost:3020/otopilot ; mock tezgâh: http://localhost:3020/dev/otopilot?speed=0
- Koyu tema: hesap menüsü → Görünüm → Koyu

Görseller: `docs/fe-r4-review/a/once/` ve `docs/fe-r4-review/a/sonra/` — `01-ust-bar`, `02-profil-menusu`, `03-bildirim-penceresi`, `04-bildirim-satir-hover`, `05-arama-son-acilanlar`, `06-arama-sonuclar`, `07-arama-baglam-menusu`, `08-otopilot-bos`, `09-otopilot-tablo`, `10-otopilot-onay`, `11-otopilot-kurulum` × `1440-acik` / `1440-koyu` / `390-acik`.
Yeniden üretim: `FE_R4A_REVIEW=1 FE_R4A_OUT=docs/fe-r4-review/a/sonra npx playwright test e2e/specs/fe-r4a-review.spec.ts --project=chromium-desktop`.

## Testler

| Paket | Sonuç | Not |
|---|---|---|
| vitest (frontend) | 1765 geçti · 18 başarısız | 18'in TAMAMI tabanda da kırmızı (A10/A12/B4/FR3-7/A8/Std-9/tema light haritası — bu şeridin dosyaları değil); yeni başarısızlık 0 (taban/son liste karşılaştırıldı). Yeni: `tests/fe-r4a-notification-drawer.test.ts` (7). |
| `test:chat` | 183 geçti · 1 atlandı | |
| `test:backoffice` (+ ui) | 336 + 43 geçti | ortak paket değişiklikleri backoffice'i bozmadı |
| `npm run build` | ✓ | |
| style-ratchet | ✗ (taban) | `EkWorkspaceTabs.vue 0→2` — tabanda da aynı (bu şerit dokunmadı) |
| typecheck-ratchet | ✗ (taban) | `BrandListComponent.vue(41)` — tabanda da aynı; bu şerit 0 yeni hata |
| pattern / no-console / contract-paths | ✓ | |
| eslint (değişen dosyalar) | 0 yeni | test dosyasındaki 2 `any` önceden vardı |
| Playwright (ilgili spec'ler, 3 proje: fe-r4a-shell, notification-drawer, notifications, shell-dsv2, shell-v2, shell, navigation, otopilot, otopilot-harness) | 289 geçti · 72 atlandı · 7 kırmızı | 2× `navigation.spec:161` (tabanda da kırmızı); 5× ilk koşuda eksik `*-linux.png` yazımı (shell 3 proje, otopilot-harness 2) — yeniden koşuda geçer. |
| axe AA | 0 ihlal | üst bar + bildirim penceresi + arama sonuçları + bağlam menüsü (açık ve **koyu**), Otopilot paneli (boş + onay kartı) |

Karakterizasyon: `e2e/specs/fe-r4a-shell.spec.ts` ilk 8 testi DEĞİŞMEMİŞ kodda yeşildi (masaüstü + mobil); A3 birim testlerinin gövde/çapa kısmı eski kodda yeşil, yalnız yeni davranış (loading/listError) eski kodda kırmızıydı.

## Değişen win32 görsel tabanları

Yöntem: tabanın (199628a5) ve bu dalın **chromium-desktop** linux ekran görüntüleri aynı makinede üretilip karşılaştırıldı (`--update-snapshots=none`); farklı çıkan **44 görüntü** aşağıda. Ortak neden üst bar tonu (A1) ve profil (A2) — kabuk içeren her ekran; `otopilot-empty-*` A4 değil, tezgâhtaki üst bar/zemin farkı. Aynı görüntülerin tablet/mobil win32 tabanları da kabuğu içerdiği için birlikte değişir (bulutta yalnız masaüstü karşılaştırıldı — 17 dk/proje). Not: tarih/saat içeren ekranlarda (ör. pano "Son güncelleme") fark kısmen zaman kaynaklı olabilir; yerelde tabanı yenilerken gözle onaylanmalı.

Toplam yenilenecek win32 dosyası: **122**.

| Spec | Görüntü | win32 projeleri |
|---|---|---|
| `account-security.spec.ts` | `account-security` | desktop, mobile, tablet |
| `admin-clients.spec.ts` | `admin-clients-list` | desktop, mobile, tablet |
| `admin-effective-config.spec.ts` | `admin-effective-config` | desktop, mobile, tablet |
| `admin-engine-settings.spec.ts` | `admin-engine-settings` | desktop, mobile, tablet |
| `admin-integration-compliance.spec.ts` | `admin-integration-compliance` | desktop, mobile, tablet |
| `admin-integration-compliance.spec.ts` | `admin-integration-compliance-detail` | desktop, mobile, tablet |
| `admin-integration-compliance.spec.ts` | `admin-integration-compliance-empty` | desktop, mobile, tablet |
| `admin-integration-config-list.spec.ts` | `admin-integration-config-list` | desktop, mobile, tablet |
| `admin-integration-settings.spec.ts` | `admin-integration-settings` | desktop, mobile, tablet |
| `admin-system.spec.ts` | `admin-system-export-detail` | desktop, mobile, tablet |
| `admin-system.spec.ts` | `admin-system-top` | desktop, mobile, tablet |
| `admin-tickets.spec.ts` | `admin-tickets-list` | desktop, mobile, tablet |
| `audit-log.spec.ts` | `audit-log` | desktop, mobile, tablet |
| `category-definitions.spec.ts` | `category-definitions` | desktop, mobile, tablet |
| `claims.spec.ts` | `claims-detail` | desktop |
| `claims.spec.ts` | `claims-list` | desktop, mobile, tablet |
| `customers.spec.ts` | `customers-list` | desktop, mobile, tablet |
| `dashboard.spec.ts` | `dashboard` | desktop, mobile, tablet |
| `integration-health.spec.ts` | `integration-health` | desktop, mobile, tablet |
| `integrations-common.spec.ts` | `integration-ECommerceView` | desktop, mobile, tablet |
| `integrations-common.spec.ts` | `integration-ErpView` | desktop, mobile, tablet |
| `integrations-common.spec.ts` | `integration-MarketplaceView` | desktop, mobile, tablet |
| `integrations-common.spec.ts` | `integration-ShippingView` | desktop, mobile, tablet |
| `integrations-einvoice.spec.ts` | `integration-EInvoiceView` | desktop, mobile, tablet |
| `invoices.spec.ts` | `invoices-list` | desktop, mobile, tablet |
| `logs.spec.ts` | `logs-export-list` | desktop, mobile, tablet |
| `logs.spec.ts` | `logs-import-detail` | desktop |
| `logs.spec.ts` | `logs-import-list` | desktop, mobile, tablet |
| `messages.spec.ts` | `messages-list` | desktop, mobile, tablet |
| `orders.spec.ts` | `orders-list` | desktop, mobile, tablet |
| `otopilot-harness.spec.ts` | `otopilot-empty-dark` | — (win32 tabanı yok) |
| `otopilot-harness.spec.ts` | `otopilot-empty-light` | — (win32 tabanı yok) |
| `privacy-data.spec.ts` | `privacy-data` | desktop, mobile, tablet |
| `privacy-data.spec.ts` | `privacy-deletion-verify` | desktop, mobile, tablet |
| `product-batch-actions.spec.ts` | `batch-action-menu` | desktop, mobile, tablet |
| `product-variant-dialogs.spec.ts` | `variant-batch-prices` | desktop, mobile, tablet |
| `product-variant-dialogs.spec.ts` | `variant-generator` | desktop, mobile, tablet |
| `product-variant-dialogs.spec.ts` | `variant-platform-prices` | desktop, mobile, tablet |
| `product-variant-list.spec.ts` | `product-variant-list` | desktop, mobile, tablet |
| `product-variants.spec.ts` | `product-variants` | desktop, mobile, tablet |
| `shell.spec.ts` | `shell-dashboard` | desktop, mobile, tablet |
| `stock-health.spec.ts` | `stock-health` | desktop, mobile, tablet |
| `stock-policy.spec.ts` | `stock-policy` | desktop, mobile, tablet |
| `subscription.spec.ts` | `subscription` | desktop, mobile, tablet |

Değişmeyenler (masaüstünde aynı çıktı): giriş/kayıt/şifre/doğrulama ekranları (kabuksuz) ve kabuğu içermeyen bileşen görüntüleri.

Yerel (Windows) onay: `npx playwright test <spec> --update-snapshots` ile yenilenmeli. `*-linux.png` commit'lenmedi.

## Açık noktalar / öneriler

- `index.html` `<meta name="theme-color" content="#13255B">` artık açılmış üst bardan koyu; mobil tarayıcı çubuğu için `navy-700` öneriliyor (kök sayfa — bu şeritte dokunulmadı).
- Tabanda kırmızı olan vitest/ratchet/e2e kalemleri Şerit D'nin (D3) konusu.
