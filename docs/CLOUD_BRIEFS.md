# Bulut önyüz iş akışı ve görev şablonları

Bulut kredisiyle (claude.ai/code) **yalnızca önyüz** işleri yapılır: tanıtım sitesi (`site/`) ve web uygulaması (`frontend/`).
Bulut deposu `github.com/duyguemre/entegrasyonik-cloud` (private), yerel deponun **geçmişsiz** önyüz kopyasıdır —
yerel git geçmişi eski sırlar içerdiği için ASLA gönderilmez. Kurallar: `CLAUDE.md` kural 7.

## Akış

| Adım | Kim | Ne |
|---|---|---|
| 1 | Yerel | `scripts/cloud-sync.sh push` — `faz3-arayuz`'un güncel görüntüsü bulut `main`'ine (sır taraması geçmezse push iptal) |
| 2 | Kullanıcı | claude.ai/code → `entegrasyonik-cloud` → yeni oturum → aşağıdaki şablonlardan birini yapıştır |
| 3 | Bulut | İşi `cloud/<kısa-ad>` dalında yapar, küçük adımlarla commit + push |
| 4 | Yerel | `scripts/cloud-sync.sh pull cloud/<kısa-ad>` → yerel `cloud/<kısa-ad>` dalı; Windows'ta ekran görüntüsü + vitest + Playwright (görsel tabanlar burada yenilenir) → `faz3-arayuz`'a birleştir |

- **Aynı anda aynı dosya iki yerde değiştirilmez.** Bulut `site/`/`frontend/` üzerinde çalışırken yerelde yalnızca backend/doküman işi.
- Buluttan dönen yalnızca `site/` ve `frontend/` değişiklikleridir (pull filtreler); `*-linux.png` asla gelmez.
- Ortam kurulumu (claude.ai/code → Environment → setup): `bash scripts/cloud-setup.sh`. Ortam değişkenine **sır konmaz**.
- Kredi azalınca yeni büyük iş başlatılmaz; açık dallar çekilir, gerekirse depo arşivlenir. Kod yerelde tam durur.

## Token tasarrufu (her şablona dahil)

- Tek oturum = tek, net kapsamlı iş. "Bir tur daha" yerine yeni oturum + yeni kısa görev.
- Ara adımlarda yalnızca ilgili spec'i ve tek viewport'u çalıştır; tam Playwright + Lighthouse yalnızca sonda bir kez.
- Ekran görüntüsünü yalnızca değişen bölümden al; tam sayfa/3 viewport yalnızca son kontrolde.
- Büyük dosyayı baştan sona okuma; `grep` ile ilgili bölümü bul.

## Şablon A — Tanıtım sitesi bölüm/sayfa turu

```
Görev: site/ içinde <BÖLÜM veya SAYFA> için premium tasarım turu.
Önce CLAUDE.md (kural 7) ve .claude/skills/premium-ui-standards/SKILL.md'yi oku.
Dal: cloud/<kisa-ad> (main'den). Yalnızca site/ değişir.
Kullanıcı geri bildirimi: "<AYNEN YAPIŞTIR>"
Yapılacaklar:
- <somut madde 1>
- <somut madde 2>
Kurallar: uydurma iddia/sayı yok (içerik src/data/* kayıtlarından; tests/claims.test.ts ve tests/llms.test.ts yeşil);
animasyon yalnızca transform/opacity; reduced-motion + "Hareket" anahtarı her şeyi durdurur; kanal renkleri --site-channel-*.
Doğrulama: cd site && npm run build && npx vitest run && npx playwright test <ilgili spec> --project=chromium-desktop --update-snapshots=missing;
sonda bir kez tam: npx playwright test --update-snapshots=missing. *-linux.png commit'leme.
Küçük adımlarla commit + push (mesaj: faz3-3b-cloud-<kisa-ad>: ..., Türkçe ASCII).
Bitince: ne değişti (madde madde), test sonuçları, commit listesi.
```

