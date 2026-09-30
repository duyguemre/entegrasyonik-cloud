# A6b inceleme görselleri (`cloud/ds-v2-a6b`)

Linux Chromium ile e2e sentetik verisinden (fixture; PII yok, saat sabit). **Görsel onay yerelde (Windows).**
Adlandırma: `sNN-<konu>-{1440|390}.png` — `NN` = standart numarası (DESIGN_SYSTEM.md §17). `before/` kod değişmeden
(a6a birleşimi sonrası taban `05d7df3`), `after/` tur sonunda. `s00-*` yalnız `after/`: vitrin §13 (geri bildirim, yükleme, ikon
kayıt defteri, satır eylemleri) ve toast.

| Standart | Görseller |
|---|---|
| 1 Hata/uyarı/boş/toast | `s01-hata-liste`, `s01-bos-liste`, `s01-uyari-detay`, `s01-hata-pano`, `s00-vitrin-*` |
| 2 Tablo → kart | `s02-kart-siparis`, `s02-kart-urun`, `s02-kart-bildirim`, `s02-kart-detay-kalem` (390 asıl) |
| 3 Toplu + bağlam | `s03-toplu-siparis`, `s03-toplu-bildirim`, `s03-baglam-siparis`, `s03-baglam-urun` |
| 4 Ana sekmeler | `s04-sekmeler`, `s04-sekmeler-liste` |
| 5 Sayfa içi sekmeler | `s05-ic-sekme-finans`, `s05-ic-sekme-log`, `s05-ic-sekme-entegrasyon` |
| 6 Sipariş + iade | `s06-siparis-liste`, `s06-siparis-detay(-alt)`, `s06-iade-liste`, `s06-iade-detay(-alt)` |
| 7 Sekme içi örtü | `s07-overlay-1…4` (detay açık → diğer sekme → ikinci diyalog → geri dönüş) |
| 8 Yükleme | `s08-yukleme-liste` (iskelet), `s08-yukleme-overlay`; marka örtüsü: `s00-vitrin-geri-bildirim` |
| 9 Yenile | `s09-yenile-liste`, `s09-yenile-pano` |
| 10 Eylem ikonları | `s10-ikon-urun`, `s10-ikon-fatura`, `s10-ikon-talep`, `s00-vitrin-geri-bildirim` |
| 11 Form | `s11-form-filtre`, `s11-form-stok`, `s11-form-hesap` |
| 12 Açılır liste | `s12-select-kanal`, `s12-select-durum` |

Çalıştırma: `A6B_REVIEW=1 A6B_REVIEW_WIDTH=1440|390 A6B_REVIEW_OUT=docs/a6b-review/after npx playwright test e2e/specs/a6b-review.spec.ts --project=chromium-desktop`.
Not: `before/` görüntülerinde MDI ikon yazı tipi yüklenmediği için ikonlar boş görünür (ortam); `after/` ikonlu.
