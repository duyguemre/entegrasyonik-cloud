# BO-ELEV denetimi — backoffice bir operasyon konsolu olarak

Taban: `cloud/bo-next` @ `fc33a48` (bo-p1 + bo-p2 + bo-next + sohbet). Dal: `cloud/bo-elev`. Tarih: 2026-10-01.
Bakış açısı: nöbetteki deneyimli bir SRE/operasyon kullanıcısı ("gece 03:00'te ne bozuk, kim etkileniyor, ne yapmalıyım?")
ve bir ürün tasarımcısı ("ekran bunu ilk bakışta söylüyor mu, tutarlı mı, sakin mi?").
Kareler: `review/once-*` (açık/koyu × 1440/390; betik `e2e/specs/review-elev.spec.ts`, `BO_REVIEW_PREFIX=once`).

Önem: **Y** = karar hızını ya da güveni doğrudan bozuyor · **O** = verimlilik/tutarlılık kaybı · **D** = cila.
Durum sütunu: `✔ BO-ELEV` bu dalda yapıldı · `→ NT-xx` NEXT_TASKS'te hazır görev · `→ BE-xx` backend gerekir.

---

## 0. Genel hüküm

Temel sağlam: tek ekran kaydı, sayfa başlığı deseni, dört durumlu paneller, tehlikeli işlem diyaloğu, step-up göstergesi,
ortam rozeti, iki temada axe temiz. bo-p1 → bo-p2 → bo-next üç ayrı ekip/oturum gibi büyüdü ve **dikiş yerleri görünüyor**:
iki tablo sistemi (`.bo-table` ve `EkDataTable`), iki durum bileşeni (`BoPanelState` ve `StateBlock`), iki yenileme düğmesi
(metinli "Yenile" ve ikon `EkRefreshButton`), iki filtre denetimi dili (ince `.bo-seg` ve kalın Vuetify alanları).
Konsolun "sakin ama keskin" olması için en büyük kazanç yeni ekran değil: **ilk bakışta karar** (genel bakış), **klavyeyle hız**,
**renk disiplini** ve **iz sürme bağlantıları**.

---

## 1. Bilgi mimarisi ve göz tarama

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| IA-1 | Genel bakış şeridi "Dikkat gerektiren durum var · Hata oranı yüksek" diyor ama **nereye gidileceğini söylemiyor**; madde metin, bağlantı değil. Nöbetçi şeritten loglara/motora tek tıkla geçemiyor. | Y | ✔ BO-ELEV (E1) |
| IA-2 | Kuyruk KPI'sı DLQ'da 1 inceleme bekleyen iş varken "Sağlıklı" diyor. Ölü mektup = elle müdahale bekleyen iş; sağlıklı denemez. | Y | ✔ BO-ELEV (E1) |
| IA-3 | Genel bakış KPI'ları 390 px'te tek sütun, altı büyük kart → ilk ekranda yalnız 2 gösterge; sayfa ~4250 px. | O | ✔ BO-ELEV (E1) |
| IA-4 | KPI "Bağımlılıklar: **Hazır**" metni metrik puntosunda; sözcük-metrik büyük harf rakamlarla aynı görsel ağırlıkta, tarama ritmini bozuyor. | D | → NT-09 |
| IA-5 | Menüde "Yaşam döngüsü · YAKINDA" ama müşteri detayında "Yaşam döngüsü" sekmesi çalışıyor. Kullanıcı özelliğin olmadığını sanıyor. Planlı ekran aslında **çapraz müşteri kuyruğu**; etiket bunu söylemeli. | O | ✔ BO-ELEV (E5) |
| IA-6 | Müşteri detayı seyrek (Hesap + Kanallar). Nöbetçinin "bu müşteride ne oluyor?" sorusunun yanıtı (loglar, denetim, bildirim geçmişi, başarısız işler) **detaydan bağlantılı değil**; her biri ayrı ekrandan elle süzülüyor. | Y | ✔ BO-ELEV (E5: iz bağlantıları) · içerik özeti → BE-02 |
| IA-7 | Müşteri listesinde plan, açık sorun sayısı, son hata yok; "kimi önce aramalıyım" sıralaması yapılamıyor. Sütun sıralama yok. | O | → NT-05, BE-01 |
| IA-8 | Log merkezi URL'de `?tid=` okumuyor (sözleşmede `LogFilter.tid` VAR). Müşteriden loglara iz sürülemiyor. | Y | ✔ BO-ELEV (E5) |

