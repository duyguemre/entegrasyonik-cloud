# S25 — Üst bar ve menü kararı (NAV_DECISION)

Tarih: 2026-09-30 · Dal: `cloud/site-s25` · Kapsam: `site/` (üst bar, açılır paneller, mobil çekmece, fiyatlar K46)

Kullanıcı: "Sitedeki menü yapısına biraz daha çalış; üst bardaki gösterimi daha seçkin bir noktaya getirmelisin, hem
üst bar hem de bunların içerikleri olarak."

## 1. Araştırma — iyi SaaS pazarlama sitelerinde tekrar eden kalıplar

Yalnız KALIP incelendi; hiçbir rakibin adı, metni, ikonu, rengi veya görseli kopyalanmadı.

| # | Kalıp | Neden işe yarıyor | Bizde |
|---|---|---|---|
| K1 | **Az üst öğe** (3-5) + Giriş + TEK birincil CTA | Göz tek satırı 1 saniyede tarar; CTA rekabetsiz kalır | Ürün · Çözümler · Kaynaklar · Fiyatlar (ortada) + metin "Giriş" + Ücretsiz dene |
| K2 | **Kart düzenli mega-menü**: ikon + başlık + tek satır fayda | Kullanıcı sayfaya gitmeden neyi bulacağını bilir; açıklama satırı taramayı hızlandırır | Her bağlantıda ikon kutusu + başlık + tek satır fayda cümlesi |
| K3 | **Öne çıkan kart** (panelin sağında, koyu/renkli zemin) | Panelin "reklam alanı": en önemli mesajı (yeni ürün, deneme) menüde bile satar | Ürün: Otopilot · Çözümler: ücretsiz deneme · Kaynaklar: öne çıkan rehber |
| K4 | **Alt bilgi şeridi** (panelin tabanında ince bant) | "Hepsini gör" ve ikincil yollar kartları kalabalıklaştırmadan sunulur | Tüm özellikler / Tüm entegrasyonlar / Tüm rehberler + ikincil bağlantı |
| K5 | **Kanal/ürün logoları** çözüm satırında | Satıcı kendi kanalını görünce "benim için" der | Pazaryerleri / E-ticaret sitesi / ERP-muhasebe satırlarında mevcut kanal rozetleri (ChannelMono standardı) |
| K6 | **Kaydırmada küçülen cam bar** | İçeriğe yer açar; bar sayfaya "oturur" | 72 → 60 px, yarı saydam zemin + bulanıklık + ince gölge; geçiş yalnız yükseklik/zemin |
| K7 | **Hover niyeti gecikmesi** (açılış ~100-150 ms, kapanış ~200-300 ms) | Fare çapraz geçerken panel yanıp sönmez; yanlışlıkla kapanmaz (WCAG 1.4.13: üzerine gelinebilir + kalıcı) | Açılış 120 ms, kapanış 240 ms; tıklama ve klavye her zaman anında |
| K8 | **Paneller arası geçişte animasyonsuz değişim** | Bir panel açıkken diğerine geçmek "tek menü" hissi verir | Açık panel varken komşu gruba geçiş anında (tekrar giriş animasyonu yok) |
| K9 | **Mobilde tam ekran çekmece**, akordeon gruplar, **altta sabit CTA** | Başparmak bölgesinde birincil eylem; sayfa arkada kaymaz | Tam yükseklik, gövde kaydırması kilitli, akordeon, altta sabit Giriş + Ücretsiz dene |
| K10 | **Aktif sayfa belirtisi** + incelikli hover/focus | Konum duygusu; klavye kullanıcısı için net odak | Üst öğede alt çizgi + kalınlık; panelde vurgulu satır; odak halkası |

Kaynaklar (kalıp düzeyinde): NN/g mega-menü ve hover-gecikme ilkeleri; W3C WAI-ARIA "disclosure navigation" deseni;
WCAG 2.1 SC 1.4.13 (üzerine gelince açılan içerik); SaaS mega-menü örnek derlemeleri (tek satır açıklama, öne çıkan kart).

## 2. Karar

**Bilgi mimarisi (3 panel + 1 doğrudan bağlantı)**

- **Ürün** — "Tek panelden tüm operasyon"
  - Katalog yönetimi · Stok senkronu ve rezervasyon · Sipariş ve iade · Güvenlik
  - Öne çıkan kart: **Otopilot** (Yeni) — ajanlarınız siz uyurken çalışır
  - Alt şerit: "Tek stok, tek panel…" · Tüm özellikler →
