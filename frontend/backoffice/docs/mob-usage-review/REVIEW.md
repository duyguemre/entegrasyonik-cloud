# MOB-08 — kullanımda masaüstü/mobil ayrımı · inceleme kareleri

Üretim: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test e2e/specs/review-usage.spec.ts --project=chromium-desktop`
(sahte API, bulut Linux Chromium). Görsel taban DEĞİLDİR; tabanlar Windows'ta (`*-win32.png`) üretilir.

| Kare | İçerik |
|---|---|
| `01-kullanim-*` | Müşteriler → **Kullanım** (`/musteriler/kullanim`): Durum (hüküm + tek cümle) → Karar ("Müdahale gerekir mi?") → Eylem ("Ne yapılabilir?", ≤ 3 bağlantı) → Ayrıntı (bugün/7 g/30 g, masaüstü–mobil kırılım, alt türler açık, 14 günlük yığılmış seri) |
| `02-kullanim-mobil-suzgec-*` | Platform süzgeci = Mobil (`?platform=mobile`); süzgeç notu; masaüstü 0 |
| `03-musteri-kullanim-*` | Müşteri detayı → **Kullanım** sekmesi (`?sekme=kullanim`): aralık 7/30/90, süzgeç, aktif kullanıcı + başarılı giriş kırılımı, günlük seri |
| `04-musteri-kullanim-pasif-*` | 10 gündür kullanılmayan örnek müşteri → uyarı hükmü + "Yaşam döngüsüne bak" eylemi |
| `05-kullanim-veri-yok-*` | Kayıt yok (`__boMock.setUsageEmpty(true)`) → "Kullanım verisi henüz yok" (uydurma 0 yok) |

Genişlikler: 1440 (açık + koyu) ve 390 (açık, dokunmatik). Erişilebilirlik: `e2e/specs/usage.spec.ts` üç projede (açık, koyu, mobil 390) axe 0 ihlal.

Yerelde bakılacaklar: Windows görsel onayı; 390'da süzgeç çubuğunun iki satıra sarılması (Aralık · Platform · Alt tür · Yenile) kabul edilebilir mi.
