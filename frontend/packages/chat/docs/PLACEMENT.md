# Otopilot yerleşim kararı (CHAT-FE-2, web uygulaması)

Durum: **Uygulandı (bulut, `cloud/chat-fe`)** · Tarih: 2026-09-30 · Çerçeve: `docs/cloud-contracts/CHAT_UI_CONTRACT.md` §7.1–7.1b, §8;
ADR-0034 Karar 7; kullanıcı kararları K21, K36–K39 (`docs/adr/USER_DECISIONS.md`).
Kural: referans ürün adı yazılmaz (K07) — aşağıdaki gerekçeler davranış kalıpları ve standartlara dayanır.

## 1. Özet karar

| Konu | Karar |
|---|---|
| Birincil yüzey | **Sağ yan panel** (`ChatPanel mode="side"`), kabuğun TEK bağlama noktası `src/chat/OtopilotDock.vue` (SecureLayout içinde bir satır). |
| ≥ 1280 px | **İtme (push):** kalıcı sağ çekmece Vuetify düzen katmanına katılır → `--v-layout-right` sekme şeridini + çalışma alanını daraltır. Kabuk kodu değişmedi. |
| 768–1279 px | **Üstüne binme (overlay):** geçici çekmece, **scrim yok** (içerik tıklanabilir kalır), gölgeli kenar, Esc kapatır. |
| < 768 px | Panel yok. Giriş noktaları **tam sayfa** sekmesini açar; composer altta, `visualViewport` ile ekran klavyesinin üstünde kalır. |
| Genişlik | Varsayılan 400 px, **360–560 px** arası; sol kenardaki ayırıcı sürüklenir ya da klavyeyle (`←/→` 16 px, `Home` en geniş, `End` en dar) ayarlanır (`role="separator"`, `aria-valuenow`). |
| Kalıcılık | Yalnız `{ open, width }` → `localStorage['ek:chat:<userId>:<tenantId>']`. Konuşma metni/anahtar yazılmaz (K38). |
| Kapat / genişlet | Başlıkta: Yeni sohbet · Ayarlar (yöneticiye) · Tam sayfada aç ↔ Yan panele al · Kapat. |
| Tam sayfa | `screens.ts` `{ key: 'chat', slug: CHAT_PRODUCT.slug }` → `/otopilot`; `ChatPanel mode="page"`, okunur genişlik ≤ 760 px ortalanmış. Yan panelden geçişte **aynı konuşma** sürer (tek denetleyici). Sayfa sekmesi etkinken yan panel gizlenir. |
| Giriş noktaları | 1) Üst bar düğmesi (ikon + ad + kısayol ipucu; dar ekranda yalnız ikon) — `EkAppHeader #end-start` yuvası, ui paketine dokunulmadı. 2) Komut paleti (Ctrl/⌘+K) sorgu ≥ 2 karakterde **en üstte** "Otopilot'a sor: «…»" satırı → Enter panelde açar ve gönderir. 3) **Ctrl/⌘+J** aç/kapat (`shortcutCatalog.ts` `APP_SHORTCUTS`, kısayol diyaloğunda "Görünüm"; çakışma testi). 4) Bağlamsal açılış: etkin sekmenin ekranı/kaydı bağlam çipi olarak eklenir (kaldırılabilir). |
| Kurulum (BYOK) | `setup-required`'da panel gövdesi `ChatProviderSetup` (sohbet listesi yerine); kaydedince aynı panelde sohbete geçer. **Ayarlar → Otopilot** ekranı (`OtopilotSettingsView`, slug `settings/otopilot`) aynı bileşeni `variant="settings"` ile barındırır (durum, test, kullanım, kaldır, onayı geri al). |
| Görünürlük | `AgentInfo`: `DISABLED` → tüm giriş noktaları gizli, `/otopilot` `ChatUnavailable`; `SETUP_REQUIRED`/`MAINTENANCE` → görünür. |
| Yaşam döngüsü | Tek denetleyici (Pinia `useOtopilotStore`). Çıkış (`resetAllStores`) ve oturum kapsamı değişimi (tenant, impersonation: `userId:tenantId`) → konuşma sıfırlanır, yeni denetleyici. |

