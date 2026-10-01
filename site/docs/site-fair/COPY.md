# Adil rekabet ilkesi: site metinleri (PRC-MKT, K58)

> Dal `cloud/site-fair`. Kaynak: `docs/research/AUTO_PRICING_LEGAL_2026-10.md` (dal `cloud/prc-legal`), §a "yapamayız",
> §c K1–K20, §f. Bu belge **seçim belgesidir**. Yayındaki metin **(A)** seçenekleridir. Başka bir seçenek seçilirse yalnız
> `site/src/data/fair-play.ts` (Otopilot maddesi için `agent-claims.ts` → `trust-price`, SSS için `faq.ts` → `fiyat-karari`)
> değiştirilir. `tests/fair-play.test.ts` yeni metni de tarar.

## İlkeler: yasaklı noktalar marka tutumuna nasıl çevrildi

| Hukuk araştırmasındaki "yapamayız" | Sitedeki üst ilke | Bugün doğru mu? (kanıt) |
|---|---|---|
| Satıcıya "önerilen fark" dayatmak (K4), fiyatı biz belirlemek | **Fiyat sizin kuralınızla belirlenir** | Evet. Fiyat alanlarını satıcı girer (`Variant.ts` → `prices`, `isPlatformBasedPrice`). Otomatik fiyatlama yok |
| İşletmeler arası veri taşımak, ortak istatistik (K2, K5, K20, en ağır risk) | **Verileriniz yalnızca sizin** | Evet. Her hesabın ayrı veri alanı var (ADR-0003). İşletmeler arası fiyat raporu yok |
| Açıklanamayan değişiklik (K15, K18) | **Şeffaf kayıt** | Stok için evet: otomatik stok değişiklikleri neden alanıyla defterde (`StockMovement.ts`, `listMovements`). Fiyat için bir şey söylenmez, çünkü otomatik fiyat değişikliği yok |
| Rakip hedefleme (K6), "eşitle" (K1), fiyat savaşı (K12) | **Rakibe değil, işinize odaklanın** | Evet. Rakip hedefleyen araç yok. Bekçi test bu dili yasaklar |

"Her otomatik değişiklik" demiyoruz. Stok defteri yazımı bilerek "en iyi çaba" ile yapılır (akışı bloklamaz) ve
mutlak "her" iddiası `claims.test` mutlak dil kuralına da takılır. Bu yüzden ifade "otomatik yapılan değişiklikler, nedeniyle birlikte kayda geçer".

## 1. `/guvenlik#adil-rekabet` (yeni bölüm, Güvence ilkeleri ile Kapsam arasında)

**Eyebrow:** Adil rekabet

| | Başlık | Giriş |
|---|---|---|
| **(A) yayında** | Fiyatınız, sizin kararınız | Entegrasyonik satışınızı yönetmeniz için çalışır; kimin hangi fiyattan satacağına karar vermez. Bu tutumu dört ilkeyle özetliyoruz. |
| (B) | Adil rekabetten yanayız | Kuralı siz koyarsınız, veriniz sizde kalır. Entegrasyonik işletmeler arasında tarafsız bir araçtır. |
| (C) | Kural sizin, veri sizin | Fiyat kararı işletmenize aittir. Biz bu kararı sizin adınıza vermeyiz, başkasının verisiyle de şekillendirmeyiz. |

**İlke 1: fiyat**
- (A) **Fiyat sizin kuralınızla belirlenir.** Kanallarınıza giden fiyatı siz belirlersiniz. Entegrasyonik sizin yerinize fiyat koymaz, size hazır bir fiyat da dayatmaz.
- (B) **Fiyatınızı siz koyarsınız.** Her kanaldaki fiyat sizin girdiğiniz değerle oluşur; size hazır bir fark ya da fiyat önermeyiz.
- (C) **Karar sizde.** Fiyatınızı biz değil, siz belirlersiniz; araçlarımız yalnızca sizin kararınızı kanallarınıza taşır.

**İlke 2: veri**
- (A) **Verileriniz yalnızca sizin.** Fiyat, maliyet ve satış verileriniz kendi hesabınızda kalır; başka bir işletmenin kararında kullanılmaz, başka işletmelerle paylaşılmaz.
- (B) **Veriniz başkasının kararına girmez.** Fiyatınız ve maliyetiniz yalnızca sizin hesabınızda işlenir; başka bir satıcıya, rapora ya da karşılaştırmaya taşınmaz.
- (C) **Sizin veriniz, sizin avantajınız.** Verileriniz yalnızca sizin işinize yarar; başka işletmelerle paylaşılmaz, birleştirilmez.
  - Not: (C)'deki "birleştirilmez" bugün doğrudur, ama ileride anonim kullanım istatistiği eklenirse metin gözden geçirilmeli.

**İlke 3: şeffaflık**
- (A) **Şeffaf kayıt.** Stokunuzda otomatik yapılan değişiklikler nedeniyle birlikte kayda geçer; bir sayının neden değiştiği sonradan izlenebilir.
- (B) **Her sayının bir nedeni var.** Otomatik stok değişiklikleri; sipariş, iade ya da düzeltme nedeniyle birlikte kaydedilir.
- (C) **Neden değişti, bilinir.** Otomatik yapılan değişiklikleri sebebiyle birlikte kayıt altında tutarız.
  - Not: (C) kapsamı stokla sınırlamaz. Otomatik fiyat değişikliği yayına girene kadar "fiyat" kelimesi eklenmemeli (K43).

