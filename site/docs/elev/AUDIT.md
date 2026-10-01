# Site denetimi — pazarlama/marka direktörü gözüyle (ELEV, 2026-10-01)

Taban: `cloud/site-s26` (S24 + S25 menü + S26 animasyon/anahtar). Dal: `cloud/site-elev`.
Yöntem: tüm ana sayfalar 1440 ve 390 px'te tam sayfa çekildi (reduced-motion, son kare) ve bölüm bölüm okundu:
`/`, `/otopilot`, `/ozellikler`, `/ozellikler/stok-rezervasyonu`, `/entegrasyonlar` (+ `/entegrasyonlar/trendyol`),
`/fiyatlandirma`, `/guvenlik`, `/sss`, `/rehber`, `/destek`, `/iletisim`. Önce görüntüleri: `review/once/`.

Bağlayıcı çerçeve: USER_DECISIONS K13 (kanal renkleri), K16 (platform), K39 (Otopilot), K43 (hazır, kendinden emin reklam
dili; vaatler `agent-claims.ts`), K44 (nasıl yaptığımız/teknik terim yok), K45 ("siz/işletmeniz"; üst seviye güven
mesajı), K46 (Otopilot her pakette dahil; kredi/token dili yok), K48 (site: serbest özerklik).

## Genel hüküm

Site teknik olarak sağlam (erişilebilir, hızlı, kanıta bağlı iddialar) ve görsel olarak "premium SaaS" çıtasına yakın.
Ama **bir marka gibi değil, bir özellik kataloğu gibi konuşuyor**. Üç kök sorun:

1. **Tek fikrin yedi kez tekrarı.** "Tek merkez / tek panel / tek stok" hero'da, sorun–çözümde, yeteneklerde, ekosistemde,
   nasıl çalışırda ve kapanışta neredeyse aynı cümleyle geçiyor. Ziyaretçi üçüncü bölümde yeni bir şey öğrenmeyi bırakıyor;
   mesaj hiyerarşisi (vaat → kanıt → fark → güven → eylem) yok, aynı vaat farklı kartlarda yineleniyor.
2. **Mühendis sesi sızıyor.** "Overselling", "omnichannel", "SKU", "AES-256-GCM", `enc:v1:`, "dayanıklılık katmanı",
   "ortak entegrasyon mimarisi", "varsayılan red", "HTTP-only çerez", "sandbox" — anasayfa ve fiyat kartlarında. K44 ile
   çelişiyor; karar vericiye (işletme sahibi / e-ticaret müdürü) güven değil yük veriyor.
3. **Görsel dil tutarlı ama aşırı kullanılıyor.** Her H2'de iki renkli "vurgulu kelime", her bölümde kart ızgarası, her
   kartta ikon kutusu: vurgu vurgu olmaktan çıkmış. Anasayfa 1440'ta ~17.600 px; on bir bölümün üçü yetenek listesi.

## Bulgular (öncelik sırasıyla)

Etiketler: **P0** güveni/dönüşümü doğrudan zedeler · **P1** marka algısını belirgin düşürür · **P2** cila.
Durum: ✅ bu turda uygulandı · ⏭ `NEXT_TASKS.md` · 🔒 kullanıcı/yayın kapısı.

