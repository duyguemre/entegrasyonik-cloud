# Aşama 5 — önce / sonra (kullanıcı geri bildirimi, 11 madde)

`before/` = `cloud/ds-v2-int2` (ce7c280), `after/` = `cloud/ds-v2-a5`. Linux Chromium, e2e sahte verisi (uydurma veri yok);
görsel onay yerelde. Üretim: `A5_REVIEW=1 A5_REVIEW_WIDTH=1440|800|390 A5_REVIEW_OUT=docs/a5-review/after npx playwright test e2e/specs/a5-review.spec.ts --project=chromium-desktop`.

| Madde | Dosyalar |
|---|---|
| 1 hiyerarşi | `m01-hiyerarsi-{siparis,pano}` |
| 2 çipler | `m02-cipler` |
| 3 kanal renkleri | `m03-kanal-{siparis,pazaryeri,iade}` |
| 4 etkin sekme | `m04-aktif-sekme` (+800) |
| 5 dikey kaydırma | `m05-sekme-kaydirma` (+800) |
| 6 sayfa başlığı | `m06-baslik-{iade,acik,ayarlar}` |
| 7 filtre geçişi | `m07-filtre-{1-acik,2-gecis,3-kapali}` |
| 8 etiket titremesi | `m08-etiket-{1-bos,2-gecis-*,3-odak}` (önce: tek geçiş karesi) |
| 9 üst bölüm / tam ekran | `m09-ust-{1-normal,2-hover,3-daraltilmis}` |
| 10 Genel \| Seçili kayıt | `m10-ust-bar` |
| 11 ürün seçenekleri | `m11-urun-secenek` |
