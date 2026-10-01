# BO-WDG denetimi — web-design-guidelines (K60) · backoffice

Dal: `cloud/bo-wdg` (← `origin/cloud/bo-r2b` + `origin/main`). Kural seti: `.claude/skills/web-design-guidelines/guidelines.md`
(yerel kopya) + SKILL.md proje uyarlaması; proje kuralları önceliklidir (`BO_UI_PATTERNS.md` §6, §8, §9, §12, premium-ui-standards).
Kapsam: `frontend/backoffice/src` (106 Vue dosyası, 3 stil dosyası) + backoffice'in kullandığı `@entegrasyonik/ui` ve
`@entegrasyonik/chat` parçaları. Yöntem: dört paralel salt-okur denetim (ortak katman · ana sayfalar · müşteri/motor/altyapı ·
bildirim/ayar/Otopilot), her bulgu kodda doğrulandı. Biçim `dosya:satır - bulgu → karar`. Yollar `frontend/backoffice/`
köküne göredir; paket dosyaları `packages/...` (= `frontend/packages/...`). Satır numaraları denetim anındaki
(`d7fbe495`) hâldir.

Karar etiketleri: **[U]** uygulandı · **[A]** atlandı (gerekçe satırda) · **[V]** zaten karşılanıyor / yanlış pozitif.

## Zaten karşılanan (bulgu sayılmadı)
- Genel `:focus-visible` halkası `packages/ui/src/styles/vuetify-overrides.css:171`; yerel `outline:none` kullanımlarının hepsi
  `box-shadow: var(--ek-focus-ring)` ile değiştirilmiş.
- Hareket: tüm geçişler `--ek-duration-*`/`--ek-transition-colors`; reduced-motion kökte sıfırlar (`packages/ui/src/styles/app.css:99`).
  `transition: all` yok. `...` yok; yükleme metinleri `…` ile bitiyor (iki istisna aşağıda).
- `content-muted` tüm yüzey token'larında AA (`packages/ui/src/tokens/roles.ts:144` testi); her ekran iki temada axe 0 (e2e).
- Yalnız ikonlu `BoAction` düğmeleri `boActionLabel` ile ad alır; `EkCopyButton`/`EkRefreshButton` ad + canlı bölge taşır.
- Yönetici/iş/abonelik/önbellek/kira yıkıcı işlemleri `GuardedDialog` → `DangerActionDialog` (gerekçe + step-up) üzerinden.
- "İçeriğe geç" bağlantısı, koyu temada `color-scheme`, `theme-color` meta, toast `aria-live`, dokunmatik 44 px katmanı (`styles/mobile.css`).

