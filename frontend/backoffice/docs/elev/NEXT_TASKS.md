# BO-ELEV — kalan işler (hazır görev tanımları)

Kaynak: `AUDIT.md` (bulgu numaraları), ilkeler `CONSOLE_IDENTITY.md`, desenler `../BO_UI_PATTERNS.md`.
Her görev: dal `cloud/bo-elev-<kısa-ad>`, taban `cloud/bo-elev`; yalnız `frontend/` (paket değişikliği ADDITIVE).
Doğrulama (her görevde): `cd frontend && npm run test:backoffice && npm run build:backoffice`; e2e ilgili spec
`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test <spec> --update-snapshots=missing` (3 proje, axe 0).

## A. Yalnız önyüz (backend gerekmez)

### NT-10 · Tablo satırında klavye (j/k, Enter) — KB-5
- **Durum (2026-10-01):** ✔ bo-r1b — `navigation/rowNav.ts` + `hotkeys.ts row`; tüm `tbody tr`/`.bo-rowcard` listelerinde (tek mekanizma, sayfa kodu yok); kısayol yardımında satır; vitest `row-nav.test.ts` + e2e `r1b.spec.ts`.
- Ne: `.bo-table` ve `EkDataTable` listelerinde j/k satır odağı, Enter birincil bağlantı, Esc odaktan çık.
- Nasıl: `src/composables/useRowNav.ts` (tablo kökü ref'i + satır seçicisi); kısayol yardımına "Tablo" grubu.
- Kabul: müşteri listesi, başarısız işler, denetim, teslim günlüğünde çalışır; metin alanında devre dışı; vitest + e2e.

### NT-02 · Üretimde yıkıcı işlemde hedef kimliğini yazdırma — DA-3
- **Durum (2026-10-01):** ✔ bo-r1b — `DangerActionDialog/GuardedDialog confirmText`; iş silme, abonelik iptali, teslim atma, yönetici devre dışı/2FA sıfırlama; e2e `?env=production` ister / örnek veride istemez.
- Ne: `currentEnv.key === 'production'` ve `destructive`/`danger` iken gerekçenin altında "Onay için `fetch-42` yazın" alanı.
- Nasıl: `DangerActionDialog`'a `confirmText?: string` prop'u; `canConfirm` ona bağlı. `GuardedDialog` `danger` ise kimliği geçirir.
- Kabul: `?env=production` önizlemede iş silme/abonelik iptali bu alanı ister; staging/mock'ta istemez; e2e.

### NT-03 · Paylaşılabilir görünüm (URL süzgeçleri + "Bağlantıyı kopyala") — FL-3
- **Durum (2026-10-01):** ✔ bo-r1b (+ BE-05 kayıtlı görünümler menüsü) — `CopyViewLink` ("Bağlantı"); müşteri listesi `q/durum/sira`, motor `sekme/kaynak`, uyarılar `durum/onem/kural`, teslimler `durum/kod/tid/olay`, loglar/denetim süzgeçleri URL'de (BO_UI_PATTERNS §11.6).
- Ne: Müşteri listesi (arama, durum), başarısız işler (kuyruk, kaynak — kaynak bitti), uyarılar (durum, önem, kural),
  teslim günlüğü süzgeçleri URL'de; `BoPageHeader` eylemlerinde `EkCopyButton label="Bu görünümün bağlantısı"`.
- Kabul: bağlantı yeni sekmede aynı görünümü açar; e2e her ekran için bir senaryo. Sunucu tarafı kayıtlı görünüm → BE-05.

### NT-04 · Tek tablo dili + mobil kart satırı — TB-1, TB-6, DG-1, MB-3
- **Durum (2026-10-01):** Kısmi ✔ bo-r1b — `.bo-toolbar`/`.bo-seg` tek tanım (backoffice.css); denetimde iç kaydırma kalktı (yapışkan başlık). `EkDataTable` < 600 px kap sorgusuyla zaten kart satırı (başarısız işler dahil). Kalan: `.bo-table` listelerinde (müşteri, denetim) `.bo-rowcard` ve `BoPanelState`↔`StateBlock` metin birliği — görsel fark yerel onay ister.
- Ne: `.bo-table` (bo-p1) ve `EkDataTable` (bo-p2) arasında satır yüksekliği, başlık puntosu, kimlik hücresi, boş/hata
  metni aynı. `BoPanelState` ve `StateBlock` metin kuralları tek tablo (`utils/errors.ts`).
- Nasıl: önce görsel fark envanteri (`review-elev` kareleri), sonra `kit.css` ↔ `backoffice.css` yinelenen `.bo-toolbar`/
  `.bo-seg` tanımlarını tek dosyada topla. < 600 px'te 5+ sütunlu operasyon listeleri kart satırı (`.bo-rowcard`).
  Denetim tablosunda iç kaydırma kaldırılır (sayfa kaydırması + yapışkan başlık).
- Kabul: görsel fark yerelde onaylı; mevcut e2e yeşil; hata kodu açıklaması kartta görünür (dokunmatik).

### NT-05 · Müşteri listesi: sütun sıralama + plan sütunu — IA-7 (kısmi)
- **Durum (2026-10-01):** ✔ bo-r1b (plan + ops sütunları BE-01 ile) — Mağaza/son eşitleme/kayıt sıralaması, `aria-sort`, `?sira=`; e2e `tenants-url.spec.ts`.
- Ne: Mağaza / son eşitleme / kayıt sütunlarında sıralama (`getClients sortField/sortOrder` sözleşmede VAR). Plan sütunu
  yalnız BE-01 gelirse.
- Kabul: başlık düğmesi `aria-sort`; URL'de `?sira=`; e2e.

### NT-06 · Log merkezi: sorun başlığı kesilmesi — TB-5
- **Durum (2026-10-01):** ✔ bo-r1b — başlık 2 satır (`line-clamp`) + `title`; sparkline < 1280 px gizli.
- Ne: başlık iki satıra kadar sarılır (`-webkit-line-clamp: 2`), tam metin `title`; sparkline sütunu 1280 altında gizlenir.
- Kabul: 1440'ta başlık okunur, 390'da kart düzeni bozulmaz.

### NT-07 · Bayat veri ve yeşil tik — ST-2, DG-3
- **Durum (2026-10-01):** ✔ bo-r1b — `EkRefreshButton quiet-success` (paket, ekleyici; ana uygulama değişmedi) tüm backoffice panellerinde; tüm hükümlü sayfalarda `BoPageHeader :stale` ("Yenilenemedi").
- Ne: Panel düzeyi `EkRefreshButton` başarı tiki "sağlıklı" okunuyor. Backoffice'te `.bo-panel__bar` içinde tik yerine
  "Güncellendi" metni (paket bileşenine ADDITIVE `quietSuccess` prop'u; ana uygulama değişmez). Tüm `useResource` ekranları
  `stale` iken başlıkta "Yenilenemedi" (genel bakıştaki desen: `BoPageHeader :stale`).
- Kabul: motor/entegrasyon/altyapı panellerinde `failOps` sonrası bayat göstergesi; ana uygulama görsel tabanı değişmez.

### NT-08 · Uyarılar: rozet yığını — ST-5
- **Durum (2026-10-01):** ✔ bo-r1b — Gölge/Susturuldu durum sütununda ikinci satır metin; "05:42'ye dek" / "3 Eki 05:42'ye dek".
- Ne: "Gölge" ve "Susturuldu" durumları durum sütununda ikinci satır metin (rozet değil); susturma bitişi "05:42'ye dek".
- Kabul: satır yüksekliği 2 satırı geçmez.

### NT-09 · Metin ve küçük tutarlılıklar — IA-4, TX-1, TX-2, TR-3
- **Durum (2026-10-01):** Kısmi ✔ bo-r1b — `BoPageHeader :auto-refresh` tek metin (uyarılar). Genel bakışa ait maddeler (HealthKpi `valueKind: 'word'`, "Son yönetim işlemleri" etiket/müşteri bağlantısı) genel bakış bo-r1a kapsamında → bo-r1a'ya devredildi.
- KPI'da sözcük değer ("Hazır") başlık puntosunda; `HealthKpi` `valueKind: 'word'`.
- Genel bakış "Son yönetim işlemleri": `event` → `utils/labels.ts AUDIT_EVENT` eşlemesi ("Yönetim yazması",
  "Destek oturumu", "Hassas okuma"), `tid` varsa müşteriye bağlantı.
- "Sekme açıkken 30 sn'de bir yenilenir" tek metin (`BoPageHeader` `autoRefresh` prop'u).

### NT-01 · Komut paleti: bağlam eylemleri
- **Durum (2026-10-01):** ✔ bo-r1b — `screens.ts actions` + `contextActionsFor`; palette "Bu ekranda" (motor, loglar, denetim, entegrasyonlar, altyapı, uyarılar, müşteri detayı → destek oturumu `?eylem=destek`); vitest `context-actions.test.ts` + e2e.
- Ne: Bulunulan ekrana göre üstte 1–3 bağlam eylemi (müşteri detayında "Destek oturumu aç", başarısız işlerde "Ölü
  mektuplara geç"). Kayıtta `actions?: (route) => Cmd[]`.
- Kabul: palet boş sorguda "Bu ekranda" grubu; e2e.

## B. Backend gerektirenler (sözleşme önerisiyle)

> **Durum (2026-10-01, bo-r1b):** sözleşme `docs/cloud-contracts/API_BACKOFFICE_ATTENTION.md` (BE-01..06) origin/main'e geldi;
> altısı da önyüzde bağlandı (sahte uçlar sözleşmeye birebir; ayrıntı BO_UI_PATTERNS §11.7). Notlar: BE-06 sözleşmede
> `BackofficeLogService/issueGroups`, önyüz taslağı `LogCenterService/getIssueGroups` — alan taslak uca eklendi, gerçek
> bağlamada yalnız uç adı değişir. Plan sütunu (NT-05) BE-01 ile geldi. Ek istekler bo-r1b raporunda: sorun grubu
> üstlen/çöz/sustur yazma uçları, denetim sunucu sayımı (`byEvent/byResult`), abonelik durum sayaçları, bildirim e-posta
> kanalı sağlığı, yönetici rolü + davet bitişi, uyarılarda `tid` süzgeci.

> Bulutta backend salt-okunur. Aşağıdakiler yerel backend hattına (BACKOFFICE_PLAN §2) önerilir; önyüz ekranları sözleşme
> gelince bağlanır. Alanlar öneridir, mevcut adlandırmaya (ERROR_CODES.md, ADR-0026) uydurulur.

### BE-01 · Müşteri listesine operasyon özeti — IA-7
`AdminService/getClients` yanıtında (ya da yeni `BackofficeTenantService/listTenants`) satır başına:
```ts
ops?: { planCode: string | null; subscriptionStatus: SubscriptionStatus | null; openIssues: number; failedJobs24h: number; lastErrorAt: string | null }
```
Süzgeç: `hasIssues?: boolean`, `subscriptionStatus?: SubscriptionStatus[]`; sıralama `openIssues`, `lastErrorAt`.
Önyüz: "Sorunlu müşteriler önce" segmenti, sayılar sağa hizalı.

### BE-02 · Müşteri detayı sağlık özeti — IA-6
`BackofficeTenantService/getHealthSummary { tid } → { openIssues: IssueGroupRef[]; failedJobs: { bullmq: number; dlq: number };
lastSyncAt: Record<integrationCode, string | null>; alerts: AlertRef[] }` (hassas okuma DEĞİL — iş verisi yok, yalnız sayaç).
Önyüz: "İz sür" kartının üstünde "Şu an" kartı.

### BE-03 · Başarısız işlerde süzgeç ve toplu işlem — FL-2, TB-7
`BackofficeEngineService/listFailedJobs` istek alanları: `tid?: number; integrationCode?: string; errorCode?: string`.
Toplu: `retryJobs { queue, jobIds: string[] (≤ 50), reason }` → `{ results: Array<{ jobId; ok; error? }> }` (step-up + gerekçe,
tek denetim kaydı + iş başına alt kayıt; LIVE_READONLY 423). Önyüz: satır seçimi + "Seçilenleri yeniden dene" (GuardedDialog
kapsamı "12 iş · UNAVAILABLE · Trendyol").

### BE-04 · İşten loga iz — TR-1
`FailedBullJob.reqId?: string` (işi kuyruğa alan isteğin kimliği) ve `traceId?: string`. Önyüz: satırda kopyalanabilir
istek kimliği + TraceDialog.

### BE-05 · Kayıtlı görünümler (sunucu) — FL-3
`BackofficePrefsService/listViews|saveView|deleteView { screen, name, query }` — yönetici başına, en çok 20, denetime
`backoffice.write`. Önyüz NT-03'ün URL modelini kullanır.

### BE-06 · Sorun gruplarında müşteri süzgeci — IA-8 (kalan)
`LogCenterService/getIssueGroups` isteğine `tid?: number`. Önyüz: `?tid=` kapsamı sorun gruplarına da uygulanır; "yalnız olay
akışına uygulanır" notu kalkar.
