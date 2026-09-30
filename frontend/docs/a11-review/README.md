# A11 — Ürün listesi: satır altı varyant gösterimi (önce / sonra)

Araç: `A11_REVIEW=1 A11_REVIEW_WIDTH=1440|390 A11_REVIEW_SCALE=2 A11_REVIEW_OUT=docs/a11-review/<before|after> npx playwright test e2e/specs/a11-review.spec.ts --project=chromium-desktop`
(bulutta `-c playwright.cloud.config.ts` ile hazır Chromium). Veri sentetik, yalnız backend varyant projeksiyonundaki alanlar.

| Dosya | Senaryo |
|---|---|
| `v1-az-varyant-{1440,390}[-yakin][-yakin-2].png` | 3 varyant, 2 renk grubu, tükenen + az stok |
| `v2-cok-varyant-*` | 14 varyant (kompakt ızgara), `-tumunu-gor` / `-tumu-acik` (yalnız `after`) |
| `v3-hatali-kanal-*` | Hepsiburada reddedildi (neden iletili), `-ipucu` (kısa neden), `-kart` (durum kartı) |

## Önce (A6b tabanı) — eleştiri
1. Varyant tablosu ürün satırından kopuk, gölgeli ayrı bir kart (kart içinde kart); satırla bağ yok.
2. Her varyantta 4 kanal × adlı çip, iki satır — gönderilmemiş kanallar da aynı ağırlıkta; gürültü yüksek.
3. Hatalı kanal yalnız kırmızı "!"; neden görmek için tıklamak gerekiyor.
4. Rowspan'li "Grup" sütunu ağır; "STOK KODU / BARKOD" çift sıralama başlıkları kalabalık.
5. Özet yok (sayı, toplam stok, kanal kapsamı); barkod kopyalanamıyor.
6. 390px'te varyant alanı tablo olarak kalıyor ve kesiliyor.
7. Çok varyantta 14 satır uzun liste; kompakt mod yok.
8. Görsel yer tutucusu kırık görünüyor.

## Sonra — kararlar
- **Bağlı hiyerarşi:** açık ürün satırı ve varyant alanı aynı `surface-sunken` blok; sol 3px şerit ürün satırında başlar; varyant kabı ürün görseli hizasında içeri girintili, üst kenarı satıra birleşik (üst köşe yarıçapsız).
  Denenen alternatif (1. iterasyon): görsel ekseninden inen dirsek çizgi — kopuk/süs gibi durduğu için kaldırıldı.
- **Açılış:** yükseklik (grid 0fr→1fr) + opaklık, `--ek-duration-base`; ok dönüşü mevcut token geçişi; reduced-motion'da 0.
- **Özet şeridi:** "n varyant · m Renk · Toplam stok" + tükendi/az bayrakları + seçili sayısı; KANALLAR: kanal nokta + ad + "x/n yayında" + hata/bekliyor sayısı; hiç gönderilmemiş kanallar tek kesik çizgili çip.
- **Gruplar:** ayırıcı seçenek başlık satırı (RENK Siyah · 2 varyant · stok 15); satırda yalnız kalan seçenekler çip.
- **Satır:** görsel (yoksa nötr ikonlu yer tutucu) · seçenek çipleri + stok kodu (mono) · barkod (mono + kopyala, hover/odakta; dokunmatikte hep görünür) · fiyat tabular sağa hizalı · stok tükendi (hata tonu) / az (≤ 5, uyarı tonu) + raf · kanal çipleri · `EkRowActions` (Ürün formunda düzenle + ⋯ Barkodu/Stok kodunu kopyala).
- **Kanal durumu:** yalnız gönderilmiş kanallar adlı çip (kanal rengi nokta + durum ikonu; reddedilen çip hata tonunda); ipucunda "Kanal · Durum" + kısa neden; tıklayınca DS-v2 durum kartı. Gönderilmemişler "+n".
  Denenen alternatif (1. iterasyon): "+2 gönderilmedi" metinli çip — satırı iki satıra kırıyordu; "+n" + ekran okuyucu metni seçildi.
- **Çok varyant (> 8):** kompakt ızgara (her hücre tek satır, 28px görsel) + ilk 8 satır + "Tümünü gör · n varyant daha" (aria-expanded/controls); açıkken 520px iç kaydırma, yapışık başlık. Sanal kaydırma gerekmedi (ürün başı varyant sayısı yüzler mertebesinde değil; iç kaydırma yeterli).
- **390px:** kap sorgusu (< 600px) ile satır = kart (A6b deseni): ☐ · görsel + seçenek + stok kodu · eylemler; altında BARKOD / FİYAT / STOK / KANALLAR.
- **Veri sınırları:** backend projeksiyonunda `reserved` yok → rezerve/kullanılabilir ayrımı gösterilmedi; seçenek değerinde renk kodu yok → renk örneği yok (grup noktası nötr işaret); "Az" eşiği yalnız görünüm sabiti (`LOW_STOCK_THRESHOLD = 5`, ipucunda yazılı).
  `IntegrationService/processPlatformProduct` ve `checkProductStatus` backend'de tanımsız → satırda "kanala gönder / durum sorgula" eylemi YOK.
- **Tutarlılık düzeltmesi:** çip "aktarım tamam ama onSale yok"u "satışa kapalı", kart "yayında" diyordu → tek kural (yalnız `onSale:false` satışa kapalı). Kart başlığı son güncelleme tarihini adım tarihinden alır ("İşlem Yok" + "Başarısız" çelişkisi giderildi).
