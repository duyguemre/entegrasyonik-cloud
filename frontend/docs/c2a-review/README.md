# C2a — ekip yönetimi · davet kabulü · sahiplik devri · reauth (inceleme görüntüleri)

Dal `cloud/fe-c2a`. Linux Chromium + e2e sahte verisi (sentetik, PII yok); saat 2026-09-30 09:00 sabit. Görsel onay yerelde (Windows).
Araç: `C2A_REVIEW=1 C2A_REVIEW_WIDTH=1440|390 C2A_REVIEW_OUT=docs/c2a-review npx playwright test e2e/specs/c2a-review.spec.ts --project=chromium-desktop`.

| Dosya | Durum |
|---|---|
| `a-ekip-listesi` | Yetkilendirme: başlıkta "Kişi davet et", bekleyen davetler kartı (≤3 satır; süre / "Süresi doldu" / "Bir günden az kaldı"), Durum kolonu, "Siz" rozeti |
| `b-davet-diyalogu` | e-posta + rol kartları (Yönetici seçili), rol tavanı notu |
| `c-davet-plan-siniri` | 403 PLAN_LIMIT_REACHED → uyarı tonu + "Aboneliği görüntüle" (390'da görünür alana kaydırılır) |
| `d-satir-menusu` | `⋯` ÜYELİK grubu: Sahipliği devret · Askıya al (tehlikeli) · Sil |
| `e-askiya-al` | tehlikeli onay (odak Vazgeç), isteğe bağlı neden, 409 LAST_OWNER okunur ileti |
| `f-sahiplik-devri` | iki adım kartı, hedef seçimi (satırdan önceden seçili), sonuç uyarısı, "Bekleyen bir devri iptal et" bağlantısı |
| `g-reauth` | uygulama geneli parola diyaloğu (devir diyaloğunun üstünde), 400 INVALID_CURRENT_PASSWORD iletisi |
| `h-devir-bekliyor` | devir bandı (kabul edene kadar sahip sizsiniz · son tarih · İptal) |
| `i-davet-kabul` | `/invite#t=…` → özet (mağaza, rol + açıklama, maskeli e-posta, geçerlilik) + hesap formu |
| `j-davet-hata` | 400 WEAK_PASSWORD → parola alanında politika iletisi (davet yanmaz) |
| `k-davet-suresi-dolmus` | 410 INVITATION_EXPIRED → "ne yapmalı" metni, giriş ikincil |
| `l-davet-tamam` | kabul oturum açmaz → "Giriş yap" |
| `m-sahiplik-kabul` | `/accept-ownership#t=…` oturumlu hedef: kabul + sonuç uyarısı |
| `n-giris-notu` | `/login?reason=invitation-accepted` başarı notu |

## Eleştiri turları

1. **1. tur** — kimliksiz sayfalarda birincil düğmeler ikincil görünüyordu (`EkButton` varsayılanı `secondary`); sorun durumu ortalı
   boş durum + sola yaslı üst etiket karışıktı; bekleyen davet satırları iki satırlık (3 davet ≈ 190px, liste aşağı itiliyor); 8 saat
   kalan davette "1 gün kaldı" yazıyordu. → `tone="primary"`, sola yaslı `AuthResultBlock`, ≥720px kapta tek çizgi satır + ≤3 satır,
   `daysLeft` aşağı yuvarlama + "Bir günden az kaldı".
2. **2. tur (390)** — devir diyaloğunda "Bekleyen bir devri iptal et" eylem çubuğundan taşıyordu; davet diyaloğundaki plan sınırı
   iletisi kaydırılan gövdenin altında görünmüyordu; sorun sayfalarında gövde başlığı tekrarlıyordu ("Davetin süresi dolmuş" /
   "Bu davetin süresi dolmuş."). → bağlantı gövdenin sonunda, hata görünür alana kaydırılır, durum başına "ne yapmalı" metni;
   hesabı olmayan kişide "Giriş yap" ikincil.
3. **3. tur** — 1440 + 390 yeniden: taşma yok, hata görünür, hiyerarşi tek birincil eylem; e2e axe 0 (liste, davet diyaloğu, davet sayfası).

Açık (bu dalın kapsamı dışında): "Yetki grubu" kolonu ham `roleCode` gösterir (karakterizasyon testi sabitliyor; üyelik rolü
`role` alanı projeksiyona gelince "Rol" kolonuna geçilmeli). `EkSelect` tek seçimde değeri çip olarak çizer (ds bileşeni davranışı).