## 2. Gerekçe (best practice)

1. **Sağ yan panel, ≥ 1280 px'de itme.** Sohbet bir "yardımcı iş alanı"dır: kullanıcı tablodaki siparişe bakarken soru sorar,
   karttaki bağlantıyla ekrana geçer. Üstüne binen panel ≥ 1280 px'de içeriğin sağ %30'unu (tablo sütunları, satır eylemleri)
   kalıcı olarak örter; itme bunu önler ve WCAG 2.2 **2.4.11 Odak gizlenmez** riskini (odaklanan öğenin panel altında kalması)
   ortadan kaldırır. 1280 px altında itme, çalışma alanını 700 px'in altına düşürüp liste ekranlarını mobil düzene iter —
   bu yüzden overlay. Kabuk zaten Vuetify düzen katmanı (`--v-layout-*`) ile konumlandığından itme **sıfır kabuk değişikliğiyle**
   gelir (FR2-SHELL ile çakışmaz).
2. **Overlay'de scrim yok.** Sohbet modal değildir; kullanıcı paneli açık tutarken arka plandaki listeyi kaydırıp seçebilmelidir.
   Scrim modal beklentisi doğurur ve odak tuzağı gerektirir (WAI-ARIA APG "dialog (modal)" kalıbı); panel bu yüzden
   `aside` (tamamlayıcı bölge) olarak işaretlidir, odak tuzağı yoktur, Esc kapatır ve odak açan öğeye döner.
3. **Genişlik 360–560 px.** 360 px: 8 kolonluk tablo parçası yatay kaydırmayla okunur, onay kartı iki düğmeyi tek satırda taşır;
   560 px üstü panel ile içerik arasında "iki ana alan" rekabeti başlatır. Sürükle-boyutlandırma klavyeyle de yapılabilir
   (WCAG 2.1.1 Klavye, 2.5.7 Sürükleme hareketlerine alternatif).
4. **Mobilde yalnız tam ekran.** 390 px'de yan panel içerik bırakmaz; tam sayfa sekmesi tarayıcı geri tuşu ve URL (`/otopilot`)
   ile doğal gezinir. Ekran klavyesi açılınca düzen görünümü değişmediğinden composer klavye altında kalırdı —
   `visualViewport` yüksekliği CSS değişkenine yazılır (`--ek-otopilot-vvh`), composer görünür kalır (WCAG 1.4.10 Reflow).
5. **Komut paletinde "sor" en üstte.** Palet kullanıcının "ne istediğini yazdığı" tek yerdir; ekran eşleşmesi yoksa bile doğal dil
   sorusu bir çıkış bulur. Satır yalnız ≥ 2 karakterde ve Otopilot açıkken görünür; kapalıyken (DISABLED) paletin eski
   davranışı (ilk ekran eşleşmesi Enter ile açılır) aynen korunur.
6. **Ctrl/⌘+J.** Ctrl+K arama olduğundan komşu, tek elle erişilen, tarayıcının **ayrılmış olmayan** (sayfa tarafından
   ezilebilen) bir tuş; mevcut kabuk/bileşen kısayollarıyla çakışmaz (test). Metin alanındayken de çalışır — composer'dan
   paneli kapatmak için. Tek karakter kısayolu değildir (WCAG 2.1.4).
7. **Bağlamsal açılış = otomatik çip, kaldırılabilir.** Kullanıcı "bu siparişler" dediğinde model hangi ekranı kastettiğini
   bilir; çip neyin gönderildiğini görünür kılar ve tek tıkla kaldırılır (ADR-0034 Karar 3). Bağlam yalnız `screens.ts`'te
   kayıtlı ekran anahtarı + teknik kimlik + `urlParams`'ta izinli filtrelerdir (PII/serbest metin yok — `globalSearch` gibi
   alanlar kayıtta olmadığı için geçmez; test).
