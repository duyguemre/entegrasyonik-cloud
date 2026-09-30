# fe-r2b — kanal rozeti (FR2-CHANNEL 11–14) + ürün listesi (FR2-PLIST 18–22)

Dal: `cloud/fe-r2b` (taban `origin/main`, sonda `cloud/fe-r2a` birleştirildi). Görseller: `<ad>-<genişlik>-{once,sonra}.png`
(1440 + 390; sahte SVG ürün fotoğrafları), üretici `e2e/specs/fe-r2b-review.spec.ts` (`FE_R2B_CAPTURE=<etiket>`). Playwright
tabanı DEĞİLDİR; görsel onay yerelde (`*-win32.png`).

## Kararlar

| # | Karar | Nerede |
|---|---|---|
| K13 | Rozet = kenarlık marka renginin **koyusu**, iç zemin **açığı**, metin koyu marka tonu. Marka hex'i değişmez; tonlar yalnız oranla `color-mix`: zemin = marka %14 + yüzey, kenarlık = marka %78 + mürekkep, metin = marka %58 + mürekkep. **Açık tema oranları sitenin `--channel-badge-*` değerleriyle birebir** (cloud/site-s23). Koyu tema ayrı oran (18/70/45) — iki temada her kanal + nötr için AA birim testli (harf/zemin ≥ 4.5, kenarlık ≥ 3). | `packages/ui/src/tokens/palette.ts` `channelBadgeMix`, `render.ts` `renderChannelBadgeRules`, `tests/theme/channel-badge.test.ts` |
| 12 | Kısa/uzun ad TEK kayıttan: `CHANNEL_NAMES` (uzun) + `CHANNEL_SHORT` (TY, HB, N11, PZ, IS, BH, SH, WC); `channelShort()` / `brandName()`. Rozet: `form="long"` ad, `form="short"` kısaltma (ad `title` + ekran okuyucu). | `packages/ui/src/tokens/channels.ts`, `EkChannelBadge.vue` |
| 11 | Uygulamadaki tüm kanal rozetleri tek bileşene bağlandı: `EkChannelDot` (chip/filled → uzun rozet, yalnız nokta → kısa rozet; `plain` metin içi nokta kaldı), `EkPlatformMark` (monogram → kısa rozet), `PlatformImageComponent`, `IntegrationAvatarComponent`, varyant ayrıntı kartı. Şerit/aksan kullanımları (grid satır şeridi, entegrasyon rayı) rozet değildir, dokunulmadı. | — |
| 13 | Kargo firmaları aynı rozet (`kind="carrier"`), kayıt `CARRIERS` (10 firma, serbest metin eşleme). "Kargoya ver" (`ManualShipmentComponent`) listesi `EkSelect kind="carrier"`; değerler eski serbest metinle aynı (backend değişmez). **Renkler ölçülmedi → nötr** (bkz. açık konular). | `channels.ts`, `ManualShipmentComponent.vue` |
| 14 | `EkSelect`: kanal/kargo seçenekleri kısa rozet öncülü, seçili çip = uzun rozet; durum çipi `EkStatusChip` dili (subtle zemin + tonlu kenarlık + emphasis metin). Filtrelerdeki kanal/kargo/durum listeleri otomatik aynı standart. | `EkSelect.vue`, `selectOptions.ts` |
| 18 | Thumbnail: xs 32 / sm 44 / md 56 / lg 64 (önce 28/40/44); `object-fit: contain` + beyaz yüzey (fotoğraf kırpılmaz, yatay/dikey ortalanır). | `ProductThumb.vue` |
| 19 | Hover = TEK büyük görsel (280 px sabit çerçeve) + adet sayacı + "tıklayın: galeri"; tıklanamayan küçük resim şeridi kaldırıldı. Tıklama = salt-okunur galeri (←/→, Home/End, şerit, Esc, "Ürünü düzenle"). Görselsiz üründe tıklama düzenlemeyi açar. | `ProductGalleryDialog.vue` |
| 20 | Varyant satırları aynı standart: büyük kare, görseli olan varyantta galeri. | `ProductVariantListComponent.vue` |
| 21 | "Platform durumu" → **Kanallar**: kanal başına karo (kısa rozet + durum işareti) — yayında ✓ / hatalı ! / bekliyor ◷ / satışa kapalı ‖ / yok (kesik pasif rozet); öncelik hatalı > bekliyor > yayında > kapalı > yok, varyantlı üründe varyant dağılımı. Varyant satırı aynı karolar. Durum kuralı tek kaynak (`variantListModel.channelState`). | `channelStatus.ts` (+ test), `ChannelStatusTile.vue`, `ProductChannelStatus.vue` |
| 22 | Yükleme seçimi: satırdaki gizli "logoya tıkla = hazır" yerine **Kanal durumu paneli**: kanal başına uzun rozet + durum çipi + dağılım + kısa neden + `role="switch"` "Gönderime hazır". Tablo: stok kodu + barkod tek iki satırlı sütunda (1440'ta yatay taşma bitti; barkoda göre sıralama kalktı, stok koduna göre sürer). | `ProductListView.vue` |

## İterasyonlar

1. Rozet + taşıma → vitrin kontrolü (tüm kanallar, kısa/uzun, boyutlar, kargo, seçim listeleri).
2. Liste v1: kanal karoları dar sütunda alt alta sarıyordu → tek satır + sütun genişliği.
3. Liste v2: tablo 1440'ta yataya taşıyor, karolar sabit eylem sütununun altında → stok kodu/barkod birleşti, ürün sütunu 320 px.
4. Panel v1: Vuetify anahtarı ağır, satırlar uzun; galeri görseli sahneden taşıyor, şerit görünmüyordu → kompakt satır + kendi anahtarı; mutlak yerleşimli `contain` sahne.
5. **Doğruluk düzeltmesi:** `platformUploads.<kod>.isReady` backend'de yalnız YAZILIYOR, hiçbir akış okumuyor → "bir sonraki aktarımda gönderilir" vaadi kaldırıldı; metin "gönderime hazır (planlama işareti) — gönderimi Toplu işlemler → Platformlara Yükle başlatır".
6. fe-r2a birleştirildi (çakışma yok), tüm kontroller ve görüntüler birleşik hâlde yeniden alındı.

## Testler (birleşik hâl)

- vitest: 69 dosya / 1413 test yeşil (yeni: `tests/theme/channel-badge.test.ts`, `tests/fe-r2b-channel-status.test.ts`; b1 thumbnail ve kanal tek-kaynak testleri FR2'ye göre güncellendi, ratchet sayıları yalnız AZALDI).
- `@entegrasyonik/ui` 22/22, backoffice 30/30; vue-tsc 0 hata (mandal); stil/desen/console mandalları ve sözleşme yolları OK; `npm run build` + `build:backoffice` OK.
- Playwright (chromium-desktop): `fe-r2b-channel-badge.spec.ts` 3/3 (2 tekrar kararlı) — **axe AA 0 ihlal** vitrin rozetleri (renk kontrastı dahil), kanal hücresi + panel, galeri; anahtarın kayıt gövdesi doğrulanır. `product-variant-list.spec.ts` güncel DOM'a uyarlandı (tabanda da kırıktı), axe 0 artık zorunlu.
- Tabanla karşılaştırma: `products/orders/claims/design-system/product-batch-actions` spec'lerindeki kırmızılar `origin/main`'de de aynı (eski seçiciler / Windows tabanı) — bu dalda yeni kırılma yok.

## Açık konular

- **Kargo marka renkleri ölçülmeli (yerel):** bulutta dış ağ kapalı; K13 "tahmini renk yok" → firmalar nötr rozet. Ölçülen hex `CHANNEL_BRAND_COLORS.md` + `palette.ts` `channelPalette`'e firma koduyla (`yurtici`, `aras`, `mng`, `surat`, `ptt`, `trendyolexpress`, `hepsijet`, `ups`, `kolaygelsin`, `sendeo`) eklenince rozet kendiliğinden renklenir; `channel-badge.test.ts` AA'yı otomatik doğrular.
- **Backend:** `isReady` bayrağının bir tüketicisi yok (BACKLOG adayı: aktarım hedefi olarak kullanılsın ya da UI'dan kalksın).
- Site `ChannelMono` baş harf gösteriyor; kısa form kaydı (`CHANNEL_SHORT`) siteye de kopyalanırsa iki yüzeyde monogram aynı olur.