## KRİTİK
- src/views/AuditView.vue:302 - ≥768 px `.bo-filter__fields { flex-wrap: nowrap }` sayfa yaması: 4 alan × 150 px + segment ≈ 900 px; 768–1200 px'te sayfa yatay taşar → **[U]** yama kaldırıldı (ortak `BoFilterBar` sarması geçerli).
- src/views/LogCenterView.vue:206,925 - sorun çekmecesi "Son istekler" satırı sarmıyor, tam reqId `<code>` kırılmıyor → 390 px'te çekmece yatay taşar → **[U]** satır sarar, kimlik `overflow-wrap:anywhere`.
- src/views/notifications/AnnouncementDetailView.vue:60,64 · AnnouncementPreview.vue:90 · CatalogView.vue:84 - kullanıcı metni (başlık/gövde/parametre önizleme) kırılmıyor; kesintisiz URL 390 px'te taşar → **[U]**.
- src/views/settings/SettingsView.vue:17 · CompetitionSettingsView.vue:136 (kök `usePlatformConfig.ts:110`) - taslak çubuğu "Vazgeç" sunucudaki taslağı onaysız ve geri alınamaz siler → **[U]** onay diyaloğu (ne silinir, kaç ayar, geri alınamaz).
- src/views/notifications/AnnouncementEditorView.vue:8 - "Vazgeç" dolu formu onaysız atar; editörde ayrılma uyarısı yok → **[U]** ortak `useLeaveGuard` (yönlendirici + `beforeunload`) ve onay.
- packages/chat/src/components/ChatPanel.vue:14 - "Yeni sohbet" konuşmayı onaysız ve geri alınamaz siler (backoffice'te kaydedilmez) → **[U]** isteğe bağlı `confirmReset` prop'u (varsayılan kapalı → web değişmez); Otopilot açar.
- src/components/SavedViewsMenu.vue:26 - "Görünümü sil" tek tıkla, onaysız, geri alınamaz; odak `body`'ye düşer → **[U]** toast'ta "Geri al" + odak listeye.
- src/pwa/PushCard.vue:110 - başka cihazın bildirim aboneliğini onaysız kaldırır (uzaktan geri eklenemez), çift tık iki çağrı → **[U]** onay + satır meşgul durumu.
- src/components/triage/BoStatusHeader.vue:30 - `to` olan olgu `RouterLink`'e `:href="undefined"` geçer → href'siz `<a>`, klavyeyle odaklanmaz → **[U]** bağlama düzeltildi.

## YÜKSEK
- src/layouts/ShellLayout.vue:25 - `v-main` + iç `<main id="bo-main">` → iki main işareti → **[U]** `v-main tag="div"`.
- src/router.ts:61 · ShellLayout.vue:127 - rota değişince odak taşınmıyor / duyurulmuyor; mobilde çekmece kapanınca odak ekran dışında kalır → **[U]** gezinmeden sonra odak `#bo-main`'e.
- ShellLayout.vue:140 · styles/backoffice.css:2 - sabit üst bar klavye odağını ve `#` çapalarını örter (WCAG 2.4.11) → **[U]** `scroll-padding-top`.
- 66 yer `outline:none` + `box-shadow` odak (ör. styles/backoffice.css:98, kit.css:231, r2/BoAction.vue:112) - Windows yüksek karşıtlık (`forced-colors`) kipinde odak görünmez → **[U]** tek genel `@media (forced-colors: active)` kuralı (`packages/ui` — normal görünüm değişmez).
- src/components/shell/CommandPalette.vue:321 - palet arama alanı `outline:none`, yerine odak yok → **[U]**.
- src/components/SavedViewsMenu.vue:35 - hata `<p>` alana bağlı değil, odak alana dönmüyor → **[U]**.
- packages/ui/src/components/EkDataTable.vue:129 - kaydırma kabı odaklanamaz (axe scrollable-region-focusable); bağlantısız tablolarda klavyeyle yatay kaydırılamaz; 6 sayfa yerel `tabindex` yaması (CacheView:24, MongoPanel:36, RedisPanel:46, SlowQueriesPanel:20, ApiHealthPanel:29, CatalogPanel:39) → **[U]** ortak `BoDataTable` bölgesi odaklanır; sayfa yamaları kaldırıldı.
- packages/ui/src/components/EkDataTable.vue:187 - hücre 14 px (`--ek-font-size-md`), §12.2 tablo rolü 13 px; `BoTableFrame` 13 → iki liste farklı boyut → **[U]** `BoDataTable` tablo rolünü uygular (web uygulaması değişmez).
- src/components/r2/BoFilterBar.vue:109 - "Filtreleri temizle" kendini kaldırır → odak `body` → **[U]** odak ilk alana.
- src/components/triage/BoAttentionList.vue:79 - "N madde daha göster" tıklanınca kaybolur → odak kaybı → **[U]** odak ilk yeni maddeye.
- packages/ui/src/components/EkProblemState.vue:23 - yüklemeden sonra çıkan hata ekran okuyucuya duyurulmuyor → **[U]** `BoPanelState`/`StateBlock` hatayı canlı bölgede duyurur.
- src/views/LogCenterView.vue:480 - `getIssueTrend` hatası yakalanmıyor: iskelet sonsuza döner, yakalanmamış ret; hızlı seçimde eski yanıt üste yazar → **[U]** hata + Tekrar dene + yarış koruması.
- src/views/LoginView.vue:55,84,108 - sunucu hatası serbest `role=alert`; alan `aria-invalid` olmaz, odak alana dönmez → **[U]**.
- src/views/admins/AcceptInviteView.vue:87,116 - doğrulama/sunucu alan hatasında odak ilk hatalı alana gitmez → **[U]**.
- src/views/admins/AcceptInviteView.vue:25 - `new-password` formunda kullanıcı adı alanı yok (parola yöneticisi) → **[U]** gizli `autocomplete="username"` (davet e-postası biliniyorsa).
- TenantDetailView.vue:228,237 · SubscriptionDetailView.vue:92,119,133 · FailedJobsPanel.vue:188,207 · StateMachinePanel.vue:59 · CacheView.vue:49 - `GuardedDialog`'a `tenant`/`scope` verilmiyor → §6 "Etkilenen" satırı yok → **[U]**.
- SubscriptionDetailView.vue:275,297,328 · FailedJobsPanel.vue:446,453 · StateMachinePanel.vue:122 · CacheView.vue:128 - korumalı yazma sonrası düz `notify`; §6 "Denetim kaydını aç" bağlantısı yok → **[U]** ortak `notifyAuditedAt`.
- src/views/usage/TenantUsagePanel.vue:17 (UsageVerdictBlock.vue) - yerel hüküm bloğu; `UsageView` aynı model için ortak `PageVerdict` kullanıyor → **[U]**.
- src/styles/kit.css:164 (`.bo-id` nowrap) · FailedJobsPanel.vue:124 - uzun iş/istek kimliği < 600 px kart satırında taşar → **[U]** kart kipinde kırılır.
- src/views/TenantDetailView.vue:98 - `ruleId · scopeKey` kırılmıyor → 390 px taşma → **[U]**.
- src/views/engine/EngineView.vue:12 - doğrudan `EkPageTabs` (§12.1 `BoTabs`) → **[U]**.
- src/views/settings/usePlatformConfig.ts:58 - ayarlarda kaydedilmemiş değişiklikle çıkışta uyarı yok → **[U]** `useLeaveGuard`.
- src/views/settings/usePlatformConfig.ts:56 - Yenile (Alt+R) kaydedilmemiş düzenlemeleri sessizce siler → **[U]** değişiklik varken form sıfırlanmaz, Yenile önce sorar.
- src/views/notifications/AnnouncementEditorView.vue:9,23,349 - Kaydet geçersizken kapalı, `touched` yalnız diyalogda → satır içi hatalar hiç görünmez → **[U]** Kaydet etkin; tıklanınca hatalar görünür + ilk hataya odak.
- src/views/settings/usePlatformConfig.ts:96 - sunucu alan hatasında odak ilk hatalı alana gitmez → **[U]**.
- src/views/settings/MaintenanceCard.vue:37 · FeatureFlagsPanel.vue:36 · PricingRulesPanel.vue:22 - `cfg.saveError` bu sekmelerde hiç çizilmez → **[U]** tek yer: taslak çubuğu.
- src/views/settings/CompetitionPlansPanel.vue:23,36 - hücre hatası yalnız kırmızı kenar; ileti alana bağlı değil → **[U]** `aria-invalid` + `aria-describedby`.
- src/views/otopilot/OtopilotSettingsView.vue:294 - zorunlu gerekçe alanının satır içi hatası/sayacı yok → **[U]**.
- src/views/otopilot/OtopilotView.vue:20 · packages/chat/src/components/ChatPanel.vue:45 - `setup-required` + `canConfigure` → gerekçesiz kurulum formu; kayıt hiç başarılı olamaz → **[U]** backoffice sohbet sayfasında kurulum yerine ayar sayfası bağlantısı.

## ORTA
- packages/ui/src/components/EkDialogCard.vue:170 · CommandPalette.vue:328 · ShortcutsDialog.vue:107 - `overscroll-behavior: contain` yok → **[U]**.
- packages/ui/src/components/EkDialogCard.vue:163 - diyalog açıklaması kırılmıyor (TraceDialog reqId ≤128) → **[U]**.
- src/components/TraceDialog.vue:186 - uzun ileti diyalogu yatay kaydırır → **[U]**; :17,24,31 `{{ n }} ms` biçimsiz → **[U]**.
- src/components/charts/BoChart.vue:105 - tüm değerler 0 iken "Bu aralıkta ölçüm yok" (gerçek "0 hata" yanlış anlatılır) → **[U]**.
- src/components/charts/BoChart.vue:25 - rolsüz div'de `aria-label`/`aria-busy`; yükleme metni `…`'sız → **[U]**.
- src/components/r2/BoStat.vue:142 - ⓘ ikonu `content-subtle` (≈2,4:1, anlam taşıyor) → **[U]** `content-muted`.
- src/components/r2/BoStat.vue:18 - değişim yönü yalnız ikon/renk; bağlantılı kutuda `aria-label` değişim ve ⓘ bilgisini yutar → **[U]** yön metni + etikete ekleme.
- src/styles/backoffice.css:206 - `.bo-seg__opt:disabled` stili yok (tıklanabilir görünür) → **[U]**.
- src/components/r2/BoFilterBar.vue:110 · FailedJobsPanel.vue:33 - `aria-live` `v-if` içinde; ilk görünüş duyurulmaz → **[U]** bölge kalıcı.
- src/components/shell/BoPageHeader.vue:36 - otomatik yenileme başarısızlığı ("Yenilenemedi") duyurulmaz → **[U]**.
- src/components/r2/BoTileGrid.vue:57 - otomatik kipte `data-span="2"` tek sütunluk kapta örtük ikinci sütun açar → **[U]**.
- packages/ui reduced-motion: Vuetify çekmece kayması ve `v-progress-circular` dönüşü süre token'ı kullanmaz → **[U]** genel kural.
- src/views/LogCenterView.vue:34,116,182 · AlertsView.vue:217 · DeliveriesView.vue:33 · RevenuePanel.vue:52,103 · CacheView.vue:128 · TenantHistoryView.vue:59 - sayılar binlik ayırıcısız → **[U]** `formatCount`/`ek-num`.
- src/views/infra/RedisPanel.vue:25 - parçalanma oranı nokta ondalıkla ham → **[U]**.
- src/views/integrations/ResiliencePanel.vue:85 - el yazımı `ago()` saate geçmez ("180 dk önce") → **[U]** ortak biçimleyici.
- src/views/engine/FailedJobsPanel.vue:175,209,453 - satır eylemi "At", diyalog "silinsin mi?/Sil", toast "silindi" → **[U]** "İş atılsın mı? / Gerekçeyle at / atıldı".
- src/views/engine/FailedJobsPanel.vue:75,172,179 - `aria-label` görünen metni içermiyor (label-in-name) → **[U]**.
- src/views/engine/FailedJobsPanel.vue:527 - sabit `150ms ease-out` geçişi → **[U]** `--ek-transition-colors`.
- src/views/billing/SubscriptionsPanel.vue:55 (kök `r2/actions.ts:53`) - satır bağlantısı her satırda aynı ad "Abonelik ayrıntı" → **[U]** benzersiz ad.
- src/views/billing/SubscriptionDetailView.vue:75,79,83 - devre dışı düğmenin nedeni bağlı değil → **[U]** `aria-describedby`.
- src/views/AuditView.vue:15,240 - "Müşteri no" rakam değilse sessizce yok sayılıyor, sayaç sayıyor → **[U]** satır içi hata.
- src/views/LoginView.vue:83,70,107 · :37 · AdminsView.vue:65 · DeliveriesView.vue:45 - kod/e-posta alanlarında `spellcheck`/`autocapitalize`/`autocorrect` yok → **[U]**.
- src/views/LoginView.vue:180 · UsageSummary.vue:163,171 - hata iletisi sonraki adımı söylemiyor → **[U]**.
- src/views/LoginView.vue:233 - kurtarma kodu indirmesi: bağlantı DOM'a eklenmeden hemen `revokeObjectURL` (Safari/Firefox iptal edebilir) → **[U]**.
- src/views/notifications/AnnouncementsView.vue:5 · AnnouncementDetailView.vue:16 - gezinti `@click="router.push"` (Ctrl/orta tık yok) → **[U]** `:to`.
- src/views/notifications/AlertsView.vue:72 · DeliveriesView.vue:86 - satır düğmeleri aynı/ham kimlikli ad → **[U]**.
- src/views/settings/SettingField.vue:44 - destek e-posta/telefon alanı düz metin → **[U]** `type`/`inputmode`.
- src/views/settings/HistoryPanel.vue:15 - devre dışı "Geri al" nedeni yalnız `title`; `aria-label` görünen metni içermiyor → **[U]**.
- src/views/settings/CompetitionPlansPanel.vue:67 - `role=alert` listesi her tuşta yeniden okunur → **[U]** `aria-live=polite`.
- src/views/otopilot/OtopilotView.vue:20 - sohbet `autofocus` mobilde klavyeyi açar → **[U]** yalnız ince işaretçide.
- src/views/LogCenterView.vue:598 · TechDetails.vue:447 · AuditView.vue:403 - test edilmeyen kontrast çiftleri → **[V]** e2e axe iki temada 0 ihlal (bu ekranlar ölçülüyor).
- src/views/infra/MongoPanel.vue:38 · notifications/CatalogView.vue:37 - seçimden sonra açılan bölüme odak/duyuru yok → **[A]** içerik aynı sayfada hemen altta, düşük etki.
- packages/chat/src/styles/chat.css:145 · EkDataTable.vue:210 - dar kart kipinde tablo semantiği kayabilir → **[A]** axe 0, kart satırda `data-label` görünür; doğrulama ekran okuyucuyla yerelde.
- src/views/LoginView.vue:56 · AdminsView.vue:63 · ReauthDialog.vue:75 · DangerActionDialog.vue:178 - gönder düğmesi geçerli olana dek kapalı → **[A]** proje deseni (EkDialog `confirm-disabled` + görünür ipucu, her diyalogda aynı); tek sayfada değiştirmek tutarsızlık yaratır.
- src/views/admins/AdminsView.vue · OtopilotSettingsView.vue - `autocomplete="off"` yönetici iç formlarında → **[A]** parola yöneticisini tetikleyen alan yok.
- packages/ui/src/components/EkRelativeTime.vue:9 - mutlak zaman ipucuna klavyeyle ulaşılmaz → **[A]** ekran okuyucu mutlak zamanı okuyor; ortak paket davranışı (web) değişir.
- src/components/TopBar.vue:84 / utils/format.ts:6 - iki göreli zaman biçimi ("3 dakika önce" / "3 dk önce") → **[A]** metin birliği ürün kararı → PROPOSALS_PENDING.
- navigation/hotkeys.ts - tek tuş kısayollarını kapatma yok (WCAG 2.1.4) → **[A]** ayar gerektirir → PROPOSALS_PENDING.
- packages/ui/src/components/EkToastHost.vue:12 - iç içe canlı bölge; 8 sn eylemli toast → **[A]** ortak paket (web) davranışı; öneri.
- BoPanelState / StateBlock - iki durum bileşeni → **[A]** §4/§12.1 ikisine de izin veriyor; birleştirme R2 taşıma işi.
- src/components/r2/BoTabs.vue:12 / EkPageTabs - sekme paneli `tabpanel`/`aria-controls` → **[A]** Vuetify sekme bileşeni kendi rollerini veriyor; panel bağı ortak paket işi (öneri).
- kit.css:221 `.bo-act-link` · BoAction.vue:87 - uzun eylem etiketi dar kartta taşabilir → **[A]** sözlük etiketleri kısa; ölçülen taşma yok (e2e 390 yatay taşma testi yeşil).
- src/views/usage/TenantUsagePanel.vue:22 - metrik rolü `BoStat` dışında → **[U]** (YÜKSEK maddesiyle birlikte `BoStat`'a geçti).

## DÜŞÜK
- src/components/charts/BoChart.vue:25 · triage/BoStatusHeader.vue:21 · billing/RevenuePanel.vue:98 - yükleme metni `…`'sız → **[U]**.
- src/views/otopilot/OtopilotSettingsView.vue:297 · chat/setupReason.ts:15 - "10-500" → "10–500" **[U]**.
- src/views/notifications/AnnouncementEditorView.vue:65,85 · DeliveriesView.vue:45 - yer tutucu `…`/örnek, düz tırnak → **[U]**.
- src/views/AuditView.vue:21 - "Kaldır" bağlamsız → **[U]** ad.
- src/views/admins/AdminsView.vue:42 - "X etkinleştir" → "X hesabını etkinleştir" **[U]**.
- src/views/TenantsView.vue:90 - rolsüz `<span aria-label>` → **[U]** kaldırıldı.
- src/views/infra/MongoCollections.vue:29 - `aria-controls` yalnız açıkken var olan satıra → **[U]**.
- src/components/shell/ShortcutsDialog.vue:86 - kapat düğmesi 32 px (dokunmatik katman dışı) → **[U]**.
- src/components/shell/CommandPalette.vue:56 - tüm alt bilgi `aria-live` → **[U]** yalnız sayaç; :273 tehlikeli diyalog açıkken Ctrl+K → **[U]** engellendi.
- src/pwa/PwaPrompts.vue:18 - rolsüz ikonda `aria-label` → **[U]**.
- src/views/overview/PulseTrends.vue:1 - çelişen eski başlık yorumu → **[U]** silindi.
- notifications/notificationsVerdict.ts:22 - "14:30'ye dek" ses uyumu → **[U]** "14:30'a dek" yerine "bitiş 14:30".
- src/views/settings/OverrideDialog.vue:102 - temizle düğmesi onayla aynı ad → **[U]** "Alanları temizle".
- src/views/admins/AcceptInviteView.vue:10 · PlannedView.vue:8 (⌘K) · TechDetails.vue:57/OverviewView.vue:58,86 (düz metin yönlendirme) · UsageSummary.vue:212 · AdminsView.vue:21 (`ek-num` e-postada) · TraceDialog.vue:241 · TopBar.vue:47 (menuitemradio) · index.html:36 (theme-color uygulama teması) · ReauthDialog.vue:81 · DangerActionDialog.vue:90 · OtopilotDock.vue:146 · EkDataTable.vue:42 (boş `th`) · billing/SubscriptionEvents.vue:8, JobRunsPanel.vue:67, StateMachinePanel.vue:111 (İngilizce enum) · TenantDetailView.vue:5/SubscriptionDetailView.vue:6 (boş `lede`) · `N gün` nbsp · ölü CSS · ConfigDiff.vue:76 (`.bo-sr` kopyası) · FeatureFlagsPanel.vue:25 · DeliveriesView.vue:71 · `title`-yalnız açıklamalar (Resilience/SlowQueries/ApiHealth) · PlatformFilter.vue:53 (38 px yerel select) · LogCenterView.vue:129 (pasif Canlı anahtarı) · LogCenterView.vue:75 (tabpanel bağı) → **[A]** kozmetik/metin cilası; görünür etkisi küçük, bir sonraki sayfa işinde ele alınır (REPORT §4).

## ATLANDI (overengineering / kapsam dışı)
- URL-durum senkronu: JobRunsPanel `job/status`, CatalogPanel `target/group/query`, ApiHealth/SlowQueries/Revenue aralığı, duyuru tür süzgeci, katalog arama/yüzey, Otopilot önizleme sekmesi — ürün kararı (hangi durum paylaşılır) gerektirir.
- Sanallaştırma: hiçbir liste sayfa başına 50 kaydı aşmıyor (imleçli 25–50, palet ≤ ~40, dikkat listesi 3–5).
- `text-wrap: balance`, `<link rel=preconnect>` (CDN yok), görsel boyutları (yalnız sabit boyutlu SVG QR) — etkisiz.
- Title Case — Türkçe cümle düzeni (SKILL.md uyarlaması).
- Kırılım tutarsızlığı (599 / 599.98 / 600 / 767 px) — görsel etkisi yok.
- `DangerActionDialog` gerekçe alanı için ayrılma uyarısı — kısa gerekçe, Esc ile vazgeçme bilinçli.
- Giriş TOTP sayacının `aria-hidden` olması — saniyelik duyuru gürültü olurdu (doğru tercih).
- Giriş/davet `autofocus` — tek birincil alan, masaüstü öncelikli yönetim konsolu; mobilde kabul edilebilir.
