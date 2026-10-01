# MOB-06 (kalan: backoffice push) + MOB-07 (Android kabuğu) — bulut raporu

Dal `cloud/mob-android` (taban `origin/cloud/mob-push` @ `be26465f` + `origin/cloud/bo-mob` @ `42422444` birleştirildi; çakışma yok).
Kararlar: K35, K36, K54 (`docs/adr/USER_DECISIONS.md`), BACKLOG MOB-04..07. Kök `BACKLOG.md` bulut yazılabilir yollarının dışında
olduğundan güncellenmedi — önerilen durum satırları §5'te.

## 1. Yapılanlar

### MOB-06 kalan — backoffice web push (yalnız kritik dikkat maddeleri)
- **Abonelik:** `BackofficePrefsService/{getPushConfig,subscribePush,unsubscribePush}` (yetenekler `platform.prefs.push_*`, `platformAdmin`,
  MCP dışı, step-up yok — kişisel tercih). MOB-04 koleksiyonu ve kuralları aynen: `PushSubscriptions`, `tid = 0` (platform) + `userId =`
  yönetici; SSRF uç listesi, şifreli saklama, cihaz sınırı. Yeni koleksiyon/göç yok. Sözleşme: `docs/API_BACKOFFICE_ATTENTION.md` BE-07.
- **Kaynak:** `notifications.platform-attention-push` (worker, 2 dk) — `getAttention` ile aynı kaynaklar (`productionAttentionSources`),
  yalnız `severity:'critical'`. Yeni madde ya da 6 sa'tir süren madde bildirim üretir; çözülüp yeniden kritikleşen tekrar bildirilir.
  Kanal kapalıyken DB'ye dokunmaz; abone yönetici yoksa dikkat hesaplanmaz. Gönderim anında alıcı DB'den taze denetlenir
  (`isGlobalAdmin===true`, `isActive!==false`; değilse abonelik silinir). İçerik sabit madde başlıkları (tenant adı/`subjects` yok), `url:'/'`.
- **Backoffice önyüz:** `src/pwa/webPush.ts` + `PushCard.vue` (Platform uyarıları ekranında "Kritik uyarılar bu cihazda" kartı; izin yalnız
  "Bu cihazda aç" ile; kanal kapalıysa kart gizli; iOS sekmesinde kurulum açıklaması; sunucu reddinde tarayıcı aboneliği geri alınır).
  SW `push`/`notificationclick` (yalnız panel içi göreli yol, açık panel penceresine odak). Sahte API + sözleşme tipleri.

### MOB-07 — Android kabuğu (mağazasız APK)
- `frontend/mobile/android-shell/`: Capacitor 8.5, tek yapılandırma (`shell.flavors.mjs` + `capacitor.config.ts`), Gradle flavor'ları
  `com.entegrasyonik.app` / `com.entegrasyonik.backoffice`. Uzak HTTPS adresi (env ile staging; `SHELL_MODE=bundled` ileride paketli dist),
  yalnız izinli origin, diğer bağlantılar sistem tarayıcısında; `http`/karma içerik/WebView hata ayıklama/yedekleme kapalı; çevrimdışı hata sayfası.
- Eklentiler yalnız Camera, PushNotifications, Share. Native kod: boş `MainActivity`. İzinler `INTERNET` + `CAMERA`.
- İmzalama yalnız yerelde (`android/keystore.properties.example`; `.jks`/`keystore.properties`/`google-services.json` git-ignored).
- **Web köprüsü** `@entegrasyonik/ui/native` (`packages/ui/src/native/shell.ts`): web derlemesine Capacitor npm paketi girmez; kabuğun
  enjekte ettiği `window.Capacitor.isNativePlatform()` + UA işareti `EntegrasyonikShell/<s> (<flavor>; fcm=0|1)`.
  - Kamera: ürün görsellerinde "Fotoğraf çek" kabukta yerel kamera → aynı `photoPrep` hattı.
  - Push: kabukta FCM belirteci (app `src/pwa/webPush.ts` + `PushDeviceCard`, backoffice `webPush.ts` + `PushCard`); FCM'siz derlemede
    "desteklenmiyor"; bildirime dokunma yalnız uygulama içi yol (`main.ts` → `onNativePushOpen`, iki uygulama).
  - Paylaş: `shareContent()` hazır (uygulamada bugün paylaş düğmesi yok; yeni ekran eklenmedi).
- **Backend FCM kanalı:** Android WebView'de Web Push olmadığından kabukta bildirimin tek yolu FCM. `fcm.ts` (FCM HTTP v1, OAuth2 JWT-bearer),
  aynı koleksiyon/dağıtıcılar; `subscribePush { fcmToken }`; `FCM_SERVICE_ACCOUNT_JSON` yalnız env (yoksa kapalı). Ayrıntı NOTIFICATION_PLAN.
- Belge: `docs/MOBILE_ANDROID_BUILD.md` (JDK 21, Android SDK 36, `npm run sync`, `./gradlew assembleRelease`, imzalama, FCM, kurulum, cihaz listesi).

