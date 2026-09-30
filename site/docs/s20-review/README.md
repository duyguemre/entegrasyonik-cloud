# S20 gözden geçirme — Rehber (bilgi merkezi)

Yerelde gözle onay için tam sayfa ekran görüntüleri (Linux Chromium, `SITE_DRAFT=true` derlemesi, `serve-dist` ile
CSP uygulanmış). Görsel tabanlar (`*-win32.png`) bunlar DEĞİLDİR.

| Sayfa | Masaüstü | Mobil |
|---|---|---|
| Hub `/rehber` (konu kümeleri, öne çıkanlar, resmi pazar verisi, sözlük bandı, SSS) | rehber-hub-1440.png | rehber-hub-390.png |
| Örnek: `/rehber/e-fatura/eticarette-e-fatura-zorunlulugu` (mevzuat, değişebilir bilgi) | rehber-e-fatura-zorunlulugu-1440.png | rehber-e-fatura-zorunlulugu-390.png |
| Örnek: `/rehber/pazaryerleri/trendyol-satici-olma` (HowTo adımları) | rehber-trendyol-satici-olma-1440.png | rehber-trendyol-satici-olma-390.png |
| Sözlük `/rehber/sozluk` (48 terim, DefinedTermSet) | rehber-sozluk-1440.png | rehber-sozluk-390.png |

## Yapı

- İçerik: `src/data/kb/**` (KB `docs/research/ECOMMERCE_MARKET_KB_2026-09-30.md`, origin/main). Kaynak defteri
  `sources.ts` (yalnız gösterilebilir kaynaklar), rakam içerebilen tek yer `facts.ts` (her belirteç resmi kaynağa ya da
  tutarlı iki ikincil kaynağa bağlı), sayfalar `guides/*.ts`, sözlük `glossary.ts`, hub metni `hub.ts`.
- Sayfa iskeleti: `src/components/rehber/GuideArticle.astro` (BaseLayout + PageMeta `jsonLd` prop'u; layout'a dokunulmadı).
- JSON-LD: Article (tarihler + `citation`), FAQPage, BreadcrumbList, HowTo (görünür adımlar), hub CollectionPage,
  sözlük DefinedTermSet/DefinedTerm — `src/lib/kb-jsonld.ts` (S19'un `src/lib/seo.ts` dosyası değişmedi).
- Testler: `tests/rehber.test.ts` (29 test). `tests/claims.test.ts`: `dist/rehber/**` yalnızca AD taramasından muaf
  (yasal sayfalarla aynı gerekçe); mutlak iddia taraması sürer, ürün bağlamı rehber testinde aynı listelerle taranır.

## Birleştirme notları (S18/S19)

- **S19 SEO kaydı:** S19 her derlenen sayfanın `src/data/seo.ts` kaydında olmasını zorunlu kılıyor. Birleştirmede
  23 rehber sayfası + hub + sözlük için kayıt girdisi gerekir; başlık (≤ 60) ve açıklama (70–155, benzersiz) sınırları
  rehber verisinde zaten uygulanıyor (`seoTitle`, `description`). S19 `SchemaNode` türüne `Article`,
  `CollectionPage` (var), `DefinedTermSet` eklenmeli. llms.txt'ye rehber listesi eklenmesi önerilir (bu dalda
  llms/sitemap/robots dosyalarına dokunulmadı; sitemap entegrasyonu yeni sayfaları kendiliğinden alır).
- **Header:** "Rehber" sekizinci birincil bağlantı. 1280–1440 arasında taşmasın diye `Header.astro` sonuna tek bir
  medya kuralı eklendi (bağlantı iç boşluğu bir kademe dar). S18 "Asistan"ı da eklediğinde dokuz bağlantı olur;
  birleştirmede 1280 genişlikte taşma yeniden kontrol edilmeli.

## İnsan kontrolü bekleyenler

- KB §0: mevzuat maddeleri resmi metinden (mevzuat.gov.tr, GİB PDF) okunamadı; mevzuat sayfaları yayın öncesi
  hukuk/mali müşavir gözden geçirmesi ister (sayfalarda "hukuki veya mali tavsiye değildir" notu var).
- e-Fatura eşikleri (3 milyon TL / 500 bin TL / 1 Temmuz) iki bağımsız ikincil kaynağa dayanıyor; bu kaynaklar rakip
  adı taşıdığı için sitede gösterilmiyor, sayfa okuru GİB'deki tebliğ metnine yönlendiriyor ve bunu açıkça yazıyor.
