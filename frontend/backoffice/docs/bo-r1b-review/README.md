# bo-r1b inceleme kareleri (K51 — "Durum → Karar → Eylem → Ayrıntı", genel bakış dışındaki tüm sayfalar)

Betik: `e2e/specs/review-r1b.spec.ts` (`BO_REVIEW=1`, sahte /admin-api). İlk ekran kareleri (1440 × 900, 390 × 844; açık/koyu):
§11.6 madde 6 sorusu — **hüküm + ilk dikkat maddesi + eylem ilk ekranda görünüyor mu?** Görsel taban DEĞİLDİR (tabanlar Windows'ta).

| Kare | Sayfa | Örnek veride hüküm |
|---|---|---|
| 10 | Müşteri listesi | Sakin: eşitleme güncel; bilgi maddeleri (kanalsız, pasif) Durum'da özet çipi |
| 11 | Müşteri detayı #102 | Sakin; BE-02 olmadığı not edilir |
| 12 / 13 | Abonelikler / abonelik detayı #104 | Kırmızı (askıda) / duruma göre |
| 20 | Motor | Sarı: DLQ, başarısız işler, takılı kira, geciken görev |
| 21–23 | Entegrasyonlar, Redis ve MongoDB, Önbellek | Veri eşiklerine göre |
| 30 / 31 | Log merkezi / Denetim | Sarı: yeni hata grubu / bilgi tonu |
| 40–43 | Yöneticiler, Platform ayarları, Otopilot ayarı, Otopilot sohbeti | Kırmızı (2FA'sız yönetici) … ; sohbette tek satır |
| 50–54 | Duyurular, Teslimler, Müşteri bildirim geçmişi (#102), Katalog, Uyarılar | Uyarılar kırmızı (kritik etkin) |
| 70 | Komut paleti "Bu ekranda" (müşteri detayı) | NT-01 |
| 71 | Üretimde yıkıcı işlem: hedef kimliğini yazdırma | NT-02 (`?env=production`) |

Yeniden üretmek: `cd frontend/backoffice && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium BO_REVIEW=1 npx playwright test review-r1b.spec.ts --project=chromium-desktop`
(yalnız bazıları: `BO_REVIEW_ONLY=20-,54-`).
