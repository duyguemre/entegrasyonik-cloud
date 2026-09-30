# Kanal marka renkleri — ölçülmüş değerler (2026-09-30, yerel)

Kullanıcı kararı (2026-09-30): "Bulunan renklerle ilerle; logolarını bulup hakim renklerine bak."
Yöntem: resmi uygulama ikonları (Apple App Store arama API'si → mzstatic 512px ikon) ve Wikimedia Commons
logo dosyaları indirildi; piksel histogramı (beyaz zemin hariç) ile hakim renk ölçüldü. Siteler bot korumalı olduğu
için tema CSS'i okunamadı; Pazarama/Ideasoft/Bizimhesap için ana sayfa HTML'indeki renk kullanımıyla çapraz kontrol yapıldı.

| Kanal | Birincil (marka) | İkincil / mürekkep | Kaynak | Not |
|---|---|---|---|---|
| Trendyol | `#FF6620` | `#000000` (ikon zemini) | App Store ikonu (hakim renk) | Commons eski wordmark PNG: `#E96E24`; yaygın atıf `#F27A1A` DOĞRULANMADI |
| Hepsiburada | `#FF6000` | — | Commons "Hepsiburada logo official.svg" fill + App Store ikonu (`#FF6000`/`#FF6100`) | İki kaynak tutarlı |
| N11 | `#FF44EE` | `#1C1C1E` | Commons "N11 Logo 2025.svg" (`#f4e` = `#FF44EE`, `#1c1c1e`) + App Store ikonu (`#FF44F0`) | 2025 yeni marka: siyah + pembe |
| Pazarama | `#0137F3` | `#FF008B` | Ana sayfa HTML renkleri (`#0137f3`, `#ff008b`) + App Store ikonu (`#0038F4`, `#FF0088`) | Elektrik mavisi (mora çalan); pembe ikincil |
| Ideasoft | `#391EE0` | — | App Store ikonu (`#3820E0`) + ana sayfa CSS (`#391ee0`, `#2e11ee`) | |
| Bizimhesap | `#20554E` | — | `msapplication-TileColor` meta + App Store ikonu (`#205450`) | |
| Shopify | `#7AB55C` | — | simple-icons (kaynak resmi kit) — DÜŞÜK güven | Entegrasyon yok, yalnız UI formu |
| WooCommerce | `#873EFF` | — | simple-icons — DÜŞÜK güven | Entegrasyon yok |

Diğer kanallar (Amazon TR, ÇiçekSepeti, PttAVM, ikas, Ticimax, T-Soft, Paraşüt, Logo, Mikro): ölçülmedi → nötr gri.

## Kullanım kuralı
- Marka rengi DEĞİŞTİRİLMEZ (tint/açık ton türetilmez); yüzeyde kullanım: nokta/şerit/logo zemini, çip kenarı veya
  dolgulu çipte doğrudan renk. Metin kontrastı AA'yı sağlamıyorsa (ör. N11 pembe, Trendyol/HB turuncu üzerinde beyaz metin)
  çip üzerindeki metin için hesaplanmış "on-color" (siyah/beyaz, hangisi ≥4.5:1 ise) kullanılır — renk değil metin rengi seçilir.
- Tek kaynak: frontend token dosyasında `channel.<kod>.brand` / `channel.<kod>.onBrand`; site aynı değerleri kendi
  token'ına kopyalar (aynı tablo). Değer değişikliği yalnız bu belge + token üzerinden.