## Şablon B — Web uygulaması (frontend) ekran grubu

```
Görev: frontend/ içinde <EKRAN GRUBU> görsel yenilemesi (ADR-0015 <AŞAMA>).
Önce CLAUDE.md (kural 7), docs/adr/0015-*.md ve .claude/skills/premium-ui-standards/SKILL.md'yi oku.
Dal: cloud/<kisa-ad>. Yalnızca frontend/ değişir; backend çalıştırılamaz (API çağrıları mock'lu testlerle doğrulanır).
Yapılacaklar:
- <somut madde>
Doğrulama: cd frontend && npm run build && npm test && npm run test:style-ratchet && npm run test:pattern-ratchet
&& npm run test:no-console-ratchet && npm run test:typecheck-ratchet; e2e: npx playwright test <ilgili spec> --update-snapshots=missing.
Küçük adımlarla commit + push. Bitince: ne değişti, test sonuçları, commit listesi.
```

## Şablon C — Önyüz test yazımı / karakterizasyon

```
Görev: <MODÜL/BİLEŞEN> için karakterizasyon/birim testleri (davranış değiştirme yok).
Önce CLAUDE.md (kural 7) ve .claude/skills/characterization-testing/SKILL.md'yi oku.
Dal: cloud/<kisa-ad>. Yalnızca site/ veya frontend/ altındaki test dosyaları eklenir.
Doğrulama: ilgili vitest dosyası + tam npm test bir kez. Bitince: eklenen testler, kapsam, commit listesi.
```

## Kuyruk — hazır brifingler (yerel orkestratör hazırladı, kullanıcı yapıştırır)

Yerel oturum artık backend/altyapı/DB işine odaklanıyor (2026-09-29 kararı); site/frontend'in TAMAMI buluta devrediliyor. Aşağıdaki brifingler doğrudan claude.ai/code → `entegrasyonik-cloud` yeni oturuma yapıştırılabilir. Bir brifing tamamlanıp yerel `faz3-arayuz`'a birleştirildiğinde bu listeden silinir, yerine BACKLOG.md'deki sıradaki kalem eklenir.

### Kuyruk 1 — ADR-0015 B4-P0 (Hesabım/güvenlik + parola değişimi)

```
Görev: frontend/ içinde N1 (Hesabım/güvenlik) ve N2 (parola sıfırlama akışının hesap içi kısmı) yeni ekranları (ADR-0015 B4-P0).
Önce CLAUDE.md (kural 7), docs/adr/0015-uygulama-gorsel-yenileme.md (Karar 4 giriş/kayıt, Karar 5.6 yeni ekran Protokol 13 uyarlaması, Karar 6 desen kataloğu), docs/API_ACCOUNT_LIFECYCLE.md ve .claude/skills/premium-ui-standards/SKILL.md'yi oku.
Dal: cloud/b4-p0-account. Yalnızca frontend/ değişir; backend çalıştırılamaz, API çağrıları sentetik fixture ile mock'lanır (mevcut e2e/fixtures deseni).
Yapılacaklar:
- N1: "Hesabım/Güvenlik" ekranı — changePassword (kimlikli), e-posta doğrulama durumu göster + resendVerificationEmail; docs/API_ACCOUNT_LIFECYCLE.md §1/§4/§5'teki gerçek istek/yanıt şekli ve hata kodlarını kullan.
- N2: hesap içinden "şifremi değiştir" akışı (A4'te yapılan /reset-password'dan AYRI — o kimliksiz akış zaten var, buna dokunma).
- screens.ts'e YALNIZCA ekleme (yeni slug, section:'account' veya uygun), minRole=member.
- Karar 6 kataloğu: EkSettingsTemplate/EkSettingsSection/EkFormDialog/EkConfirmDialog (parola değişince oturum düşer uyarısı) kullan, DS'e (components/ds/**) dokunma.
Kurallar: uydurma API alanı/hata kodu YOK — yalnızca docs/API_ACCOUNT_LIFECYCLE.md'de belgeli olanlar; PII log'lanmaz; yeni ekran spec'i (Protokol 13 §5.6): smoke+boş+hata+≥1 etkileşim(istek gövdesi doğrulaması)+3 viewport+axe AA=0.
Doğrulama: cd frontend && npm run build && npm test && npm run test:style-ratchet && npm run test:pattern-ratchet && npm run test:no-console-ratchet && npm run test:typecheck-ratchet; e2e: npx playwright test <yeni spec> --update-snapshots=missing.
Küçük adımlarla commit + push. Bitince: ne değişti, test sonuçları, commit listesi, backend'de eksik/belirsiz bulduğun alan (varsa).
```

