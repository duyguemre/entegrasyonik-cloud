# MCP-6 önyüz (cloud/mcp-fe) — inceleme ve rapor

Kaynaklar: `docs/cloud-contracts/MCP_UI_CONTRACT.md` 1.0.0 (kanonik), ADR-0035, K36–K38 / K47 / K48.
Dal: `cloud/mcp-fe`. Taban `origin/cloud/fe-r2d` + `origin/main`. fe-r2d bu oturumda henüz bitmemişti (yalnız `before/`
görüntüleri vardı, dal çalışırken ilerliyordu); iş onun üstünde yapıldı ve son hâli birleştirildi (çakışma yok). Ayar
dosyalarından yalnız `screens.ts`, `menu.ts` ve `pageHelp.ts`'e kayıt **eklendi**; mevcut ekranlara dokunulmadı.
Yalnız mock kullanıldı; backend'e bağlanılmadı.

## Ekranlar

| # | Ekran | Rota | Dosya | Görüntüler (1440 + 390) |
|---|---|---|---|---|
| S1 | OAuth onay (consent) — sade kabuk | `/oauth/consent?req={id}` | `src/views/unsecure/OAuthConsentView.vue` | `s1-onay-bilinen-tek`, `s1-onay-dogrulanmamis-coklu`, `s1-onay-suresi-dolmus` |
| S2 | Bant dışı işlem onayı — sade kabuk | `/approve/{id}` | `src/views/unsecure/McpApprovalView.vue` | `s2-islem-onayi-bekliyor` (+`-koyu`), `-tamamlandi`, `-salt-okuma`, `-suresi-dolmus` |
| S3 | Bağlı uygulamalar (bağlantı talimatı + bekleyen onaylar + liste/iptal) | `/account/connected-apps` | `src/views/secure/user/ConnectedAppsView.vue` | `s3-...-dolu`, `-magaza-sekmesi` (+`-koyu`), `-bos-operator` |
| S4 | Yapay zekâ bağlantısı (tenant erişim kapısı) | `/settings/ai-connection` | `src/views/secure/settings/AiConnectionView.vue` | `s4-ayar-sahip-acma`, `-sahip-metin-guncellendi`, `-yonetici-salt-okuma` |

Ortak parçalar: `src/components/mcp/` (`mcpModel.ts` saf görünüm modeli, `mcpMessages.ts` tr/en `mcp.*`,
`McpActionPreview.vue` onay önizleme kartı, `McpConnectGuide.vue` 3 adım, `McpCopyField.vue` kopyala + `aria-live`),
`src/composables/useMcpApi.ts` (REST uçları), `src/types/McpTypes.ts` (§4 birebir), `src/mocks/mcp.ts` (§7'nin 16
senaryosu + `settings-owner-on`). Geliştirmede backend olmadan: `?mcpMock=<senaryo>` (yalnız `vite dev`; üretim
paketine girmez — derlemede doğrulandı).

**Rol görünürlüğü (yalnız ipucu; asıl sınır backend `can()`):** sahip → tenant sekmesi + Tümünü kes + S4 düzenleme;
yönetici → tenant sekmesi + Tümünü kes, S4 salt-okuma; operatör → yalnız kendi bağlantıları, S4 salt-okuma. S4'te
düzenleme kararı yalnız backend `canEdit`'ten gelir (önyüz rol tahmini yapmaz).

**Güvenlik kuralları (statik testle korunur):** S1 yönlendirmesi yalnız `window.location.assign(res.data.redirectTo)`;
önyüz URL kurmaz. `preview.*` / `notice.text` düz metin (`v-html` 0). İlk odak başlıkta. Yazma kutusu varsayılan
işaretsiz ve mağaza değişince sıfırlanır. "Ekranda aç" yalnız `screens.ts`'te kayıtlı ekrana ve `urlParams` beyaz
listesiyle. Statik metinlerde hedef yapay zekâ ürün adı yok (K07); istemci adı yalnız `clientName`.

## Sözleşme sapmaları ve backend'e notlar (MCP-7)

1. **Onay sayfası yolu çelişkisi:** ADR-0035 Karar 5 `https://app.entegrasyonik.com/onay/{id}`, sözleşme §1 ve brif
   `approve/{id}`. Uygulanan: `/approve/{id}` (`approve` ayrılmış ilk segmentlere eklendi). Backend `approvalUrl`
   üretirken `/approve/` kullanmalı ya da ADR düzeltilmeli.
2. **`ApprovalView`'da `requestId` yok:** `failed` durumunda "destek kodu" isteniyor ama alan yok. Geçici: onay kimliği
   (`id`) destek kodu olarak gösteriliyor. Öneri: `result.requestId?: string` eklenmesi.
3. **Salt-okuma yanıtı:** önyüz hem `code:'LIVE_READONLY'` hem kodsuz HTTP 423'ü aynı görünüme eşler; backend hata
   zarfında `code`'u her zaman doldurmalı (F4).
4. **REST fiilleri:** `restApi` yalnız GET/POST sunduğu için `useMcpApi` axios'u doğrudan (aynı taban adres, çerez ve
   genel yakalayıcılarla) kullanır. Tüm çağrılar `skipSessionRedirect` ile gider; 401'de ekran `/login?redirect=<tam adres>`
   yapar (onay ekranının dönüş adresi kaybolmasın).
