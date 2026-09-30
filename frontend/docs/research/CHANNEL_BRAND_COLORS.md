# Kanal Marka Renkleri — Birincil Kaynak Araştırması

- **Tarih:** 2026-09-30 (bulut oturumu, zamanlanmış görev)
- **Kapsam:** Araştırma; kod değişikliği yok.
- **Sonuç özeti:** Birincil kaynaktan **hiçbir platformun rengi doğrulanamadı.** Bulut ortamının ağ
  politikası 17 platform alanının tamamını engelledi. Yalnızca Shopify ve WooCommerce için,
  üçüncü taraf bir veri kümesinden (resmi marka sayfasını kaynak gösteren) **DÜŞÜK** güvenli değerler alındı.

## 1. Yöntem ve erişim sonucu

| Adım | Sonuç |
|---|---|
| `curl -sSL -m 20` (tarayıcı UA, `Accept-Language: tr-TR`), platform başına 1 istek, 17 ana sayfa | **17/17 başarısız**: `curl: (56) CONNECT tunnel failed, response 403`. Bu yanıt ortamın çıkış proxy'sinden geliyor, sitelerden değil. |
| `WebFetch https://www.trendyol.com/` (farklı çıkış yolu) | `EGRESS_BLOCKED`: "blocked by the network egress proxy" |
| Web araması (Trendyol / Hepsiburada / n11 "logo hex") | Yalnızca logo toplayıcı siteler çıktı. Trendyol için `#333333` iddiası vardı (logotyp.us). Bu değer turuncu wordmark ile çelişiyor ve **reddedildi**. Hepsiburada ve n11 için sonuç çıkmadı. |
| npm `simple-icons@16.33.0` (npm kayıt defterine erişim açık) | Yalnızca Shopify, Woo ve WooCommerce (eski) kayıtları bulundu. Her kaydın `source` alanı resmi marka sayfasını gösteriyor. Veri kümesi üçüncü taraf olduğu için güven **DÜŞÜK**. |

Ana sayfa HTML'i alınamadığından `theme-color`, `msapplication-TileColor`, `manifest.json`, inline logo SVG
ve CSS değişkeni adımlarının hiçbiri uygulanamadı. Hiçbir görsel/logo dosyası depoya kopyalanmadı.

