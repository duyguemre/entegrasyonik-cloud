# DS-v2 Aşama 3 — premium eleştiri turu 2

Tur 1 düzeltmelerinden sonra aynı araçla (`A3_REVIEW=1`) yeniden çekim; tur 1'de görüntüsü alınamayan ekranlar
(yönetim ayar ekranları, uyum konsolu) eklendi. **D** = düzeltildi · **A** = açık (gerekçeli).

## Liste / tablo

| # | Ekran | Kusur | Madde | Durum |
|---|---|---|---|---|
| L2b | İşlem kayıtları, Denetim günlüğü (390) | Yapışık kenar gölgesi eklendi ama çok silikti; yapışık kolonu olmayan dar görünümde kaydırılabilirlik hiç anlaşılmıyordu | 6 | D — kenar gölgesi belirginleşti (token değeri), `EkDataGrid`'e CSS kaydırma gölgesi (local/scroll arka plan; içerik kenara varınca kaybolur) |
| L10 | Destek yönetimi, tüm listeler (390) | Mobilde "yenile" düğmesi tek başına alt satıra düşüyordu | 6, 10 | D — arama tam satır, eylemler altta tek satır |
| L11 | Tüm listeler | Boş/hata durum başlıkları Başlık Düzeninde ("Sipariş Bulunamadı"), diyalog başlıkları BÜYÜK HARF ("FİNANSAL İŞLEM DETAYI") — tipografi dili tutarsız | 1 | D — cümle düzeni; e2e çapaları güncellendi |
| L12 | Müşteriler, sipariş detayı | Telefon biçimi ekranlar arası farklı / biçimsiz | 6 | D — `formatPhone` (tek biçimlendirici) |
| L13 | Ürünler | Ürün görseli olmayan satırda yer tutucu kırık-resim simgesi | 6 | A — `ProductImageComponent` (ürün bileşen seti) temizlik işinde |

## Yönetim ekranları

| # | Ekran | Kusur | Madde | Durum |
|---|---|---|---|---|
| Y1 | Entegrasyon uyum | İçerik sol menüye yapışık (sayfa kenar boşluğu yok), bulgular tablosu sağdan taşıyor | 10 | D — `padding: space-6` |
| Y2 | Sistem yönetimi | Metrik "hap"ları yatay etiket-değer, renkli sayı; KPI dili değil | 5 | D — mikro etiket üstte, değer altta (`metric` rolü) |
| Y3 | Entegrasyon ayarları / motor / etkin yapılandırma | Derin bağlantı inceleme menüsünde yoktu → pano + "erişiminiz yok" bildirimi | — | D — inceleme menüsüne eklendi (araç) |

## Formlar

| # | Ekran | Kusur | Madde | Durum |
|---|---|---|---|---|
| F7 | Tüm filtrelerde tarih alanı | Takvim ikonu ~27px (yazıdan büyük; ikon/yazı oranı dışı) | 1 | D — 18px (`md`) |
| F8 | Kargo / E-fatura / ERP / Pazaryeri / E-ticaret | Boş durum başlığı "Başlamak İçin Seçim Yapın" | 1 | D — cümle düzeni |

## Renk ve eski stil envanteri (brif m.1)

| Kapsam | Önce | Sonra | Not |
|---|---|---|---|
| `public/assets/css/site.css` | 157 literal | 0 | ölü kurallar silindi (~1000 satır), kalanlar rol token'ı; DS katman ölçeğine aykırı `!important` z-index'ler ve `.v-overlay__scrim` yaması kalktı |
| `public/assets/css/integrations.css` | 61 literal | dosya yok | tamamen ölüydü |
| Çağrı yerlerindeki eski tema anahtarları (`passiveColor`, `processButtonColor`, `danger` renk olarak, `grey*`, `orange`) | — | 0 (bu set) | ürün/tanım bileşen setleri paralel işte |