## 2. Durum renkleri ve rozet tutarlılığı

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| ST-1 | Başarısız iş / ölü mektup tablolarında hata kodu rozetleri **gökkuşağı** (UNAVAILABLE sarı, AUTH kırmızı, VALIDATION mavi, UNKNOWN gri). Hata kodu bir **kimlik**tir, durum değil; 25 satırda dört renk "her şey önemli" diyor ve gerçek durum rozetlerini (Açık/Kritik) boğuyor. | Y | ✔ BO-ELEV (E3: nötr kod etiketi + tek anlamlı nokta) |
| ST-2 | Panel başlığında yenileme sonrası 1,2 sn yeşil tik (`EkRefreshButton` success); Redis düşükken "Kuyruk durumu ✓" yan yana "Redis hazır değil" görünebiliyor. Tik "veri tazelendi" demek ama "sağlıklı" okunuyor. | O | → NT-07 (paket kararı; ana uygulamayı etkiler) |
| ST-3 | Müşteri detayında kanal türü ham enum: `MARKETPLACE`, `ECOMMERCE`. | O | ✔ BO-ELEV (E5) |
| ST-4 | Müşteri detayı başlığında "Aktif" ve "Kurumsal · Aktif" yan yana iki yeşil rozet; hangisi hesap hangisi abonelik belli değil. | O | ✔ BO-ELEV (E5: "Abonelik:" ön eki) |
| ST-5 | Uyarılar tablosunda "Gölge" rozeti ve "Susturuldu" rozeti aynı hücrede yığılıyor; susturma bitişi rozet içinde uzun tarih. | D | → NT-08 |

## 3. Tablo yoğunluğu ve okunurluk

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| TB-1 | İki tablo sistemi: `.bo-table` (bo-p1: müşteri, genel bakış, denetim) ve `EkDataTable` (bo-p2/next: motor, entegrasyon, abonelik, bildirim). Satır yüksekliği, başlık puntosu, kimlik hücresi farklı. | O | Kısmi ✔ (E3: operasyon listeleri sıkı yoğunluk) · birleştirme → NT-04 |
| TB-2 | Başarısız işler 25 satır × iki satırlık hücre × her satırda tam metinli "Yeniden dene" düğmesi → 1.700 px; düğme sütunu görsel gürültü. Silme (yıkıcı) ikonu yeniden denemeye 8 px uzaklıkta. | Y | ✔ BO-ELEV (E3) |
| TB-3 | İş kimliği `bo-code` gri kutusu `EkDataTable` hücresinde taşıyor (kutu sola kaçık, alt satırla hizasız). | D | ✔ BO-ELEV (E3) |
| TB-4 | Uyarılar tablosu: "başladı 52 dakika önce" dört satıra kırılıyor, "Kimlik hatası / devre kesici" iki satır; zaman sütunu dar, ayrıntı sütunu boş alan. | O | ✔ BO-ELEV (E4) |
| TB-5 | Log merkezi sorun başlıkları ~400 px'te sert kesiliyor ("…mağaza anaht"); ipucu yok, tam başlık ancak detayda. | O | → NT-06 |
| TB-6 | Denetim tablosu sabit yükseklikli iç kaydırma + sayfa kaydırması (çift kaydırma); son satır yarım görünüyor. | D | → NT-04 |
| TB-7 | Toplu işlem yok (aynı hata kodlu 12 işi tek seferde yeniden dene). | O | → BE-03 (toplu uç + idempotency) |

## 4. Filtre, arama, kaydedilmiş görünüm

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| FL-1 | Filtre denetimleri iki dilde: `.bo-seg` (36 px, ince) + Vuetify outlined `v-select` (40 px, büyük etiket, kalın kenar). Denetim/log araç çubuğunda göz hizası kırık. | O | ✔ BO-ELEV (E6: araç çubuğu alanları tek boy/ton) |
| FL-2 | Başarısız işlerde müşteri / entegrasyon / hata kodu süzgeci yok; yalnız kuyruk + kaynak. | O | → BE-03 (sunucu süzgeci; istemcide sayfa içi süzme yanıltıcı olur) |
| FL-3 | Kaydedilmiş görünüm yok; URL süzgeçleri yalnız denetimde ve kısmen log merkezinde. "Bağlantıyı kopyala" yok. | O | → NT-03 |
| FL-4 | Müşteri listesi arama kutusu sayfadaki en büyük öğe (48 px, 18 px yazı) — konsol yoğunluğuyla çelişiyor. | D | ✔ BO-ELEV (E6) |

