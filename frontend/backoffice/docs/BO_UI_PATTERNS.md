# Backoffice UI desenleri (BO-P1) — yeni ekran yazanlar için tek referans

Kaynak dal: `cloud/bo-p1`. Bu belge **bağlayıcıdır**: `cloud/bo-p2` ve sonraki ekranlar bu kabuk, kayıt ve desenleri
kullanır; kopya kabuk/başlık/tablo/diyalog açılmaz. Görsel dil: premium ama sakin operasyon konsolu (Stripe/Linear
seviyesi) — bilgi yoğun, renk yalnız anlam taşıdığında, hareket 150–300 ms ve yalnız opaklık/renk.

**Önce ilkeler:** `elev/CONSOLE_IDENTITY.md` (konsolun ruhu, yap/yapma, kontrol listesi) bu belgenin üst katmanıdır.

Hızlı özet — yeni ekran = **(1) kayıtta bir satır + (2) `BoPageHeader` + (3) her bölümde `BoPanelState` + (4) tehlikeli
işlemde `DangerActionDialog` + (5) `.bo-table` / `EkRelativeTime` / `EkCopyButton`**.

---

## 1. Kabuk ve bilgi mimarisi

### 1.1 Tek ekran kaydı — `src/navigation/screens.ts`
Menü, rotalar, breadcrumb, sayfa başlığı/açıklaması ve komut paleti **yalnız** bu dosyadan beslenir. `router.ts` ve
`ShellLayout.vue` ekran eklemek için **değişmez** (çakışma yüzeyi tek dosya).

Bölüm → grup → ekran:

| Bölüm | Grup | Ekranlar (yol) | Durum (BO-P1) |
|---|---|---|---|
| — | Genel bakış | `overview` `/genel-bakis` | hazır |
| — | Otopilot (bo-next) | `otopilot` `/otopilot` (tam sayfa; yan panel kabukta) | hazır |
| Müşteri ve gelir | Müşteriler | `tenants` `/musteriler` · `lifecycle` `/musteriler/yasam-dongusu` · `support` `/musteriler/destek` | hazır · yakında · yakında |
| | Abonelikler | `subscriptions` `/abonelikler` | yakında |
| Platform | Motor ve kuyruklar | `engine` `/motor` | yakında |
| | Entegrasyonlar | `integrations` `/entegrasyonlar` | yakında |
| | Altyapı | `infra` `/altyapi` (Redis ve MongoDB) · `cache` `/altyapi/onbellek` | yakında |
| Gözlem | Loglar ve sorunlar | `logs` `/loglar` | taslak |
| | Denetim | `audit` `/denetim` | hazır |
| Yönetişim | Yöneticiler | `admins` `/yoneticiler` | yakında |
| | Sistem ayarları | `flags` `/sistem/bayraklar` · `otopilot-settings` `/sistem/otopilot` (platform yapay zekâ anahtarı) | hazır |
| | Bildirimler ve duyurular (bo-next) | `announcements` `/sistem/duyurular` (yol korundu) · `deliveries` `/bildirimler/teslimler` · `tenant-notifications` `/bildirimler/musteri-gecmisi` · `notification-catalog` `/bildirimler/katalog` · `alerts` `/bildirimler/uyarilar` | hazır |

**Planlı ekranı hazır yapmak (bo-p2):**
```ts
// screens.ts — ilgili planned({...}) girdisini düz nesneye çevirin:
{ key: 'engine', label: 'Motor ve kuyruklar', lede: '…tek cümle…', icon: 'mdi-cog-transfer-outline', group: 'engine',
  status: 'ready',                      // uçlar taslak/sahte ise 'draft' (menüde "Taslak")
  path: '/motor',                       // YOL DEĞİŞMEZ
  keywords: ['bullmq', 'kuyruk'],       // komut paleti
  view: () => import('../views/EngineView.vue') }
```
- Grupta birden fazla ekran varsa menüde açılır grup olur; tek ekranlıysa yaprak. Yeni ekran uygun **mevcut gruba**
  eklenir; yeni grup yalnız bilgi mimarisi kararıyla (bu belge güncellenerek) açılır.