### Kuyruk 2 — ADR-0015 B5 (P3 ekranları, karakterizasyon önce)

```
Görev: frontend/ içinde ADR-0015 Aşama B5 — P3 ekranları (views/secure/definitions/**, productDefinitions/** [liste dışı], components/productDefinitions/**, user/* [Subscription HARİÇ, o B3'te yapıldı], supports/*, Financial/Printout/Setting ekranları). Karakterizasyon YOK, kod DEĞİŞMEDEN önce spec yazılmalı (Protokol 13).
Önce CLAUDE.md (kural 7), docs/adr/0015-uygulama-gorsel-yenileme.md (Karar 5.2 yeniden tabanlama süreci, Karar 6 desen kataloğu) ve .claude/skills/{characterization-testing,premium-ui-standards}/SKILL.md'yi oku.
Dal: cloud/b5-p3-screens. Yalnızca frontend/ değişir. En büyük dosya ProductVariantsComponent (131 literal) — önce onu yap, sonra kalanları.
Yapılacaklar (sıra: her dosya için ÖNCE karakterizasyon testi değişmemiş kodda yeşil, SONRA yenileme):
1. ÖNCE: mevcut davranışı (DOM kancaları, iş kuralları) sabitleyen Playwright/vitest spec'i yaz, DEĞİŞMEMİŞ kodda yeşil olduğunu kanıtla.
2. SONRA: Karar 6 kataloğuna bağla (EkListPage/EkDataTable/EkFormDialog/EkStatusChip/format.ts vb.), literal renk→0, sonsuz pulse/hover-lift/bounce KALDIR (Karar 1.1).
3. PNG tabanları --update-snapshots=missing ile (Windows'ta linux.png asla commit'lenmez).
Kurallar: davranış iddiaları DEĞİŞMEZ (izinli değişiklik listesi ADR Karar 5.1 ile aynı ilke); şablon dışı kullanım gerekirse ek-pattern-exception yorumuyla gerekçelendir.
Doğrulama: cd frontend && npm run build && npm test && npm run test:style-ratchet && npm run test:pattern-ratchet && npm run test:no-console-ratchet && npm run test:typecheck-ratchet; e2e: npx playwright test <ilgili spec> --update-snapshots=missing.
Küçük adımlarla (dosya başına ayrı commit) commit + push. Bitince: hangi dosyalar bitti/hangileri kaldı (kapsam büyük, tek oturumda bitmeyebilir — kaldığı yerden yeni oturumla devam edilir), test sonuçları, commit listesi.
```

### Kuyruk 3 — ADR-0015 B3 kalanı (log detay raporları tam token göçü)

ADR-0015 B3 (abonelik+admin+loglar) yerelde KISMEN tamamlandı, kullanıcı kararıyla (2026-09-29) güvenli bir kontrol noktasında durduruldu — bkz. BACKLOG.md "ADR-0015 B3 KISMEN TAMAMLANDI". Kalan 3 dosya:

