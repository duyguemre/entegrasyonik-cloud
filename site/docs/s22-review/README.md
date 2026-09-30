# S22 — Ajan sayfası (Otopilot) + ana sayfa hero girişi

Kaynak: `docs/cloud-contracts/SITE_FEEDBACK_R2_2026-09-30.md` → SR2-AGENT (1–4), SR2-HOME (5), madde 8'in ajan sayfası ve
hero kısmı. Dal: `cloud/site-s22` (taban `origin/main`). Görüntüler bulutta (Linux Chromium) alındı; nihai görsel onay yerelde.

Yeniden üretmek: `npm run build && ./docs/s22-review/restart-server.sh && node docs/s22-review/capture.mjs <önek> [--path=/otopilot] [--home] [--reduced] [--only=1440,390]`

## Ad sabiti (insan kararı bekliyor)

- **Tek satır:** `site/src/data/agent-brand.ts` → `export const AGENT_BRAND = 'Otopilot'`.
- Türeyenler: slug/rota (`/otopilot`, `src/pages/[ajan].astro` getStaticPaths), SEO kaydı (başlık `Otopilot: operasyon ajanları`,
  ekmek kırıntısı), llms.txt / llms-full.txt başlığı, header/footer gezinme etiketi + hedefi (`navigation.ts`), sayfa ve ana sayfa
  kopyası (`assistant.ts` şablonları), erken erişim e-posta konusu, `dist/_redirects`.
- Ad değişirse: önceki slug `AGENT_LEGACY_PATHS`'e eklenir (yayındaki bağlantılar 301 ile korunur). Kopya, ada ek gelmeyecek
  biçimde kuruldu ("Otopilot ajanları", "Otopilot çalışma alanı") → "Kontrol Kulesi" gibi bir adla da Türkçe ek uyumu bozulmaz.
- Koruma (`tests/upcoming.test.ts` "S22 ad sabiti"): ad yalnızca bu dosyada metin olarak geçer (mutasyonla doğrulandı),
  "Asistan"/Copilot vb. ad olamaz, slug addan türer, 301 kuralları.

## Eski adres → 301

`_headers` ile aynı desen: `astro:build:done` → `dist/_redirects` (Cloudflare Pages / Netlify biçimi):
`/asistan /otopilot 301`, `/asistan/ …`, `/asistan.md /otopilot.md 301`. Yerel `scripts/serve-dist.mjs` aynı dosyayı uygular
→ E2E'de gerçek 301 test edilir. Hosting `_redirects` desteklemiyorsa (ör. Render Static) aynı kurallar panelden girilmeli.

## 1. Önce — eleştiri (`once-*.png`)

| Sorun | Kök neden |
|---|---|
| Header ile içerik arasında ~150 px boş bant (madde 1) | `.ai-hero:global(.section)` sayfanın Astro kapsam kimliğini istiyordu, `<section>`'ı ise `Section.astro` kendi kimliğiyle basıyor → sıkı hero boşluğu **hiç uygulanmıyordu** (S18'den beri; `.ai-section` ritmi de). Üstüne ızgara dikeyde ortalıydı, uzun sohbet sahnesi kopyayı aşağı itiyordu. |
| "Asistan" = chatbot kıvamı | Hero, sayfanın ilk ekranı ve anlatı sohbet üzerine; ajanlar 3. bölümde küçük kartlar. |
| Döngü/sınırlar görünmez | Akış 4 hapçık; onay kapısı/salt-okuma/denetim kaydı güven ızgarasında dağınık. |

## 2. Karar — ajan-önce kurgu

Hero (koyu, **ajan konsolu** örnek görünümü) → **Ajan döngüsü** (5 adım zaman çizelgesi, ortada insan onayı kapısı) →
**Ajanlar** (canlı ledli kartlar; "Gözleyecek / Getirecek") → **Sınırlar** (öneri → onay kapısı → uygulama → denetim kaydı akışı
+ 3 sınır kartı, her biri "Temeli bugün kodda: <kanıtlı madde>") → **Güven** (kanıtlı vs planlanan, aynen) → Sohbetle de yönetin
(S18 örnek senaryo sahnesi buraya taşındı) → Yerel uygulama + MCP → SSS → Erken erişim.

