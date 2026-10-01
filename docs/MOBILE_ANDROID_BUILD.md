# MOB-07 — Android kabuğu: yerel derleme, imzalama ve APK kurulumu

Karar: K54 (USER_DECISIONS), BACKLOG MOB-07. Mağaza yayını MOB-05'te kalır (Protokol 12). Bu belge yerel makinede iki APK'nın
nasıl üretilip telefona doğrudan kurulacağını anlatır. Bulut oturumunda Android SDK yoktur: orada yalnız yapılandırma + statik
testler koşar, **APK derlenmez**.

## 1. Ne var

`frontend/mobile/android-shell/` — tek Capacitor 8 projesi, iki Gradle flavor:

| Flavor | Paket kimliği | Ad | Varsayılan adres | Değiştirmek için (derleme anı) |
|---|---|---|---|---|
| `app` | `com.entegrasyonik.app` | Entegrasyonik | `https://app.entegrasyonik.com` | `SHELL_APP_URL` |
| `backoffice` | `com.entegrasyonik.backoffice` | Entegrasyonik Yönetim | `https://admin.entegrasyonik.com` | `SHELL_BACKOFFICE_URL` |

- WebView **uzak HTTPS adresi** yükler: aynı web derlemesi, yayın = web yayını (APK yeniden kurulmaz). `SHELL_MODE=bundled`
  ileride paketli `dist` içindir (API kökü ayrıca yapılandırılmalı; şu an kullanılmıyor).
- Yalnız izinli origin'lerde gezinir (`server.allowNavigation`: flavor'ın kendi host'u). Diğer her bağlantı (yardım, pazaryeri
  paneli, yasal metin vb.) **sistem tarayıcısında** açılır. `http`, karma içerik, WebView hata ayıklama ve Android yedekleme kapalı.