```
Görev: frontend/ içinde ADR-0015 B3'ün TAMAMLANMAMIŞ 3 dosyası — DetailedImportLogReport.vue (en büyük, ~122 literal renk, HİÇ dokunulmadı), ExportLogList.vue + ImportLogList.vue (yalnız konumlandırma düzeltildi, tam token göçü YAPILMADI — sırasıyla ~71/~48 literal renk kaldı).
Önce CLAUDE.md (kural 7), docs/adr/0015-uygulama-gorsel-yenileme.md (Karar 6 desen kataloğu) ve .claude/skills/premium-ui-standards/SKILL.md'yi oku. Kardeş dosyalar DetailedExportLogReport.vue (TAM göçü zaten yapıldı — BİREBİR AYNI deseni izle: JOB_STATUS_COLOR_NAME/statusColorName/statusColorHex/statusTone) ve DetailedImportLogReportMissing{Attribute,Category}.vue (aynı şekilde zaten göçürüldü) — bunları REFERANS al, tutarlı kal.
Dal: cloud/b3-logs-remainder. Yalnızca frontend/ değişir.
Yapılacaklar:
- DetailedImportLogReport.vue: ÖNCE ECharts chartOption'daki renk dizisinin gerçekten `var(--ek-*)` string'i olarak canvas'a geçirilip geçirilmediğini DOĞRULA (canvas CSS custom property okuyamaz — muhtemelen JS'te çözümlenmiş hex/rgb DEĞERİ gerekir, DetailedExportLogReport.vue'nun bunu nasıl çözdüğüne bak). `'#c6282822!important'` gibi hex+alfa-sonek birleşik string'leri BULK REGEX ile DEĞİL, tek tek elle dönüştür (önceki deneme bunu bozma riski nedeniyle geri alındı).
- ExportLogList.vue/ImportLogList.vue: kalan tüm hex/rgb/inlineStyle → token, raw v-chip varsa EkStatusChip, formatDate() varsa format.ts'e taşı (DetailedExportLogReport ile aynı statusTone deseni).
- Davranış iddiaları DEĞİŞMEZ (logs.spec.ts zaten var, davranış spec'i kırılmadan yeşil kalmalı).
Doğrulama: cd frontend && npm run build && npm test && npm run test:style-ratchet && npm run test:pattern-ratchet && npm run test:no-console-ratchet && npm run test:typecheck-ratchet; e2e: npx playwright test logs.spec.ts --update-snapshots=missing.
Küçük adımlarla (dosya başına ayrı commit) commit + push. Bitince: literal renk öncesi/sonrası sayıları, test sonuçları, commit listesi.
```

### Kuyruk 4 — ADR-0018 "Entegrasyon uyum" admin konsol ekranı (backend hazır)

Backend (`IntegrationComplianceService`) yerelde TAMAMLANDI (2026-09-29) — bkz. BACKLOG.md "ADR-0018 admin konsol ekranı backend'i TAMAMLANDI". Bu, o backend'i tüketen frontend ekranıdır.