- **Çözümler** — "Nerede satıyorsanız oradayız"
  - Pazaryerleri (Trendyol, Hepsiburada, N11, Pazarama) · E-ticaret siteniz (Ideasoft) · ERP ve muhasebe (Bizimhesap)
    — her satırda kanal rozetleri, her rozet kanal sayfasına gider
  - Öne çıkan kart: **14 gün ücretsiz deneme** (gün sayısı ve kart şartı plan kaydından)
  - Alt şerit: "Kanallarınızı dakikalar içinde bağlayın…" · Tüm entegrasyonlar →
- **Kaynaklar** — "Öğrenin, sorun, hızla ilerleyin"
  - Rehber · SSS · Destek · İletişim; yan sütun: rehber konuları
  - Öne çıkan kart: öne çıkan rehber (bilgi merkezi kaydından)
  - Alt şerit: "Aradığınızı bulamadınız mı?" · Terimler sözlüğü →
- **Fiyatlar** — doğrudan bağlantı (S24 kısa etiketi)

**Tek kaynak:** tüm başlık, fayda satırı, ikon, öne çıkan kart ve alt şerit `src/data/navigation.ts`'te; `nav-menu.ts`
yalnız kayıtlardan (kanallar, deneme, rehber) türetir. Header, mobil çekmece ve footer aynı modeli okur.

**Üst bar:** 72 px, yarı saydam zemin; kaydırınca (masaüstü) cam katman 60 px'e kısalır + ince gölge — yalnız
`transform` (akış yüksekliği sabit, sayfa zıplamaz); başlığa yaslanan yapışkan öğeler `--site-header-visible` ile
izler. S24 (kullanıcı madde 8, sadelik) ile birleşti: üst öğeler ORTADA, sağda metin "Giriş" + tek CTA, ayraç yok. Hover: yumuşak zemin hapı; açık grup: hap + dönmüş ok; aktif: alt çizgi + yarı kalın.

**Panel:** kartlı düzen (sol: ikonlu bağlantılar/çözüm satırları, sağ: öne çıkan kart), tabanda alt şerit. Açılış:
opaklık + 4 px yukarıdan kayma + %98 → %100 ölçek (200 ms); kapanış 150 ms. `prefers-reduced-motion` ve "Hareket"
kapalıyken yalnız kısa opaklık.

**Etkileşim:** tıklama/Enter/Space aç-kapa; fare için hover niyeti (120/240 ms); ↓/↑ panelde dolaşma, ←/→ üst öğeler,
Home/End, Esc kapatır ve odağı düğmeye döndürür; Tab panelden çıkınca kapanır (odak tuzağı yok); `aria-expanded` +
`aria-controls`; JS yoksa hover/focus-within ile görünür.

**Mobil (< 1024 px):** tam ekran çekmece (header altından ekran sonuna), arka sayfa kaydırması kilitli, akordeon gruplar
(ikon + başlık + fayda satırı), Çözümler'de kanal rozetleri, altta sabit Giriş yap + Ücretsiz dene.

## 3. Reddedilenler

- **Beşinci üst öğe (ör. "Otopilot" doğrudan üst barda):** 1024 px'te hareket kontrolüyle sığmıyor, CTA'yı eziyor.
  Otopilot, Ürün panelinin öne çıkan kartı ve "Yeni" rozetiyle daha görünür.
- **Tam genişlik (kenardan kenara) panel:** 1440'ta boş alan bırakıyor; içerik 3 grupta az. Kapsayıcı genişliğinde
  kartlı panel seçildi.
- **Paneller arası "morph" (boyut animasyonu):** yalnız transform/opacity kuralını aşar (genişlik/yükseklik animasyonu).
- **Salt hover ile açılma:** klavye/dokunmatik için erişilemez; hover yalnız ek kolaylık.

## 4. S24 ile birleşme

S24 aynı sırada üst barı sadeleştirdi (kullanıcı madde 8: "kalabalık sürüyor"): ortada 3 grup + "Fiyatlar", metin
"Giriş", ayraçsız, simge hareket kontrolü, Ürün panelinde koyu Otopilot kartı. Birleşmede S24'ün **bar kararları aynen
alındı**; panel içeriği S25 modeliyle (her panelde öne çıkan kart + alt şerit) değiştirildi — S24'ün Otopilot kartı
S25'teki `slot: 'feature'` kaydının özel hâli olduğu için ayrı `feature` bayrağına gerek kalmadı.
