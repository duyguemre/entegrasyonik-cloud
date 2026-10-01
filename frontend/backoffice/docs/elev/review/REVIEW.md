# BO-ELEV inceleme — önce / sonra ve sert eleştiri

Kareler bu klasörde: `once-*` (taban `cloud/bo-next` fc33a48), `iter1-*` (ilk uygulama), `sonra-*` (iterasyon 2 sonrası).
Adlandırma: `<önek>-<no>-<ekran>-<tema>-<genişlik>.png`. Betik: `e2e/specs/review-elev.spec.ts`
(`BO_REVIEW=1 BO_REVIEW_PREFIX=sonra [BO_REVIEW_ONLY=01-,21-] [BO_REVIEW_THEMES=light] [BO_REVIEW_WIDTHS=1440]`).
Bu kareler görsel taban DEĞİLDİR; görsel onay yerelde (Windows) yapılır.

| No | Ekran | Önce | Sonra |
|---|---|---|---|
| 01 | Genel bakış | `once-01-genel-bakis-*` | `sonra-01-genel-bakis-*` |
| 11 | Müşteri detayı | `once-11-musteri-detay-*` | `sonra-11-musteri-detay-*` |
| 21 | Başarısız işler | `once-21-motor-basarisiz-*` | `iter1-…`, `sonra-21-motor-basarisiz-*` |
| 31 | Denetim (süzgeç alanları) | `once-31-denetim-*` | `sonra-31-denetim-*` |
| 44 | Platform uyarıları | `once-44-uyarilar-*` | `sonra-44-uyarilar-*` |
| 50–52 | Palet, kısayol yardımı | `once-50/51-*` | `sonra-50/51/52-*` |
| 60–61 | Kısmi bozulma (Redis düşük) | `once-60/61-*` | `sonra-60/61-*` |
| 70 | Tehlikeli işlem diyaloğu | `once-70-*` | `sonra-70-*` |
| diğerleri | 10, 12, 20, 22, 23, 30, 40–43 | `once-*` | `sonra-*` (yan etki denetimi: süzgeç alanı boyu) |

---

## E1 — Genel bakış: karar şeridi
**Önce:** "Dikkat gerektiren durum var · Hata oranı yüksek" — hüküm var, yön yok. Kuyruk KPI'sı 1 DLQ işi varken
"Sağlıklı". 390 px'te altı KPI tek sütun, sayfa ~4.250 px.
**Sonra:** "3 konu dikkat istiyor" + her konu hedef ekranı yazan bir bağlantı (Hata oranı %1,7 → Loglar `?level=fatal,error`;
1 iş elle inceleme bekliyor (DLQ) → Motor `?sekme=basarisiz&kaynak=dlq`; 2 yeni sorun → Loglar). Kırmızı konu varsa şerit
kırmızı. KPI kartlarının tamamı ayrıntı ekranına gider (tek sekme durağı, kart içi "Yeniden dene" üstte kalır). DLQ > 0 →
"İnceleme bekliyor". 390 px'te KPI'lar iki sütun, sayfa ~3.850 px.
**Sert eleştiri (iterasyon 1 → 2):** (a) Yenileme başarısız olduğunda "Güncellendi az önce" yalan söylüyordu (zaman her
denemede ilerliyordu) → artık yalnız başarılı okumada ilerliyor; başarısızsa sarı "Yenilenemedi — gösterilen veri X önce alındı".
(b) Mobilde KPI etiketleri "HATA ORANI (…" diye kesiliyordu → dar ekranda sarılıyor. (c) Kalan: "Hazır" sözcüğü hâlâ
metrik puntosunda (NT-09); "Son yönetim işlemleri"nde ham `backoffice.write` (NT-09).

