# Backoffice UI desenleri (BO-P1) — yeni ekran yazanlar için tek referans

Kaynak dal: `cloud/bo-p1`. Bu belge **bağlayıcıdır**: `cloud/bo-p2` ve sonraki ekranlar bu kabuk, kayıt ve desenleri
kullanır; kopya kabuk/başlık/tablo/diyalog açılmaz. Görsel dil: premium ama sakin operasyon konsolu (Stripe/Linear
seviyesi) — bilgi yoğun, renk yalnız anlam taşıdığında, hareket 150–300 ms ve yalnız opaklık/renk.

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
| `useCursorList(fetchPage)` | `src/composables/useCursorList.ts` | İmleçli liste. İlk istek imleçsiz; `nextCursor` aynı filtrelerle geri gönderilir; filtre değişince `reload()`; eski yanıt yok sayılır. "Daha fazla" hatası listeyi silmez. `LoadMore` bileşeniyle. |
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