## 5. Klavye verimliliği

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| KB-1 | Kısayollar keşfedilemiyor: Ctrl+K, `/`, Ctrl+J, Alt+R var ama bir **kısayol yardımı** (`?`) yok. | Y | ✔ BO-ELEV (E2) |
| KB-2 | Ekranlar arası gezinme yalnız palet/fare; operasyon konsollarının standardı `g` + harf dizisi (g o genel bakış, g m müşteriler, g l loglar, g d denetim…) yok. | O | ✔ BO-ELEV (E2) |
| KB-3 | Palet boş sorguda yalnız ekran listesi; **son açılanlar** (ekran + müşteri) yok. Müşteri ADIYLA arama yok (yalnız numara). | O | ✔ BO-ELEV (E2) |
| KB-4 | Palet "102" için yalnız "Müşteri #102 detayını aç"; aynı müşterinin loglarına/denetimine tek adımda gidilemiyor. | O | ✔ BO-ELEV (E2) |
| KB-5 | Tablo satırlarında j/k ile gezinme yok. | D | → NT-10 |

## 6. Boş / hata / kısmi bozulma

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| DG-1 | Dört durum her panelde var (iyi). Ama `BoPanelState` (bo-p1) ve `StateBlock` (bo-p2) metin kuralları ayrı; aynı 503 iki ekranda farklı cümle. | O | → NT-04 |
| DG-2 | Redis düşükken genel bakış şeridi "Kuyruklar okunamadı" diyor; hangi ekranda ne yapılacağı yok. | O | ✔ BO-ELEV (E1: maddeye hedef bağlantı) |
| DG-3 | Otomatik yenileme başarısız olduğunda (son iyi veri korunuyor — iyi) sayfa başlığında "bayat veri" göstergesi yok; "Güncellendi 3 dk önce" yeşil/nötr kalıyor. | O | → NT-07 |

## 7. Tehlikeli işlem güvenliği

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| DA-1 | Diyalog dört soruyu yanıtlıyor (iyi) ama **hangi ortamda** olduğunu söylemiyor. Üst bardaki ÜRETİM rozeti diyalog örtüsünün altında soluk kalıyor; en kritik anda ortam bilgisi görünmez. | Y | ✔ BO-ELEV (E7) |
| DA-2 | Yıkıcı satır eylemi (sil) yeniden dene düğmesinin hemen yanında, aynı boyda. | O | ✔ BO-ELEV (E3) |
| DA-3 | Üretimde yıkıcı işlemlerde ek onay (ör. hedef kimliğini yazdırma) yok. | O | → NT-02 |

## 8. İzlenebilirlik

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| TR-1 | Başarısız iş satırında istek/iz kimliği yok; işten loga geçiş yok. | O | → BE-04 (`reqId`/`traceId` alanı) |
| TR-2 | Müşteri detayı → loglar/denetim/bildirimler/abonelik bağlantısı yok (IA-6). | Y | ✔ BO-ELEV (E5) |
| TR-3 | Genel bakış "Son yönetim işlemleri" `reqId`'ye bağlanıyor (iyi); `tid` olan kayıtta müşteriye bağlantı yok. | D | → NT-09 |

## 9. Metin kalitesi

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| TX-1 | Ham enum/kod sızıntıları: `MARKETPLACE`, `PENDING_MANUAL_REVIEW` (motor KPI açıklaması), `backoffice.write` (genel bakış). | O | Kısmi ✔ (E5 kanal türü) · kalan → NT-09 |
| TX-2 | "Sekme açıkken 30 sn'de bir yenilenir" + "Sekme açıkken 30 saniyede bir kendiliğinden yenilenir" — aynı bilgi iki biçimde. | D | → NT-09 |
| TX-3 | Pazarlama dili yok, ton tutarlı (iyi). Teknik terimler parantezle açıklanıyor (iyi). | — | — |

## 10. Mobil (390 px)

| # | Bulgu | Önem | Durum |
|---|---|---|---|
| MB-1 | Genel bakış çok uzun (IA-3). | O | ✔ BO-ELEV (E1) |
| MB-2 | Üst bar 390'da sıkışık ama işlevsel; ortam rozeti metni korunuyor (iyi). | — | — |
| MB-3 | Başarısız işler 390'da yatay kayan 7 sütun; kart satır görünümü yok (BO_UI_PATTERNS §3 önerisi uygulanmamış). | O | → NT-04 |

---

## Öncelik sırası (uygulanan)
E1 genel bakış "karar şeridi" · E2 klavye (kısayol yardımı, g-dizileri, palette son açılanlar + müşteri adı + müşteri eylemleri) ·
E3 operasyon tabloları (nötr hata kodu, sıkı yoğunluk, sakin satır eylemleri) · E4 uyarılar tablosu · E5 müşteri izlenebilirliği
(+ log `?tid=`) · E6 araç çubuğu denetim boyu · E7 diyalogda ortam satırı. Ayrıntı: `review/REVIEW.md`.
