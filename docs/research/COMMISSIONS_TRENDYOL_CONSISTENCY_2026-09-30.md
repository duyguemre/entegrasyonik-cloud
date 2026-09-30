# Trendyol commissions.json tutarlılık raporu (COM-01, 2026-09-30)

Kaynak: `backend/src/integration/modules/marketplace/trendyol/commissions.json` (tek commit 2026-04-24). Tarama: node betiği, dış istek yok.

| Bulgu | Sayı |
|---|---|
| Toplam düğüm / kök / yaprak | 4204 / 18 / 3683 |
| id tekrarı, parentId tutarsızlığı | 0 / 0 |
| Ebeveynden farklı oranlı çocuk (çelişki) | 3683 (çocukların ~%88'i); bunların 1950'sinde çocuk > ebeveyn |
| Sessiz %0 | 1 (id 4984 Dijital Destek Kartı) -> null yapıldı |
| Aykırı (>40) | 1 (id 4594 İkinci El Otomobil %50; doğrulanamadı, dokunulmadı) |
| KA1/KA2 dolu | 2706 (ikisi birlikte); hiçbirinde KA1>KA2 veya kademe>temel yok; micro hiçbirinde dolu değil |
| maturity dağılımı | 28:2643, 21:998, 45:259, 30:196, 24:64, 14:30, 7:10, diğer 4 |

Yorum: ebeveyn oranı yaprağı temsil etmez (örn. Aksesuar 25 -> Saat 21,5 / Takı 30); ebeveyn düğümü oranı "varsayılan" gibi okunmamalı, yaprak kimliğiyle aranmalı. Hangisinin doğru olduğu resmi tabloyla teyit edilmeden düzeltilmedi.

Kararlar: (1) KA1/KA2 anlamı kaynaksız -> kademe SEÇİLMEZ (yalnız `tiers` okunur), ayar katmanı yok; (2) `commissions.meta.json` eklendi (source, asOf=2026-04-24 repo tarihi, vatIncluded=null bilinmiyor, effectiveFrom=null); (3) güncelleme betiği resmi Excel/CSV gerektirir, yapılmadı.
