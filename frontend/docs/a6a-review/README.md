# A6a inceleme görselleri (`cloud/ds-v2-a6a`)

Linux Chromium ile e2e sentetik verisinden alındı (saat sabit, veri uydurma değil — fixture). **Görsel onay yerelde (Windows).**
Adlandırma: `<alan>-<durum>-{before|after}-{1440|390}.png`. `before` görüntüleri kod değişmeden, taban `4e4d9ef` üzerinde alındı.

| Alan | Araç (A6A_REVIEW=1) | Durumlar |
|---|---|---|
| `variants-*` — ürün ekleme/düzenleme varyant ızgarası + toplu düzenleyici | `e2e/specs/a6a-review-variants.spec.ts` | grid, grid-edit, grid-stress (48 varyant), batch-prices, batch-attributes, batch-attributes-error, bulk-editor(+colselect/applied/pasted/channels/preview) |
| `productform-*` — ürün formu sihirbaz şeridi, eksikler paneli, kanal fiyat bölümleri | `e2e/specs/a6a-review-productform.spec.ts` | ekle-kategori/tanim/tekil/detay/eksikler, duzenle-acilis/tanim, kanal-fiyatlari |
| `ticket-*` — destek talebi oluşturma + ayrıntı | `e2e/specs/a6a-review-ticket.spec.ts` | create-bos/dogrulama/dolu/basari/hata, detail-acik-uzun/kapali |
| `mapping-*` — kategori/özellik eşleme hata durumları | `e2e/specs/a6a-review-mapping.spec.ts` | category/choices × 5xx/auth/timeout/network/empty/tech/loading, values-5xx/empty |

Çalıştırma: `A6A_REVIEW=1 A6A_REVIEW_WIDTH=1440|390 A6A_REVIEW_TAG=after npx playwright test e2e/specs/a6a-review-<alan>.spec.ts --project=chromium-desktop --workers=1`
(varyant aracı `A6A_REVIEW_TAG` okur; diğerleri kendi başlık yorumlarındaki değişkenleri kullanır).
