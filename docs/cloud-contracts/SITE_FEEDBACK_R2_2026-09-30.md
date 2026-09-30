# Site review — 2. tur geri bildirim (kullanıcı, 2026-09-30)

Çıta: premium; agentic/AI ruhu; site genelinde tutarlı.

## SR2-AGENT — "Asistan" → agentic ürün kimliği
1. `/asistan` sayfasında üst bölümde bir boşluk kalıyor (header ile içerik arası) → düzelt.
2. "Asistan" adı chatbot kıvamında kalıyor → kullanılmayacak. Agentic mantığı (işi kendisi yapan, gözleyen, öneren, onayla uygulayan ajanlar) net anlatan ORİJİNAL bir ad.
   - Ad tek bir sabitten gelir (site kopyası + rota + SEO kaydı + llms.txt); değiştirmek tek yerden olur.
   - Rota: yeni ad slug'ı; eski `/asistan` → 301 yönlendirme.
   - Aday adlar (orkestratör önerisi, kullanıcı seçene kadar varsayılan = 1):
     1. **Otopilot** — "Entegrasyonik Otopilot: operasyon ajanları" (otonom yürütme + insan onayı metaforu)
     2. **Operasyon Ajanları** — betimleyici, en net
     3. **Kontrol Kulesi** — izleme/yönlendirme metaforu (operasyon merkezi animasyonuyla uyumlu)
   - Rakip/üçüncü taraf marka adları (Copilot vb.) kullanılmaz.
3. Sayfa premium seviyeye taşınmalı (çok fazla çalışma gerekiyor): tasarım, hiyerarşi, içerik anlatımı. Ajanların ne yaptığı (gözle → öner → onayla → uygula → raporla), sınırlar/güvenlik (onay kapıları, salt-okuma, denetim kaydı) görsel ve anlaşılır.
4. Alt bölümlerdeki bilgiler daha estetik, "robotik/AI ruhuna" uygun görsel dil (ör. ajan kartları, akış/zaman çizelgesi, canlı durum göstergeleri; abartısız, performanslı, reduced-motion uyumlu).

## SR2-HOME — Anasayfa
5. Agentic yön anasayfanın İLK bölümünde (hero) uygun şekilde vurgulanmalı (ad + tek cümle değer + sayfaya giriş).

## SR2-NAV — Üst bar
6. Üst bardaki link sayısı çok arttı, kalabalık → çözüm: gruplanmış menü (ör. Ürün / Çözümler / Kaynaklar(rehber, blog, SSS) / Fiyatlar) + açılır panel (mega-menu) masaüstünde, mobilde düzenli çekmece; birincil CTA ayrı. Klavye/a11y ve mevcut e2e/SEO testleri korunur.

## SR2-ENTITY — Varlık tanımı ve footer
7. Footer'daki "Entegrasyonik nedir" metni (`site/src/data/seo.ts` `entityDefinition`) dar sütunda kalıyor → ekranın kalan genişliğine yayılsın (footer düzeni: tanım metni geniş alan, link sütunları yanında/altında; mobil düzgün).
8. Terminoloji: Entegrasyonik bir **yazılım değil, platformdur.** Kendini tanımladığı her yerde (entityDefinition, Organization/SoftwareApplication açıklaması, llms.txt/llms-full, hero/alt başlıklar, SSS, asistan/ajan sayfası, meta description) "platform" kullanılır. İstisna: kategori/arama terimi olarak genel ifade ("pazaryeri entegrasyon yazılımı nasıl seçilir" gibi rehber başlıkları, SEO anahtar kelimesi) kalabilir — ama Entegrasyonik'in kendisi için değil. Testlerdeki beklenen metinler buna göre güncellenir.