- Eklentiler yalnız `@capacitor/camera`, `@capacitor/push-notifications`, `@capacitor/share`. Native kod yalnız boş
  `MainActivity` (Capacitor iskeleti); izinler `INTERNET` + `CAMERA` (+ push eklentisinin `POST_NOTIFICATIONS`'ı).
- Tek kaynak: `shell.flavors.mjs` (flavor tablosu, izinli origin, adres doğrulama). `npm run sync` her flavor'a kendi
  `android/app/src/<flavor>/assets/capacitor.config.json`'unu yazar; `./gradlew assembleRelease` iki APK'yı birlikte üretir.
- Web kodu kabuğu `window.Capacitor.isNativePlatform()` + User-Agent işaretiyle tanır (`EntegrasyonikShell/<sürüm> (<flavor>; fcm=0|1)`;
  köprü: `frontend/packages/ui/src/native/shell.ts`). Web derlemesine Capacitor npm paketi girmez.
  - **Kamera:** "Fotoğraf çek" (ürün görselleri) kabukta yerel kamerayı açar, çıktı aynı hazırlama hattına (2400 px, EXIF/konum
    temizliği) girer. Barkod okuma WebView'in `getUserMedia`'sıyla çalışır (CAMERA izni).
  - **Push:** Android WebView'de Web Push yoktur → FCM. `google-services.json` ile derlenmiş kabukta (`fcm=1`) "Bu cihazda aç"
    FCM belirteci alır ve sunucuya kaydeder (`subscribePush { fcmToken }`); belirteçsiz derlemede kart "desteklenmiyor" der
    (uygulama içi + e-posta sürer). Bildirime dokunma yalnız uygulama içi göreli yolu açar.
  - **Paylaş:** `shareContent()` (yerel paylaşım sayfası → Web Share). Uygulamada bugün paylaş düğmesi yok; köprü hazır, ilk
    kullanan ekran bunu çağırır (yeni ekran eklenmedi).

## 2. Gerekenler (bir kez)

1. **JDK 21** (Temurin/Microsoft OpenJDK). `java -version` → 21.x. `JAVA_HOME` ayarlı olmalı.
2. **Android SDK** — Android Studio (önerilir) ya da yalnız komut satırı araçları:
   - SDK Platform **36**, Build-Tools 36.x, Platform-Tools (adb).
   - Windows: `ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk`; PATH'e `%ANDROID_HOME%\platform-tools`.
   - Alternatif: `frontend/mobile/android-shell/android/local.properties` içine `sdk.dir=...` (git-ignored).
3. **Node 22+** (Capacitor 8).
4. Bağımlılıklar: `cd frontend/mobile/android-shell && npm ci` (yalnız MIT/ISC/Apache/BlueOak/0BSD/Unlicense lisanslı; `npm audit` 0 —
   CLI'nin iOS bağımlılığındaki `uuid` `overrides` ile 11.1.1'e sabitlendi).

## 3. İmzalama anahtarı (YALNIZ yerelde, bir kez)

Doğrudan kurulum için APK imzalı olmalıdır. Anahtar ve parolalar **asla** commit'lenmez (`.gitignore` + statik test korur).

```bash
cd frontend/mobile/android-shell/android
keytool -genkeypair -v -keystore entegrasyonik-release.jks -alias entegrasyonik -keyalg RSA -keysize 4096 -validity 10000
copy keystore.properties.example keystore.properties   # macOS/Linux: cp
# keystore.properties içine gerçek parolaları yazın (storeFile android/ klasörüne görelidir)
```

- Aynı anahtarla imzalanmayan sürüm, kurulu uygulamanın üstüne **kurulamaz** (önce kaldırmak gerekir → oturum/izinler gider).
  `.jks` dosyasını ve parolaları parola yöneticisinde yedekleyin. Anahtar kaybı = tüm kullanıcılar yeniden kurar.
- `keystore.properties` yoksa `assembleRelease` imzasız APK üretir (kurulamaz); deneme için `assembleDebug` yeterlidir.

## 4. FCM (isteğe bağlı; anlık bildirim için)

1. Firebase konsolunda proje oluşturun (Protokol 12: hesap/proje insan kararı). Projeye iki Android uygulaması ekleyin:
   `com.entegrasyonik.app` ve `com.entegrasyonik.backoffice`.
2. İndirilen tek `google-services.json`'ı (iki istemciyi de içerir) **`frontend/mobile/android-shell/android/app/google-services.json`**
   konumuna koyun. Dosya git-ignored'dır; commit'lenmez. Yoksa kabuk FCM'siz derlenir (`fcm=0`, push kartı "desteklenmiyor").
3. Sunucu: Firebase → Proje ayarları → Hizmet hesapları → yeni özel anahtar (JSON). İçeriği **yalnız** `backend/.env`'e:
   `FCM_SERVICE_ACCOUNT_JSON=<tek satır JSON ya da base64>` (SIR). `NOTIFY_V2_ENABLED=true` gerekir. Yerelde egress guard için
   `EGRESS_ALLOW_WEBPUSH=1 npm run start:local` (fcm.googleapis.com + oauth2.googleapis.com açılır).
4. Abonelik koleksiyonu göçü `0020-push-subscriptions-app` yedek doğrulandıktan sonra çalıştırılmış olmalı (CLAUDE.md kural 3;
   `docs/NOTIFICATION_PLAN.md` NB9).

## 5. Derleme

```bash
cd frontend/mobile/android-shell
npm ci
npm run sync                      # cap sync android + iki flavor yapılandırması
# staging için örnek (PowerShell):  $env:SHELL_APP_URL="https://staging.entegrasyonik.com"; npm run sync
cd android
./gradlew assembleRelease         # Windows: gradlew.bat assembleRelease
# sürüm numarası web sürümüyle aynı (MOB-05 kuralı):
./gradlew assembleRelease -PshellVersionCode=12 -PshellVersionName=1.12.0
```

Çıktılar:
- `android/app/build/outputs/apk/app/release/app-app-release.apk`
- `android/app/build/outputs/apk/backoffice/release/app-backoffice-release.apk`

Tek flavor: `./gradlew assembleAppRelease` ya da `./gradlew assembleBackofficeRelease`. Hızlı deneme: `./gradlew installAppDebug`
(USB ile bağlı telefona doğrudan kurar).

Simge: şu an Capacitor varsayılan simgesi (iki flavor aynı). Ayrı simge için `android/app/src/<flavor>/res/mipmap-*` altına
flavor simgeleri konur (ör. `npx @capacitor/assets generate` çıktısı; backoffice için PWA'daki amber kalkan rozeti). Yalnız kaynak dosyası, kod değil.

## 6. Telefona kurulum (mağazasız)

- **USB:** telefonda Geliştirici seçenekleri → USB hata ayıklama açık → `adb install -r app-app-release.apk`
  (`-r`: aynı imzayla güncelleme, veriler korunur).
- **Dosya ile:** APK'yı telefona gönderin (Drive/e-posta/USB) → dosyaya dokunun → "Bilinmeyen uygulamaları yükle" iznini
  o uygulama (Dosyalar/Chrome) için açın → Yükle. Play Protect uyarısı çıkabilir ("Yine de yükle"): mağaza dışı imzalı APK için olağandır.
- Güncelleme: aynı anahtarla imzalı yeni APK'yı aynı yolla kurun. Web tarafı değişiklikleri için APK güncellemesi GEREKMEZ (uzak adres).

## 7. Cihazda doğrulama listesi

Her iki APK için (Android 10+ bir telefon, mümkünse bir de Android 13+):
1. Açılış → giriş ekranı; giriş (uygulama: e-posta/parola; backoffice: parola + TOTP) → oturum kalıcı (uygulamayı kapat/aç).
2. Dış bağlantı (ör. yardım/yasal metin/pazaryeri paneli) **sistem tarayıcısında** açılır; uygulama içinde kalmaz.
3. Uçak kipinde aç → "Bağlantı kurulamadı" ekranı → bağlantı gelince "Yeniden dene" ile döner.
4. Uygulama: Ürün → Görseller → "Fotoğraf çek" → yerel kamera → fotoğraf yüklenir; dosya EXIF/konum içermez (MOB-02 denetimi).
   Barkod okuma (ürün/sipariş arama) kamera iznini ister ve okur.
5. Push (FCM'li derleme + sunucuda `FCM_SERVICE_ACCOUNT_JSON`):
   - Uygulama: Ayarlar → Bildirim tercihleri → "Bu cihazda aç" → Android izni (13+) → cihaz listesinde "Android · Uygulama".
   - Backoffice: Platform uyarıları → "Kritik uyarılar bu cihazda" → "Bu cihazda aç" → "Android · Yönetim".
   - Uygulamayı kapatın; bir test bildirimi/kritik dikkat maddesi üretin → bildirim gelir, kilit ekranında ayrıntı yok →
     dokununca doğru ekran açılır.
   - Android ayarlarından bildirimi kapatıp tekrar deneyin → izin reddi açıklaması; uygulamayı kaldırınca sonraki gönderimde
     FCM 404 → abonelik sunucuda silinir.
6. FCM'siz derlemede push kartı "desteklenmiyor" der, uygulama çökmez.

## 8. Bilinen sınırlar / sonraki adımlar

- **CSP:** Capacitor köprüsü uzak sayfaya satır içi `<script>` olarak enjekte edilir. Bugün CSP `Report-Only` olduğundan sorun yok;
  CSP zorlamaya geçtiğinde kabukta köprü engellenir (kod web yoluna düşer: kamera `capture` girdisi, push "desteklenmiyor").
  Zorlamadan önce karar gerekir (ör. kabuk için ayrı CSP ya da köprü betiği karması).
- **Dosya indirme:** WebView varsayılan olarak indirme yapmaz (dışa aktarma/PDF). Kabukta indirme gereken ekranlar için ayrı iş.
- **Mağaza:** Play/App Store yayını, iOS kabuğu ve imza/sürüm otomasyonu MOB-05 (Protokol 12).
