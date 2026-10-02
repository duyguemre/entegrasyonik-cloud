# BO-R2b raporu — kalan sayfalar (K59, BO2-P3..P7)

Dal: `cloud/bo-r2b` (← `origin/cloud/bo-r2a`; bo-r2a'nın son 3 commit'i de birleştirildi, `116adf62`).
Kaynak: `docs/cloud-contracts/BO_FEEDBACK_R2_2026-10-01.md`. Desen: `docs/BO_UI_PATTERNS.md` §12 (bo-r2a) — bo-r2b yeni yerel
kopya üretmedi; eksik çıkan parçalar ortak sete eklendi (§2). Kareler: `once/` (bo-r2a'nın almadığı 9 ekran: 22–30) ·
`sonra/` (03–30, bu görevin son hâli). Kapsam: `frontend/backoffice/` + `frontend/packages/chat` (isteğe bağlı `wide`;
varsayılan değişmedi → web uygulaması etkilenmez).

## 1. Özet
- **Yerel kopya mandalı tümüyle 0** (`tests/r2-baseline.json`, 8 kural): yerel h1, `.bo-table`, doğrudan `EkDataTable`,
  yerel segment, yerel sayfalama, yerel Yenile, `.bo-panel__bar`, el yazımı SVG grafik. bo-r2a sonu taban 82 ihlal / 40 dosya.
- Tüm sayfalar: `BoSection` bölümleri, `BoTileGrid` eş yükseklik, `BoStat` metrikleri (`EkMetricCard` kalmadı), `BoDataTable`
  + `BoPagination`, `BoFilterBar` + `BoSegmented`, eylemler sözlükten (`BoAction`), uzun sayfalar `BoTabs`/`BoViewSwitch`/
  `BoCollapsible` ile bölündü, 390 px'te sayfa düzeyinde yatay kaydırma yok.

## 2. Ortak sete eklenenler (yerel kopya yerine)
- `actions.ts`: `send` (Gönder), `rollback` (Geri al), `enable` (Etkinleştir), `reset` (Sıfırla, yıkıcı), `flush` (Boşalt,
  yıkıcı) — "Test e-postası gönder", "Bu sürüme geri al", yönetici "Etkinleştir"/"2FA sıfırla", önbellek "Aileyi boşalt"
  bunlara taşındı. §12.3 tablosu güncellendi; birim testi yıkıcı listeyi doğrular.
- `BoFilterBar`: alan grubu esnek tabanlı (`flex: 1 1 320px`) — arama ile aynı satırda kalır, sığmazsa kendi içinde sarar
  (Loglar'daki sayfa yaması kaldırıldı).
- `BoSection flush`: içteki `EkDataTable` kenarlığı/yarıçapı ortakta sıfırlanır (Yöneticiler, Yayın geçmişi yamaları kaldırıldı).
- `@entegrasyonik/chat` `ChatPanel` `wide` (isteğe bağlı, varsayılan kapalı) + tablo hücrelerinde `data-label` — §3.1.
- Ölü kod: `components/HealthKpi.vue` silindi.

## 3. Sayfa başına değişiklik

### 3.1 Otopilot (`/otopilot`) — BO2-P3
- **Geniş alan:** 760 px okunur sınır kalktı; sohbet sayfa genişliğini kullanır (1440'ta ~1130 px; UI parçaları 1180 px'e
  kadar, düz metin ≤ 80ch) ve görünür yüksekliği doldurur — sayfa kaymaz, yalnız konuşma kayar.
- **Yatay scroll yok:** sohbet gövdesi bir kap; kap < 560 px (yan panel 360–560 px, telefon) iken tablo satırları etiketli
  kart satırlara iner (thead ekran okuyucuya kalır). Geniş kapta tablo zaten sığar.
- **Sezgisel:** ≥ 1600 px sağda yardım sütunu — "Ne sorabilirsiniz" (platform sağlığı / kuyruklar / müşteriler; tek
  dokunuşla gönderir) + "Nasıl çalışır" (yalnız okur, kaydedilmez, her ekranda yanınızda) + Otopilot ayarı bağlantısı.
  Daha dar ekranda sütun yok (sohbet tüm genişliği alır; öneriler boş durumda). Başlıkta durum çipi ("Etkin" / hüküm özeti);
  tekrar eden "yalnız okur" meta satırı kaldırıldı (açıklamada var).
- **Paket:** `ChatPanel` `wide` prop'u (varsayılan `false`) → `.ek-chat.is-wide`; tüm geniş kurallar bu kapsamda (test:
  `packages/chat/tests/wide-layout.test.ts` — sızma yok, varsayılan sınıf yok, `data-label`). Backoffice tam sayfa ve yan panel
  `wide` kullanır; web uygulaması kullanmaz → davranışı aynı.

### 3.2 Müşteri kullanımı (`/musteriler/kullanim`) — BO2-P4
- Kutular arası boşluk: sayaçlar `BoStat` + `BoTileGrid :cols=3`, altında iki kart `BoTileGrid :cols=2` (eş yükseklik, 20 px ritim).
- Anlaşılırlık: her bölüm `BoSection` başlık + "bu ne anlatır" açıklaması; platform süzgeci başlıktan çıkıp `BoFilterBar`
  (+ "N süzgeç etkin / Filtreleri temizle").
- ECharts: masaüstü/mobil/belirlenemedi dağılımı `BoChart` halka (donut); günlük seri BoChart (SeriesBars).
- Müşteri detayı › Kullanım sekmesi (`TenantUsagePanel`) aynı dilde (7/30/90 gün `BoSegmented`).

### 3.3 Abonelikler (`/abonelikler`, `/abonelikler/:tid`) — BO2-P5
- Liste `BoTabs`: **Abonelikler (N)** · **Gelir metrikleri** (`?sekme=gelir`). Satır = abonelik detayı (müşteri adı bağlantısı
  + ayrı "Aç" eylemi) — "neyin neyi açtığı" açık.
- Detay: breadcrumb + başlıkta "Müşteriye git · #tid"; `BoStat` şeridi (Plan, dönem sonu/deneme bitişi, kart, olay sayısı →
  Olaylar sekmesi); sekmeler **Özet** · **Olaylar (N)** · **Eylemler**. Eylemler sekmesinde her düğmenin altında ne yaptığı /
  neden kullanılamadığı yazar; iptal K40/K41 `GuardedDialog` akışı (gerekçe + step-up + onay) aynen. Hükümdeki `#iptal`
  bağlantısı Eylemler sekmesini açıp iptal düğmesine odaklanır.
- Gelir: `BoStat` + aralık `BoSegmented` + durum dağılımı halka grafik.

### 3.4 Motor ve kuyruklar (`/motor`) — BO2-P6
- **Başarısız işler:** `BoViewSwitch` **Özet** / **Ayrıntılı** (`?gorunum=ayrinti`).
  - Özet: `BoStat` şeridi (başarısız iş, neden sayısı, en eski hata) + hata koduna göre gruplu tablo (insan okur neden + kod,
    iş türü dağılımı, adet, en eski) → "İşleri göster" o koda süzgeçli Ayrıntılı'ya geçer.
  - Ayrıntılı: **iş başına tür** (ör. "Sipariş çekme" + iş kimliği), **durum** rozeti (Başarısız / Yeniden deneniyor / Ölü
    mektup), **hata nedeni** (`codes.ts` iletisi + kod), deneme n/m, **zaman** (son / ilk hata), müşteri + entegrasyon, istek
    kimliği (kopyala), iz + yeniden dene / at. Toplu yeniden deneme, seçim, URL süzgeçleri korundu.
- Kuyruklar: kuyruk başına `BoSection`, `BoStat` + `BoTileGrid`, grafik ECharts. Durum makinesi: 2 sütun + "Takılı kiralar"
  tablosu. Zamanlanmış görevler: `BoViewSwitch` Görev durumu / Koşu geçmişi (`?goster=gecmis`), sonuç `BoSegmented`.
- Her sekmenin başında tek cümle "bu sekme ne anlatır".
- Eksik backend alanları mock'ta dolduruldu, sözleşmede opsiyonel (§6).

### 3.5 Diğer sayfalar — BO2-P7
- **Müşteriler:** `BoFilterBar` + `BoSegmented` (sayaçlı) + Filtreleri temizle; `BoTableFrame` (sıralama, `aria-sort`, satır
  tıklaması korundu); `BoPagination` (`total`). Mobilde ikincil sütunlar gizli.
- **Müşteri detayı:** `BoTabs`; özet kısaldı — üstte 4 `BoStat` (açık sorun, başarısız iş, etkin uyarı, son sipariş eşitleme;
  her biri ilgili ekrana), "Açık sorunlar" + "Etkin uyarılar" (3), hesap, iz sür; eşitleme/kuyruk ayrıntısı `BoCollapsible`.
  1440×900'de ilk ekranda hüküm + metrikler + ilk karar. Destek oturumu (K41) ve tehlikeli akışlar aynen.
- **Entegrasyonlar:** API sağlığı (`BoStat` ×4, `BoFilterBar`, `BoDataTable`), Dayanıklılık (`BoTableFrame`), Katalog (`BoFilterBar`
  + `BoDataTable` + 25'erli `BoPagination`). Sekmeler `BoTabs`.
- **Altyapı / Önbellek:** Redis, MongoDB, Yavaş sorgular, Önbellek — `BoStat` şeritleri, eş yükseklikli 2'li ızgaralar,
  `BoDataTable`; önbellek "Aileyi boşalt" sözlükte `flush` (yıkıcı, onaylı).
- **Loglar:** `BoTabs` Sorunlar / Akış (`?sekme=`); sol süzgeç sütunu kalktı → tek `BoFilterBar` (aralık, seviye, kaynak, arama,
  tek "Filtreleri temizle"); sorun çekmecesinde "Örnek ileti" ve "Son istekler" katlanır; `BoPagination`. URL sözleşmesi ve
  kayıtlı görünümler korundu.
- **Denetim:** yüzey `BoSegmented`, `BoFilterBar`, `BoTableFrame` + `BoPagination`; mobilde Aktör/Hedef/İstek satır ayrıntısında.
- **Yöneticiler:** `BoFilterBar` + `BoSegmented` (Tümü / 2FA yok / Kilitli / Davetler / Uzun süredir girmeyen, sayaçlı,
  `?filtre=`), `BoDataTable`; Davet et `add`, Devre dışı bırak / Daveti iptal et `cancel`, Etkinleştir / 2FA sıfırla sözlükten.
- **Sistem ayarları:** 5 sekme — Platform ayarları · Bakım modu · Özellik bayrakları · Ortam · Yayın geçmişi; hüküm bağlantıları
  sekmeyi açıp başlığa odaklanır; taslak çubuğu sekmelerin üstünde.
- **Rekabet:** durum kutuları sabit (eş yükseklik) + 4 sekme (Plan varsayılanları · Müşteri istisnaları · Fiyat kuralları ·
  Geçmiş ve denetim); `?tid=` istisnalar sekmesine.
- **Otopilot ayarları:** iki eş yükseklikli `BoSection`.
- **Bildirimler ve duyurular:** Duyurular (`BoFilterBar` + `BoDataTable`; "Yeni duyuru" `add`), editör 4 bölüm + yan önizleme
  (≤ 1023 px alta iner), detay `BoSection` + yan önizleme, Teslimler (`BoStat` şeridi, eş yükseklikli 2'li ızgara, `BoTableFrame`,
  satırda yeniden dene/at), Katalog (2 eş kutu, `BoTableFrame`, "Test e-postası gönder" `send`), Uyarılar, Müşteri geçmişi.
- **Giriş:** tipografi ölçeğe (iddia başlığı `title` rolü), dokunmatikte bağlantı/göz düğmesi ≥ 44 px. **Planlı ekranlar**
  (`/musteriler/yasam-dongusu`, `/destek`): `BoSection` + `BoTileGrid`, teknik ayrıntı katlanır.

## 4. İnceleme rotaları (yerel: `npm run dev:backoffice` → http://localhost:3100)
- Otopilot: http://localhost:3100/otopilot (sohbet için konsolda `window.__BO_CHAT_MOCK__={config:'enabled',speed:1}` + yenile;
  1600 px üstünde yardım sütunu, telefonda "Onay bekleyen siparişleri göster" → kart satır)
- Müşteri kullanımı: http://localhost:3100/musteriler/kullanim · http://localhost:3100/musteriler/102?sekme=kullanim
- Abonelikler: http://localhost:3100/abonelikler · http://localhost:3100/abonelikler?sekme=gelir · http://localhost:3100/abonelikler/101 ·
  http://localhost:3100/abonelikler/103?sekme=eylemler
- Motor: http://localhost:3100/motor · http://localhost:3100/motor?sekme=basarisiz (Özet) ·
  http://localhost:3100/motor?sekme=basarisiz&gorunum=ayrinti · http://localhost:3100/motor?sekme=basarisiz&gorunum=ayrinti&kaynak=dlq ·
  http://localhost:3100/motor?sekme=durum · http://localhost:3100/motor?sekme=zamanlanmis&goster=gecmis
- Müşteriler: http://localhost:3100/musteriler · http://localhost:3100/musteriler/102 · http://localhost:3100/musteriler/102?sekme=yasam-dongusu
- Entegrasyonlar: http://localhost:3100/entegrasyonlar · ?sekme=dayaniklilik · ?sekme=katalog
- Altyapı: http://localhost:3100/altyapi · ?sekme=mongodb · ?sekme=yavas · http://localhost:3100/altyapi/onbellek
- Loglar / Denetim: http://localhost:3100/loglar · http://localhost:3100/loglar?sekme=akis · http://localhost:3100/loglar?tid=104 ·
  http://localhost:3100/denetim
- Yöneticiler: http://localhost:3100/yoneticiler
- Sistem: http://localhost:3100/sistem/bayraklar (?sekme=bakim|bayraklar|ortam|gecmis) · http://localhost:3100/sistem/rekabet
  (?sekme=istisnalar|fiyat-kurallari|gecmis) · http://localhost:3100/sistem/otopilot
- Bildirimler: http://localhost:3100/sistem/duyurular · /sistem/duyurular/yeni · /bildirimler/teslimler ·
  /bildirimler/musteri-gecmisi?tid=101 · /bildirimler/katalog · /bildirimler/uyarilar
- Giriş: http://localhost:3100/giris · Planlı: http://localhost:3100/musteriler/yasam-dongusu
- Kareler: `docs/bo-r2-review/once/*.png` ↔ `sonra/*.png` (aynı ad; 01–21 öncesi bo-r2a `once/`'ta, 22–30 bu görevde)

## 5. Test sonuçları
Hepsi `cloud/bo-r2b` son hâlinde (bo-r2a birleşmesi sonrası), bulut Linux, Chromium `/opt/pw-browsers/chromium`.

| Kapı | Sonuç |
|---|---|
| `npm run test:backoffice` (backoffice vitest + ui) | **362 / 362** + **43 / 43** geçti (r2-system mandalları dahil; taban tümü 0) |
| `npx vitest run` (frontend tam) | **94 dosya, 1751 / 1751** geçti |
| `npm run test:chat` | **186 geçti, 1 atlandı** (yeni `wide-layout.test.ts` 3 test dahil) |
| `vue-tsc` (backoffice `typecheck` + frontend) | **0 hata** |
| Ratchet'ler | typecheck 0 (taban 0) · style OK (635 dosya) · pattern OK (319 dosya) · no-console OK (iyileşme web `src`'de, bu işten değil — taban yazılmadı) · **r2-system 8 mandal taban 0** |
| `test:contract-paths` | **171 / 171** OK |
| `npm run lint` | 0 hata (1193 uyarı, önceden var) |
| `build:backoffice` + `build` | ikisi de başarılı |
| Backoffice Playwright tam (3 proje: desktop, desktop-dark, mobile 390) | **385 geçti, 0 başarısız, 170 atlandı** (atlananlar proje/BO_REVIEW koşullu). İlk tam koşuda 6 başarısız → 4'ü bu işin eskimiş yerel `*-linux.png` tabanı (silinip `missing` ile yeniden üretildi), 2'si smoke log trendi iddiası (bo-r2a `role="img"` ile uyumlandı); düzeltme sonrası `smoke.spec.ts` 44 + 6 geçti |
| Frontend (web) Otopilot e2e (`otopilot.spec.ts` + `otopilot-harness.spec.ts`, 4 proje) | **117 geçti, 0 başarısız, 54 atlandı** (2 test ilk koşuda yalnız eksik linux tabanını yazdı; tekrar koşuda geçti) → paket değişikliği web sohbetini bozmadı |
| Yeni e2e `r2b-otopilot.spec.ts` | 1440: geniş sohbet (> 1000 px), yardım sütunu 1680'de, öneri gönderir, sayfa yatay/dikey kaymaz, tablo içte kaymaz · 390: tablo kart satır, `data-label`, oluşturucu görünür |

Not: ara adımlarda 7 paralel ajan nedeniyle makine yükü 45–60 idi; o sırada görülen giriş zaman aşımları yük kaynaklıydı,
son koşular yük ~1 iken yapıldı. `*-linux.png` commit'lenmedi.

## 6. Backend sözleşme istekleri (BE)
**BE-R2B-1 (BO2-P6, orta) — `BackofficeEngineService/listFailedJobs`.** UI tipleri `src/api/contracts/engine.ts`'te opsiyonel;
mock dolduruyor; alan yoksa UI türetir/"—" gösterir.
1. `FailedBullJob.jobType?: string` — iş türü kodu (BullMQ iş adı), örn. `"fetch-orders" | "push-status" | "push-cargo" |
   "fetch-claims"`. Yoksa `operation`'dan türetilir.
2. `FailedBullJob.state?: 'failed' | 'retrying'` — `failed` denemeler tükendi / kalıcı; `retrying` otomatik yeniden deneme sırada.
   Yoksa `failed`.
3. `FailedBullJob.firstFailedAt?: string` (ISO) — ilk hata; son hata mevcut `failedAt`. Yoksa `enqueuedAt` "Kuyruğa alındı" olarak.
4. `DlqRecord`: `jobType?`, `attemptsMade?: number`, `maxAttempts?: number`, `firstFailedAt?` — aynı anlamlar.
5. `ListFailedJobsResponse.groups?: Array<{ errorCode: string; jobType: string | null; count: number; oldestFailedAt: string;
   newestFailedAt?: string }>` — süzgece uyan TÜM kayıtlar için hata kodu × iş türü özeti (bullmq + dlq). Yoksa Özet görünümü
   ilk 50 işten hesaplar ve sayıyı örneklem olarak gösterir ("37+").
- İş türüne göre sunucu süzgeci (`jobType` sorgu parametresi) — şu an yalnız istemci tarafı gruplama.

**BE (bo-r2a'dan devreden, düşük):** `getPulse.calls.integration.hourly` ve `errorRate.integration.hourly` serileri.

Not: Bu görevin kapsamı `frontend/` olduğu için istek `docs/cloud-contracts`'a yazılmadı; yerel oturum oraya taşıyabilir.

## 7. PROPOSALS_PENDING (karar bekleyen öneriler)
- **P-R2B-1 Ortak set genişletmeleri** (ajanlardan; uygulanmadı, gerekçe: sayfalar onsuz da kurala uyuyor):
  `BoDataTable` için `emptyVariant` (veri yok / süzgeç sonucu yok ayrımı — Uyarılar, Duyurular, Teslimler'de yalnız metin farkı
  kaldı), sütun düzeyi `bo-hide-sm` (dar kapta EkDataTable zaten kart satıra iner), `BoTableFrame` sıralanabilir başlık hücresi
  (Müşteriler'de tek yerel `.bo-tenants__sort` kaldı), matris tabloları için dar ekranda kart satır (Dayanıklılık), `BoSegmented`
  seçeneğinde `hint`, `BoStat` "okunamadı" durumu, tekrar eden "halka + oran çubuğu" için ortak dağılım bileşeni.
- **P-R2B-2** `@entegrasyonik/chat` `wide` yerleşiminin web uygulaması Otopilot tam sayfa/yan panelinde de açılması
  (dar panelde tablo kart satır). Web'de davranış değişikliği olduğu için K48 gereği onaya bırakıldı; bu görevde web değişmedi.
- **P-R2B-3** Otopilot yardım sütununun 1280–1599 px aralığında daraltılabilir hâli (şu an yalnız ≥ 1600 px).
- (bo-r2a'dan sürer) R2 bileşenlerinin `@entegrasyonik/ui`'ye taşınması; ECharts parçasının ilk boyamadan sonraya alınması.

## 8. Bilinen eksikler
- Dayanıklılık matrisi 390 px'te kendi kabında yatay kayar (sayfa kaymaz); hücre metinleri kırpılır.
- Müşteri listesi mobilde kart satır değil: ikincil sütunlar gizli, tablo kendi bölgesinde kayabilir (sayfa kaymaz).
- Ayrıntılı başarısız işler 1440'ta ~3,4 ekran (ortak hüküm bloğu ~1000 px); Özet görünüm varsayılan (~1,9 ekran).
- Motor "at" onay diyaloğu düğmesi "Sil" (kalıcı silme açıklamasıyla), satır eylemi sözlükte "At".
- Loglar: canlı akış anahtarı pasif (uç yok); sekme sayacı "50+" yerine sayı.
- Sistem ayarları taslak çubuğundaki "Vazgeç" yerel düğme ve onaysız (önceki davranış korundu).
- Görsel tabanlar (`*-win32.png`) Windows'ta yeniden üretilmeli: başlık/bölüm/sekme düzenleri değişti (smoke tabanları fark verecek — beklenen).
