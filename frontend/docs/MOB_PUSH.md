# MOB-04 — Web push (önyüz)

Backend ve kanal kuralları: `docs/NOTIFICATION_PLAN.md` §NB9. Bu belge yalnız önyüz davranışını anlatır.

## Nerede

**Ayarlar > Bildirim tercihleri** (`NotificationPreferencesView`):

- Kategori × kanal matrisine **Telefon** sütunu eklenir (kategori başına açık/kapalı). Kilitli (tümü zorunlu) kategoride de
  değiştirilebilir: push uygulama içi/e-postanın tamamlayıcısıdır.
- **Bu cihazda anlık bildirimler** kartı: bu tarayıcıyı abone eder/çıkarır, kayıtlı cihazları listeler ve kaldırır.
- Sütun ve kart **yalnız** sunucu kanalı açıkken (`NotificationService/getPushConfig → enabled`) ve masaüstü kabuğu
  (Electron) dışında görünür. Electron'da `getPushConfig` hiç çağrılmaz.

## Kurallar

| Konu | Davranış |
|---|---|
| İzin | Yalnız **"Bu cihazda aç"** tıklamasıyla (`Notification.requestPermission`). Sayfa açılışında istem yok. |
| iOS / iPadOS | Push yalnız ana ekrana eklenmiş PWA'da (16.4+). Safari sekmesinde: "Paylaş → Ana Ekrana Ekle" açıklaması, aç düğmesi yok. Kurulu ama eski iOS: sürüm açıklaması. |
| İzin reddi | Dürüst açıklama (site ayarlarından izin), tekrar istem yok. |
| Desteklemeyen tarayıcı | "Uygulama içi ve e-posta çalışmaya devam eder" açıklaması. |
| Sunucu reddi | Tarayıcı aboneliği geri alınır (yetim abonelik bırakılmaz); hata kodu kullanıcı diline çevrilir. |
| VAPID değişimi | Eski abonelik anahtarla uyuşmazsa bırakılıp yeniden abone olunur. |
| İçerik | Sunucu yalnız sabit başlık + kısa metin + uygulama içi yol gönderir; kilit ekranında sipariş/müşteri/ürün ayrıntısı yok. |

## Service worker (`public/service-worker.js`)

- `push`: yük `{v:1, title, body, url, tag, severity}`; her push görünür bildirim üretir. Bozuk/bilinmeyen yükte genel metin
  ("Yeni bir bildiriminiz var.") ve bildirim merkezi. Kritik/hata → `renotify`.
- `notificationclick`: yalnız uygulama içi göreli yol (`/` ile başlar; `//`, `\`, denetim karakteri yok) — yoksa
  `/notifications`. Açık uygulama penceresi varsa odaklanıp oraya gider, yoksa yeni pencere açar.
- Önbellek kuralları (MOB-01) değişmedi: API yanıtları önbelleğe alınmaz.

## Tercih sözleşmesi düzeltmesi

`stores/notificationPreferences.ts` artık backend NB4 şeklini konuşur (`matrix`, `instant/digest`, `digest.cadence/hourLocal`,
`quietHours` = `null | {start,end,tz}`). Önceki gövde (`categories`, `frequency/hour`, `quietHours.enabled`) backend'in strict
şemasında 400 alıyordu; eski biçim okunurken savunmacı olarak hâlâ tanınır.

## Testler

- `tests/pwa/web-push.test.ts` — destek tespiti, cihaz adı, VAPID anahtarı, izin yalnız eylemle, abone ol/çık, sunucu reddinde geri alma.
- `tests/pwa/service-worker-push.test.ts` — gerçek SW dosyası VM'de: push gösterimi, bozuk yük, açık yönlendirme koruması, tıklama.
- `tests/notification-preferences.test.ts` — backend sözleşmesi + push sütunu.
- `e2e/specs/mob-04-web-push.spec.ts` (chromium-mobile, sahte `PushManager`/`Notification`) — sütun/kart görünürlüğü,
  izin akışı, istek gövdeleri, iOS sekmesi, Electron, izin reddi, cihaz kaldırma, axe.

## Yerelde gerçek cihazla doğrulanacaklar

1. Android Chrome (kurulu PWA ve sekme): aç → bildirim gelir → dokununca doğru ekran.
2. iPhone (iOS 16.4+): Safari sekmesinde açıklama; ana ekrana ekle → aç → bildirim; kilit ekranında ayrıntı yok.
3. Masaüstü Chrome/Edge/Firefox: aç/kapat; uygulama kapalıyken bildirim; tıklama mevcut pencereyi odaklar.
4. Electron: tercih ekranında Telefon sütunu ve kart yok.
5. Cihazdan uygulama verisini silme / bildirimi sistem ayarından kapatma → sonraki gönderimde 404/410 ve abonelik temizliği.

## Android kabuğu (MOB-07)

Android WebView'de Web Push yoktur. Kabukta (`EntegrasyonikShell/... fcm=1`) aynı kart FCM yolunu kullanır: "Bu cihazda aç" →
Android bildirim izni → FCM belirteci → `subscribePush { fcmToken }`; belirteç yalnız bu cihazda (`ek-native-push-token`) tutulur,
"Bu cihazda kapat" belirteçle siler. FCM'siz derlemede ya da sunucuda FCM kapalıyken kart "desteklenmiyor" der. Bildirime dokunma
yalnız uygulama içi yolu açar (`src/main.ts` → `onNativePushOpen`). Köprü: `packages/ui/src/native/shell.ts`; ayrıntı `docs/MOBILE_ANDROID_BUILD.md`.
