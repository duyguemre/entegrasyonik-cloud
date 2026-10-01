# Backoffice review — 2. tur geri bildirim (kullanıcı, 2026-10-01)

Kullanıcı: backoffice'i baştan sona gözden geçir; tutarlı, okunabilir, kullanıcı deneyimi yüksek ve premium hissettiren bir panel. Karar: USER_DECISIONS K59. R1 (K51, "Durum → Karar → Eylem → Ayrıntı") geçerliliğini korur; R2 bunun görsel/sistem katmanıdır.

Bulut uygulaması iki zincirli görevde: **bo-r2a** (denetim + ortak bileşenler + tipografi + ECharts + Genel Bakış + Teknik ayrıntılar), **bo-r2b** (kalan tüm sayfalar, bo-r2a üzerine).

## Çalışma yöntemi
- **BO2-01** Önce tüm sayfaları incele, tekrar eden yapıları çıkar: sayfa başlığı, bilgi kutuları, listeler, tablolar, filtreler, sayfalama, düğmeler, ikonlar, grafikler. Envanter → `frontend/backoffice/docs/bo-r2-review/INVENTORY.md`.
- **BO2-02** Bu yapılar için ortak, yeniden kullanılabilir bileşenler oluştur ya da mevcutları standartlaştır; sayfalar yalnız bunları kullansın (yerel kopya kalmasın — statik mandal).
- **BO2-03** Sonra her sayfayı aşağıdaki kurallara göre tek tek düzenle.
- **BO2-04** Sonunda sayfa başına ne değişti kısa özet (rapor).

## Genel kurallar
### Yerleşim ve boşluklar
- **BO2-10** Sol/sağ padding çok fazla; ekran alanı daha geniş kullanılmalı.
- **BO2-11** Bölümler ("Müdahale edilecek konular", listeleri, sayfanın ana veri listesi gibi) birbirinden ayrışmıyor, sayfaya dağılmış bilgiler gibi duruyor. Her bölüm görsel olarak net ayrılmalı (kart, başlık, boşluk hiyerarşisi); okunabilir, tutarlı düzen.
- **BO2-12** Aynı satırdaki kutular aynı yükseklikte ve kenarlardan hizalı.

### Sayfa başlıkları
- **BO2-20** Tüm sayfalarda sayfa adı + açıklaması daha okunabilir ve premium, standart bir başlık bileşeniyle.

### Tipografi
- **BO2-30** Font kurallarına uyulmayan yerler var. Başlık, alt başlık, gövde, etiket için TEK tipografi ölçeği tanımlanmalı ve her yerde uygulanmalı (mandal: ölçek dışı font-size/weight yasak).

### Tablolar, filtreler, sayfalama
- **BO2-40** Tüm veri listelerinde datatable tasarımı standart.
- **BO2-41** Sayfalama ve filtre yapısı tüm sayfalarda aynı bileşen ve aynı davranış.

### Tutarlılık
- **BO2-50** Aynı/benzer işi yapan düğme, ikon, tablo ve diğer tüm öğeler sayfalar arasında aynı görünür ve aynı davranır (düzenle, sil, detay, yenile, dışa aktar…). Ortak eylem sözlüğü (ikon + etiket + varyant) tek kaynak.

### Grafikler
- **BO2-60** Mevcut grafikler zayıf. Vue ECharts ile daha premium, göze hoş gelen, albenili grafikler; renkler panelin paletiyle uyumlu (açık + koyu tema, token'dan türeyen ECharts teması). Not: `frontend/package.json` echarts ^6 + vue-echarts ^8 zaten var; backoffice paketine aynı sürümle eklenir, tree-shaken.

### Kaydırma
- **BO2-70** Çok uzun dikey scroll gerektiren sayfalar sekme, görünüm değiştirici veya daraltılabilir bölümlerle bölünmeli.
- **BO2-71** Yatay scroll mümkün olduğunca oluşmamalı.

## Sayfa bazında
- **BO2-P1 Genel Bakış:** Çok fazla yazı var, hepsi aynı anda okunamıyor. Bilgiler önceliklendirilmeli: önemli metrikler öne, detaylar ikinci planda (açılır alan, tooltip, detay sayfası vb.).
- **BO2-P2 Teknik Ayrıntılar** (`?ayrinti=teknik`): kutu yerleşimleri düzeltilmeli; kenarlardan hizalı, aynı satırdakiler aynı yükseklikte.
- **BO2-P3 Otopilot (chat-as-UI):** sohbet ekranı daha geniş alana yayılmalı (içinde UI öğeleri gösteriliyor), yatay scroll olmamalı; daha premium, kolay ve sezgisel. Not: sohbet bileşeni ortak `@entegrasyonik/chat` paketi (web + backoffice + yerel) — paket değişikliği web uygulamasını bozmamalı, chat vitest + frontend e2e sohbet spec'leri yeşil kalmalı.
- **BO2-P4 Müşteri Kullanımı:** kutular birbirine yapışık; aralarında yeterli boşluk. Bölüm daha anlaşılır, genel tasarım kalitesi yükseltilmeli.
- **BO2-P5 Abonelikler:** neyin neyi açtığı anlaşılmıyor. İçerik sekme yapısıyla düzenlenmeli, gezinme netleşmeli.
- **BO2-P6 Motor ve Kuyruklar:** "başarısız işler" diyor ama hangi işin neden başarısız olduğu belli değil. Sayfanın ne anlattığı netleşmeli: her iş için tür, durum, hata nedeni, zaman açıkça. Çok fazla dikey scroll → sekmeler veya görünüm değiştirici (ör. özet / detay). Backend yanıtında alan eksikse mock + `docs/cloud-contracts` sözleşme isteği (BE isteği olarak rapora).
- **BO2-P7 Diğer tüm sayfalar:** aynı genel kurallarla değerlendirilip düzenlenir.
