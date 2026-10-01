# ELEV inceleme — siteyi pazarlama/marka seviyesine taşıma (1. tur)

Dal: `cloud/site-elev` (taban `cloud/site-s26`). Yalnız `site/` değişti. Görüntüler bulutta Linux Chromium ile,
reduced-motion (anlamlı son kare) ile alındı; tam sayfa çekimler 1600 px dilimlere bölündü. Görsel onay yerelde.

Belgeler: `../AUDIT.md` (20 bulgu, öncelikli) · `../BRAND.md` (kimlik kılavuzu) · `../NEXT_TASKS.md` (11 görev).

## Uygulananlar (E1–E7)

| # | Bulgu | Ne yapıldı | Görüntü |
|---|---|---|---|
| E1 | A2, A11 | Jargon temizliği: overselling, omnichannel, SKU, AES-256-GCM, `enc:v1:`, "mimari", "varsayılan red", sandbox, "Durağan veride şifreleme", "Hata toleransı", "API yanıtları" → fayda dili. Teknik ayrıntı yalnız `/guvenlik` "Ayrıntı" panellerinde. Kalıcı koruma: `src/data/brand.ts` `VOICE_BANNED` + `tests/brand-voice.test.ts` (derlenmiş tüm pazarlama sayfaları; rehber/yasal hariç) | `sonra/anasayfa-1440-sonra-p3`, `-p8` |
| E2 | A3 | Kapanış ikincil CTA "Giriş yap" → **"Demo talep edin"** (mailto, konu hazır) | `sonra/anasayfa-1440-sonra-p10` |
| E3 | A4, A5 | Hero: ikinci rozet ("Çok kanallı satış yönetimi") kalktı, gövde tek vaat cümlesi; özellik şeridi reduced-motion'da dengeli 4×2 ızgara (yetim çip yok) | `once/anasayfa-1440-once-p0` → `sonra/anasayfa-1440-sonra-p0`; 390: `once/…390-once-p0` → `sonra/…390-sonra-p0` |
| E4 | A6, A7 | Dört mesaj sütunu (Kontrol · Doğruluk · Zaman · Güven) — bölüm başlıkları yeniden yazıldı: "Her kanal ayrı panel, ayrı stok, ayrı mesai", "Sipariş bir kanalda, stok her kanalda doğru", "Siparişten iadeye, operasyonunuzun tamamı", "Kanallarınız bağlanır, iş akışınız sadeleşir", "Dört adımda hazırsınız", "Verileriniz yalnızca size ait". İki renkli vurgu yalnız hero/kapanış (+ tek koyu vitrin kartı) | `sonra/anasayfa-1440-sonra-p1`, `-p2` |
| E5 | A16 | Slogan **"Çok kanal. Tek kontrol."** + vaat cümlesi footer'da ve kapanış eyebrow'unda (tek kaynak `brand.ts`) | `sonra/anasayfa-1440-sonra-p10` |
| E6 | A8, A9, A14 | İç sayfa H1 = değer cümlesi, sayfa adı teal eyebrow (`/ozellikler`, `/guvenlik`, `/entegrasyonlar`, `/iletisim`). **Hata düzeltmesi:** `PageHero`'nun `.page-hero h1` kuralı kapsam dışı kalıyordu (sınıf alt bileşen Section'da) → tüm iç sayfa H1'leri genel 36/700'e düşüyordu; artık display ölçeği. `/ozellikler` hero sayaçları güç sayıları (kısmi sayısı karta/matrise) | `once/ozellikler-1440-once-p0` → `sonra/ozellikler-1440-sonra`; `sonra/guvenlik-*`, `entegrasyonlar-*`, `iletisim-*` |
| E7 | A10 | Yetenekler bölümündeki koyu "dört değer sütunu" bandı (hemen altındaki bentoyu tekrar ediyordu) ve kaydı kaldırıldı; sayfa ~460 px kısaldı | `sonra/anasayfa-1440-sonra-p2`, `-p3` |

## İterasyonlar ve kendi eleştirim

1. **E3 ilk sürüm** (`iterasyon/anasayfa-1440-it1-kopya-serit-hatasi`): ızgara kuralı, gizli kopya kümenin
   `display: none`'unu ezdi → masaüstünde çipler iki kez göründü; 390'da 2 sütunlu ızgara sağdan taştı
   (`iterasyon/anasayfa-390-it1-serit-tasma`). → Izgara yalnız ≥1024 px ve yalnız asıl kümede (`:not(--copy)`),
   dar ekranda eski sarma korunur.
2. **E4**: "Tek merkez, tek stok, tek sipariş akışı" (vitrin kartı) yedinci "tek" tekrarıydı → S26 hikâyesine bağlanan
   "Sipariş bir kanalda, stok her kanalda doğru". Hero gövdesinde ilk taslak "stok her yerde aynı anda güncellenir"
   pazaryerlerinin kendi güncelleme aralığı yüzünden fazla iddialıydı → "stok tek merkezden düşer ve tüm kanallara iletilir".
3. **E6 ilk sürüm** (`iterasyon/ozellikler-1440-it1-h1-kucuk`): H1 değer cümlesi oldu ama 36 px/700'de kaldı; kök
   neden kapsam dışı seçici. Eyebrow teal yapıldı ama `.section--stage p` kuralı ezdi → seçici güçlendirildi.
4. **Son geçiş**: güvenlik bölümünde kalan "Durağan veride şifreleme / Hata toleransı" etiketleri ve "API yanıtları"
   başlığı da fayda diline çevrildi.

Bilinçli olarak değiştirilmeyenler: örnek künye bilgileri (kullanıcı kararı, yayın kapısı — N11); taslak fiyat notu
(`claims.test.ts` metni birebir korur — N4, kullanıcı onayı); Otopilot demo kartındaki üç eylem (N7);
`/ozellikler/stok-rezervasyonu` başlığındaki "(overselling)" arama terimi (sözlükte yalnız o sayfaya izin).

## Test değişiklikleri (gerekçeli)

- Yeni: `tests/brand-voice.test.ts` (4 test).
- `tests/home.test.ts`: kapanış ikincil CTA → demo mailto; güvenlik testinde `AES-256-GCM` ana sayfa beklentisi K44
  gereği tersine çevrildi (algoritma adı `/guvenlik`'te, `pages.test.ts` korur), şifreleme iddiası kayıttaki cümleyle
  ve kısmi ödeme sınır notu aynen zorunlu; dört değer sütunu beklentisi → bandın yokluğu.
- `tests/claims.test.ts`: kaldırılan `homePillars` kaydının iki atfı silindi (görünür metin değil artık). Diğer
  iddia/kanıt kuralları değişmedi; "seçim kriterleri" SSS yanıtı "varsayılan olarak" ölçütünü korur.
- e2e: H1/başlık metinleri (`home.spec`, `inner-pages.spec`), fiyat satır başlığı "Ürün varyantı", destek SSS bağlantı adı.

## Test sonuçları

Bkz. sonraki bölüm (son koşu).
