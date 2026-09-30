# 0023 — RPC Girdi Şema Doğrulaması: Yetenek Kaydı Bağında Opsiyonel `input` Zod Şeması, Tek Noktadan Doğrulama

## Durum
Kabul edildi (2026-09-30)

## Bağlam
`docs/audits/BACKEND_INTEGRATION_AUDIT_2026-09-30.md` F-11 (P1, OWASP API3/API6): jenerik RPC (`POST /api/:service/:operation`) istek gövdesini doğrulamadan servis metoduna verir; `zod` yalnız config/capabilities'te kullanılıyordu. Kanıtlı riskler: `UserService.createUser` gövdedeki `user`'ı ham `Users.create(user)` ile yazar (tenant `Users` şeması `strict:false`: `owner/isGlobalAdmin/lockUntil` gibi alanlar gövdeden yazılabilir); `TicketService.sendTicketMessage` `senderType/senderId/senderName`'i gövdeden alır (destek kimliği taklidi); entegrasyon `settings` üst düzey anahtarları `$set: { 'marketplace.$.settings.<anahtar>': … }` yoluna gömülür (`a.b` / `$…` anahtarı yol/operatör enjeksiyonu); kimlik alanlarına `{ $ne: null }` gibi nesneler geçebilir; `SettingService.updateSettings` gövde eksikse TypeError (500). Yetenek kaydı (ADR-0019) her yetenek için `input` şeması taşır ama bu MCP/yetenek düzeyidir (`legacyInput`), FE'nin gerçek tel gövdesi değildir.

## Değerlendirilen Alternatifler
1. **Her servis metodunda elle doğrulama.** Reddedildi: 25+ serviste dağınık, unutulmaya açık, tek noktadan denetlenemez (F-11 tam olarak bunu bulmuştu).
2. **Yetenek düzeyi `capability.input`'u tel şeması yapmak.** Reddedildi: MCP girdisi (`bindings[].map` ile dönüştürülür) ile FE gövdesi farklı biçimdedir; birini zorlamak diğerini bozar.
3. **Bağ düzeyinde opsiyonel `Binding.input` (zod) + `RunOperation`'da tek noktadan doğrulama; şemasız operasyon eskisi gibi; şemasız-yazma sayısı mandallı.** Seçildi.

## Karar
- `capabilities/types.ts` `Binding.input?: ZodType` (RPC tel gövdesi). Şemalar `capabilities/rpc-input/**` altında (`'Servis/operasyon'` → şema) tutulur; `capabilities/index.ts` bunları bağlara iliştirir (`RPC_INPUT_BY_RPC`). `capabilities/**` `api/**`'yi içe aktarmaz (ADR-0016).
- `api/RunOperation.execute`: yetkilendirme + yetkiyi (entitlement) geçtikten ve sunucu alanları (`userContext/principal/order/clientId/requestMeta`) gövdeden atıldıktan SONRA, servis örneklenmeden ÖNCE `validateRpcRequest`. Yetkisiz çağıran şema ayrıntısı göremez (403 önce). Zod çıktısı servise gider (allow-list etkisi).
- **Mass assignment:** üst düzey gövde `.strict()` (bilinmeyen alan → 400). FE'nin sunucudan aldığı belgeyi geri gönderdiği iç içe varlıklar (ör. `user`, `clientMarketplace`) **izin listesi** (zod varsayılanı strip: yalnız izinli alanlar geçer, kalanı sessizce atılır — FE uyumu). Kimlikler yalnız string (NoSQL operatör nesnesi reddi). Serbest `settings` nesnelerinde üst düzey anahtar güvenli olmalı (`$` önekli/`.` içeren/prototip adı yok).
- **Hata biçimi:** `ApplicationError(msg, 400, 'VALIDATION', fields)`; `ApiManager.sendError` yalnız 4xx `VALIDATION`'da `fields: [{ path, message }]` ekler (`error` string, `code` korunur; FE sözleşmesi bozulmaz). İletiler zod metninden değil `issue.code`'dan üretilen sabit Türkçe metinlerdir; **gövde değerleri yanıta/loga yansıtılmaz** (ADR-0001 Karar 12); yalnız izin verilmeyen alan ADLARI (arındırılmış, ≤5, ≤40 karakter). Yeni hata kodu YOK (`VALIDATION` zaten kataloglu).
- **Kapsam kuralı — mevcut kodlu doğrulamayı ezme:** yaşam döngüsü servisi kendi kodlu hatalarını üretiyorsa (`AccountService/changePassword` → `INVALID_REQUEST/WEAK_PASSWORD`, özel rota + `tests/unit/account`) o operasyon BİLİNÇLİ şemasız bırakılır (mandal listesinde); ya da şema alanları `optional` tutulur ve yalnız tip/uzunluk kapısı olur (`TenantDataService/requestDeletion`).
- **Mandal:** `capabilities/rpc-input-baseline.json` = yazma etkili (`effect != read`) ve şemasız RPC bağlarının donmuş listesi. `tests/unit/capabilities/rpcInput.ratchet.test.ts`: listede olmayan şemasız yazma bağı → kırmızı; şema eklenip listeden çıkarılmayan bağ → kırmızı (yalnız küçülür). Yeniden üretim: `UPDATE_RPC_INPUT_BASELINE=1`.

## Gerekçe
Tek noktadan doğrulama F-11'in kök nedenini (dağınık/eksik doğrulama) kapatır; bağ düzeyinde opsiyonel şema geriye uyumludur (şemasız operasyon değişmez) ve kademeli göçe izin verir. İzin listesi + strict ayrımı FE'yi kırmadan mass assignment'ı keser. Sabit iletiler gövde sızıntısını yapısal olarak engeller.

## Maliyet/Ölçek Notu
Ek bağımlılık/servis yok (`zod` zaten bağımlılık). İstek başına bir `safeParse` (mikro-saniyeler, DB yok). Yeniden değerlendirme eşiği: şemasız yazma bağı sayısı mandalla sıfıra indiğinde `input` zorunlu hale getirilir (tip düzeyinde).

## Etki Alanı
`backend/src/capabilities/{types.ts,index.ts,rpc-input/**,rpc-input-baseline.json}`, `backend/src/api/{RunOperation.ts,requestValidation.ts,Security.ts,ApiManager.ts}`, `docs/ERROR_CODES.md` (yanıt zarfı notu). Ürün/varyant kaydet-güncelle, katalog eşleme, görsel, fatura oluşturma vb. ikinci dalga (mandal listesinde).

## Uygulama Notu (2026-09-30, faz4-int-wp8)
İlk dalga: 50 yazma + 1 salt-okunur (exportExcel) RPC bağı şemalandı (şemasız yazma bağı: 60, mandallı) (kimlik/hesap/yönetim, entegrasyon ayarları, stok politikası, sipariş/iade/kargo/fatura/müşteri, ürün onsale/silme, mesaj, destek, platform ayarı). Yetki testleri (`operation-policy.test.ts`, `audit-logger.test.ts`) gövde şeması uygulamadan izole edilir (`requestValidation` pass-through mock; şema davranışı `tests/unit/api/requestValidation.test.ts`'te sınanır). F-12 (exportExcel) aynı iş paketinde: satır tavanı + projeksiyon + cursor; yanıt sözleşmesi (base64 `excelData`) korunur.