- Detay sayfaları (menüde yok, breadcrumb'da ebeveyn): `DETAIL_ROUTES`'a `{ name, path, parent, title, view }`.
- `lede` = sayfa başlığının altındaki **tek cümle**: ekranın ne işe yaradığı (Türkçe, sade; teknik terim gerekiyorsa
  parantez içinde kısa açıklama).
- Yakında durumu: `status: 'planned'` + `plan: { items, endpoints }` → `PlannedView` o yolda premium "yakında" durumu
  gösterir (kapsam, ilgili hazır ekranlara bağlantı, teknik ayrıntı katlanır). Menüde soluk etiket + `YAKINDA` rozeti.

### 1.2 Üst bar
Sol: menü · marka + "Yönetim" · **ortam rozeti**. Orta: komut paleti tetikleyicisi. Sağ: **adım-yükseltmesi
göstergesi** · tema · kullanıcı menüsü.
- Ortam rozeti (`VITE_ADMIN_ENV`; dev'de `?env=staging|production` ile önizlenir): `Örnek veri` (sahte API, mavi ikon) ·
  `Yerel` (nötr) · `Staging` (**dolu sarı** + barın üstünde sarı şerit) · `ÜRETİM` (**dolu kırmızı**, büyük harf +
  kırmızı şerit). Rozet ekran okuyucuya ortam açıklamasıyla okunur.
- Adım-yükseltmesi göstergesi (`StepUpIndicator`): son 5 dk içinde parola+kod doğrulandıysa yeşil `Doğrulandı · 4:12`
  (geri sayım); değilse `Hassas işlemler kilitli`. Menüsünden **Şimdi doğrula** (işlem ortasında kesilmemek için).

### 1.3 Menü
`EkSidebarNav` (ortak paket). Etkin ekran: zemin + solda 3 px gösterge. Planlı ekran: soluk etiket + `YAKINDA` (label
rozeti), tıklanabilir. Taslak: `TASLAK` (info). Menü altında "Hızlı geçiş Ctrl K" ipucu. < 960 px: geçici çekmece.

### 1.4 Komut paleti (Ctrl+K / ⌘K, metin alanı dışında `/`)
Kaynaklar: kayıttaki tüm ekranlar (`label`, grup, `lede`, `keywords` üzerinde Türkçe duyarsız arama), hızlı geçişler
(`102` / `#102` → müşteri detayı; istek kimliği → `/loglar?reqId=` ve `/denetim?reqId=`), eylemler (tema, kimliği
doğrula, çıkış). Yeni ekranın palette görünmesi için ek iş gerekmez — kayıttaki `keywords` yeter.

## 2. Sayfa başlığı deseni — `components/shell/BoPageHeader.vue`
```vue
<div class="bo-page">
  <BoPageHeader :updated-at="loadedAt">
    <template #meta>…kısa not (isteğe bağlı)…</template>
    <template #actions>…filtre segmenti… <EkButton tone="secondary" icon="mdi-refresh" :loading="loading" @click="load">Yenile</EkButton></template>
  </BoPageHeader>
  …bölümler…
</div>
```
- Sıra: breadcrumb (grup çok ekranlıysa ya da detay sayfasıysa) → **h1** + durum rozeti (kayıttan) → tek cümle açıklama
  → meta satırı (`Güncellendi 2 dk önce` — `updatedAt` verin) ; sağda eylemler. **Yenile her zaman en sağda.**
- Detay sayfası: `:title="kayıt.adı" lede="" :extra-crumbs="[{ label: kayıt.adı }]"`; kimlik meta satırında
  kopyalanabilir (`EkCopyButton`); birincil eylem sağda.
- Sayfada tek h1; kart başlıkları h2/h3 (`EkCard :heading-level`).

## 3. Yoğun veri tabloları — `.bo-table` (styles/backoffice.css)
```html
<div class="bo-table-wrap" tabindex="0" role="region" aria-label="Başarısız işler tablosu" style="--bo-table-max-h: 70vh">
  <table class="bo-table" data-density="compact">
    <caption class="ek-sr-only">…</caption>
    <thead><tr><th scope="col">Kuyruk</th><th scope="col" class="is-num">Bekleyen</th></tr></thead>
    <tbody><tr class="is-link" @click="open(r, $event)"><th scope="row"><RouterLink :to="…">{{ r.ad }}</RouterLink></th>…<td class="is-num ek-num">…</td></tr></tbody>
  </table>
</div>
<p class="bo-table-foot">12 / 40 kayıt · kaynak: BackofficeEngineService/listFailedJobs</p>
```
- Kaydırılabilir kap klavyeyle odaklanır (`tabindex="0"` + `role="region"` + `aria-label`; axe `scrollable-region-focusable`).
- Başlık yapışkan; satır 44 px (`compact` 36 px — 20+ satırlık operasyon listeleri compact).
- Sayılar sağa hizalı + tabular (`is-num ek-num`); kimlikler mono (`is-id`) + `EkCopyButton`; zamanlar `EkRelativeTime`.
- Tıklanabilir satır: fareyle satırın tamamı, klavyeyle satırdaki **birincil bağlantı** (tek sekme durağı; satıra ayrıca
  `tabindex` verilmez). `open()` tıklama bir `a`/`button` üstündeyse ya da metin seçiliyse satırı açmaz (örnek:
  `TenantsView.vue`). Birincil bağlantısı olmayan satırda `tabindex="0"` + Enter.
- Filtre çubuğu `.bo-toolbar`; tek seçimli filtreler `.bo-seg` (radiogroup), sayaçlı (`.bo-seg__count`).
- Mobilde ikincil sütunlar `bo-hide-sm` ile gizlenir.
- Mobilde (< 768 px) tablo yatay kayar; 3'ten fazla sütunlu ana listeler için kart satır görünümü tercih edilir.
- Mevcut `EkDataTable` (ortak paket) de kullanılabilir; aynı kurallar (sayı hizası, rozet standardı) geçerlidir.

## 4. Durumlar: yükleniyor / boş / hata / kısmi bozulma — `components/shell/BoPanelState.vue`
Her veri bölümü dört durumu **ayrı ayrı** çizer; bir bölümün hatası sayfayı düşürmez.
```vue
<EkCard title="Kuyruklar">
  <BoPanelState v-if="state !== 'ready'" :state="state" skeleton="table" :error="error"
    :degraded-reason="section?.error" empty-title="Başarısız iş yok" empty-text="Son 500 başarısız iş tutulur." @retry="load" />
  <div v-else>…</div>
</EkCard>
```
| Durum | Görünüm | Metin kuralı |
|---|---|---|
| `loading` | içerik biçiminde iskelet (`skeleton` + `rows`) — yerleşim kaymaz | — |
| `empty` | sakin ikon + başlık + neden boş/ne yapılabilir | "Başarısız iş yok" + bağlam |
| `error` | `EkProblemState` (kırmızı) + Tekrar dene + istek kimliği (Teknik ayrıntı) | "<ne oldu> — <ne yapılmalı>", ham hata yok |
| `degraded` | `EkProblemState` (sarı) — bölüm okunamadı, diğerleri güncel + Tekrar dene | `getHealth` bölümü `{status:'degraded', error:'timeout'|'error'}` → `degraded-reason` |

Uzun iş (kaydetme/aktarma) sürerken içerik üstüne `EkLoadingOverlay` (kartsız marka yükleyici, 150 ms gecikmeli);
uygulama/oturum açılışında `EkBootScreen` (ortak paket, iki uygulamada aynı; 200 ms gecikmeli — hızlı açılışta görünmez).

## 5. Durum rozetleri — tek standart
- Varlık durumu: `EkStatusChip` (`tone`: success/warning/danger/info/neutral, `dot`). Etiket ve ton eşlemesi
  **yalnız** `src/utils/labels.ts`'te (ör. `LIFECYCLE`, `ISSUE_STATUS`, `LEVEL`); ekranda satır içi eşleme yazılmaz.
- Sağlık: `ok` → success "Sağlıklı" · `degraded` → warning "Kısmi bozulma" · `fail` → danger "Erişilemiyor" ·
  `unknown` → neutral "Bilinmiyor" (`HEALTH` eşlemesi). Ekran durumu (hazır/taslak/yakında) `STATUS_BADGE`.
- Renk tek başına anlam taşımaz: rozet metni + (gerekirse) ikon.

## 6. Tehlikeli / hassas işlem UX'i — `components/shell/DangerActionDialog.vue`
Step-up + gerekçe gerektiren **her** işlem (geçici erişim, iş yeniden dene/at, kira bırak, plan değiştir, bayrak yayın/
geri al, yönetici ekle/kaldır, önbellek boşalt) bu tek diyalogla onaylanır. Diyalog dört soruyu aynı sırayla yanıtlar:
**Ne olacak · Geri alınabilir mi · Etkilenen (müşteri ya da kapsam) · Kimlik doğrulama durumu**, ardından gerekçe
(≥ 10, ≤ 500 karakter; denetime `meta.reason`).
```vue
<DangerActionDialog v-model="open" title="İşi at" icon="mdi-delete-outline" destructive
  action="Başarısız iş kuyruktan kalıcı olarak silinir." :reversible="false"
  scope="Sipariş kuyruğu · fetch-42 · Mağaza #7" confirm-label="Gerekçeyle at"
  :busy="busy" :error="error" @confirm="(reason) => discard(reason)" />
```
- `destructive` → kırmızı ton (silme/atma/iptal); hassas ama yıkıcı olmayan (geçici erişim, yeniden dene) → varsayılan.
- Step-up: istemci `401 REAUTH_REQUIRED`'ı yakalar, parola+kod diyaloğunu açar, isteği **bir kez** yeniler; ekran ek
  bir şey yapmaz. Vazgeçilirse `AdminApiError.cancelled` → "Kimlik doğrulanmadığı için işlem yapılmadı."
- Başarı: `notifyAudited('…yapıldı.', () => router.push({ path: '/denetim', query: { tid, event } }))` → toast +
  **Denetim kaydını aç** bağlantısı. Hata: diyalog açık kalır, `error` metni alanın altında.
- `/denetim` şu sorgu parametrelerini okur: `tid`, `event`, `reqId`, `surface`, `range`.

## 7. Zaman, kimlik, kopyalama (ortak paket)
- `EkRelativeTime :value` → "3 dk önce"; ipucu ve ekran okuyucu mutlak zaman ("30.09.2026 21:15"); dakikada bir tazelenir.
- `EkCopyButton :value label="İstek kimliği"` → "İstek kimliği kopyala"; başarıda onay ikonu + `aria-live`.
- Kimlikler (tid, reqId/correlationId, jobId) mono + kopyala; istek kimliği varsa iz görünümüne bağlantı (`TraceDialog`).

## 8. Tipografi, yoğunluk, tema
- Gövde `--ek-type-body-*`, tablo `--ek-type-table-*`, mikro etiket (tablo başlığı, bölüm etiketi) `--ek-type-micro-*`
  büyük harf. Metrik rakam `--ek-type-metric-*` + `ek-num`.
- Ham renk/px renk yasak (statik test); yalnız `--ek-*` token. Açık/koyu tema aynı token setiyle; her ekran iki temada
  axe 0 ihlal.
- Hareket: yalnız `--ek-duration-*` + `--ek-easing-*`; `prefers-reduced-motion`'da animasyon yok.

## 9. Klavye ve erişilebilirlik
- İlk sekme durağı "İçeriğe geç". Ctrl+K palet, `/` palet (metin alanı dışında), Esc diyalog/palet kapatır.
- Yalnız ikonlu düğmelerde `aria-label` zorunlu (ipucu yerine geçmez). Satır/kart tıklanabilirse klavyeyle de açılır.
- Canlı bölgeler: toast (`EkToastHost`), kopyala onayı, palet sonuç sayısı.

## 10. İçerik dili
Türkçe, net, profesyonel; "siz" dili. Etiket kısa isim ("Bekleyen iş"), açıklama tek cümle. Teknik terim gerekiyorsa
kısa açıklamayla: "p95 (isteklerin %95'i bu sürenin altında)", "DLQ (elle inceleme bekleyen işler)". Hata:
"<ne oldu> — <ne yapılmalı>". Sahte/taslak veri her zaman görünür biçimde belirtilir.

---

## Ek — bo-p2 (Aşama 4 ekranları) yapı taşları
Bu ek bo-p1 desenlerinin ÜZERİNE kuruludur; çelişki yoksa yukarıdaki kurallar geçerlidir.

| Yapı taşı | Yer | Ne zaman |
|---|---|---|
| `useResource(fetcher)` | `src/composables/useResource.ts` | Tek okuma (pano, detay). Durum: loading → ready / error / degraded (503) / notFound (404); yenilemede veri korunur (`refreshing`), hatada son iyi veri kalır (`stale`). |
| `useCursorList(fetchPage)` | `src/composables/useCursorList.ts` | İmleçli liste. İlk istek imleçsiz; `nextCursor` aynı filtrelerle geri gönderilir; filtre değişince `reload()`; eski yanıt yok sayılır. "Daha fazla" hatası listeyi silmez. `BoPagination` bileşeniyle (R2; eski `LoadMore` kaldırıldı). |
| `useGuardedAction(run, onDone)` + `GuardedDialog` | `src/composables/useGuardedAction.ts`, `src/components/kit/GuardedDialog.vue` | Step-up + gerekçe isteyen HER yazma. `GuardedDialog` = `DangerActionDialog` (items[0] → "Ne olacak", kalanlar ayrıntı; `danger` → yıkıcı; `irreversible`/`reversible` açıkça). Varsayılan slot: işleme özgü alan (gün, plan, e-posta). |
| `StateBlock` | `src/components/kit/StateBlock.vue` | Panel gövdesinin dört durumu; hata metni `describeError` ile koda özgü eylem taşır (504 → "daha dar aralık", 423 → "salt-okuma kapanınca", 409 → "listeyi yenileyin"). `BoPanelState` ile aynı görsel dil (EkProblemState). |
| `describeError` | `src/utils/errors.ts` | Sunucu iletisi + koda göre eylem: "<ne oldu> — <ne yapılmalı>". Ham istisna asla. |
| `MeterList`, `SeriesBars` | `src/components/kit/` | Sade, erişilebilir grafik: oran çubukları (değer metin olarak) ve yığılmış zaman serisi ("Tablo olarak göster"). |
| `useTabQuery` | `src/composables/useTabQuery.ts` | Sekme ↔ `?sekme=`; paylaşılan bağlantı aynı sekmeyi açar. |
| `units.ts`, `codes.ts` | `src/utils/` | Yüzde/kuruş/bayt/süre/yaklaşık ms biçimi; hata kodu → ERROR_CODES.md iletisi + ton. |
| `kit.css` | `src/styles/kit.css` | `bo-panel*`, `bo-toolbar*`, `bo-kv`, `bo-code`, `bo-cell-stack`, `bo-approx` ("yaklaşık" etiketi), `bo-grid-2/3`. |

**Paket ve kabuk dokunuşları (ekleyici):** `@entegrasyonik/ui` → `EkReasonDialog` (sunumsal gerekçe diyaloğu; backoffice'te artık `DangerActionDialog` kullanılır, paket bileşeni diğer yüzeyler için duruyor). `DangerActionDialog` → varsayılan slot + `blocked` prop'u (ek alan geçersizken onay kapalı). Davranış değişmedi.

**Sahte API test kolları** (tarayıcı konsolu / e2e): `__boMock.setDegraded(true)` (Redis düşük → kuyruk/dayanıklılık/Redis 503; B7a `available:false`), `setLiveReadonly(true)` (retryJob/cancelSubscription/changePlan 423), `setFeatureFlags(true)` (örnek bayraklar), `failOps('<Servis>/')` (500), `expireReauth()` (sonraki hassas işlemde step-up). Sahte durum sayfa yenilemesinde sıfırlanır: e2e'de kol, SPA içi gezinmeden önce çekilir.

---

## Ek — bo-next (bildirimler, K40/K41, sohbet) yapı taşları
Bu ek bo-p1 + bo-p2 desenlerinin ÜZERİNE kuruludur.

**Bilgi mimarisi:** Yönetişim bölümüne `notifications` grubu ("Bildirimler ve duyurular") açıldı; `notifications` planlı
girdisi `announcements` anahtarıyla aynı yolda (`/sistem/duyurular`) hazır oldu. "Sistem ayarları" tek ekranlı kaldığı için
menüde yaprak görünür. Duyuru alt sayfaları `DETAIL_ROUTES`: `/sistem/duyurular/yeni`, `/:id`, `/:id/duzenle`.

| Yapı taşı | Yer | Kural |
|---|---|---|
| `useGuardedAction` bağlamı | tüm yazmalar | `open(ctx)` bağlamı **null olamaz** (`confirm` null bağlamı yok sayar). Bağlamsız işlemde anlamlı bir etiket verin: `open('self')`, `open('draft')`. |
| Sahte adaptör | `src/api/mock/adapter.ts` | Yanıt ağdaki gibi **JSON kopyası**dır; ekran sahte sunucunun nesnesini referansla paylaşmaz. Yazma yanıtını ekrana koyarken de yeni nesne verin (aynı referans `computed`'ı tetiklemez). |
| `EmailFrame` | `views/notifications/EmailFrame.vue` | Sunucu e-posta HTML'i YALNIZ `<iframe sandbox="" srcdoc>` içinde (betik/form/üst gezinme yok), asla `v-html`. İki temada açık zeminde çizilir. |
| `AnnouncementPreview` | `views/notifications/` | Bant / uygulama içi / e-posta sekmeleri + TR/EN; kanal kapalıysa not düşer. Düzenleyicide taslak 400 ms gecikmeli `previewAnnouncement {draft}` ile canlı. |
| `useCountdown` | `src/composables/useCountdown.ts` | Geri sayım daima SUNUCU bitiş anından (K41 destek oturumu 30 dk, uzatılamaz); istemci süre eklemez. Bitiş türetilmişse (başlangıç + 30 dk) `~` ile "yaklaşık" gösterilir. |
| Hata `details` | `AdminApiError.details`, `utils/errors.ts codeAction` | Koda özgü sayısal ayrıntı eyleme yansır (ör. `TRIAL_EXTENSION_LIMIT` → "En fazla N gün daha uzatabilirsiniz"). Bilinmeyen kodda tür eylemi. |
| Yoklama | `AlertsView` | SSE yoksa 30 sn yoklama; sekme gizliyken ve diyalog açıkken durur. |

**Sahte API test kolları (ek):** `__boMock.setNotifyEmail(false)` → `sendTestEmail` 503 `NOTIFY_EMAIL_UNAVAILABLE`.
`setLiveReadonly(true)` artık `scheduleAnnouncement`, `retryDelivery`, `sendTestEmail` ve yalnız SAĞLAYICI yolundaki
`cancelSubscription`'ı da 423 yapar (kartsız abonelikte iptal yereldir, K40).

### Otopilot (CHAT-FE-3, CHAT_UI_CONTRACT §7.2)
- Aynı `@entegrasyonik/chat` paketi; backoffice'e özgü her şey `src/chat/`: taşıyıcı `/admin-api/agent` (`transport.ts`),
  host (`boChatHost.ts`: yalnız backoffice rotaları; tenant → müşteri detayı, platformJob → başarısız işler, logEvent →
  log merkezi), metin ezmeleri (`texts.ts`: "hesap sahibi/ekip" yerine "platform yöneticisi"), tek örnek (`otopilot.ts`),
  kabuktaki TEK bağlama noktası `OtopilotDock.vue` (ShellLayout).
- Yerleşim web ile aynı: ≥ 1280 px itme, 768–1279 px üstüne binme (scrim yok), < 768 px yalnız tam sayfa; genişlik 360–560.
  Giriş noktaları: üst bar düğmesi, Ctrl/⌘+J, komut paletinde en üstte "Otopilot'a sor: «…»".
- v1 **salt okuma**: `info.readOnly` istemcide her zaman true (rozet); backoffice yazma aracı yok.
- Depolama: yalnız `{ open, width }` → `bo:chat:<yönetici sub>` (`prefs.ts`, backoffice'te depoya yazan tek dosya). Müşteri
  anahtarları (`ek:chat:*`), mock bayrağı (`__EK_CHAT_MOCK__`) ve `/api/agent` backoffice kodunda geçmez (chat-storage.test.ts).
- Geliştirme/test: sahte /admin-api açıkken mock taşıyıcı; Playwright `window.__BO_CHAT_MOCK__ = { config, speed }`. Bayraksız
  otomasyonda sohbet kapalıdır (mevcut specler ve görsel tabanlar etkilenmez).


---

## Ek — BO-ELEV (konsol kimliği) yapı taşları
İlkeler: `elev/CONSOLE_IDENTITY.md`. Denetim ve kalanlar: `elev/AUDIT.md`, `elev/NEXT_TASKS.md`.

| Yapı taşı | Yer | Kural |
|---|---|---|
| `hotkey` | `navigation/screens.ts` | Hazır/taslak ekrana tek harf; `g` + harf ile gidilir, `?` yardımında ve palette görünür. Tekil (elev.test.ts). Planlı ekrana verilmez. |
| Kısayol işleyici | `navigation/hotkeys.ts` | `g`-dizisi (1,5 sn), `?`, Alt+R (görünür ilk `[data-page-refresh]`). Metin alanında / açık diyalogda çalışmaz. Sayfa başlığındaki metinli "Yenile" düğmesine `data-page-refresh` verin. |
| Son açılanlar | `navigation/recents.ts` | Yalnız `{kind:'screen',key}` / `{kind:'tenant',tid}`; ad yazılmaz; `bo:recent:<sub>`. Depoya yazan izinli dosya (static.test). |
| Karar şeridi | `OverviewView` `.bo-ov-status` | Hüküm + bağlantılı maddeler (`{label, where, to, tone}`); kırmızı madde varsa şerit kırmızı. Bağlantısız uyarı yazılmaz. |
| `HealthKpi :to` | `components/HealthKpi.vue` | Kartın tamamı ayrıntıya gider; tek sekme durağı etiketteki bağlantı. |
| `BoPageHeader :stale` | `components/shell/BoPageHeader.vue` | Son yenileme başarısızsa "Yenilenemedi — gösterilen veri X önce alındı". `updatedAt` yalnız başarılı okumada ilerler. |
| `.bo-dense` | `styles/kit.css` | Operasyon listesi sarmalayıcısı → `EkDataTable` satırı 36 px. Hücreler tek satır; ikincil bilgi `title`'a. |
| `.bo-id`, `.bo-code-tag` | `styles/kit.css` | Kimlik mono zeminsiz; hata kodu nötr mono etiket (açıklama `title`'da). Hata kodu için `EkStatusChip` KULLANILMAZ. |
| `.bo-row-actions__sep`, `__danger` | `styles/kit.css` | Yıkıcı satır eylemi ayraçla ayrık, hayalet; yalnız üzerine gelince kırmızı. |
| İz bağlantıları | `TenantDetailView` "İz sür" | Kimlik gösterilen yerde iz ekranına aynı süzgeçle bağlantı. URL süzgeçleri: `/loglar?tid=&level=&category=&reqId=&fp=`, `/denetim?tid=&reqId=`, `/bildirimler/musteri-gecmisi?tid=`, `/motor?sekme=basarisiz&kaynak=dlq`. |
| Ortam satırı | `DangerActionDialog` | İlk satır Ortam; üretim kırmızı, staging sarı şerit. Ekran ek bir şey yapmaz. |
| Süzgeç alanı boyu | `styles/backoffice.css` | `.bo-page` içindeki compact Vuetify alanları 38 px / 14 px (`.bo-seg` ile aynı göz hizası). |

**Sahte API (ek):** `failOps(prefix)` artık tüm operasyonlara uygulanır (oturum uçları hariç) — genel bakış yenileme
hatası `failOps('BackofficeOverviewService/')` ile denenir.

---

## 11. Sayfa deseni: Durum → Karar → Eylem → Ayrıntı (BO-R1, K51) — **TÜM sayfalar**
Kaynak: kullanıcı geri bildirimi `docs/cloud-contracts/BO_FEEDBACK_R1_2026-10-01.md` (BO1-PAGES 6-7), karar K51. İlke:
`elev/CONSOLE_IDENTITY.md` §1 "Önce karar, sonra veri". Konsol bilgi yığmaz, **yönlendirir**: her sayfa yukarıdan aşağı
dört soruyu sırayla yanıtlar. Kaynak dal: `cloud/bo-r1a` (bileşenler + genel bakış); diğer sayfalara uygulama `cloud/bo-r1b`. İnceleme kareleri:
`docs/bo-r1a-review/` (`REVIEW.md`).

| Katman | Soru | Bileşen | Kural |
|---|---|---|---|
| **1 · Durum** | Mevcut durumdan ne anlamalıyım? | `BoStatusHeader` | `BoPageHeader`'ın HEMEN altında, tek cümle hüküm + sağlık rozeti. Her sayfada bir tane. |
| **2 · Karar** | Müdahale etmeli miyim? | `BoAttentionList` | Dikkat isteyenler önem sırasıyla; boşsa "her şey yolunda" + neyin denetlendiği. |
| **3 · Eylem** | Nasıl müdahale ederim? | `BoActionCard` (+ maddedeki eylem bağlantısı) | Tek somut öneri + tek düğme. Yazma eylemi `guarded` → `useGuardedAction`/`GuardedDialog`. |
| **4 · Ayrıntı** | Kanıt nerede? | `BoDetailSection` (ya da mevcut tablo kartları) | Tablolar, loglar, geçmiş en altta; panoda katlanır ve ilk açılışta yüklenir. |

Bileşenler `src/components/triage/` altında (backoffice'e özgü; ortak pakete taşıma ayrı karar). Ortak türler ve eşlemeler:
`triage.ts` (`Severity`, `Health`, `SEVERITY`, `HEALTH_BADGE`, `AttentionEntry`, `healthOf()`, `countText()`).

### 11.1 Durum — `BoStatusHeader`
```vue
<BoStatusHeader :health="health" :verdict="verdict" :summary="summary" :facts="facts" :loading="!loaded">
  <BoActionCard v-if="first" eyebrow="Önerilen ilk adım" … />   <!-- isteğe bağlı: en önemli maddeden türetilir -->
</BoStatusHeader>
```
- `health`: `ok` (doğrulanmış iyi) · `warning` (izlenmeli) · `critical` (şimdi müdahale) · `unknown` (okunamadı). Rozet metni
  `HEALTH_BADGE`'den: Sağlıklı · İzlenmeli · Müdahale gerekli · Bilinmiyor. Gerekirse `badge-label` ("Kısmi bozulma").
- `verdict` tek cümle, sayı içerir: "Her şey yolunda" / "2 konu şimdi müdahale istiyor" / "Kuyruklar okunamadı — durum eksik".
  `summary` ikinci cümle: neye bakıldı, ne kadar güncel ("Sistem ve müşteri denetimleri 30 sn önce yapıldı.").
- `facts`: en çok 4 bağlantılı özet (`{ label, value, tone, href|to }`): sayfa içi bölüme (`#sistem`) ya da başka ekrana.
- Yüzey: `ok` → nötr yüzey, yeşil yalnız ikon/rozet/sol çizgi (sakin); `warning`/`critical` → ince tonlu zemin. Canlı bölge
  (`role="status"`) yalnız hüküm metnini okur. `loading` → iskelet, yerleşim kaymaz.
- `ok` iken metin **"Her şey yolunda"** + neyin denetlendiği; yeşil tik yalnız doğrulanmış iyilik içindir (okunamayan bölüm
  varsa `unknown`/`warning`, asla `ok`).

### 11.2 Karar — `BoAttentionList`
```vue
<BoAttentionList :items="entries" :state="state" :error="error" :checks="checks" :degraded="degraded"
  ok-title="Sistem tarafında müdahale gereken bir şey yok" list-label="Sistemde dikkat isteyenler" @retry="load" />
```
- Madde (`AttentionEntry`, `triage.ts`): `{ id, severity, title, why?, impact?, count?, advice?, action?, secondary?,
  capabilities?, since?, subjects? }`. Her madde aynı sırayla üç soruyu yanıtlar: **Ne oldu** (`title` + `why`) · **Ne
  kadar ciddi** (önem metni ikonla + `count` "412 çağrı" + `impact` + `since` "52 dk önce başladı") · **Ne yapmalı**
  (`advice`, tek cümle) + **eylem** (`action.to`: hedef ekran + süzgeç önceden uygulanmış; yerinde yazma değil).
  `capabilities` (yerinde güvenli eylem önerisi, ör. "Hepsini yeniden dene") yalnız kilit ikonlu ipucu olarak çizilir;
  akış ilgili ekranda `GuardedDialog` ile yapılır. `subjects` → nötr müşteri kimlikleri (ilk 3 + "+N müşteri").
- Sıra: sayfanın verdiği sıra korunur (panoda sunucu sırası: ciddiyet → etki ağırlığı → eskiden yeniye). Sayfa kendi
  verisinden liste kuruyorsa `critical` → `warning` → `info`, aynı önemde eskiden yeniye dizer.
- `limit` (5; mobilde panoda 2): fazlası "N madde daha göster (2 uyarı · 1 bilgi)"; **kritikler limitten bağımsız hep
  görünür**. `total` (sunucu toplamı) `items`'tan büyükse "Toplam N maddenin en önemli M tanesi gösteriliyor".
- Kritik maddenin eylemi dolgu (`.bo-act-link.is-primary`), diğerleri sakin ikincil. Ekranda tek bir dolgu düğme hedeflenir.
- Durumlar: `loading` (iskelet) · `error` (`BoPanelState` hata + Tekrar dene) · `unsupported` (uç yok — "henüz bağlı değil",
  uydurma veri YOK) · `ready` + boş → **her şey yolunda** (`okTitle` + `okText` + "Denetlenen: …") · `ready` + `degraded`
  dolu → sarı not "X okunamadı — liste eksik olabilir" + Yeniden dene (liste yine çizilir).
- Müşteri kapsamlı maddede `subjects` → nötr kimlik (`#107 Örnek · Mağaza`, müşteri detayına bağlı); renkli rozet olmaz.
- Önem rengi yalnız ikon ve önem sözcüğünde ("Kritik"/"Uyarı"); ikon biçimi de farklıdır (sekizgen/üçgen/daire) — renk
  tek taşıyıcı değil. Kritik maddenin eylemi dolgu, diğerleri sakin.
- Metin kuralı: başlık ünlemsiz, enum yok; sayı birimiyle (birimsiz sayı gösterilmez); `advice` "…kontrol edin" (siz dili).

### 11.3 Eylem — `BoActionCard`
```vue
<!-- gezinme -->
<BoActionCard eyebrow="Önerilen ilk adım" tone="critical" :title="top.title" :text="top.advice" :action-label="top.action.label" :to="top.action.to" />
<!-- yerinde güvenli eylem (step-up + gerekçe) -->
<BoActionCard title="Denemeyi uzatın" text="Kurulum sürüyor; 14 gün ek süre önerilir." action-label="Uzat…" guarded @act="extend.open(tid)" />
```
- Sayfada en çok **bir** önerilen ilk adım (Durum içinde) + bölüm başına en çok bir kart. Kart veri yazmaz; `guarded` yalnız
  "Kimlik doğrulama ve gerekçe istenir; işlem denetime yazılır" notunu ve kilit ikonunu gösterir, akış sayfadadır (§6).
- Tehlikeli (yıkıcı) eylem kartla önerilmez; ilgili ekrana götürülür ve orada `DangerActionDialog` ile yapılır.

### 11.4 Ayrıntı — `BoDetailSection`
```vue
<BoDetailSection id="teknik" title="Teknik ayrıntılar" summary="Bağımlılıklar · podlar · kuyruk sayaçları" sync-query @open="loadDetails">
  …mevcut kartlar/tablolar…
</BoDetailSection>
```
- Kapalıyken içerik çizilmez; ilk açılışta `@open` → sayfa veriyi o an çeker. `sync-query` → `?ayrinti=teknik,…` (paylaşılan
  bağlantı aynı görünümü açar). Başlık h2 içinde `aria-expanded` düğme.
- Liste/tablo ağırlıklı sayfalarda (müşteriler, loglar) ayrıntı = sayfanın kendisi; katlanmaz, yalnız Durum/Karar üstüne eklenir.

### 11.5 Soru-cevap bölümü — `BoTriageSection` (pano ve çok sorulu sayfalar)
```vue
<BoTriageSection id="sistem" :index="1" question="Sistemde müdahale gereken var mı?" :health="h" answer="Evet · 1 kritik"
  :more="{ label: 'Uyarılar', to: { name: 'alerts' } }">…</BoTriageSection>
```
- Başlık (h2) bir SORUDUR; yanında kısa cevap rozeti ("Hayır" / "Evet · 2 kritik"). Sakin bilgi bölümlerinde (`calm`)
  rozet nötr ("Olağan", "Son 24 saat"). Bölümler sorulma sırasıyla dizilir; `index` okuma sırasını gösterir.

### 11.6 Sayfaya uygulama (bo-r1b için kontrol listesi)
1. `BoPageHeader` → **`BoStatusHeader`** (hüküm sayfanın verisinden; okunamayan bölüm → `unknown`/`warning`).
2. Sayfanın "dikkat" kümesini çıkarın (başarısız iş, açık devre, ödeme sorunu…) → `AttentionEntry[]` → **`BoAttentionList`**
   (sayfa kendi verisini çevirir; yeni uç gerekmez). Eylem bağlantısı aynı sayfada bir süzgeç/sekme olabilir.
3. Sayfada tek önerilen eylem varsa **`BoActionCard`** (yazma ise `guarded` + `GuardedDialog`).
4. Mevcut tablolar/paneller **Ayrıntı** katmanıdır: yeri aşağı, içerik değişmez. Durum/Karar eklemek için tablo silinmez.
5. Hedef sayfalar gelen süzgeci okur (`?sekme=`, `?kaynak=`, `?tid=`, `?fp=`, `?level=`); okumuyorsa eklenir (§Ek BO-ELEV "İz
   bağlantıları"). Yeni okunan sorgu parametresi bu tabloya yazılır:

| Hedef | Yol | Okunan süzgeç (ekran) | Sözleşme (`API_BACKOFFICE_ATTENTION.md`) adı → çeviri (`src/api/attention.ts routeOf`) |
|---|---|---|---|
| `engine` | `/motor` | `sekme=kuyruklar|basarisiz|durum|zamanlanmis`, `kaynak=dlq`; başarısız işler `tid`, `entegrasyon`, `kod` (BE-03; sözleşme adları `integrationCode`, `errorCode` da okunur) | `tab=queues|failed|state-machine|scheduled` → `sekme`; `source` → `kaynak` |
| `integrations` | `/entegrasyonlar` | `sekme=saglik|dayaniklilik|katalog` | `tab=api-health|resilience|catalog` → `sekme`; `integrationCode`, `range` geçer (ekran henüz süzmüyor — panel ucu `integrationCode` almıyor) |
| `infra` | `/altyapi` | `sekme=redis|mongodb|yavas` | `tab=slow-queries` → `sekme=yavas`; `range` geçer |
| `cache` | `/altyapi/onbellek` | `#bo-cache-families` (bo-r1b) | — |
| `logs` | `/loglar` | `tid` (olay akışı kesin; sorun grupları BE-06 ile YAKLAŞIK), `level`, `category`, `reqId`, `fp`, `sekme=akis|sorunlar`, `sirala=lastSeen|count|tenantCount|new`; süzgeç değişimi URL'e yazılır (bo-r1b) | `tab=issues` düşer (varsayılan sekme); `status=open` geçer (sorun durumu süzgeci yok; açık gruplar zaten öndedir) |
| `audit` | `/denetim` | `event`, `result=ok|fail|error`, `surface`, `range=24h|7d`, `tid`, `reqId` | — |
| `alerts` | `/bildirimler/uyarilar` | `durum=firing|resolved|all`, `onem=critical|warning`, `kural=R1…` (bo-r1b); sözleşme adları `status`, `ruleId` de okunur | `status=firing`, `ruleId` geçer |
| `deliveries` | `/bildirimler/teslimler` | `durum`, `kod`, `tid`, `olay` | — |
| `announcements` | `/sistem/duyurular` | `durum=active|scheduled|draft|ended|cancelled` (bo-r1b) | — |
| `notification-catalog` | `/bildirimler/katalog` | `ara=<kod>` (bo-r1b) | — |
| `tenant` | `/musteriler/:tid` | `sekme=ozet|yasam-dongusu`, `eylem=destek` (destek oturumu güvenli akışı; tek kullanımlık — NT-01) | tek müşterili öğe buraya yönlenir (aşağıda) |
| `subscription` | `/abonelikler/:tid` | `#iptal` (yönetim eylemleri kartı; bo-r1b) | tek müşterili abonelik öğesi buraya yönlenir |
| `subscriptions` | `/abonelikler` | `sekme=abonelikler|gelir`, `durum=<abonelik durumu>`, `plan=<kod>` (bo-r1b); sözleşme adı `status` de okunur | `status=past_due|suspended|trialing`, `endingInDays` geçer (`endingInDays` süzgeci uçta yok) |
| `tenants` | `/musteriler` | `q`, `durum=aktif|pasif|eski|kanalsiz|sorunlu`, `sira=magaza|sonEsitleme|kayit|acikSorun|basarisizIs|sonHata` (`-` önek azalan) (bo-r1b, NT-03/05, BE-01) | `hasIssues=1` → `durum=sorunlu` |
| `admins` | `/yoneticiler` | `filtre=nomfa|locked|invites|idle`, `davet=1` (davet diyaloğunu açar; tek kullanımlık) (bo-r1b) | — |
| `flags` | `/sistem/bayraklar` | `#bakim`, `#taslak`, `#gecmis`, `#ayarlar` (bo-r1b) | — |
| (yakında) | `/musteriler/yasam-dongusu`, `/musteriler/destek` | ekran planlı | `status=…`, `olderThanHours` — ekran gelene dek tek müşterili öğe müşteri detayına yönlenir |

Tek müşterili öğe kuralı (`preferDetail`): `subjects` tek ise liste hedefi (`/abonelikler`, `/musteriler`,
`/musteriler/yasam-dongusu`, `/musteriler/destek`) yerine o müşterinin kaydı açılır — tek tıkla doğru kayıt.

6. Kontrol: ilk ekranda (1440 × 900 ve 390 × 844) hüküm + ilk dikkat maddesi + eylemi görünür mü? "Her şey yolunda"
   senaryosu da çizildi mi (sahte API'de sakin kol)? Axe açık/koyu 0.

### 11.7 Sayfalara uygulama — bo-r1b yapı taşları
Genel bakış dışındaki tüm sayfalar (müşteriler + detay, abonelikler + detay, motor, entegrasyonlar, altyapı, önbellek,
loglar, denetim, yöneticiler, platform ayarları, Otopilot ayarı/sohbet, duyurular, teslimler, müşteri bildirim geçmişi,
katalog, uyarılar) bu deseni **tek uyarlayıcı** üzerinden kullanır:

| Yapı taşı | Yer | Kural |
|---|---|---|
| Hüküm modeli | `src/utils/verdict.ts` | Sayfa kendi verisinden SAF bir `<ad>Verdict.ts` fonksiyonuyla `PageVerdict` üretir (`buildVerdict({ attention, actions, calm, checks, note, busy })`). Madde: `title` (ne oldu) + `impact` + `advice` + `to` (ZORUNLU; aynı sayfa sekmesi için göreli `{ query: { sekme } }`) + `cta`. Okunamayan kaynak `unreadable(id, ad, retry)` → "X okunamadı — Yeniden dene" (asla "sağlıklı"). Varsayılan hüküm kısa ve sayılı ("2 konu şimdi müdahale istiyor"), en acil madde ikinci cümlede. Her sayfanın vitest'i `tests/verdict*.test.ts`. |
| `PageVerdict` | `src/components/verdict/PageVerdict.vue` | `BoPageHeader`'ın HEMEN altında `<PageVerdict :verdict="v" />` (null → denetleniyor). İçte §11.1–11.3 bileşenleri: tone → `Health` (success/info → ok, error → critical, neutral → unknown); ilk YIKICI OLMAYAN eylem "Önerilen ilk adım" kartı (`guarded` → kilit notu, akış sayfanın `GuardedDialog`'u); kalan eylemler sakin "Diğer eylemler" satırı; dikkat listesi `limit` 3. Acil madde yoksa bilgi maddeleri büyük liste yerine Durum'daki bağlantılı **özet çipleri** (`facts`) olur. Sonunda "Ayrıntılar" ayracı (`detailsLabel=false` ile kapatılır — Otopilot sohbeti). |
| `useVerdictSources` | `src/composables/useVerdictSources.ts` | Sekmeli sayfada hüküm için hafif özet okumaları (`settled`, `failed(k)`, `stale`, `updatedAt` = en eski başarılı okuma). Başlıkta metinli "Yenile" (`data-page-refresh`) hüküm kaynaklarını VE açık paneli (`:key` nesli) birlikte tazeler; `BoPageHeader :updated-at :stale`. |
| `CopyViewLink` | `src/components/CopyViewLink.vue` | NT-03: başlık eylemlerinde "Bağlantı" (Yenile'nin solunda) — geçerli URL (sekme + süzgeçler) panoya. Kayıtlı görünüm sunucuda → BE-05. |
| Bağlam eylemleri | `navigation/screens.ts` `actions?: (route) => ContextAction[]` | NT-01: palette boş sorguda en üstte "Bu ekranda" (en çok 3). Detay rotası da tanımlayabilir (müşteri detayı: destek oturumu → `?eylem=destek`). |
| Satır klavyesi | `navigation/rowNav.ts` (+ `hotkeys.ts` `row`) | NT-10: `#bo-main` içindeki görünür `tbody tr` / `.bo-rowcard` satırlarında j/k, Enter, Esc. Sayfa kodu gerekmez; satırın birincil bağlantısı odaklanır (`[data-kb-row]` sakin vurgu). |
| Üretimde kimlik yazdırma | `DangerActionDialog confirmText` / `GuardedDialog confirmText` | NT-02: yalnız `currentEnv.key === 'production'` + yıkıcı iken "Onay için `<kimlik>` yazın" alanı; eşleşmeden onay kapalı. Verilen yerler: iş silme (iş kimliği), abonelik iptali (tid), teslim atma (teslim kimliği), yönetici devre dışı/2FA sıfırlama (e-posta). |
| Sessiz yenileme onayı | `EkRefreshButton quiet-success` (paket, ekleyici) | NT-07: backoffice panel düğmeleri başarıda yeşil tik yerine nötr "Güncellendi" (tazelik ≠ sağlık). Ana uygulama varsayılanı değişmedi. |
| Otomatik yenileme metni | `BoPageHeader :auto-refresh="30"` | NT-09: tek metin "Sekme açıkken 30 sn'de bir yenilenir". |
| BE-01..06 bağları | `api/contracts/ops.ts`, `contracts/engine.ts`, `api/mock/ops/{tenantOps,prefs,engine}.ts` | Müşteri listesi ops sütunları + "Sorunlu müşteriler" (BE-01); müşteri detayı "Şu an" kartı (BE-02, `degradedSections` → "okunamadı"); başarısız işlerde süzgeç + seçim + "Seçilenleri yeniden dene" (BE-03, `retryJobs` step-up + gerekçe, iş başına sonuç) ve iz sütunu (BE-04 `reqId` → `/loglar?reqId=`); başlıkta "Görünüm" grubu = Bağlantı + kayıtlı görünümler menüsü (BE-05, `SavedViewsMenu`, ekran anahtarı `route.meta.screen`, yönetici başına ≤ 20); sorun gruplarında `tid` (BE-06, yaklaşık ipucu). Sahte uçlar sözleşmeye birebir (`tests/ops-*-contract.test.ts`). |
| Hash kaydırma | `router.ts scrollBehavior` | Hüküm bağlantısı sayfa içi bölüme (`#bakim`, `#bo-cache-families`) kaydırır; davet bileti `#t=` etkilenmez. |

**Panodaki uygulama (bo-r1a):** genel bakış dört soruyu sırayla yanıtlar — 1 sistemde müdahale (getAttention
`groups.system`), 2 büyük resim (getPulse: API isteği, kanal çağrısı, 5xx ve kanal hata oranı, sipariş — sakin), 3
müşterilerde müdahale (`groups.customers`), 4 genel kullanım (müşteri/abonelik sayıları, MRR); teknik ayrıntılar
(bağımlılık/pod/kuyruk/alım/son yönetim işlemleri) katlanır (`?ayrinti=teknik`). 1440'ta duvar düzeni (1|2 / 1|4 / 3|4;
DOM sırası 1-2-3-4). Veri tek adaptörden: `src/api/attention.ts` (`loadAttention`, `loadPulse`; uç yoksa `getHealth`'ten
sistem maddeleri türetilir, müşteri bölümü "henüz bağlı değil"). Sözleşme: `docs/cloud-contracts/API_BACKOFFICE_ATTENTION.md`.
Metin (title/why/impact/eylem etiketi) sunucudandır; önyüz yalnız kontrol kimliğine göre "Ne yapmalı" ipucu ekler.

**Sahte API (ek):** `__boMock.setCalm(true)` → "her şey yolunda" (getAttention boş, getHealth olağan);
`setAttentionDegraded(['circuits'])` → okunamayan kontrol (`status:'degraded'`); `setAttentionMissing(true)` →
getAttention/getPulse 404 (eski backend; adaptör geri düşüşü). Sahte durum sayfa yenilemesinde sıfırlanır: kolu çekip
"Yenile"ye basın (e2e: `r1a.spec.ts`).

## Ek — MOB-08 (kullanımda platform ayrımı) yapı taşları
Sözleşme `docs/API_BACKOFFICE_USAGE.md`; karar K55. K51 sayfa hiyerarşisi (Durum → Karar → Eylem → Ayrıntı) kullanım bölümlerinde bu parçalarla kurulur.

| Yapı taşı | Yer | Kural |
|---|---|---|
| `usageVerdict.ts` | `views/usage/` | SAF hüküm: `{tone, title, sentence, decisions[], actions[]}`. Eşikler yalnız burada (`UNKNOWN_SHARE_WARN` %20, `MOBILE_MAJORITY` %50, `INACTIVE_DAYS_WARN` 7). Okunamayan (degraded) ≠ "kullanım yok"; hesaplanamayan ayrı hüküm. Eylem ≤ 3, hepsi bağlantı. |
| `UsageVerdictBlock` | `views/usage/` | Durum (h2 + tek cümle, `role=status`) → "Müdahale gerekir mi?" → "Ne yapılabilir?". < 768 px tek sütun. Ton sol kenar + ikon + metin (renk tek başına anlam taşımaz). |
| `PlatformBreakdown` | `views/usage/` | Ana kırılım Masaüstü / Mobil (+ varsa Belirlenemedi) her zaman görünür; alt türler `<details>` içinde. `MeterList` (değer metin). |
| `PlatformFilter` | `views/usage/` | `.bo-seg` Tümü/Masaüstü/Mobil + "Alt tür" seçimi; değer URL'de `?platform=` (`platformFromQuery`). Alt tür seçiliyken segmentte işaret yok. |
| Etiketler | `utils/labels.ts` `PLATFORM_CLASS`, `CLIENT_PLATFORM` | Ekranda satır içi platform adı yazılmaz. Değer listesi `@entegrasyonik/ui/platform` (tek kaynak). |
| `SeriesBars` `tone:'success'` | `components/kit/` | Kategorik ikinci seri (mobil); alarm anlamı yok. |

**Sahte API kolu (ek):** `__boMock.setUsageEmpty(true)` → `getPulse.activeUsers` ve `getUsage.activeUsers` `computable:false`.

---

## 12. R2 sistem katmanı (BO-R2a, K59) — **tüm sayfalar, bo-r2b bunu izler**
Kaynak: `docs/cloud-contracts/BO_FEEDBACK_R2_2026-10-01.md` (BO2-*), karar K59. R2, §11 "Durum → Karar → Eylem → Ayrıntı"
deseninin **görsel/sistem katmanıdır** (K51 geçerli). Envanter: `docs/bo-r2-review/INVENTORY.md`. Rapor: `docs/bo-r2-review/R2A_REPORT.md`.
Bileşenler `src/components/r2/` (yerleşim, liste, eylem) ve `src/components/charts/` (grafik). **Sayfa yalnız bunları
kullanır; yerel kopya yazılmaz** — mandal `tests/r2-system.test.ts` (azalan taban `tests/r2-baseline.json`).

### 12.1 Bileşen seti

| İhtiyaç | Bileşen | Kural |
|---|---|---|
| Sayfa başlığı (BO2-20) | `BoPageHeader` (shell) | Ekran kaydındaki ikon kapsülde + h1 (`title`) + tek cümle açıklama + meta; altta ayraç; eylemler sağda, **Yenile en sağda** (`BoAction kind="refresh" data-page-refresh`). `:auto-refresh="30"` tek metin. `hide-icon` yalnız istisna. Yerel h1 yasak. |
| Bölüm (BO2-11) | `BoSection` | Her anlamlı bölüm bir kart: başlık (`heading` 16/600) + açıklama (`caption`) + `#actions` + gövde + `#footer`. `fill` (ızgarada tam yükseklik), `flush` (tablo kenardan kenara), `plain` (kart içi alt bölüm, kartsız), `tone` (yalnız durum: sol şerit). Yerel `.bo-panel__bar` başlık çubuğu yasak. Pano soru kartı `BoTriageSection` aynı ölçüde. |
| Kutu ızgarası (BO2-12) | `BoTileGrid` | Aynı satırdaki kutular **eş yükseklik + hizalı** (hücre `stretch`, çocuk %100). `:cols="2|3"` sabit (< 1024 px en çok 2, < 600 px `mobile-cols`), `:min="176"` otomatik sütun (KPI şeridi, `dense`). Geniş kutu `data-span="2"`/`"all"`. `bo-grid-2/3` yeni kodda kullanılmaz. |
| Önemli metrik | `BoStat` | Mikro etiket (tek satır, kesilir) + metrik değer + tek satır `hint`; uzun açıklama `info`'da (ⓘ, `title` + ekran okuyucu metni — kutu bağlantıysa iç içe etkileşim yok); `series` → sparkline; `to` → kutunun tamamı bağlantı. `tone` yalnız durum (critical/warning/success/info). |
| Standart veri listesi (BO2-40) | `BoDataTable` | `EkDataTable` sütun tipleri + 36 px yoğunluk + `phase` dört durum + `#footer` sayfalama + bölge adı. Doğrudan `EkDataTable` yasak (taban). |
| Özel satırlı tablo | `BoTableFrame` | `.bo-table` işaretlemesinin tek yeri (odaklanır kaydırma bölgesi, sr başlığı, `density`, `flat`, `max-height`). Hücre sınıfları §3 (`is-num`, `is-id`, `is-link`). |
| Filtre çubuğu (BO2-41) | `BoFilterBar` + `BoSegmented` | Sıra: arama (`#search`) · alanlar/segmentler · "N süzgeç etkin" + **Filtreleri temizle** (sözlük `clearFilters`, yalnız etkinken) · `#trailing` (Dışa aktar). Süzgeç değişince liste baştan yüklenir ve URL'e yazılır. Tek seçim = `BoSegmented` (radiogroup, ←/→, sayaç); yerel `role="radiogroup"` yasak. |
| Sayfalama (BO2-41) | `BoPagination` | Uçlar imleçli: "N kayıt gösteriliyor · listenin sonu" (+ `total` → "12 / 40 kayıt") + "Daha fazla" (aynı süzgeçle ekler, liste silinmez, hata satır içi). `BoSection #footer` ya da `BoDataTable #footer` içinde. Yerel "Daha fazla" / `.bo-table-foot` yasak. |
| Sekme (BO2-70) | `BoTabs` | `EkPageTabs` + `?sekme=` (varsayılan URL'e yazılmaz). Uzun sayfanın ilk bölme aracı: farklı **konular** (Kuyruklar / Başarısız işler). |
| Görünüm değiştirici | `BoViewSwitch` | Aynı içeriğin iki yoğunluğu (Özet / Ayrıntılı), `?gorunum=`. Örn. BO2-P6 başarısız işler: özet = türe göre gruplu sayılar, ayrıntılı = iş başına tür/durum/neden/zaman tablosu. |
| Daraltılabilir | `BoCollapsible` (kart/madde içi) · `BoDetailSection` (sayfa, `?ayrinti=`) | İkinci plandaki açıklama/kanıt kapalı başlar; `inline` → düğme eylem satırına katılır, içerik alt satıra iner. Örn. `BoAttentionList compact` "Neden ve ne yapmalı". |
| Eylem (BO2-50) | `BoAction` + `actions.ts` | Aşağıda §12.3. |
| Grafik (BO2-60) | `BoChart` | Aşağıda §12.4. |
| Durumlar | `StateBlock` / `BoPanelState` | Değişmedi (§4, bo-p2). |

### 12.2 Tipografi ölçeği (BO2-30) — TEK kaynak `@entegrasyonik/ui/tokens` `typeRole`
| Rol | Token | Boyut / satır / ağırlık | Nerede |
|---|---|---|---|
| Sayfa başlığı | `--ek-type-title-*` | 22 / 30 / 600 | yalnız `BoPageHeader` h1 ve `BoStatusHeader` hükmü |
| Metrik | `--ek-type-metric-*` | 28 / 34 / 700 | yalnız `BoStat` değeri (tek sayı) |
| Bölüm başlığı | `--ek-type-heading-*` | 16 / 24 / 600 | `BoSection`, `BoTriageSection`, `BoDetailSection` başlığı, kutu içi büyük sayı |
| Alt başlık | `--ek-type-subheading-*` | 14 / 20 / 600 | liste maddesi başlığı, grafik başlığı |
| Gövde | `--ek-type-body-*` | 14 / 22 / 400 | metin, açıklama |
| Etiket | `--ek-type-label-*` | 13 / 18 / 500 | düğme, bağlantı, form etiketi, satır adı |
| Tablo | `--ek-type-table-*` | 13 / 20 / 400 | tablo hücresi |
| Yardım/meta | `--ek-type-caption-*` | 12 / 16 / 400 | zaman, ipucu, kaynak notu, bölüm açıklaması |
| Mikro | `--ek-type-micro-*` | 11 / 16 / 600, BÜYÜK HARF, `tracking` | tablo başlığı, KPI etiketi, "NE YAPMALI" |
- Mandal: `font-size` yalnız `var(--ek-type-<rol>-size)` / `var(--ek-icon-*)` (ikon) / `inherit`; `font-weight` yalnız
  `var(--ek-type-<rol>-weight)` ya da `var(--ek-font-weight-regular|medium|semibold)` (bold yok); `font:` yalnız `inherit`;
  şablonda satır içi font stili yok. Taban **0** — ihlal eklenemez.
- Ağırlık hiyerarşisi: sayfada 700 yalnız metrikte; başlıklar 600; vurgu 500. Bir kutuda en çok iki boyut.

### 12.3 Eylem sözlüğü (BO2-50) — `src/components/r2/actions.ts`
| `kind` | İkon | Etiket | Varsayılan varyant | Not |
|---|---|---|---|---|
| `refresh` | `mdi-refresh` | Yenile | secondary | Sayfa başlığında en sağ, `data-page-refresh` (Alt+R). Panel içi tazeleme `EkRefreshButton quiet-success` (NT-07) |
| `edit` | `mdi-pencil-outline` | Düzenle | secondary | satırda `icon-only` → ghost |
| `delete` / `discard` / `cancel` | çöp kutusu / çöp kutusu / `mdi-cancel` | Sil / At / İptal et | danger-quiet | **Yıkıcı**: onay diyaloğu zorunlu (§6); satırda ayraçla ayrık, ikon sakin, üzerine gelince kırmızı |
| `detail` | `mdi-arrow-right` (sonda) | Ayrıntı | secondary | `:to` ile bağlantı; "Müşteriye git" gibi etiket verilebilir |
| `view` | `mdi-eye-outline` | Görüntüle | secondary | |
| `export` / `download` | dosya-dışa-aktar / indir | Dışa aktar / İndir | secondary | `BoFilterBar #trailing` |
| `retry` | `mdi-replay` | Yeniden dene | secondary | iş yeniden deneme (guarded) |
| `add` | `mdi-plus` | Ekle | **primary** | ekranın tek ana işi ("Yeni duyuru" → `label`) |
| `link` | bağlantı | Bağlantı | secondary | `CopyViewLink` ile aynı |
| `clearFilters` | süzgeç-kaldır | Filtreleri temizle | ghost | yalnız `BoFilterBar` |
| `copy`, `openExternal`, `more`, `filter`, `save` | paket glifleri | — | — | |
- Glifler ortak paketin `ACTION_ICONS` kayıt defterinden (müşteri uygulamasıyla aynı iş = aynı ikon). Ekran ikon/ton
  seçmez; yalnız `kind` (+ gerekirse `label`, `object`, `tone` primary/ghost). İkon düğmede erişilebilir ad
  `boActionLabel(kind, object)` ("Duyuruyu düzenle").
- Mandal: sayfada `icon="mdi-refresh"` yasak (taban **0**). Sil/düzenle/dışa aktar sayfa taşımasında (bo-r2b) aynı kurala geçer.

### 12.4 Grafik teması ve sarmalayıcı (BO2-60) — `src/components/charts/`
- `echarts` ^6 + `vue-echarts` ^8 (uygulamayla aynı sürüm), **tree-shaken** tek kayıt `register.ts`: SVG çizici + Bar/Line/Pie
  + Grid/Tooltip/MarkLine. Grafik parçası tembel yüklenir (ilk grafikli sayfada).
- Tema `chartTheme.ts` (saf TS): renkler `@entegrasyonik/ui/tokens` `appSemanticColorsLight/Dark`'tan (literal renk yok —
  test), `bo-light` / `bo-dark` olarak kayıtlı; `BoChart` etkin temayı `themeMode`'dan seçer. Kategorik sıra: action ·
  secondary · info · warning · neutral (5'ten fazla seri "Diğer"). Durum serileri `tone` ile (başarısız = `error`).
  Izgara kesikli `border-subtle`, eksen `border-default`, etiket `caption` + `content-muted`, ipucu `surface` + kenarlık,
  gradyan/gölge yok, hareket ≤ 250 ms `cubicOut`, reduced-motion'da kapalı.
- `BoChart :kind="line|area|bar|stacked-bar|sparkline|donut"`: `state` (loading iskelet sabit yükseklik · empty sakin
  metin · error + Tekrar dene · ready), `summary` (zorunlu anlam; serilerden toplam/en yüksek/son eklenir → ekran okuyucu),
  HTML lejant, **"Tablo olarak göster"** (sparkline hariç), `threshold` (kesikli eşik çizgisi), `categoryTones` (halka).
- Mevcut grafik bileşenleri API'si korunarak BoChart'a taşındı: `Sparkline`, `BarTrend`, `kit/SeriesBars`. `MeterList`
  grafik değildir (oran çubuğu, değer metin) — korunur. Yeni el yazımı `<svg role="img">` grafik yasak (taban 0).

### 12.5 Yerleşim ve kaydırma kuralları (BO2-10, BO2-70, BO2-71)
- Kabuk: `.bo-page` yan boşluk 16 px (≤ 767 px: 12 px), üst 20 px, tavan 1760 px; bölümler arası tek ritim 20 px (mobil 16).
- Sayfa iskeleti: `BoPageHeader` → `PageVerdict`/`BoStatusHeader` → (varsa) KPI şeridi `BoTileGrid :min` + `BoStat` →
  bölümler (`BoSection` / `BoTileGrid :cols`) → ayrıntı (`BoTabs` / `BoDetailSection`).
- **Dikey**: ilk ekranda (1440 × 900) hüküm + metrikler + ilk karar bölümü görünmeli. Bir sayfa 1440'ta ~3 ekrandan uzunsa
  böl: farklı konu → `BoTabs`; aynı içerik iki yoğunluk → `BoViewSwitch`; ikincil kanıt → `BoCollapsible`/`BoDetailSection`.
  Panoda dikkat listesi `compact` + `limit` 3 (mobil 2; kritikler her zaman görünür).
- **Yatay**: sayfa düzeyinde yatay kaydırma **yok** (`document.scrollWidth ≤ clientWidth`, e2e `r2a.spec.ts`). Dar kutuda
  tablo yerine sayı kutuları/liste (ör. teknik ayrıntılar "Kuyruklar"); 4+ sütunlu tablo yalnız ≥ ½ genişlikte kutuda; mobilde
  ikincil sütun `bo-hide-sm`, ana listeler kart satır. Tablo kabı kendi içinde kayabilir (odaklanır bölge) ama sayfa kaymaz.
- Mobil dokunma katmanı (≥ 44 px, `mobile.css`) değişmedi; yeni bileşenler `(pointer: coarse)` altında 44 px hedef verir.

### 12.6 Mandallar ve taban
| Mandal | Test | Taban (bo-r2a sonu) |
|---|---|---|
| Tipografi ölçeği | `r2-system.test.ts` BO2-30 | 0 |
| Yerel h1 | `page-title` | 0 (giriş/davet kabuk dışı) |
| Yerel Yenile | `refresh` | 0 |
| El yazımı SVG grafik | `chart-svg` | 0 |
| Yerel `.bo-table` | `raw-table` | 6 |
| Doğrudan `EkDataTable` | `datatable` | 19 |
| Yerel segment | `segment` | 22 |
| Yerel sayfalama | `pagination` | 6 |
| Yerel bölüm başlığı | `section-head` | 24 |
Taban **yalnız azalır**: bir sayfa taşındığında test "tabanı düşürün" der → `R2_BASELINE_WRITE=1 npx vitest run tests/r2-system.test.ts`.
