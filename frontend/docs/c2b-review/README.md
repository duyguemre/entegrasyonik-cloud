# C2b — bildirim merkezi, çekmece, tercihler, SSE istemcisi (inceleme görselleri)

Dal `cloud/fe-c2b` (taban `cloud/ds-v2-a6b` + fe-breadcrumb, fe-a9, fe-a10, fe-a11). Görseller e2e sahte verisinden,
bulutta Linux Chromium ile alındı (Playwright tabanı DEĞİL; görsel onay yerelde).

Üretim: `C2B_REVIEW=1 C2B_WIDTH=1440|390 npx playwright test e2e/specs/notifications.spec.ts e2e/specs/notification-preferences.spec.ts --project=chromium-desktop -g inceleme`

| Dosya | Ne |
|---|---|
| `merkez-{1440,390}.png` | Bildirim merkezi: katalog kategori ikonu/tonu, kritik çip, ×23 grup rozeti + "son:", zorunlu kilit, bağlantı durumu, "Daha fazla göster"/"Hepsi bu kadar" |
| `merkez-ayrinti-{1440,390}.png` | Ayrıntı: önem · Zorunlu · okunma · "23 kez", Görüntüle (internalActionPath) |
| `cekmece-{1440,390}.png` | Çekmece: gün grupları, Tümü/Okunmamış, kanal noktası + kategori · zaman, hayalet "Detayları gör", kritik sol şerit |
| `tercihler-{1440,390}.png`, `tercihler-alt-*` | Tercihler: kategori × kanal matrisi (kilitli satırlar), özet, sessiz saatler, dil, kirli durum çubuğu |

## İterasyonlar

1. **İlk sürüm** — çekmecede meta satırı kanal çipinin İÇİNE ayraç düşürüyor ve satır başında "·" ile sarıyordu; gizli
   (opaklık 0) satır eylemleri her satırda 32px boşluk bırakıyordu; merkezde dar ekranda ikon kapsülü satır ortasına kayıyordu;
   tercih matrisi 1/3 + 2/3 bölümde sıkışıyor (ipuçları 4 satır), parçalı seçimler tam genişliğe yayılıyordu; anahtarlar
   uygulamanın geri kalanından farklı (`inset`).
2. **Düzeltmeler** — meta tek metin (ayraçlar metin içinde) + `EkPlatformMark` nokta; satır eylemleri işaretçili cihazda sağ üstte
   yüzen küçük panel (üzerine gelince/odakta), dokunmatikte hep görünür; ikon kapsülü üste hizalı; matris tam genişlik başlıklı
   blok; parçalı seçimler içerik genişliğinde; anahtarlar uygulama standardı.
3. **Cila** — "Detayları gör" ikincil çerçeveli düğme yerine hayalet bağlantı (liste sakin); kanal · kategori ayracı; tercihler
   ekranı kendi kaydırıcısı (sekme kabı `h-100` verdiğinden pencere kayıyor ve zemin görünüm yüksekliğinde bitiyordu —
   DashboardView emsali). Yük altında e2e yarışı bir GERÇEK hatayı gösterdi: merkez yüklenirken gelen SSE olayı düşürülüyordu →
   bekleyen sinyal yükleme sonunda işlenir.