```
Görev: frontend/ içinde admin panel "Entegrasyon uyum" konsol ekranı (ADR-0018 Karar 2 "Konsol" + Karar 4 tablosu "Aşama B" satırı, backend HAZIR — sen yazmayacaksın, TÜKETECEKSİN).
Önce CLAUDE.md (kural 7), docs/adr/0018-*.md (TAMAMI, özellikle Karar 2 "Bulgu modeli: IntegrationFinding" şeması+şiddet varsayılanları VE "Konsol" alt bölümü), docs/adr/0015-uygulama-gorsel-yenileme.md (Karar 3 tasarım sistemi, Karar 6 desen kataloğu — bu ekran "liste + detay çekmecesi" şablonunu kullanır) ve .claude/skills/premium-ui-standards/SKILL.md'yi oku.
Backend sözleşmesi: backend/src/api/services/integration-compliance-service.ts dosyasını SALT OKUNUR referans olarak oku (metotlar: list/summary/getDetail/transition/get; girdi/çıktı şekillerini AYNEN kullan, uydurma alan ekleme). ADR-0020 C'de kurulan `useIntegrationConfigApi.ts` (components/adminPanel/integrations/) AYNI desende bir `useIntegrationComplianceApi.ts` yaz (RPC istemcisi, aynı hata-değer sözleşmesi).
Dal: cloud/adr0018-compliance-console. Yalnızca frontend/ değişir; backend çalıştırılamaz, API çağrıları sentetik fixture ile mock'lanır.
Yapılacaklar:
- Yeni ekran: views/secure/adminPanel/integrations/ComplianceView.vue (screens.ts'e YALNIZCA ekleme, admin.integrationCompliance gibi bir anahtar, minRole=platformAdmin) — EkListPage + EkDetailSheet (liste+çekmece şablonu, ADR-0015 Karar 3).
- Filtreler: entegrasyon, kategori, tür (kind), şiddet (severity), durum (status) — backend list()'in desteklediği filtreler (integrationCode/kind/status backend'de, category/severity FE'de EK filtre olarak gösterilebilir, backend zaten bellekte süzüyor).
- Entegrasyon başına özet kartı (summary() ucu): adapterVersion, lastVerifiedAt, son probe sonucu (TEK platform-düzeyi değer olduğunu, ADR'nin öngördüğü entegrasyon-başına ayrı değer OLMADIĞINI dürüstçe göster — E3), açık bulgular şiddete göre gruplu (EkStatusChip renk kodlu).
- Detay çekmecesi (getDetail()): kanıt (evidence — REDAKTE, ham veri yok), etkilenen tenant sayısı+listesi (yalnız sayı göster, PII yok), öneri (recommendation).
- Eylemler (transition()): triage/accept/wontfix/false_positive/fixed — EkConfirmDialog; "fixed" seçilince fixRef ZORUNLU (backend 400 döner, FE önceden doğrulasın); diğerlerinde gerekçe (reason) OPSİYONEL (backend zorunlu tutmuyor, ADR da tutmuyor).
- Boş durum: hiç açık bulgu yoksa EkEmptyState "Şu an bilinen bir uyum sorunu yok" (E3 dürüstlük — sahte "her şey mükemmel" hissi verme, "izleme aktif" notu ekle).
Kurallar: uydurma alan/sayı YOK; backend'in DÖNMEDIĞI hiçbir veriyi (ör. entegrasyon-başına ayrı probe sonucu) UYDURMA; yeni ekran spec'i (Protokol 13 §5.6): smoke+boş+hata+≥1 etkileşim(transition çağrısı gövde doğrulaması)+3 viewport+axe AA=0; rol testi (platformAdmin dışı 403/menüde yok).
Doğrulama: cd frontend && npm run build && npm test && npm run test:style-ratchet && npm run test:pattern-ratchet && npm run test:no-console-ratchet && npm run test:typecheck-ratchet; e2e: npx playwright test <yeni spec> --update-snapshots=missing.
Küçük adımlarla commit + push. Bitince: ne değişti, test sonuçları, commit listesi, backend sözleşmesinde eksik/belirsiz bulduğun alan (varsa).
```

### Sıradaki adaylar (henüz brifing yazılmadı, backend hazırlığı doğrulanmalı)
- ADR-0015 B4-P0 kalanı: N3 (abonelik yönetimi — SubscriptionView B3'te TAMAMLANDI, artık hazır), N12 (onboarding sihirbazı — N3/N5/N13'e bağlı adımlar backend hazır oldukça açılır).
- ADR-0015 B4-P1/P2: N7/N10 (docs/API_TENANT_SURFACE.md hazır — sağlık/denetim okuma), N6/N8/N9/N11/N14-N17 (bazıları küçük backend gerektirir, gap analizine bkz.).
- ADR-0019 Aşama B (`frontend/src/generated/capabilities.ts` + `restApi.call()` sarmalayıcı) — yalnızca `backend/`'i salt-okunur referans olarak okur, kural 7'ye uygun; ADR-0019'un TAMAMINI (docs/adr/0019-*.md) okuyarak brifing yazılmalı, kapsam büyük.