5. **S3 tenant sekmesi sütunları:** sözleşme "ek sütun kullanıcı" diyor; 960px okuma genişliğine sığması için tenant
   sekmesinde (tüm satırlar aynı mağaza) "Mağaza" sütunu yerine "Kullanıcı" gösterilir; "Bağlandı" ve "Bitiş" tek
   sütunda iki satırdır.
6. **Menü kayıtları:** `ConnectedAppsView` (kök) ve `settings/AiConnectionView` için ApplicationDB `menus` kaydı yerel iş
   (backend `MenuService`). `screens.ts` + `menu.ts` bileşen eşlemesi hazır; testler `menuFixtureWithMcp` kullanır.
7. **S1 "Ayarı aç" bağlantısı** kullanıcının **etkin** mağazasının S4'üne gider; listedeki mağaza etkin mağazadan
   farklıysa kullanıcı önce mağaza değiştirmeli (bugün derin bağlantıda mağaza parametresi yok).
8. **Yardım makalesi:** iki ekranın "Sayfa hakkında" içeriği yazıldı; ayrı "yapay zekâ bağlantısı" makalesi MCP-7'de
   (ADR-0035 Etki Alanı). O zamana dek `acc-privacy`'ye bağlanır.
9. **Belgeler:** brifin bağlayıcı saydığı `docs/MCP_PLAN.md` bu depoda (bulut kopyası) YOK; kabul kriteri olarak
   sözleşme §8 kullanıldı.
10. **Adlandırma** (brif "Otopilot bağlantıları" ↔ sözleşme "Yapay zekâ bağlantısı") ve **ortak onay kartı**
    (`@entegrasyonik/chat` tabanda yok): `frontend/docs/PROPOSALS_PENDING.md` P-MCP-1, P-MCP-2.

## Testler (bu dalda koşuldu)

| Kapı | Sonuç |
|---|---|
| vitest (tümü) | 69 dosya / 1454 test yeşil. Yeni: `tests/mcp-contract.test.ts` (tipler ↔ sözleşme §4 alan alan, hata kodları, 16 senaryonun çalışma anı şekli, statik kurallar), `tests/mcp-model.test.ts` (S1 faz/gövde, S2 her `status` ve hata kodu → görünüm, geri sayım + tek duyuru, rol görünürlüğü, S4 onay zorunluluğu/gövde, tr↔en eşliği, kullanılan her `mcp.*` anahtarı) |
| vue-tsc (mandal) | 0 hata (taban 0) |
| style / pattern / no-console mandalları | OK |
| eslint | 0 hata (uyarılar mevcut taban) |
| `npm run build` + `npm run build:backoffice` | ikisi de başarılı; üretim JS'inde mock kodu yok |
| Playwright (mock, 3 viewport: 375/800/1280) | `mcp-consent` 11, `mcp-approval` 11, `mcp-connections` 9, `mcp-settings` 8 senaryo × 3 = 117 yeşil (görsel tabanlar ilk koşuda `--update-snapshots=missing` ile yazıldı, sonraki koşular kararlı). Kapsam: §8 listesinin tamamı + klavye akışları, diyalog odak dönüşü, çift gönderim yok, iyimser olmayan iptal, geri sayım sıfırda süresi dolmuş |
| axe AA (light + dark) | 4 ekranda 0 ihlal. Koyu tema gerçek Vuetify `darkTheme` örneğiyle zorlanır ve uygulandığı doğrulanır (müşteri uygulamasında tema seçici kapalı, FR2-DARK) |
| Yatay taşma | 375/800/1280'de 0 |

Görsel tabanlar: `*-linux.png` git-ignored (kural 7); win32 tabanları yerelde üretilecek: `mcp-consent`, `mcp-approval-pending`,
`mcp-connections`, `mcp-settings-owner`.

## Ortam notları (bulut)
- `scripts/cloud-setup.sh` bu ortamda `npx playwright install` adımında (indirme engelli) düşüyor; önyüz bağımlılıkları
  ayrıca kuruldu. Önceden kurulu Chromium yeterli (`playwright.cloud.config.ts`).
- `package-lock.json` Windows'ta üretildiği için `@rollup/rollup-linux-x64-gnu` eksik → `npm i --no-save` ile kuruldu.
- `npm run tokens` çalıştırılmadan token dist'i olmadığından 4 vitest ve tüm e2e düşüyor (kod hatası değil). Kurulum
  betiğine eklenmesi önerilir (betik `scripts/` altında, bu görevin yazma kapsamı dışında).
- Önceden var olan: AuthShell'in marka paneli koyu temada soluk kalıyor (FR2-DARK kapsamı).

## İnceleme görüntülerini yeniden üretmek
```
MCP_REVIEW=1 MCP_WIDTH=1440 npx playwright test e2e/specs/mcp-fe-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop
MCP_REVIEW=1 MCP_WIDTH=390  npx playwright test e2e/specs/mcp-fe-review.spec.ts -c playwright.cloud.config.ts --project=chromium-desktop
```
