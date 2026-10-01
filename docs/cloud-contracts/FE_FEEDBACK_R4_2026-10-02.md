# FE geri bildirimi R4 — 2026-10-02 (K61)

Kaynak: kullanıcı isteği, 2026-10-02 gece. Taban: `faz3-arayuz @ 762eadb1` (yerel görsel cila turu FE-LOCAL-1002 dahil: sol menü, sekme şeridi, EkPageBar, filtre şeridi, tanım ekranları).
Çıta: `premium-ui-standards` + `web-design-guidelines` skill'leri, `frontend/docs/DESIGN_SYSTEM.md`, tanıtım sitesiyle (site/) tutarlı premium dil. Referans uygulama adları hiçbir yerde geçmez.

Kullanıcının sözleri (özet değil, madde madde):

## Şerit A — Kabuk ve pencereler (dal `cloud/fe-r4a`)
- **A1 Üst bar rengi:** üst bar çok koyu oldu; biraz aç. Açık ve koyu temada token üzerinden; kontrast AA.
- **A2 Profil bölümü:** üst bardaki profil kısmındaki koyu bölümü kaldır (koyu blok zaten Otopilot'ta var). Profil alanı arka planla uyumlu, sade, premium olsun.
- **A3 Bildirimler penceresi:** baştan tasarla — siteye uygun, premium. Gruplama (bugün/dün/önceki), okunmamış vurgusu, tür ikonları/renk tonları token'dan, toplu "okundu", boş/yükleme/hata durumları, klavye ve a11y, mobil. Bildirim merkezi sayfası (`NotificationCenterView`) ile aynı dil.
- **A4 Otopilot penceresi:** aynı şekilde baştan, premium. Mevcut işlev ve sözleşmeler (onay kartı, kill-switch, kota, kurulum durumu) korunur.
- **A5 Akıllı arama sonuç context menüsü:** sonuç listelerinin ve satır context menüsünün tasarımını iyileştir (gruplama, ikon kutucukları, eşleşme vurgusu, kısayol ipuçları, seçili satır, boş sonuç).

## Şerit B — Ürün ekleme (dal `cloud/fe-r4b`)
- **B1:** Ürün ekleme/düzenleme bölümünü **temelde yaptığı işi bozmadan** yeniden tasarla. Alanlar, doğrulama, kaydetme akışı, API gövdeleri, sihirbaz adımları DEĞİŞMEZ (önce karakterizasyon/birim testleriyle sabitle).
- **B2:** Varyant **rowspan'lı gösterimi AYNEN korunur** (yalnız görsel cila; yapı değişmez).

## Şerit C — Ayarlar ve dashboard (dal `cloud/fe-r4c`)
- **C1 Uygulama ayarları sayfası:** baştan yeniden tasarla (mağaza, fatura, lojistik, iletişim vb.). Bölüm gezinmesi, kaydet/vazgeç durumları, kirli form uyarısı, doğrulama mesajları; mevcut API ve alanlar korunur.
- **C2 Dashboard "Bugün sırada":** bölümü yeniden tasarla (öncelik, sayı, eylem, boş durum).
- **C3 Dashboard alt kartlar:** kartlar yan yana gelmiyor, bazılarında geniş boşluk kalıyor → ızgarayı düzenle (eşit yükseklik/akış, boş alan kalmasın; 1440/1280/1024/768/390 genişliklerde kontrol).

## Şerit D — Bekleyen önyüz borçları (dal `cloud/fe-r4d`, kullanıcının saydıkları dışında kalanlar)
- **D1** Gerçek gerileme: `prc-r2-pricing-rules` mobil/tablet axe (renk kontrastı geçiş anı ~#7891e1; tablette kaydırılabilir bölge odaklanamıyor).
- **D2** Gerçek gerileme: `list-standard` tablette sayfalama yapışmıyor (~183px kayma).
- **D3** Tabanda da kırmızı işlevsel e2e'ler: legacy-definition, mcp-connections/consent axe, privacy-data (C1.6), product-variant-list axe, ds-overlays — düzelt ya da gerekçeyle belgele.
- **D4** `pattern-baseline` betiği EkPageBar'ı sayfa başlığı olarak tanısın (CategoryDefinitionView `pageHeaderMissing` elle 1'e çekilmişti → betik düzeltilince taban yeniden üretilir).
- **D5** `definitions/*DefinitionView` satır eylemleri işlevsiz (7 ekran) → bağla. **ProductDefinitionView hariç** (Şerit B'ye ait).

## Ortak kurallar
- Dosya sahipliği şeritler arasında ayrıktır; paylaşılan `@entegrasyonik/ui` / token dosyalarına yalnız EKLEME (değiştirme gerekirse raporla).
- Her şerit: önce/sonra ekran görüntüleri `frontend/docs/fe-r4-review/<şerit>/` (1440 açık+koyu, 390), rapor `frontend/docs/fe-r4-review/<şerit>/REPORT.md` (bitiş işareti).