### Yan düzeltmeler (tabanda kırmızıydı)
- `backoffice/tests/p2-states.test.ts`: backend'e eklenen `BackofficeEngineService/retryJobs` step-up ucu "bilinçli kullanılmayan" listesine.
- `frontend/tests/integration-compliance-api.test.ts`: backend `api/services → api/rpc/handlers` taşınmasından kalan eski yol.

## 2. Testler (bulut)

| Kapı | Sonuç |
|---|---|
| backend `typecheck` | 0 hata |
| backend `lint` | 0 hata (uyarılar tabanla aynı) |
| backend `depcruise` | 0 hata, 3 uyarı (tabanda aynı döngüler) |
| backend `jest` (tam) | 7281 geçti / 329 kaldı (26 paket) — kalan paketlerin TAMAMI tabanda da kırmızı (aynı ortamda karşılaştırıldı; yeni kırmızı yok) |
| backend `ratchet` | çalıştırılamadı: `knip` JSON çıktısı boş (bulut ortamı); tabanda da aynı hata |
| backend yeni testler | `platformAttentionPush.test.ts` (12), `fcmPush.test.ts` (7), `webPush*`/`egress-guard`/`schedules`/parite güncel — yeşil |
| frontend vitest | 1652/1652 (token CSS üretildikten sonra; `npm run tokens` git-ignored çıktı üretir) |
| backoffice vitest | 145/145 |
| `packages/ui` vitest | 33/33 (köprü testleri dahil) |
| vue-tsc (frontend + backoffice) | 0 hata; frontend typecheck/style/pattern/no-console mandalları korundu |
| `npm run build` (frontend + backoffice) | başarılı (önce `npm run tokens`) |
| Kabuk statik testleri (`npm test`, node --test) | 9/9 — izinli origin, eklenti listesi, sırların git dışı, flavor kimlikleri, native kod/izinler |
| Lisans / audit | kabuk: MIT/ISC/Apache-2.0/BlueOak/0BSD/Unlicense, `npm audit` 0 (`uuid` override); frontend/backend yeni bağımlılık yok |
| Android derleme | **YAPILMADI** — bulutta Android SDK yok, Google Maven 403 |

Tabanda da kırmızı olan backend paketleri (bu dalın değil): `tests/mongo-semantics/**` (mongodb-memory-server ikilisi indirilemiyor),
`operation-policy` FE envanteri, `integrationPlaybook.static`, `NoRawRegex`, `errorCodes.docs`, `oauth/flow`, `N11.internalOrderSnapshot`.

## 3. Yerelde yapılacaklar

1. **Derleme:** `docs/MOBILE_ANDROID_BUILD.md` §2–§5 (JDK 21 + Android SDK 36 → `cd frontend/mobile/android-shell && npm ci && npm run sync`
   → `cd android && ./gradlew assembleRelease`). İlk derlemede Gradle sözdizimi/AGP uyumu ilk kez doğrulanır (bulutta yapılamadı).
2. **İmzalama:** §3 `keytool` + `keystore.properties` (yalnız yerel; yedekleyin).
3. **FCM (isteğe bağlı):** §4 — Firebase projesi (Protokol 12), iki Android uygulaması, `google-services.json` yerelde, `FCM_SERVICE_ACCOUNT_JSON` `.env`'de.
4. **Göç:** web push/FCM kanalını açmadan önce `0020-push-subscriptions-app` (yedek doğrulandıktan sonra; CLAUDE.md kural 3).
5. **Cihazda doğrulama:** §7 listesi (giriş, dış bağlantı sistem tarayıcısında, çevrimdışı ekranı, kamera + EXIF, barkod, push aç/kapat,
   kilit ekranında ayrıntı yok, dokununca doğru ekran, FCM'siz derlemede çökme yok). Backoffice web push: masaüstü/Android Chrome'da
   Platform uyarıları kartından aç → kritik bir dikkat maddesi (ör. Redis durdur → "Kuyruk okunamıyor") 2 dk içinde bildirim olarak gelmeli.

## 4. Bilinen sınırlar
- CSP zorlamaya geçince Capacitor köprüsünün satır içi betiği engellenir (bugün `Report-Only`); karar gerekir (MOBILE_ANDROID_BUILD §8).
- WebView'de dosya indirme (dışa aktarma/PDF) yok — ayrı iş.
- Backoffice push tekrar durumu süreç belleğinde: birden çok worker podunda aynı bildirim çoğalabilir (cihazda `tag` yerine geçer).
- İki flavor şimdilik aynı varsayılan simgeyi kullanır (kaynak dosyası eklenerek değişir).

## 5. BACKLOG önerisi (kök dosya yerelde güncellenir)
- MOB-06: "backoffice push yapıldı (bulut `cloud/mob-android`; kanal env ile kapalı) — gerçek cihaz doğrulaması yerelde".
- MOB-07: "kabuk + köprü + FCM kanalı yapıldı (bulut); APK derleme/imzalama/cihaz doğrulaması yerelde (MOBILE_ANDROID_BUILD.md)".