**İlke 4: adil rekabet**
- (A) **Rakibe değil, işinize odaklanın.** Belirli bir satıcıyı hedef alan araç sunmayız. Araçlarımız kendi maliyetinize, stokunuza ve hedeflerinize göre karar vermenize yardım eder.
- (B) **Adil rekabet, sağlıklı pazar.** Belirli bir satıcıyı hedef alan araç sunmayız; rekabet, her işletmenin kendi kararıyla güçlenir.
- (C) **Rakibe değil pazara bakın.** Kararlarınızı tek bir rakibe göre değil, kendi hedeflerinize göre verin.
  - Not: (C) brifteki örnekti. "Pazara bakın" bugün sunulmayan bir pazar görünürlüğü aracı (buybox) varmış gibi okunabileceği
    için **(A) seçildi** (K43 yayın kapısı). Pazar görünürlüğü yayına girdiğinde (C)'ye geçilebilir.

## 2. Ana sayfa: Güvenlik bölümünün altında tek satır

| | Etiket | Metin | Bağlantı |
|---|---|---|---|
| **(A) yayında** | Adil rekabet ilkemiz | Fiyatınız sizin kuralınızla belirlenir; verileriniz başka bir işletmenin kararında kullanılmaz. | İlkelerimizi okuyun → `/guvenlik#adil-rekabet` |
| (B) | Fiyatınız, sizin kararınız | Kuralı siz koyarsınız, veriniz sizde kalır. | Adil rekabet ilkemiz → |
| (C) | Adil rekabetten yanayız | Size fiyat dayatmayız; verinizi başka bir satıcının kararında kullanmayız. | Nasıl? → |

## 3. Otopilot: "Kontrol sizde" bölümünde altıncı güvence maddesi (ızgara 3 + 3 oldu)

- (A) **Fiyatınız, sizin kuralınız.** Ajanlar fiyat kararını sizin yerinize vermez: fiyata dokunan bir öneri yalnızca sizin kurallarınıza ve sizin verinize dayanır; başka bir işletmenin verisi hesaba katılmaz.
- (B) **Fiyat kararı sizde.** Ajanlar fiyatınızı belirlemez; başka bir işletmenin verisini görmez, kullanmaz.
- (C) **Adil ve şeffaf.** Ajanların önerileri yalnızca sizin kurallarınıza ve hesabınızın verisine dayanır.

Kayıt `agent-claims.ts` → `trust-price`, durum `building`. İç not: fiyat önerisi yapan ajan yayına girdiğinde AUTO_PRICING_LEGAL K2 ve K4 korunmalı.

## 4. SSS: "Hesap ve güvenlik" kategorisi (`fiyat-karari`)

- **Soru:** Entegrasyonik fiyatlarıma karar verir mi, verilerim başka işletmelerin kararında kullanılır mı?
- **Yanıt (A):** Hayır. Kanallarınıza giden fiyatı siz belirlersiniz; Entegrasyonik sizin yerinize fiyat koymaz. Fiyat, maliyet ve satış verileriniz kendi hesabınızda kalır; başka bir işletmenin kararında kullanılmaz, başka işletmelerle paylaşılmaz.

## Bilerek yazılmayanlar

- Hukuki uygunluk garantisi ("yasalara %100 uygun", "hukuken garantili", "Rekabet Kurumu onaylı").
- Kurul kararı, soruşturma, taahhüt kararı ya da kanun maddesi atfı.
- Bir pazaryerinin adı veya aracı. Rakip firma adı da yok (K07).
- "Buybox'a eşitle", "rakibi otomatik geç/yen", "fiyat savaşını kazan", "rakip fiyat takibi".
- Otomatik fiyatlama ve buybox görünürlüğü ("yakında" dahil, K43). Teknik mekanizma (K44). Müşteri adresi (K45).

## Statik bekçi (`site/tests/fair-play.test.ts`)

- **Kapsam:** derlenmiş sitenin tüm HTML sayfaları (pazarlama + rehber + yasal) ile `llms.txt` / `llms-full.txt`.
  Pazarlama sayfalarında ayrıca `otomatik fiyatlama`, `buybox`, `akıllı/dinamik fiyatlama` geçemez. Rehber sözlüğünde
  "buybox" yalnız kavram tanımı olarak geçebilir.
- **Kalıplar:** `FAIR_BANNED` (`src/data/fair-play.ts`), pazaryeri adı ile otomatik fiyat aracının birlikte geçmesi ve rakip
  firma adları (`tests/fixtures/competitors.ts`, rehber testiyle ortak). Eşleştirme Türkçe-normalize metinde yapılır.
- **Serbest bırakılanlar:** "garanti edemez", "garantisi değildir" gibi çekince cümleleri ve "Stoğu tüm kanallarda eşitle".
  Test bu ayrımı kendisi sınar (14 yasak, 11 serbest örnek).
- **İlke kaydı denetimi:** kanıt dosyaları mevcut ve atıf metni dosyada geçiyor; mutlak/hukuk dili, "müşteri" hitabı,
  pazaryeri adı yok; başlıklar 7 kelimeyi aşmıyor.