| # | Öncelik | Bulgu | Neden önemli | Öneri | Durum |
|---|---|---|---|---|---|
| A1 | P0 | Footer ve iletişimde **örnek** adres/telefon/MERSİS (`COMPANY_SAMPLE_VALUES=true`) | Gerçek sanılan sahte künye, yayında en hızlı güven kaybıdır (ve yasal risk) | Kullanıcı kararıyla örnek; yayın kapısına bağlı kalmalı. Bu turda değiştirilmedi | 🔒 yayın kapısı (company.ts bayrağı) |
| A2 | P0 | Anasayfada teknik jargon: "Overselling", "omnichannel", `enc:v1:` saklama görseli, "AES-256-GCM" rozetleri, "Güvenlik mimarisini inceleyin", "Ortak entegrasyon standardı… mimarisiyle", "Varsayılan red" | K44 ihlali; hedef kitle terimleri tanımıyor, rakip/saldırgan için de gereksiz ipucu | Fayda dili: "aşırı satış", "çok kanallı", "şifreli saklama"; teknik ayrıntı yalnız `/guvenlik` "Ayrıntı" panellerinde. Kalıcı test | ✅ (E1) |
| A3 | P0 | Kapanış bölümünün ikincil CTA'sı **"Giriş yap"** | Sayfanın en güçlü dönüşüm anında mevcut kullanıcıya hitap ediyor; demo talebi (K43) yok | İkincil = "Demo talep edin"; giriş üst barda ve footer'da zaten var | ✅ (E2) |
| A4 | P1 | Hero'da iki rozet üst üste (Otopilot duyurusu + "Çok kanallı satış yönetimi") ve uzun gövde paragrafı | İlk 5 sn'de dikkat bölünüyor; 390'da başlık ekranın ortasına itiliyor | Tek duyuru rozeti; gövde tek, kısa vaat cümlesi | ✅ (E3) |
| A5 | P1 | Hero altı 8 özellik hapı iki satıra kırılıyor, son hap ("ERP kataloğu") ortada yetim; 390'da hero ~1.700 px | "Sonradan eklenmiş" görüntü (SR3-7 kalıntısı); mobilde içeriğe ulaşmak uzun | Masaüstünde tek satır; mobilde haplar gizli (bilgi aşağıda tekrar ediliyor) | ✅ (E3) |
| A6 | P1 | Mesaj tekrarı: "tek merkez/tek panel" 7 bölümde başlık | Hikâye ilerlemiyor; her bölüm aynı vaadi tekrar ediyor | Dört mesaj sütunu (BRAND.md): **Kontrol · Doğruluk · Zaman · Güven**; her bölüm başlığı tek sütuna hizmet eder | ✅ kısmen (E4: anasayfa başlıkları) |
| A7 | P1 | Her H2'de iki renkli vurgu kelime | Vurgu değersizleşmiş; "şablon site" hissi | Renkli vurgu yalnız hero + kapanışta; bölüm başlıkları tek renk, güçlü fiil | ✅ (E4) |
| A8 | P1 | İç sayfa hero'ları sayfa adını H1 yapıyor ("Özellikler", "Güvenlik", "Entegrasyonlar") | Pazarlama H1'i vaat taşır; sayfa adı üst etiket olmalı. SEO'da da H1 değer cümlesi daha güçlü | H1 = değer cümlesi, sayfa adı eyebrow; title/breadcrumb sayfa adı kalır | ⏭ N1 |
| A9 | P1 | `/ozellikler` hero istatistik kartı "5 — kısmi, kanala göre değişen" diyor | İlk ekranda zayıflık vurgusu; şeffaflık doğru yerde değil | Hero'da yalnız güç sayıları (özellik, kanal); kapsam şeffaflığı kart/matriste kalır | ⏭ N2 |
| A10 | P1 | Anasayfa uzunluğu (11 bölüm); yetenekler üç katmanda (koyu özet bandı + bento + "Günlük işleriniz için" 6 kart) + güvenlik 4 kart | Karar vericinin taradığı sayfada aynı bilgi üç kez; dönüşüm noktası (fiyat) çok aşağıda | Yetenekleri tek katmana indir (bento kalır; özet bandı ve "Günlük işler" birleşir); güvenliği kısa banda indir | ⏭ N3 |
| A11 | P1 | Fiyat kartlarında "SKU", "omnichannel", "overselling" | Fiyat sayfası en çok karar vericinin okuduğu yer | "ürün çeşidi", "çok kanallı", "aşırı satış" | ✅ (E1) |
| A12 | P1 | "TASLAK FİYATLAR — ÖNERİ — insan kararı bekliyor (ADR-0014 Açık Soru 1)" notu ziyaretçiye iç süreç adı söylüyor | Taslakta doğru bir emniyet; ama "ADR" ifadesi ziyaretçiye anlamsız | Not taslak derlemesinde kalsın ama ziyaretçi dili: "Fiyatlar yayın öncesi kesinleşecektir" (karar kaydı korunur) | ⏭ N4 (iddia testine dokunur, ayrı iş) |
| A13 | P1 | Göz alıcı "kanıt" yok: sahte müşteri/rakam yasak ama yerine kanıtlanabilir güven unsurları da yok | Sosyal kanıt boşluğu dönüşümü düşürür | Kanıtlanabilir güven unsurları: "6 kanal canlı", "14 gün ücretsiz, kart yok", "verileriniz yalnızca size ait", "Türkiye'de geliştirilir/destek Türkçe" (doğrulanırsa), kurulum adım sayısı, "her Otopilot eylemi onayınızla" | ⏭ N5 |
| A14 | P2 | Eyebrow biçimi sayfalar arası farklı: anasayfa "— ÇİZGİLİ TEAL", Otopilot çizgisiz teal, iç sayfa hero beyaz | Küçük ama marka sesi tutarlılığı | Tek `Eyebrow` biçimi (token: `--site-eyebrow-*`) | ⏭ N6 |
| A15 | P2 | Güvenlik bölümü (anasayfa) koyu sahne + SSS + koyu kapanış + koyu footer: son 3 ekran ağırlıklı koyu | Sayfa sonu kasvetli, kapanış CTA'sı zeminle yarışmıyor | Güvenlik özetini açık zemine, kapanışı tek koyu "sahne" yap | ⏭ N3 ile |
| A16 | P2 | Footer marka cümlesi "Pazaryeri entegrasyon ve stok yönetimi: tek stok, tek panel." kategori tanımı gibi | Footer son marka temasıdır; slogan olmalı | Marka sloganı (BRAND.md) | ✅ (E5) |
| A17 | P2 | Otopilot sayfası: "Demo talep edin" + "Hemen başlayın" + "Adresi kopyala" aynı kartta üç eylem | Eylem seçimi bulanık | Tek birincil (Demo talep edin) + metin bağlantısı | ⏭ N7 |
| A18 | P2 | Mobilde (390) hero ürün paneli + 4 sekme + 4 kart + 8 hap: ilk içerik bölümüne 2,2 ekran | Mobil ziyaretçi kaydırma yorgunluğu | Mobilde panel sadeleşir (sekmeler gizli), hap bulutu kalkar | ✅ kısmen (E3: haplar) / ⏭ N8 |
| A19 | P2 | Hareket dili: çok sayıda eşzamanlı döngü (hero, sorun–çözüm, bento parçaları, ekosistem) | "Her şey kıpırdıyor" hissi; premium = sükûnet | Görünür ekranda en fazla bir döngü; diğerleri tek seferlik giriş | ⏭ N9 |
| A20 | P2 | Otopilot görseli "Ajanlar · onay modunda" gibi iç durum dili; kartlarda "İZLER / GETİRİR" iyi | — | Korunur; yalnız durum hapları fiil diline ("Gözlüyor", "Öneri hazır") — zaten öyle | — |

## Güçlü yanlar (korunacak)

- İddia kaydı + kanıt mimarisi (`capabilities.ts`, `agent-claims.ts`): reklam dilini güvenle sertleştirmeye izin veren
  sağlam zemin. Hiçbir sahte rakam/müşteri yok.
- Otopilot sayfası (S24): sade hero, açık döngü (Gözle → Öner → Onayla → Uygula → Raporla), "Hız ajanlardan, karar
  sizden" — sitenin en iyi marka cümlesi; bu ses tüm siteye yayılmalı.
- Sıfır aşırı satış hikâyesi (S26): somut, anlamlı animasyon — "göster, anlatma" ilkesinin en iyi örneği.
- Kanal rozetleri (K13) ve renk/token disiplini; a11y ve reduced-motion altyapısı.