Dürüstlük korunur: her planlanan öğe aşama rozetli + gelecek kip; konsol "Örnek görünüm", sohbet "Örnek senaryo" etiketli; rakam
yalnızca sohbet sahnesinde; "sınır" kartlarının kodda olan temeli ayrı ve kanıtlı maddeye bağlı.

### İterasyonlar

| # | Görüntü | Eleştiri → değişiklik |
|---|---|---|
| 1 | `it1-ust-1440.png` | Yeni kurgu ilk hâli. **Boşluk hâlâ var** (yalnızca ortalamayı düzeltmek yetmedi) → ölçüm: section `padding-top` 126 px = varsayılan; kapsam kimliği hatası bulundu. H1 dört satır, "Öneri hazır" noktası koyu zeminde görünmüyor. |
| 2 | `it2-ust-1440.png`, `it2-hero-1440.png` | Global seçici → boşluk giderildi; H1 `display-md`. Ana sayfa girişi hap olarak 3 satıra kırıldı (dağınık). Ajan sayfasında hap + ayrı betimleyici satır + H1 sıkışık. |
| 3 | `it3-*` | Ana sayfa girişi iki satırlı kompakt kart (ad + aşama + bağlantı / değer cümlesi); betimleyici hapın içine alındı. 390'da 5 px yatay taşma bulundu (sohbet sahnesinin ışıması, artık `overflow:hidden` hero'da değil) → bölümde `overflow-x: clip`. |
| 4 | `it4-ust-*` | Mobil onay akışına dikey bağ çizgisi; ana sayfa kartında dar ekranda "Keşfedin" etiketi tek başına alt satıra düşüyordu → yalnız ok; ajan hapında betimleyici dar ekranda gizli. Sohbet sahnesi altyazısı koyu zemin rengindeydi, açık bölümde okunmuyordu → açık zemin token'ları. axe: döngü adım etiketi 4,36:1 → `--site-link-accent`. |

### Sonra

- `sonra-1440.png`, `sonra-390.png` (tam sayfa), `sonra-ust-*.png` (ilk ekran), `sonra-hero-*.png` (ana sayfa hero).
- `sonra-reduced-*.png`: reduced-motion — konsol noktaları dolu, tarama/iz ışığı yok, sohbet sahnesi statik son kare.

## Hareket ve performans

- Yeni döngüler (`scenes-loops.css`, mevcut kapılar): `agent-console` (durum noktası ışıması 6 sn, tarama ışığı 12 sn) ve
  `agent-loop` (yalnız ≥1024 px, iz ışığı 12 sn + sırası gelen düğümde %8 büyüme). Yalnızca opacity/translate/scale; `paused`
  başlar, görünürken çalışır, sekme gizliyken durur; reduced-motion / "Hareket" kapalı / JS'siz: statik. Görsel dosya yok.
- Açık/koyu: sayfa ritmi koyu sahne ↔ açık bölüm; tüm renkler token (ham renk/px/süre yok — tokens.test yeşil).

## Terminoloji (madde 4/8)

Ajan sayfası ve hero kopyasında Entegrasyonik "platform" (ör. "platformun bugünkü sürümünde", "Entegrasyonik platformuna").
Kalan "yazılımıdır" yalnızca footer/markdown'daki `entityDefinition`'da ve ana sayfa güvenlik bölümünde — **S23 kapsamı**
(paralel görev), dokunulmadı.

## Açık notlar

- Ana sayfa ajan bandında (`AssistantTeaser.astro`) aynı kapsam hatası var: `.teaser-section:global(.section)` hiç eşleşmiyor
  (bant tasarlanandan uzun). Ana sayfa düzenini S23 ile çakıştırmamak için bu turda dokunulmadı; tek satırlık düzeltme:
  `:global(.section.teaser-section)`.
- `frontend/src/design/tokens/dist/tokens.static.css` bulut kopyasında yok (git-ignored üretim çıktısı); `npm run tokens` ile
  yerelde üretilip kullanıldı (commit'lenmedi). `scripts/cloud-setup.sh` Playwright indirmesi bulutta 403 → setup yarıda kalıyor.
