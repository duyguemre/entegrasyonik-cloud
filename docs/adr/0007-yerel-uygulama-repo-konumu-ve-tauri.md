# 0007 — Yerel Uygulamanın Repo Konumu, Electron'un Emekliliği ve Tauri 2 + PWA İlişkisi

## Durum
Kabul edildi (2026-09-26). Kod imzalama sertifikası ve güncelleme imza anahtarının saklanması **insan onayı bekliyor** (Protokol 12). Bu ADR, web tarafında ADR-0001'in çerez modelini, yerel uygulama/PWA tarafında ise ADR-0010'un (ADR-0001'in genişletmesi) OAuth 2.1 + PKCE modelini varsayar; çelişirse ADR-0001/0010 esas alınır ve bu ADR'nin "Oturum modeli" bölümü güncellenir.

## Bağlam
Master prompt Faz 1.0, yerel uygulamanın (Faz 4, MCP istemcisi) repo konumunun ve mevcut Electron kabuğuyla ilişkisinin ADR'lenmesini istiyor (Faz 1 DoD maddesi). Girdiler (`PRODUCT_SURFACES.md` §4, §6):

- **Repo yapısı:** Kökte `package.json`/workspace yok; 6 bağımsız `package.json` + lock (`frontend`, `backend`, `mockserver/backend`, `mockserver/frontend`, `gitlab/www`, `gitlab/entegrasyonikapp`). CI yok.
- **Şişkinlik:** `gitlab/` bir dağıtım artefakt klasörü: 1783 takipli dosya (takipli `node_modules` 1417 dosya, 34 MB `backend.js` ncc bundle'ı — içinde gömülü sırlar, bkz. BACKLOG C5). Pack ≈ 437 MB.
- **Electron kabuğu** (`frontend/main.js`, `forge.config.js`): Electron 29 (destek hattının gerisinde), preload yok, uygulama içinde port 3000'de Express sunucusu açıp kendine bağlanıyor, auto-update yok, imzalama/publisher yok, Squirrel olayları işlenmiyor. Fuses ayarları olumlu. Hiçbir sürümün müşteriye dağıtıldığına dair kanıt yok (doğrulanamadı).
- **Oturum:** Web uygulaması `httpOnly` çerez, üretimde `SameSite=None; Secure`. Tauri WebView origin'i (Windows `http://tauri.localhost`) backend'e çapraz-site → üçüncü taraf çerez davranışı WebView2/WKWebView'da belirsiz; ayrıca `SameSite=None` CSRF yüzeyini büyütür (SAAS_CORE_AUDIT §2.3).
- **Web app sağlığı:** 2.8 MB tek dosya bundle, URL'siz sekme tabanlı gezinme, derleme zamanı sabit API adresi, `vue-tsc` kırık, hover menü (dokunmatikte çalışmaz).
- **Ön koşullar:** Rust 1.98.1 (msvc), VS 2022 C++ araçları, WebView2 bu makinede kurulu (MASTER_STATE).
- **Hedef (Faz 4):** Tauri masaüstü (Windows birincil) + mobil için aynı arayüzün responsive/PWA sürümü; native mobil şimdilik yok; offline = son bilinen durum önbelleği.

## Değerlendirilen Alternatifler

### A. Repo konumu
1. **Aynı repo, ayrı paket (`desktop/`)** — Artı: tek ADR/skill/hook seti; backend sözleşmesi (MCP araç şemaları, tipler) ile istemci tek PR'da değişir; design token/bileşen paylaşımı doğrudan; fabrika akışı (worktree, branch) tek yerde. Eksi: `gitlab/` şişkinliği klon süresini etkiler; Rust `target/` ve Node artefaktlarının `.gitignore` disiplini gerekir; minimal workspace kurulumu gerekir.
2. **Ayrı repo** — Artı: temiz geçmiş, bağımsız sürüm ritmi, Rust/Node ayrımı. Eksi: tip/şema/token paylaşımı için paket yayınlama (private registry) veya kopyalama gerekir; ADR/skill/hook seti çoğalır; tek haneli ölçekte iki repo iki kat bakım. Şişkinlik sorunu zaten `gitlab/`'ın takipten çıkarılmasıyla çözülebilir — ayrı repo için tek başına yeterli gerekçe değil.

### B. Electron kabuğu
1. **Kaldır (Tauri ilk kullanılabilir sürüme ulaşınca)** — Artı: tek masaüstü hattı; Electron 29 EOL/güvenlik yükü biter; `frontend` paketi saf web olur. Eksi: Tauri gecikirse ara dönemde masaüstü paketi yok (zaten dağıtılmıyor → kayıp pratikte sıfır).
2. **Tauri ile paralel koru** — Artı: geri dönüş seçeneği. Eksi: iki kabuk, iki güncelleme/imzalama hattı; Electron'da preload/auto-update/imzalama sıfırdan yapılmalı. Tek haneli ölçekte savunulamaz.
3. **Electron'u güncelleyip Tauri'yi atla** — Eksi: master prompt Tauri'yi hedefliyor; ~150 MB kurulum boyutu, gömülü Node yüzeyi; MCP istemcisi için keychain/dosya izni modeli Tauri'de hazır.

### C. UI paylaşımı
1. **Web uygulamasının tamamını Tauri içine göm** — Artı: "bedava" masaüstü. Eksi: yerel uygulama AI-native bir sohbet + Generative UI istemcisidir, 30+ ekranlı yönetim paneli değil; mevcut borçlar (2.8 MB bundle, URL'siz sekme gezinmesi, çerez oturumu, sabit API adresi) aynen taşınır; mobil PWA'da hover menü/sekme modeli çalışmaz.
2. **Ayrı, ince arayüz + paylaşılan tasarım katmanı** — Artı: küçük, hızlı, mobile uygun kabuk (sohbet, bağlantı ayarları, takip görünümleri, Generative UI render alanı); web app ile yalnızca design token'ları, Vuetify teması ve Generative UI bileşen kataloğu paylaşılır. Eksi: ince bir kabuğu sıfırdan yazmak (küçük; yeni bileşen, refactor/yeniden yazım kuralı kapsamına girmez çünkü mevcut modül yeniden yazılmıyor).
3. **Tamamen ayrı tasarım sistemi** — Eksi: "aynı design token dili" kabul kriterini (Master prompt, Kabul 5) ihlal eder.

### D. Oturum modeli (WebView)
1. **Çerez (`SameSite=None`) + CORS'a `tauri.localhost` ekleme** — Eksi: WebView üçüncü taraf çerez davranışı belirsiz; CSRF yüzeyi; MCP istemcisi zaten Bearer token ister (ADR-0009).
2. **OAuth 2.1 Authorization Code + PKCE (sistem tarayıcısı), Bearer access token + dönen (rotating) refresh token** — Artı: MCP yetkilendirme spesifikasyonu (2025-11-25) ile aynı akış; çerezden bağımsız; iptal edilebilir. Eksi: backend'de token uç noktaları gerekir (ADR-0010 kapsamında — ADR-0001'in genişletmesi).

## Karar
Yerel uygulama **aynı repoda ayrı bir paket** (`desktop/`, içinde `src-tauri/`) olarak Tauri 2 ile inşa edilir; Electron kabuğu Tauri'nin ilk "anlamlı kullanım noktası"nda tek commit'te **kaldırılır**; arayüz web uygulamasını gömmez, **ince ayrı bir Vue/Vite kabuğudur** ve web app ile yalnızca paylaşılan bir `packages/ui-kit` (design token + Vuetify teması + Generative UI bileşen kataloğu + API/araç şeması tipleri) üzerinden ortaklaşır; aynı `desktop/` web kaynağı mobil için **PWA** olarak da derlenir; masaüstü oturumu **OAuth 2.1 + PKCE ile Bearer token**'dır (çerez yok).

Ayrıntılar:

1. **Repo düzeni (hedef):**
   ```
   backend/            (değişmez)
   frontend/           (web app; Electron dosyaları kaldırılınca saf web)
   desktop/            (Vite + Vue 3 + TS kabuk; `src-tauri/` Rust)
   packages/ui-kit/    (token, tema, GenUI katalog bileşenleri, JSON Schema, tipler)
   mockserver/         (değişmez)
   ```
   Kökte **minimal npm workspaces** (`frontend`, `desktop`, `packages/*`) — pnpm/Nx/Turborepo YOK. `backend` ve `mockserver` workspace'e alınmaz (ayrı Node sürüm/derleme hattı; gereksiz risk). `.gitignore`'a `desktop/src-tauri/target/`, `desktop/src-tauri/gen/` eklenir.
2. **Ön koşul — `gitlab/` takipten çıkarılır:** `git rm -r --cached gitlab/` + `.gitignore` (dosyalar diskte kalır; dağıtım paketi gerekiyorsa ayrı deploy reposunda/CI artefaktı olarak üretilir). Bu geri alınabilir bir işlemdir. **Git geçmişinin yeniden yazılması (pack'ten 437 MB'ın ve gömülü sırların silinmesi) insan kararıdır** (BACKLOG C5, Protokol 12); yapılmasa da bu ADR geçerlidir.
3. **Electron:** `frontend/main.js`, `forge.config.js`, `electron*`/`@electron-forge/*` bağımlılıkları ve `start`/`make` script'leri, Tauri masaüstü "uygulama açılıyor + giriş yapılabiliyor" noktasına ulaşınca tek commit'te silinir (git ile geri alınabilir → Protokol 12 kapsamında değil). Paralel bakım yapılmaz; o güne dek Electron'a iş yapılmaz.
4. **Tauri masaüstü (Windows birincil):** NSIS kurulum paketi, kullanıcı başına kurulum (yönetici yetkisi gerekmez). Sıkı CSP (uzak script yok, `connect-src` yalnızca API/MCP alanı + kullanıcının seçtiği model sağlayıcısı), minimum capability seti (ayrıntı: ADR-0009 dosya erişimi). HTTP çağrıları Rust tarafında (`tauri-plugin-http`) yapılır → CORS/çerez bağımlılığı yok. macOS/Linux derlemesi yapılandırmada açık bırakılır, test/dağıtım kapsam dışı (backlog nice-to-have).
5. **Mobil:** `desktop/` kaynağı `vite build --mode pwa` ile PWA olarak derlenir (Tauri'ye özgü yetenekler — yerel dosya, keychain, AI sohbeti — özellik bayrağıyla kapalı). Mobil MVP = temel takip görünümleri (satış özeti, siparişler, düşük stok, entegrasyon sağlığı) — Faz 4 DoD'deki "temel takip senaryosu". Offline: son başarılı yanıtların IndexedDB önbelleği ("son güncelleme: …" etiketiyle), yazma kuyruğu yok. Tauri 2 native mobil (iOS/Android) **opsiyon olarak not edilir, yapılmaz** (store hesabı/inceleme maliyeti).
6. **Oturum modeli:**
   - Masaüstü: sistem tarayıcısında OAuth 2.1 Authorization Code + PKCE (S256), yönlendirme loopback (`http://127.0.0.1:<rastgele port>`) ile alınır. Access token kısa ömürlü (öneri 15 dk) ve yalnızca bellekte; refresh token dönen (rotating), Windows Credential Manager'da (Rust `keyring` crate) saklanır; WebView JS'i refresh token'ı hiç görmez. Çıkışta ve backend'den iptal edilebilir (ADR-0010, ADR-0001'in genişletmesi).
   - PWA: aynı PKCE akışı, public client; access token bellekte, refresh token IndexedDB'de, dönen + **mutlak ömür 7 gün** (tarayıcı depolaması güvenli olmadığı için kısa tutulur; mobil MVP salt-okunur olduğundan kabul edilebilir risk).
   - Web uygulaması çerez modelinde kalır (ADR-0001'e göre); yerel uygulama için CORS'a `tauri.localhost` eklemek gerekmez (HTTP Rust tarafında).
7. **Auto-update:** `tauri-plugin-updater`; güncelleme paketleri Tauri güncelleme anahtarıyla imzalanır (ücretsiz, yerelde üretilir). Manifest (`latest.json`) + paketler mevcut R2 depolamasında statik barındırılır (ek servis yok). **Güncelleme özel anahtarı repo'ya/dokümana yazılmaz**; saklama yeri (parola yöneticisi/CI sırrı) insan kararıdır. Anahtar kaybı = mevcut kurulumlar artık güncellenemez → yedekleme zorunlu (insan eylemi).
8. **Windows kod imzalama (Authenticode):** Ücretli sertifika/hizmet ve kimlik doğrulaması gerektirir → **Protokol 12, onay bekliyor**. Öneri: bulut tabanlı imzalama hizmeti (ör. Azure Artifact/Trusted Signing — uygunluk ve Türkiye'den şirket doğrulaması **doğrulanmalı**) veya OV sertifika. O zamana kadar imzasız beta derlemeleri (SmartScreen uyarısı belgelenir) yalnızca iç test ve seçilmiş pilot müşteriye verilir.

## Gerekçe
- **Maliyet bilinci:** Tek haneli abone ölçeğinde ikinci repo, ikinci masaüstü kabuğu veya monorepo aracı (Nx/Turborepo) bakım yükünü artırır ama müşteriye değer katmaz. Minimal npm workspaces tek ihtiyaç olan paylaşımı (token + GenUI kataloğu + tipler) çözer.
- Ayrı repo lehine tek güçlü gerekçe (şişkinlik) `gitlab/`'ın takipten çıkarılmasıyla ortadan kalkar; Tauri toolchain'i (Rust) Node paketlerinden `desktop/src-tauri/` altında izole kalır → master prompt'taki "toolchain uyumsuzluğu ciddi sorun çıkarırsa ayrı repo" koşulu şu an oluşmuyor.
- Electron hiç dağıtılmamış bir iskelet; güncelleme/imzalama/preload sıfırdan yapılacağı için onu kurtarmak Tauri'ye geçmekten pahalı.
- Web app'i gömmek, 1d'de bulunan tüm frontend borcunu yerel uygulamaya ve mobile taşır; ince kabuk + paylaşılan katalog hem kaliteyi hem "aynı token dili" kabul kriterini sağlar ve Faz 3a web modernizasyonuyla (token kaynağı) aynı paketi besler.
- Token tabanlı oturum MCP (ADR-0009) için zaten gerekli; çerez sorununu prototip gerektirmeden ortadan kaldırır.

## Maliyet/Ölçek Notu
- **Ek maliyet:** Rust derleme süresi (ilk derleme dakikalar, CI eklendiğinde runner süresi); güncelleme barındırma R2'de ≈ sıfır; kod imzalama yıllık ücret (onay bekliyor). Yeni servis yok.
- **Ek operasyon:** güncelleme imza anahtarının güvenli saklanması ve yedeği (insan); sürüm yayını (manifest güncelleme) — Faz 4'te script'lenir.
- **Yeniden değerlendirme eşikleri:**
  - Git klonu (tam geçmiş) **1 GB'ı** aşarsa veya `desktop` temiz CI derlemesi **20 dakikayı** aşarsa → ayrı repo / geçmiş temizliği yeniden değerlendirilir.
  - Workspace kaynaklı bağımlılık çakışması bir ayda **3'ten fazla** kırık derlemeye yol açarsa → `packages/ui-kit`'in sürümlenmiş paket olarak yayınlanması/ayrı repo değerlendirilir.
  - Aktif kullanıcı oturumlarının **%30'undan fazlası** mobil PWA'dan geliyorsa **veya** en az **3 ödeyen müşteri** push bildirim/mağaza varlığını açıkça talep ederse → Tauri 2 native mobil ADR'si açılır.
  - Masaüstü uygulamayı kuran harici müşteri sayısı **3'e** ulaşmadan önce (hangisi önce gelirse: ilk ücretli harici dağıtım) Authenticode imzalama devreye alınmış olmalıdır.
  - macOS talep eden ödeyen müşteri sayısı **2'yi** geçerse → macOS imzalama/notarization (Apple Developer hesabı, Protokol 12) ADR'si.

## Etki Alanı
- Repo kökü: yeni kök `package.json` (workspaces), `.gitignore` (gitlab/, target/, gen/).
- `gitlab/` (takipten çıkar), `frontend/` (Electron dosyaları/bağımlılıkları silinir; `packages/ui-kit` tüketicisi olur — Faz 3a token çalışmasıyla aynı kaynak).
- Yeni: `desktop/`, `desktop/src-tauri/`, `packages/ui-kit/`.
- `backend/`: OAuth 2.1 token uç noktaları (ADR-0010, ADR-0001'in genişletmesi), MCP uç noktası (ADR-0009).
- `PRODUCT_SURFACES.md` §6 bu ADR'ye referans almalı (orkestratör).

## Faz 4 için ilk üç somut adım
1. **Repo hazırlığı + iskelet:** `gitlab/`'ı git takibinden çıkar (`.gitignore`), kök minimal npm workspaces kur, `desktop/`'u `create-tauri-app` (Vue + TS + Vite) ile oluştur; sıkı CSP + minimum capability; Windows'ta `tauri build` ile NSIS paketi üret ve uygulamanın açıldığını doğrula (REVIEW.md "uygulama açılabildiğinde" tetikleyicisi). Ardından Electron dosyalarını tek commit'te sil.
2. **Oturum:** ADR-0010'un (ADR-0001'in genişletmesi) token uç noktaları üzerinde masaüstü PKCE + loopback girişi, refresh token'ın Credential Manager'da saklanması, çıkış/iptal; iki test tenant'ıyla giriş yapılıp kendi `userContext`'inin döndüğü doğrulanır.
3. **Paylaşılan katman + ilk uçtan uca komut:** `packages/ui-kit` içine token/tema + GenUI kataloğunun ilk 3 bileşeni (KPI kartı, tablo, uyarı) ve JSON Schema; ADR-0009'daki ilk salt-okunur MCP aracı (`get_integration_health`) masaüstünden çağrılıp katalog bileşeniyle render edilir; updater yapılandırması (imzalı manifest, R2) eklenir — Authenticode imzası onay gelene kadar yok.
