# DS-v2 Aşama 4 — ikinci bağımsız premium tur, tur 3 (kapanış)

Tur 2'den açık kalan ölçüm (A4-31) piksel örneklemesiyle doğrulandı; yeni **stres** durumu (uzun ad/ürün metni, çok kalem,
12.480 kayıt / 500 sayfa, büyük tutar) ve yakın çekim tablo başlığı araca eklendi (`a4-review.spec.ts`: `durum-stres`,
`durum-yakin-baslik`). **D** = düzeltildi · **A** = açık (gerekçeli).

| # | Ekran(lar) | Kusur | Düzeltme | Durum |
|---|---|---|---|---|
| A4-31 | TÜM tablolar (kap ≥ 600px) | Başlıkta seçim kolonu ile kimlik kolonu arasında **4px beyaz şerit** (piksel örneği: x=40–43 `#ffffff`, çevresi `#f6f8fb`). Neden: kimlik kolonu `left: 44px` yapışık, seçim kolonu 40px çiziliyordu → yapışıklık kolonu 4px sağa itip ızgara zeminini açığa çıkarıyordu (satır metni de 4px kayıktı) | Seçim kolonu `box-sizing: border-box` + 44px sabit (min/max). Yeniden örnek: şerit yok | D |
| A4-33 | Siparişler (1440, stres) | Uzun müşteri adı ("Muhammed Mustafa Kemal Karaosmanoğlu-Yılmazer") kolonu sınırsız genişletip tutar/durum kolonlarını görünür alanın dışına itiyordu | Tek satırlık metin kolonu en fazla 240px, taşan kısım üç nokta (tablo düzeni; kart düzeninde tam metin sarar) | D |
| A4-34 | Siparişler (390, stres) | — | Kart düzeni uzun adı ve ürün metnini sarar; 1.234.567,89 ₺ tutar ve 500 sayfalık sayfalama taşmıyor | — (doğrulandı) |
| A4-35 | Tüm listeler (hover) | Satır hover'ı `surface-muted` — sabitlenmiş eylem hücresi dahil tüm satır tonlanıyor | Kusur değil (tutarlı) | — |
| A4-36 | Siparişler (1440, stres) | 9 kolonlu sipariş tablosu 1440'ta yine yatay kayar (içerik 240 + müşteri 240) | — | A — kolon seti ürün kararı; kaydırma gölgesi + yapışık kimlik/eylem kolonu kaydırılabilirliği gösterir (a3 L2) |

## Tur özeti (tur başına düzeltilen kusur)

| Tur | Düzeltilen | Açık (gerekçeli) |
|---|---|---|
| 1 (`a4-critique-1.md`) | 14 (A4-1 … A4-14) | 3 (A4-15, A4-16, A4-17 — metin/manifesto) |
| 2 (`a4-critique-2.md`) | 12 (A4-18 … A4-29; A4-29 inceleme aracı) | 2 (A4-31 → tur 3'te düzeltildi, A4-32) |
| 3 (bu belge) | 2 (A4-31, A4-33) | 1 (A4-36) |

Toplam **28 düzeltme**; açık: A4-15 (Şifre/Parola terimi), A4-16 (manifesto notlarının teknik dili), A4-17 (Başlık Düzeni i18n
metinleri — T3-5 ile aynı metin turu), A4-32 (yönetici KPI satırı mobilde tek sütun), A4-36 (sipariş tablosu kolon seti).
