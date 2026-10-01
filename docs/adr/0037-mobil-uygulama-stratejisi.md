# 0037 — Mobil: tek web kod tabanı, PWA + mağazasız Android kabuğu, kullanımda platform boyutu

## Durum
Kabul edildi (2026-10-01). Kod bulutta: `cloud/fe-mobdesk` (MOB-00/01, DESK-00), `cloud/fe-mob2` (MOB-02/03), `cloud/mob-push` (MOB-04), `cloud/bo-mob` (MOB-06), `cloud/mob-android` (MOB-07 + backoffice push), `cloud/mob-usage` (MOB-08).
Kullanıcı kararları: K35, K36, K53, K54, K55. Backlog: MOB-00..08, DESK-00..05.

**İlişkiler:** ADR-0029 (bildirim kanalları — `webpush` eklendi), ADR-0034 (tek önyüz paketi web + backoffice + Electron), ADR-0019 (yeni ekran yok; mevcut yetenekler).

## Bağlam
Kullanıcı Android/iOS'ta native kod yazmadan, bakım maliyetini artırmadan (80/20) uygulamayı ve backoffice'i telefonda istiyor; Android'e kurulabilen, içinde normal siteyi çalıştıran ve kamera/bildirim/paylaş kullanan bir paket. Masaüstü Electron ince kabuk olarak kalır (K36).

## Kararlar

### Mimari
1. **Tek web kod tabanı.** Uygulama ve backoffice aynı Vue derlemesi; native ekran yazılmaz.
2. **PWA önce (uygulama + backoffice ayrı).** Ayrı manifest/kapsam/ad/ikon; service worker yalnız kabuk + statik varlık. **API yanıtları ve tenant verisi cihazda önbelleğe alınmaz** (testle kilitli); çevrimdışında dürüst "bağlantı yok" ekranı. Electron'da service worker kapalı.
3. **Android kabuğu (Capacitor, mağazasız APK).** Tek yapılandırma, iki paket kimliği (uygulama + backoffice); WebView uzak HTTPS adresini yükler, yalnız izinli origin, dış bağlantılar sistem tarayıcısında. Eklentiler yalnız Camera, Push (FCM), Share; web kodunda `isNativePlatform()` köprüsü mevcut soyutlamaların arkasında. İmza anahtarı, keystore ve `google-services.json` yalnız yerelde (git-ignored). Kaynak `frontend/mobile/android-shell/`.
4. **Cihaz yetenekleri web standardıyla.** Kamera: `capture` + istemci tarafı küçültme ve EXIF/konum temizliği, mevcut imzalı yükleme. Barkod: `BarcodeDetector`, yoksa tembel yüklenen hafif okuyucu; yalnız arama. Push: ADR-0029'a `webpush` kanalı; VAPID yalnız env, yoksa kanal kapalı; içerikte hassas veri yok; izin yalnız kullanıcı eylemiyle.
5. **Kullanımda platform boyutu.** İstemci sınıfı tek yardımcıdan (`desktop_web | mobile_web | pwa | android_app | electron | unknown`), `X-Client-Platform` başlığıyla; sunucu izinli listeyle doğrular, UA yalnız yedek. Ham UA/IP saklanmaz (KVKK). Backoffice kullanım ekranlarında masaüstü/mobil kırılımı + filtre.

### İş (business)
1. Mağaza yayını (Google Play / App Store, MOB-05) geliştirici hesabı ve ücret gerektirir → Protokol 12, ayrı onay. iOS'ta App Store 4.2 (salt web sarmalayıcı) riski not edildi.
2. Mobil ayrı ürün/ücret kalemi değildir; tüm planlarda aynı uygulama.
3. Öncelik düşük; ana iş akışlarının önüne geçmez.

## Sonuçlar
- Artı: tek kod tabanı, sıfır native bakım, Android'e hemen kurulum; telefon özellikleri web standardıyla.
- Eksi: iOS'ta push yalnız kurulu PWA'da (16.4+); mağaza görünürlüğü yok; WebView uzak URL'ye bağımlı (çevrimdışı iş yok — bilinçli).

## Gözden geçirme tetikleyicileri
Müşterinin mağazada uygulama istemesi; PWA push/kamera yetersizliği; çevrimdışı çalışma ihtiyacı; Capacitor ana sürüm değişikliği.
