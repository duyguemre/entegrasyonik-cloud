# S19: SEO + LLM görünürlüğü (GEO/AEO): yapı ve onay bekleyenler

## Tek kaynak: `src/data/seo.ts`

Her derlenen sayfa bu kayıtta yer alır: yol, başlık, açıklama, `index` kararı, ekmek kırıntısı, schema.org türleri,
OG etiketi ve llms özeti. Kayıtta olmayan bir sayfa derlemede hata verir. `tests/seo.test.ts` de derlenen her HTML'in
kayıtlı olduğunu denetler.

| Çıktı | Üreten | Kural |
|---|---|---|
| `<title>`, description, robots, canonical, hreflang, OG/Twitter | `layouts/BaseLayout.astro` | başlık ≤ 60 (`Sayfa · Entegrasyonik`), açıklama 70–155, benzersiz; canonical mutlak ve sondaki `/` ile |
| JSON-LD | `lib/seo.ts` → `jsonLdFor(entry)` | WebPage/CollectionPage/ContactPage/FAQPage, BreadcrumbList (iç sayfalar), ana sayfada Organization + WebSite + SoftwareApplication, entegrasyon sayfalarında HowTo. Product/Review/Rating YOK |
| OG görseli (1200×630 PNG) | `pages/og/[slug].png.ts` + `lib/brand-images.ts` | token renkleri, başlık + bölüm etiketi, logo/rakip adı yok |
| Simgeler + manifest | `pages/[icon].png.ts`, `pages/site.webmanifest.ts` | favicon ile aynı geometri |
| sitemap | `astro.config.mjs` (@astrojs/sitemap) | yalnızca `index: true`; lastmod = kaynak dosyaların son git commit tarihi; priority/changefreq yok |
| robots.txt | `lib/robots.ts` | AI tarayıcılarına izin (kararın gerekçesi dosyada yorum olarak yazılı); önizleme yolu Disallow; taslakta tümü kapalı |
| llms.txt / llms-full.txt | `pages/llms*.txt.ts` | indekslenen her sayfa, canonical URL, kısa açıklama ve markdown bağlantısıyla yer alır; geliştirme aşamasındaki sayfalar notla geçer |
| `/sayfa.md` (ana sayfa `/index.md`) | `astro.config.mjs` → `lib/html-to-markdown.mjs` | derlenmiş `<main>`'den üretilir, yeni metin eklenmez; `_headers` → `text/markdown` + `X-Robots-Tag: noindex` |
| "Entegrasyonik nedir?" | `entityDefinition()` | footer, llms*, markdown ve Organization/SoftwareApplication açıklamasında aynı metin; kanal adları yalnızca `available` kayıtlardan gelir |

Yeni sayfa eklerken `seo.ts`'e bir girdi ekleyin. Girdi eksikse derleme ve test kırılır.

## İnsan kararı / onayı bekleyenler

- **OG görselleri:** bu klasördeki `og-*.png` dosyaları (yayın derlemesi, alan adı entegrasyonik.com). Yazı tipi derleme
  makinesindeki sistem yazı tipidir (Inter yoksa sans-serif'e düşer). Görseller yerelde (Windows) gözle onaylanmalı.
- **Footer'a eklenen "Entegrasyonik nedir?" bandı:** her sayfanın alt bilgisinde görünür, bu yüzden tam sayfa görsel
  tabanları (`*-win32.png`) yerelde yenilenmeli.
- **Search Console / Bing Webmaster doğrulaması:** doğrulama meta etiketi ya da DNS kaydı eklenmedi. Alan adı sahibinin
  hesabı gerekir. Yayından sonra sitemap-index.xml bu panellere gönderilmeli.
- **AI tarayıcı kararı:** varsayılan olarak izin verildi (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot,
  Claude-User, Google-Extended, PerplexityBot, Perplexity-User, CCBot, Applebot-Extended). Geri almak `lib/robots.ts`'te tek satırlık bir değişikliktir.
- **SoftwareApplication fiyatı:** plan seed'i "ÖNERİ" durumunda olduğu için `offers` yazılmadı. Fiyatlar nihai olunca
  kendiliğinden yazılır.
- **Şirket bilgileri:** `COMPANY_SAMPLE_VALUES=true` olduğu sürece adres, telefon, unvan ve MERSİS JSON-LD'ye yazılmaz.
- **Yasal sayfalar:** `LEGAL_REVIEWED=false` olduğu sürece noindex kalır, sitemap ve markdown'a girmez. Onaydan sonra
  kendiliğinden indekslenir.