## E2 — Klavye
**Önce:** Ctrl+K vardı; `?` yok, ekranlar arası kısayol yok, Alt+R ipucu **görünüyor ama çalışmıyordu**.
**Sonra:** `g` + harf (kayıtta `hotkey`, tekil — vitest), `?` kısayol yardımı (kayıttan üretilir), Alt+R görünür ilk sayfa
yenileme düğmesi. Palet: boş sorguda "Son açılanlar" (yönetici başına, yalnız ekran anahtarı / müşteri no — ad yazılmaz,
KVKK), mağaza adıyla arama (sunucu araması, eski yanıt yok sayılır), `102` → detay / olay akışı / denetim. Ekran satırlarında
kısayol rozeti (`G M`). Palet ve yardım diyaloğunun erişilebilir adı yoktu (`- dialog:`) → `aria-label` verildi.
**Eleştiri:** Kısayol harfleri Türkçe ezber için ideal değil (k = kuyruk, y = yönetici iyi; a = abonelik zorlama). Harf
çakışması gelirse kayıt testi kırılır — bilinçli. Tablo satırında j/k yok (NT-10).

## E3 — Operasyon tabloları (başarısız işler / ölü mektup)
**Önce:** 25 satır ≈ 1.700 px; iki satırlık hücreler; dört renkli hata kodu rozeti; her satırda çerçeveli "Yeniden dene";
sil ikonu 8 px yanında; iş kimliği gri kutusu kaymış.
**Sonra:** 36 px satır (`.bo-dense`), tek satır (işlem adı `title`'da), hata kodu `.bo-code-tag` (nötr, mono, açıklama
`title`'da), "Yeniden dene" hayalet düğme, yıkıcı sil ince ayraçla ayrık ve yalnız üzerine gelince kırmızı. ≈ 1.330 px.
**Eleştiri:** Hata kodunun açıklaması yalnız `title` ipucunda — dokunmatikte görünmez (NT-04 kart görünümüyle çözülecek).
Toplu yeniden deneme yok (BE-03).

## E4 — Platform uyarıları
**Önce:** "başladı 52 dakika önce" dört satıra kırılıyordu.  **Sonra:** "Başladı 52 dk önce / son görülme 1 dk önce", kırılmaz.

## E5 — Müşteri izlenebilirliği
**Önce:** Detay = Hesap + Kanallar (`MARKETPLACE`); log merkezi `?tid=` okumuyordu; menüde "Yaşam döngüsü · YAKINDA"
detaydaki çalışan sekmeyle çelişiyordu; başlıkta iki yeşil rozet ("Aktif", "Kurumsal · Aktif").
**Sonra:** "İz sür" kartı (Olay akışı `?tid`, Denetim `?tid`, Bildirim geçmişi `?tid`, Abonelik); log merkezinde müşteri
kapsamı çipi (kaldırılabilir, "olay akışına uygulanır; sorun grupları platform genelidir" dürüst notu) ve olay akışı
sekmesi; kanal türü Türkçe; "Abonelik: Kurumsal · Aktif"; menüde "Hesap kuyruğu" (planlı çapraz müşteri listesi).
**Eleştiri:** Detay hâlâ müşterinin **şu anki sağlığını** göstermiyor (son hata, açık sorun, başarısız iş sayısı) — backend
özeti gerekir (BE-02). Başlıktaki "Denetim kaydı" düğmesi İz sür kartıyla tekrar ediyor; kaldırma kararı yerel görsel
onaya bırakıldı.

## E6 — Süzgeç alanları
Sayfa içindeki compact Vuetify alanları 38 px / 14 px'e çekildi (`.bo-page` kapsamı; giriş ve diyaloglar etkilenmez).
Denetim ve log araç çubuğunda segment, seçim ve metin alanı aynı göz hizasında.

## E7 — Tehlikeli işlem diyaloğu
İlk satır **Ortam** (Örnek veri / Yerel / Staging sarı şerit / ÜRETİM kırmızı şerit). `GuardedDialog` üzerinden tüm yazma
diyaloglarına yayıldı.

## Kontrol listesi (CONSOLE_IDENTITY)
- [x] İlk satır hüküm ve bağlantılı (genel bakış) · [x] Kimlikler nötr (hata kodu) · [x] Operasyon listesi sıkı ·
  [x] Ekranlar `g` dizisiyle · [x] Ortam diyalogda · [x] Müşteri kimliği iz ekranlarına bağlı · [x] Bayat veri söyleniyor
  (genel bakış; diğer ekranlar NT-07) · [x] axe 0 (açık/koyu; elev.spec + mevcut specler)
