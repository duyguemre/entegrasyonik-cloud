# S20b — rehber sayfaları S19 SEO kaydına bağlandı (bulut, 2026-09-30)

Dal: `cloud/site-s20b` = `cloud/site-s19` + `site-s21` (hero) + `site-c1s` (kanal renkleri) + `site-s20` (rehber).

## Kaydedilen sayfalar (`src/data/seo.ts` → `rehberEntries()`, section `rehber`)
- `/rehber` (hub): sayfa düğümü CollectionPage + `mainEntity` ItemList (22 rehber + sözlük), FAQPage (hub SSS)
- `/rehber/sozluk`: WebPage + DefinedTermSet (48 DefinedTerm, `inDefinedTermSet`)
- 22 rehber sayfası: WebPage + Article (tarih + citation) + FAQPage (görünür SSS) (+ HowTo yalnızca `howTo: true`)
- Hepsinde BreadcrumbList SEO kaydındaki kırıntı zincirinden (görünür kırıntı `crumbsFor()` ile aynı)
- Başlık/açıklama `src/data/kb/**` kayıtlarından (≤60 / 70–155, S20 içerik kuralları aynen); `index: true`

## Değişiklikler
- PageMeta kullanımları kaldırıldı; sayfa-içi JSON-LD `src/lib/kb-jsonld.ts` → `jsonLdFor()` (BaseLayout basar)
- llms.txt `## Rehber` bölümü; llms-full.txt rehber kısa yanıtları + kaynak yayıncıları; her sayfanın `.md` sürümü üretilir
- Çakışmalar: Header (S18 geniş çubuk + S20 dar bağlantı boşluğu), claims.test (S18 UPCOMING istisnası + S20 /rehber istisnası) iki taraf korunarak
- Header: dokuz bağlantıyla 1280'de ~33 px, ≥1440'ta 12 px taşma ölçüldü → bağlantı iç boşluğu daraltıldı (yerelde görsel onay)
- Testler: llms.test dar `## Rehber` ad/kalıp istisnası (mutlak iddia taraması sürer; tarama dizileri artık tembel okunuyor),
  seo.test FAQPage kuralı rehberi kapsar, `<title>` kontrolü `&#39;` kaçışını tanır

## Test
`npm run build` yeşil; `npm test` 786/788 — kalan 2 hata (claims (2)/(3) evidence) buluttaki kopyada depo kökü
`INTEGRATIONS_REGISTRY.md` olmadığı için; `origin/cloud/site-s19` üzerinde de aynı şekilde kırmızı (ortam kaynaklı).

Görüntüler Linux Chromium'da (bulut); görsel onay yerelde.
