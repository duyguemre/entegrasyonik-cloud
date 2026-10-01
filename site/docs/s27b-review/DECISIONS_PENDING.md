# S27b — Kullanıcı kararı bekleyenler

Tarih: 2026-10-01 · Dal: `cloud/site-s27b`. Her madde için **makul varsayılan uygulandı**; karar değişirse tek
yerden geri alınır (dosya/satır belirtildi). Kayıt: `docs/adr/USER_DECISIONS.md`'ye işlenmesi yerel oturumun işidir
(bulut kopyasında `docs/adr/` salt-okunur).

## D1 — N4: Taslak fiyat notunun ziyaretçi dili (ELEV A12) — KARAR GEREKİR

- **Önceki hâl:** Fiyat sayfası hero'sunda ve anasayfa planlar bölümünde ziyaretçiye
  "ÖNERİ — insan kararı bekliyor (ADR-0014 Açık Soru 1)" yazıyordu (iç süreç adı).
- **Uygulanan varsayılan:** Görünür metin: **"Fiyatlar ve plan içerikleri yayın öncesi kesinleşir. Gösterilen
  tutarlara KDV dahil değildir."** (`src/data/plan-cards.ts` → `PROPOSAL_VISITOR_NOTICE`, `getPlanNotice()`).
  Yönetişim kaydı `PROPOSAL_NOTICE` (`plans.ts`) **değişmedi**; `claims.test.ts` onu birebir doğrulamaya devam ediyor.
  Kayıt sayfada görünmez `data-proposal-notice` özniteliğinde taşınır; e2e (`pricing.spec.ts`) özniteliği birebir,
  `plan-cards.test.ts` görünür metnin iç süreç adı içermediğini doğrular. Gevşetme değil, yer değiştirme.
- **`SITE_DRAFT=false` davranışı (varsayılan):** seed `_meta.status` "ÖNERİ" olduğu sürece not yayın derlemesinde de
  görünür (güvenli taraf). Seed onaylanınca (`ÖNERİ` kalkınca) not kendiliğinden kaybolur.
- **Seçenekler:** (a) varsayılan kalsın · (b) not yalnız taslak derlemede görünsün, yayında hiç görünmesin ·
  (c) metin değişsin (önerinizi yazın).
- **Geri alma:** `getPlanNotice()` yerine `getPlanSourceNotice()` göstermek (1 satır, iki bileşen).

## D2 — Önerilen plan vurgusu

- **Varsayılan:** "Büyüme" planı "Önerilen" rozetli tek koyu vitrin kartı (`RECOMMENDED_PLAN_CODE`, `plan-cards.ts`).
  Tasarım kararıdır; "en popüler / en çok tercih edilen" gibi istatistik iddiası yazılmaz (test korur).
- **Soru:** Vurgulanacak plan Büyüme mi kalsın? (Önceden fiyat sayfası "en çok özellikli plan", anasayfa sabit
  `growth` kullanıyordu; artık ikisi aynı kayıttan.)

## D3 — Kapanış CTA'sının ikincil eylemi (fiyat sayfası)

- **Varsayılan:** "Giriş yap" yerine **"Demo talep edin"** (ELEV A3/BRAND: kapanışta giriş yok; anasayfa ile aynı
  `mailto` deseni). Giriş bağlantısı üst barda duruyor.

## D4 — Plan kartı CTA metinleri

- **Varsayılan:** kayıttaki pazarlama metinleri her iki yüzeyde: "Ücretsiz deneyin" / "Büyüme ile başlayın" /
  "Teklif isteyin" (`pricing.ts` `PLAN_PITCH`). Fiyat sayfasındaki eski "Ücretsiz dene / Planı seç / Teklif iste"
  kalktı. Büyüme kartının alt notu: "Kaydolun, planı uygulamadan etkinleştirin" (deneme yalnız seed deneme planında).

## D5 — İç sayfa H1'leri (N1)

| Sayfa | Önce | Sonra | Gerekçe |
|---|---|---|---|
| `/destek` | Destek merkezi | **Kurulumdan ilk siparişe, yanınızdayız** (eyebrow: Destek merkezi) | Değer cümlesi; sayfa adı eyebrow, `<title>` ve kırıntıda kalır |
| `/sss` | Sık sorulan sorular | **Merak ettiklerinize net yanıtlar** (eyebrow: Sık sorulan sorular) | Aynı; anahtar ifade title/eyebrow/kırıntıda korunur |
| `/entegrasyonlar/[kod]` | "X entegrasyonu" | **korundu** | Arama niyeti tam olarak "kanal adı + entegrasyonu"; H1'de kalması SEO açısından daha güçlü |
| `/ozellikler/stok-rezervasyonu` | "Aşırı satış (overselling) nasıl önlenir?" | **korundu** | Soru biçimli H1 arama sorgusunu birebir karşılar (rehber niteliği) |

İsterseniz `/sss` için anahtar ifade H1'e geri alınabilir ("Sık sorulan sorular").

## D6 — N11 künye yayın kapısı — YAPILMADI (işletme verisi bekliyor)

Kontrol listesi: `site/docs/s27b-review/KUNYE_CHECKLIST.md`.
