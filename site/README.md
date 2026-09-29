# Entegrasyonik tanıtım sitesi (`site/`)

ADR-0014 uyarınca Astro (statik çıktı) + `frontend/.../tokens.static.css` (kopyasız import) + `--site-*` katmanı + Inter (self-host). Kendi `package.json`'ı vardır (workspace değil). **Production deploy YOK (Protokol 12); site `SITE_DRAFT=true` ile noindex + TASLAK bandıyla çalışır.**

```bash
cd site
npm install
npm run dev            # http://localhost:4321
npm run build          # -> dist/ (+ dist/_headers: sıkı CSP)
npm run preview        # astro preview (başlıkları UYGULAMAZ)
node scripts/serve-dist.mjs --dir dist --port 4381   # _headers + brotli uygulayan yerel sunucu
npm test               # vitest: token/hareket/hardcode kuralları, CSP başlıkları, dist (iki gerçek build) testleri
E2E_PORT=4381 npm run test:e2e   # Playwright: 3 viewport (375/800/1280) smoke + ekran görüntüsü + axe
npm run lighthouse     # yerel Lighthouse (mobil): taslak build + SITE_DRAFT=false build (SEO); Chrome gerekir
```

Ortam değişkenleri (`.env.example`; site `.env` okumaz, kabuktan verin): `SITE_DRAFT` (varsayılan `true`), `PUBLIC_APP_URL` (varsayılan `http://localhost:3000`), `PUBLIC_SITE_URL` (yalnız `SITE_DRAFT=false`), `SITE_PREVIEW_ROUTES` (yalnız yerel/E2E: `/bilesen-onizleme`), `SITE_OUT_DIR`.
Astro telemetrisini kapatmak için `ASTRO_TELEMETRY_DISABLED=1` (betikler otomatik ayarlar).

Kurallar özeti: `--ek-*` yeniden tanımlanmaz; ham renk/px/süre yok (`tests/tokens.test.ts`); sıcak dosyalar (`package.json`, `src/layouts/*`, `src/styles/site-tokens.css`) yalnızca orkestratör birleştirmesiyle değişir; gezinme öğeleri `src/data/navigation.ts`'te `published` bayrağıyla açılır.

## İddia kaydı ve veri katmanı (ADR-0014 S1)

Sitedeki her olgusal iddia markup'a değil `src/data/*.ts` kaydına yazılır ve `evidence` (repo içi dosya + doğrulanabilir `contains` metni) taşır: `integrations.ts` (6 gerçek entegrasyon + gizli roadmap), `capabilities.ts` (yetenek + güvenlik iddiaları), `faq.ts`, `plans.ts`, ortak türler `evidence.ts`. **Sayfalar ham kayıtları değil `getPublic*` seçicilerini kullanır** (`getPublicIntegrations`, `getPublicCapabilities`, `getPublicFaq`, `getPublicPlans`, `getPublicTrial`, `getPlanSourceNotice`): seçiciler `evidence`/`internalNotes` alanlarını atar ve roadmap öğelerini (`ROADMAP_VISIBLE=false`, ADR Açık Soru 5) vermez. Sayfa/bileşen kaynağına yol haritası adı (Amazon, e-fatura, kargo firmaları...) veya mutlak/sayısal iddia sabit yazılamaz — `tests/claims.test.ts` yakalar (`dist/` varsa derleme çıktısını da tarar: önce `npm run build`).

**Plan/fiyat kaynağı (S4b: seed'e bağlandı):** `plans.ts` fiyat/limit/KDV/deneme değerlerini `backend/src/database/application/seed/plans.seed.json`'dan DERLEME ZAMANINDA okur (kök-göreli import; backend çalıştırılmaz, dosya repo içinde). Seed `_meta.status` "ÖNERİ" ile başladıkça sayfalar taslak notu gösterir (`getPlanSourceNotice()`); seed'de olmayan değer (yıllık fiyat, KDV dahil tutar) gösterilmez/uydurulmaz. `trialOffer.implemented=true` (register -> `trialing`, S4a). `/fiyatlandirma` verisi `src/data/pricing.ts` (karşılaştırma + kanıtlı SSS). Belirli sayfa için Lighthouse: `MSYS_NO_PATHCONV=1 npm run lighthouse -- --path /fiyatlandirma` (Git Bash'te yol dönüşümünü kapatın).