**Yerelde tekrar denemek için:** Yerel 403'ler muhtemelen bot korumasından (Cloudflare/Akamai) geliyor.
Bulutta ise ortamın ağ erişim düzeyi bu alanlara izin vermiyor. Bulutta tekrar denenecekse:
ortam ayarları → Network access → daha geniş erişim düzeyi seçilmeli ya da aşağıdaki alanlar izin listesine
eklenmeli (bkz. <https://code.claude.com/docs/en/claude-code-on-the-web>). Bir alternatif de yerelde
gerçek bir tarayıcıyla DevTools üzerinden `document.querySelector('meta[name=theme-color]')` değerini ve
logo SVG'sinin `fill` değerlerini okumak.

Engellenen alanlar: `www.trendyol.com`, `www.hepsiburada.com`, `www.n11.com`, `www.pazarama.com`,
`www.ideasoft.com.tr`, `bizimhesap.com`, `www.amazon.com.tr`, `www.ciceksepeti.com`, `www.pttavm.com`,
`www.shopify.com`, `woocommerce.com`, `ikas.com`, `www.ticimax.com`, `www.tsoft.com.tr`, `www.parasut.com`,
`www.logo.com.tr`, `www.mikro.com.tr`.

## 2. Sonuç tablosu

Kontrast değerleri WCAG 2.x göreli parlaklık formülüyle **hesaplandı** (node betiği, §4).
Sütunlar: *beyaz zeminde metin* = renk ile #FFFFFF arasındaki oran (aynı oran, bu renk üzerinde beyaz metin için de geçerlidir), *renk üzerinde siyah* = renk ile #000000 arasındaki oran.

### Birincil platformlar

| Platform | Önerilen birincil | İkincil | Kaynak (URL + yöntem) | Erişim | Güven | Çelişen değerler | Beyaz zeminde metin / renk üzerinde beyaz | Renk üzerinde siyah |
|---|---|---|---|---|---|---|---|---|
| Trendyol | **DOĞRULANAMADI** | — | trendyol.com: proxy 403 | 2026-09-30 | — | logotyp.us `#333333` (üçüncü taraf, reddedildi) | — | — |
| Hepsiburada | **DOĞRULANAMADI** | — | hepsiburada.com: proxy 403 | 2026-09-30 | — | — | — | — |
| N11 | **DOĞRULANAMADI** | — | n11.com: proxy 403 | 2026-09-30 | — | — | — | — |
| Pazarama | **DOĞRULANAMADI** | — | pazarama.com: proxy 403 | 2026-09-30 | — | — | — | — |
| Ideasoft | **DOĞRULANAMADI** | — | ideasoft.com.tr: proxy 403 | 2026-09-30 | — | — | — | — |
| Bizimhesap | **DOĞRULANAMADI** | — | bizimhesap.com: proxy 403 | 2026-09-30 | — | — | — | — |

### İkincil platformlar

| Platform | Önerilen birincil | İkincil | Kaynak (URL + yöntem) | Erişim | Güven | Çelişen değerler | Beyaz zeminde metin / renk üzerinde beyaz | Renk üzerinde siyah |
|---|---|---|---|---|---|---|---|---|
| Shopify | `#7AB55C` | — | simple-icons 16.33.0 (npm), source: <https://www.shopify.com/brand-assets> (üçüncü taraf veri kümesi, kaynağı resmi kit) | 2026-09-30 | **DÜŞÜK** | — | 2.44 ✗ | 8.59 ✓ AAA |
| WooCommerce | `#873EFF` (güncel "Woo" markası) | `#96588A` (simple-icons'ta eski "WooCommerce" kaydı) | simple-icons 16.33.0, source: <https://woocommerce.com/style-guide>, kılavuz: <https://woocommerce.com/brand-and-logo-guidelines> | 2026-09-30 | **DÜŞÜK** | İki kayıt birbiriyle çelişiyor (yeni ve eski marka) | 5.04 ✓ AA / 5.17 ✓ AA | 4.16 (yalnızca büyük metin) / 4.06 (yalnızca büyük metin) |
| Amazon TR | **DOĞRULANAMADI** | — | proxy 403; simple-icons'ta kayıt yok | 2026-09-30 | — | — | — | — |
| ÇiçekSepeti | **DOĞRULANAMADI** | — | proxy 403 | 2026-09-30 | — | — | — | — |
| PTTAVM | **DOĞRULANAMADI** | — | proxy 403 | 2026-09-30 | — | — | — | — |
| ikas | **DOĞRULANAMADI** | — | proxy 403 | 2026-09-30 | — | — | — | — |
| Ticimax | **DOĞRULANAMADI** | — | proxy 403 | 2026-09-30 | — | — | — | — |
| T-Soft | **DOĞRULANAMADI** | — | proxy 403 | 2026-09-30 | — | — | — | — |
| Paraşüt | **DOĞRULANAMADI** | — | proxy 403 | 2026-09-30 | — | — | — | — |
| Logo | **DOĞRULANAMADI** | — | proxy 403 | 2026-09-30 | — | — | — | — |
| Mikro | **DOĞRULANAMADI** | — | proxy 403 | 2026-09-30 | — | — | — | — |

Eşikler: ≥4.5 AA normal metin, ≥3.0 AA büyük/kalın metin ve UI bileşeni, ≥7.0 AAA.

## 3. Depoda zaten bulunan değerler (kaynaksız, bilgi amaçlı)

Aşağıdaki değerler bu araştırmanın ürettiği sonuçlar **değildir**. Depoda iki ayrı yerde tanımlıdırlar,
hiçbirinin kaynağı belgelenmemiştir ve dört platformda iki kaynak birbiriyle **çelişir**. Birincil kaynak doğrulaması yapılana
kadar "doğrulanmamış" kabul edilmeleri gerekir.

| Platform | `frontend/src/design/tokens/palette.ts` (`integrationAccent`) | `site/src/styles/site-tokens.css` (`--site-channel-*`) | Çelişki | Beyaz zeminde metin (palette / site) | Renk üzerinde siyah (palette / site) |
|---|---|---|---|---|---|
| Trendyol | `#F27A1A` | `#f27a1a` | yok | 2.77 ✗ | 7.57 |
| Hepsiburada | `#FF6000` | `#ff6000` | yok | 3.03 (yalnızca büyük metin) | 6.93 |
| N11 | `#5B2D8E` | `#5c2d91` | küçük sapma | 9.50 / 9.38 | 2.21 / 2.24 ✗ |
| Pazarama | `#6A1B9A` | `#6c3ce1` | **belirgin fark** | 9.39 / 6.23 | 2.24 / 3.37 |
| Ideasoft | `#0E4C92` | `#0063e5` | **belirgin fark** | 8.51 / 5.36 | 2.47 / 3.92 |
| Bizimhesap | `#1B998B` | `#00a86b` | **belirgin fark** | 3.51 / 3.08 | 5.98 / 6.81 |

Not: Trendyol (`#F27A1A`, 2.77) ve Hepsiburada (`#FF6000`, 3.03) beyaz zeminde metin rengi olarak AA'yı
geçmez. Mevcut kod bu renkleri zaten yalnızca şerit/nokta olarak kullanıyor (palette.ts yorumu, site-tokens.css
`-fill` türevleri). Bu kullanım kontrast açısından doğrudur.

## 4. Kontrast hesaplama betiği

```js
const L = h => { const c = [0,2,4].map(i => parseInt(h.slice(i,i+2),16)/255)
  .map(v => v <= 0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4);
  return .2126*c[0] + .7152*c[1] + .0722*c[2] };
const r = (a,b) => { const x=L(a), y=L(b); return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2) };
// node c.js 7AB55C 873EFF ...  → onWhite / white-on / black-on
```

## 5. Önerilen sonraki adım

1. Yerelde gerçek tarayıcıyla, altı birincil platformun ana sayfasında `meta[name=theme-color]` değerini, manifest'teki
   `theme_color` değerini ve header logo SVG'sinin `fill` değerlerini oku. Bulunan değerleri bu tablodaki "DOĞRULANAMADI" hücrelerine yaz.
2. Doğrulama sonrası `palette.ts` ile `site-tokens.css` arasındaki çelişkiyi (Pazarama, Ideasoft, Bizimhesap) tek kaynakta birleştir.