8. **Kurulum sohbetin içinde değil, bir ayar formu.** Anahtar hiçbir zaman sohbet/LLM kanalından geçmez (ADR-0034 Karar 9);
   form panelde aynı bileşenle ilk kurulumu hızlandırır, ayarlar ekranı ise kalıcı yönetimi (durum, kullanım, kaldırma, onayı
   geri alma) taşır. Sahip onayı ayrı eylemdir; aktarım metni herkese görünür, onay kutusu yalnız sahipte.

## 3. Uygulama haritası

| Dosya | Rol |
|---|---|
| `src/layouts/SecureLayout.vue` | `<OtopilotDock />` + Ctrl/⌘+J bağlama + `otopilot.init()` (3 küçük ekleme). |
| `src/components/layout/ApplicationBar.vue` | `#end-start` yuvasında `<OtopilotLauncher>`. |
| `src/components/layout/ShellSearch.vue` | "Otopilot'a sor" grubu (en üstte). |
| `src/navigation/screens.ts`, `src/stores/site/menu.ts`, `src/stores/workspace.ts` | `chat` + `OtopilotSettingsView` kaydı ve istemci bağlantıları (yardım merkezi emsali). |
| `src/navigation/shortcutCatalog.ts` | `APP_SHORTCUTS` (`otopilotToggle`), `matchAppShortcut`, `appShortcutKeys` — ui kaydına dokunmadan. |
| `src/chat/*` | Mağaza (tek denetleyici, tercihler), host (bağlantı çözümü, durum çipleri, telemetri), taşıyıcı seçimi, sayfa bağlamı, dock, başlatıcı. |
| `src/views/secure/OtopilotView.vue`, `src/views/secure/settings/OtopilotSettingsView.vue` | Tam sayfa + ayarlar. |

Paket boyutu: sohbet arayüzü (bileşenler + markdown-it) **tembel** yüklenir (panel ilk açıldığında); mock taşıyıcı üretim
paketine girmez (yalnız dev bayrağı ya da `VITE_CHAT_TRANSPORT=mock`). Kabukla gelen: denetleyici + `sse` taşıyıcı + zod
şemaları (giriş noktalarının görünürlüğü `info()`'ya bağlı olduğu için).

## 4. Taşıyıcı seçimi (dev / test)

- Varsayılan `sse` → `<VITE_API_BASE_URL>/agent`. Electron aynı derlemeyi yüklediği için aynıdır (K36).
- `VITE_CHAT_TRANSPORT=mock` → mock (demo).
- Yalnız geliştirmede: `window.__EK_CHAT_MOCK__ = { config, speed }` (Playwright init script) ya da
  `localStorage['ek-chat-mock'] = 'setup-required'` vb. (elle inceleme). Yapılandırmalar: `enabled`, `unavailable`,
  `maintenance`, `setup-required`, `setup-no-permission`, `consent-pending-owner`, `consent-pending-admin`, `read-only`.
- Playwright: `e2e/fixtures/mockApi.ts` varsayılan `agent/info` = `DISABLED` (mevcut ekran specleri ve görsel tabanları
  değişmez); sohbet specleri mock taşıyıcıyı `e2e/fixtures/otopilot.ts` ile seçer.

## 5. Sonraya kalanlar

- Ekran/kayıt başlıklarında isteğe bağlı "Otopilot'a sor" düğmesi (`EkPageBar`, sayfa bileşeni) — FR2-SHELL sonrası; bugün
  bağlam her açılışta etkin sekmeden otomatik gelir.
- Seçili satır bağlamı (`PageContext.selection`) — liste ekranlarının seçim durumunu dışa açması gerekir.
- Backoffice yerleşimi (§7.2, `/admin-api/agent`, `bo:` öneki) ayrı kalem.
- Ayarların gerçek menü kaydı (ApplicationDB `menus`, ayarlar bölümü) — yerel iş.
