# USER_DECISIONS.md'ye eklenecek satırlar (bulutta docs/adr salt-okunur; yerelde kopyalanır)

Tablo: "Operasyon, güvenlik ve bağımlılıklar" ya da yeni bölüm "Eşleme, fiyat ve entegrasyon uyumluluğu (2026-10-03)".

| No | Tarih | İstek (özet) | Karar | Bağlayıcı belge | Durum |
|---|---|---|---|---|---|
| K75 | 2026-10-03 | Kategori/marka/özellik eşleme, entegrasyon mapping'leri, fiyat yönetimi, sipariş/iade/fatura/finans/mesaj uyumluluğu ve çekim süreleri baştan sona; kullanıcı "bu neden böyle" görsün; canlıya yazma yok | Plan onaylandı: yapılandırılmış hata sözleşmesi (`IntegrationIssue`) + gönderim öncesi ön kontrol; eşleme tek kaynağı `AttributeMappings` (FE eski `Categories.platforms` okumaları kalkar); platform katalog önbelleği + bayatlık taraması; marka modeli kanal yeteneğine göre (TY/PZ/IS eşleme, HB ad, N11 özellik); yazma uçları yalnız mock + sandbox | docs/eslesme-fiyat/PLAN.md (§2a) | UYGULANIYOR |
| K76 | 2026-10-03 | Fiyat: kanal bazlı kural (komisyon/marj/yuvarlama/KDV), senkron yönü, çakışma | `PriceRules.type:'channel'` şimdi; yalnız bu tip insan onaysız uygulanabilir (kill-switch + günlük sınır + geçmiş); yön yerel → kanal otomatik (`pricePending`), kanal → yerel asla (fark uyarısı); tüm fiyat yazımları `PriceHistory`'ye | PLAN §3.4 | UYGULANIYOR |
| K77 | 2026-10-03 | Çekim süreleri ve ölçek (100/1.000/10.000 müşteri) | Sipariş 5 dk (webhook'lu kanalda 10 dk mutabakat), iade 15 dk, mesaj 10 dk, finans 6 sa, fiyat 60 sn bayrak, platform listeleri haftalık; entegrasyon başına kuyruk + jobId tekilleştirme + lease'li üretici + Redis paylaşımlı platform-geneli limiter (hepsi şimdi); HB ve Ideasoft webhook alıcıları (abonelik kaydı kullanıcıda); backoffice'ten plan bazlı ayar | PLAN §3.5–3.6 | UYGULANIYOR |
| K78 | 2026-10-03 | Trendyol kargo: her sipariş "pazaryeri lojistiği" sayılıyordu | Tenant ayarı `trendyol.shippingModel` = marketplace (varsayılan, dürüst "yapılmadı") / seller (Picking + takip no); satıcı modeli canlıda kullanıcı testi | PLAN K-D | UYGULANIYOR |
| K79 | 2026-10-03 | Ideasoft canlı doğrulama | Bu işte kapsam dışı: kod düzeltmeleri yazılır ve mock'la test edilir; token yenileme/canlı okuma yapılmaz (üretim bağlantısı riski) | PLAN K-H | GEÇERLİ |
| K80 | 2026-10-03 | Hepsiburada sandbox | Kullanıcı HB desteğinden SIT test merchant talep edecek; yazma testleri yerelde SIT'te | PLAN K-I | GEÇERLİ (insan görevi) |
