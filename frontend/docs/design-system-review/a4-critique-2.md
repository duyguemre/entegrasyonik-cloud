# DS-v2 Aşama 4 — ikinci bağımsız premium tur, tur 2

Tur 1 düzeltmelerinden sonra `a4-review.spec.ts` ile 1440 / 800 / 390 yeniden çekim (49 görüntü × 3 genişlik) + klavye/odak
akışı, boş/hata/yükleniyor durumları ve bilgisayarda ölçülen hesaplanmış stiller (düğme yazı boyutu). Odak: tur 1'in doğurduğu
yeni durumlar, mikro tipografi, mobil yoğunluk, W1/W2 durum ekranları. **D** = düzeltildi · **A** = açık (gerekçeli).

## Bulgular

| # | Ekran(lar) | Kusur | Düzeltme | Durum |
|---|---|---|---|---|
| A4-18 | Giriş, doğrulama, sıfırlama, tüm ham `v-btn` | Tur 1'deki DS düğme tipografisi (A4-2) giriş "Giriş", doğrulama "Uygulamaya git" düğmelerinde **uygulanmıyordu** — hesaplanmış stil 12px: eski `public/assets/css/site.css` `.entegrasyonik-application .v-btn { font-size: 12px !important }` kuralı eziyordu | Eski kural kaldırıldı; ikon düğmelerinin taban boyutu `caption` rolüne sabitlendi (glif 1.5em → 18px, ikon boyutları değişmez). Ölçüm: giriş düğmesi 13px / 600 | D |
| A4-19 | Tüm formlar | Yüzen alan etiketi 10px — DS tipografi ölçeğinin (11/12/13/14…) dışında, "Sipariş durumu" gibi etiketler zor okunuyordu; alan metinleri literal 14px | `micro` boyutu (11px, büyük harf değil); alan/etiket boyutları `body` token'ına bağlandı | D |
| A4-20 | Tüm listeler (hata durumu) | Hata kartının altında sayfalama "**0 kayıt**" diyordu — hata ≠ boş ilkesine aykırı (liste boş değil, bilinmiyor) | Hata durumunda sayfalama gizli; kart "Tekrar dene" ile biter | D |
| A4-21 | Denetim günlüğü, Finans › Özet (390) | Kart düzeninde sıralanabilir kolon yoksa başlık satırı **boş gri şerit** olarak kalıyordu | Sıralanabilir kolon ve seçim yoksa sıralama çubuğu görsel olarak gizli (ekran okuyucu başlıkları korunur) | D |
| A4-22 | Bildirimler (390) | Kart düzeninde başlık yalnız tür ikonuydu, bildirim metni "BİLDİRİM" etiketiyle ikinci satırda | Dar ekranda tür kolonu yok; ikon bildirimin yanında, **kart başlığı = bildirim** (zaman + okunma bilgisi başlık hücresinde) | D |
| A4-23 | Bildirim çekmecesi | İşlem özeti kartında kanal ham kod BÜYÜK HARF ("TRENDYOL"); tür rozeti ("İçe Aktarım") kart genişliğinde esniyordu; ipucu "Tümünü Sil" | `EkChannelDot`; rozet içerik genişliğinde; cümle düzeni | D |
| A4-24 | Pano, Stok sağlığı (390) | 4 KPI kartı alt alta ~500px — ilk ekranda içerik yok | Dar ekranda **2 sütun**; `EkMetricCard` dar ekranda ikon üstte (sütun düzeni), iç boşluk `space-4` | D |
| A4-25 | Ürünler, Etkin yapılandırma, Destek yönetimi (390) | Başlık eylemlerinde "yenile" düğmesi tek başına bir satıra düşüyordu (arama + metinli eylem sığmayınca) | Mobilde arama + yenile ilk satırda; metinli eylemler sığmazsa alt satıra (`order`); arama tabanı 160px | D |
| A4-26 | Entegrasyon uyum (390) | Beş filtre seçicisi 168px sabit genişlikte alt alta, sağ yarı boş | Dar ekranda 2'li ızgara | D |
| A4-27 | Sistem yönetimi | Tur 1 terim değişikliğinin kalanı: ayrıntı diyaloğu "Export Trafiği Detaylı Analiz" | "Gönderim trafiği — ayrıntılı analiz" | D |
| A4-28 | Kabuk (menü) | Menü düğümünde ikon yoksa nokta yedeği; `screens.ts` ikon alanı "menüde yoksa yedek" olarak belgelenmiş ama kullanılmıyordu | Menü ikonu yoksa kayıt defteri ikonu (`resolveScreenByKey().icon`), o da yoksa nokta | D |
| A4-29 | İnceleme aracı | a3/a4 inceleme menüsü ikonsuzdu → rayda ve sekmelerde nokta sütunu (ürün kusuru sanılıyordu; gerçek menü ağacı ikonlu gelir) | İnceleme fixture'ı e2e menü fixture'ındaki ikonları kullanır | D (araç) |
| A4-30 | Klavye akışı (Siparişler) | Tab sırası: arama → yenile → filtre başlığı → Görünümler → alanlar → Temizle/Sorgula → sıralama düğmeleri → satırlar; odak halkası her durakta görünür. İlk çekimde "Ka…" kesik yüzen etiket görüldü | Kusur değil — Tab'lar arası bekleme olmadan çekilen görüntüde etiket geçişi yakalanmıştı; araç geçiş bitince çeker | — |
| A4-31 | Tablet (800) | Yapışık seçim kolonu ile kimlik kolonu arasında başlıkta açık renkli ince şerit şüphesi | Kırpılmış ölçüm yapılamadı (görüntü işleme aracı yok); tablo ekranlarında yeniden incelenecek | A — tur 3'e |
| A4-32 | Etkin yapılandırma (390) | 4 KPI kartı (`EkKpiRow`) alt alta; "2026-09-29.b1" gibi uzun değerler 2 sütunda kesilir | — | A — yönetici ekranı; `EkKpiCard` değer kesmesi bilinçli (tek satır), 2 sütun uzun sürüm dizgisini okunmaz yapar |

## Hareket / geçiş

Sekme geçişi (`SecureLayout.playTabEnter`) 200ms fade + 4px kayma, `prefers-reduced-motion` desteği; hover/renk geçişleri
`--ek-transition-colors`. Sayfa içi sekmelerde (Finans, İşlem kayıtları) içerik anında değişiyor — kısa ve sakin, göze batmıyor;
ek animasyon eklenmedi (brif: "hoplayıp zıplayan yok").
