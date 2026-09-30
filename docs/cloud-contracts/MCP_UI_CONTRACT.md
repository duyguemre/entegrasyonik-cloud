# MCP_UI_CONTRACT — Yapay zekâ uygulaması bağlantısı (uzak MCP) önyüz sözleşmesi (bulut görevi girdisi)

Sürüm: 1.0.0 (2026-10-01). Karar: `docs/adr/0035-uzak-mcp-sunucusu.md` (ADR-0035). Plan: `docs/MCP_PLAN.md` (bu belge = MCP-6; gerçek uçlara bağlama MCP-7, yerel). Kullanıcı kararları: K47, K37(b), K38, K36 (`docs/adr/USER_DECISIONS.md`).
Bu belge önyüzün **backend olmadan** (mock ile) bitirilebilmesi için yazıldı. Backend uçları henüz yok; tipler burada kanoniktir.

**Ne yapılıyor (kullanıcı gözünden):** Kullanıcı kendi yapay zekâ uygulamasına (abonelikli masaüstü/web sohbet uygulaması) Entegrasyonik'i "bağlayıcı" olarak ekler. Uygulama kullanıcıyı Entegrasyonik'e yönlendirir → **Onay ekranı** (hangi uygulama, hangi mağaza, okuma mı yazma mı) → bağlanır. Yapay zekâ bir yazma işlemi isterse kullanıcıya bir bağlantı verir → **İşlem onayı sayfası**nda kullanıcı önizlemeyi görüp onaylar/reddeder. Bağlantılar **Bağlı uygulamalar** ekranında görülür ve iptal edilir. Tenant sahibi özelliği **Yapay zekâ bağlantısı** ayarından açar (varsayılan kapalı).

**Kapsam dışı:** sohbet arayüzü (CHAT_UI_CONTRACT), uygulama içi BYOK kurulumu, backoffice, masaüstü yerel araçları. Rakip/ürün adları (hedef yapay zekâ uygulamalarının adları dahil) statik metinlerde **yazılmaz**; uygulama adı yalnız backend'in döndürdüğü `clientName` alanından gösterilir.

---

## 1. Ekranlar ve rotalar

| # | Ekran | Rota (`frontend/src/navigation/screens.ts`) | Kim | Kabuk |
|---|---|---|---|---|
| S1 | Onay (consent) | `oauth/consent?req={id}` | giriş yapmış kullanıcı | **Sade kabuk** (menü yok, logo + kart; giriş sayfası deseni). Oturum yoksa mevcut giriş akışı `redirect` ile geri döner |
| S2 | İşlem onayı | `approve/{id}` (URL'de başka parametre yok) | işlemi başlatan kullanıcı | Sade kabuk |
| S3 | Bağlı uygulamalar | `account/connected-apps` (hesap bölümü, `AccountSecurityView` yanında) | her kullanıcı | Normal kabuk |
| S4 | Yapay zekâ bağlantısı (MCP) ayarı | `settings/ai-connection` (mevcut ayarlar bölümü; Otopilot ayarının yanında) | görür: `settings:read`; değiştirir: yalnız sahip | Normal kabuk |

Tümü `menuSource:'registry'` kurallarına uyar; yetenek kimlikleri §4'te. S1/S2 menüde görünmez.

## 2. S1 — Onay ekranı

Veri: `GET /api/oauth/requests/{id}` → `ConsentRequest` (§4). Karar: `POST /api/oauth/requests/{id}/decision` → `ConsentDecisionResult`; başarıda `window.location.assign(redirectTo)` (yalnız backend'in döndürdüğü URL; önyüz URL kurmaz).

Yerleşim (yukarıdan aşağı):
1. Başlık: "**{clientName}** Entegrasyonik hesabınıza erişmek istiyor". `client.known === true` → "Tanınan uygulama" çipi. `false` → uyarı kutusu (warning tonu): "Bu uygulama doğrulanmadı. Yalnızca bağlantıyı kendiniz başlattıysanız devam edin." Her iki durumda **yönlendirme adresi alanı** (`client.redirectHost`) belirgin gösterilir ("Onaydan sonra şu adrese döneceksiniz: …").
2. **Mağaza seçimi:** `tenants.length > 1` → radyo listesi (ad + rol); 1 ise salt metin. `tenant.mcpAccess === 'off'` olan seçenek devre dışı + açıklama: "Bu mağazada yapay zekâ bağlantısı kapalı. Mağaza sahibi Ayarlar → Yapay zekâ bağlantısı'ndan açabilir." (Kullanıcı sahipse S4'e bağlantı.)
3. **İzinler:** her zaman "Verilerinizi okuma (siparişler, ürünler, stok, raporlar)" (salt bilgi). `tenant.writeAvailable === true` ise onay kutusu "İşlem önerme — her işlem ayrıca Entegrasyonik'te onayınızı ister" (varsayılan **işaretsiz**). `writeAvailable === false` ise gösterilmez.
4. **Bilgilendirme (KVKK):** `notice.text` (backend'den, sürümlü) + "Kişisel veriler (ad, adres, telefon) maskelenir." Onay kutusu yok (kullanıcı düzeyi bilgilendirme; tenant onayı S4'te).
5. Düğmeler: "Reddet" (ikincil) ve "İzin ver" (birincil). Tenant seçilmeden "İzin ver" devre dışı. İlk odak başlıkta, **birincil düğmede değil**.

Durumlar (`ConsentRequest.state` ve hata kodları):
| Durum | Görünüm |
|---|---|
| yükleniyor | kart iskeleti |
| `expired` / 404 | "Bu bağlantı isteğinin süresi doldu. Yapay zekâ uygulamanıza dönüp yeniden bağlanın." |
| `IMPERSONATION_FORBIDDEN` | "Destek oturumunda uygulama bağlanamaz." |
| `noEligibleTenant` (tüm mağazalar `off`) | 2. maddedeki açıklama, "İzin ver" yok, yalnız "Reddet" |
| karar gönderiliyor | düğmeler meşgul, çift gönderim yok |
| karar hatası | satır içi hata + destek kodu (`requestId`) |
| reddet | backend `redirectTo` (hata parametresiyle) döner → aynı şekilde yönlendir |

## 3. S2 — İşlem onayı sayfası

Veri: `GET /api/mcp/approvals/{id}` → `ApprovalView`. Karar: `POST /api/mcp/approvals/{id}` `{ decision: 'approve' | 'reject' }` → `ApprovalView` (güncel durum).

Yerleşim: başlık "**{clientName}** bir işlem öneriyor"; önizleme kartı (`preview.title`, `preview.lines[]` madde listesi, `preview.count`); "Bu işlem pazaryerine gönderilir" notu (`external === true`); kalan süre (görsel geri sayım; ekran okuyucuya yalnız son 60 sn'de bir kez); düğmeler "Reddet" / eylemi söyleyen birincil düğme (`preview.confirmLabel`, ör. "12 siparişi onayla"). İlk odak başlıkta. Onaydan sonra sonuç durumu ve "Yapay zekâ uygulamanıza dönebilirsiniz; aynı isteği tekrarladığında sonucu görecek." + `openIn` varsa "Ekranda aç" bağlantısı.

| `status` | Görünüm |
|---|---|
| `pending` | önizleme + düğmeler |
| `executed` | başarı + `result.summary` |
| `failed` | hata iletisi (`result.code` → i18n) + destek kodu |
| `unknown_outcome` | "Sonuç belirsiz, ekrandan kontrol edin" + `openIn` |
| `rejected` | "Reddedildi" |
| `expired` / 404 | "Bu onay isteğinin süresi doldu veya size ait değil." |
| hata `LIVE_READONLY` | "Canlı veri salt-okuma modunda; bu işlem şu an yapılamaz." |
| hata `MAINTENANCE` | bakım iletisi |
| hata `QUOTA_EXCEEDED` | "Günlük işlem sınırınıza ulaştınız" + plan yükseltme bağlantısı (mevcut desen) |

## 4. Tipler ve uçlar (kanonik; mock bunlarla birebir)

```ts
// Ortak
type McpScope = 'mcp:read' | 'mcp:write';
type McpAccess = 'off' | 'read' | 'readwrite';
interface ApiError { error: string; code?: string; requestId: string; fields?: Record<string, string> } // tek hata zarfı (F4)

// S1 — GET /api/oauth/requests/:id   (yetenek: oauth.consent.view)
interface ConsentRequest {
  id: string;
  state: 'pending' | 'expired';
  client: { name: string; known: boolean; redirectHost: string };
  requestedScopes: McpScope[];
  tenants: Array<{ tid: number; name: string; role: 'owner' | 'admin' | 'member' | string;
                   mcpAccess: McpAccess; writeAvailable: boolean }>;
  notice: { textVersion: string; text: string };      // düz metin; markdown/HTML değil
  expiresAt: string;                                   // ISO
}
// POST /api/oauth/requests/:id/decision   (yetenek: oauth.consent.decide)
interface ConsentDecisionRequest { approve: boolean; tid?: number; scopes?: McpScope[] }
interface ConsentDecisionResult { redirectTo: string }

// S2 — GET/POST /api/mcp/approvals/:id   (yetenek: mcp.approvals.view / mcp.approvals.decide)
interface ApprovalView {
  id: string;
  status: 'pending' | 'executed' | 'failed' | 'unknown_outcome' | 'rejected' | 'expired';
  client: { name: string };
  capability: { id: string; title: string };           // title: kayıttaki summary (i18n backend'de çözülmüş)
  external: boolean;
  preview: { title: string; lines: string[]; count?: number; confirmLabel: string };  // lines ≤ 20, her biri ≤ 200 karakter, düz metin
  expiresAt: string;
  result?: { summary?: string; code?: string; openIn?: { screen: string; params?: Record<string, string> } };
}

// S3 — Bağlı uygulamalar
// GET /api/mcp/connections?scope=me|tenant   (mcp.connections.list; scope=tenant yalnız users:manage)
interface McpConnection {
  id: string;                        // aile kimliği
  clientName: string; known: boolean; redirectHost: string;
  tenant: { tid: number; name: string };
  user?: { id: string; email: string };                // yalnız scope=tenant
  scopes: McpScope[];
  createdAt: string; lastUsedAt: string | null; expiresAt: string;
}
interface McpConnectionList { items: McpConnection[] }
// DELETE /api/mcp/connections/:id            (mcp.connections.revoke) → 204
// POST   /api/mcp/connections/revoke-all     (mcp.connections.revokeAll; sahip/admin) → { revoked: number }
// GET /api/mcp/approvals?status=pending      (mcp.approvals.list) → { items: ApprovalView[] }

// S4 — Tenant ayarı
// GET /api/mcp/settings                      (mcp.settings.get)
interface McpSettings {
  access: McpAccess;                 // etkin değer (metin sürümü eskiyse 'off')
  consent: { textVersion: string; at: string; byEmail: string } | null;
  currentText: { textVersion: string; text: string };
  consentOutdated: boolean;          // kayıtlı onay eski sürüm → yeniden onay gerekir
  canEdit: boolean;                  // yalnız sahip ve impersonation değil
  serverUrl: string;                 // kullanıcıya gösterilecek MCP adresi (ör. https://api.entegrasyonik.com/mcp)
  activeConnections: number;
}
// PUT /api/mcp/settings                      (mcp.settings.save; yalnız sahip)
interface McpSettingsSave { access: McpAccess; acceptTextVersion?: string } // access≠off ise acceptTextVersion = currentText.textVersion ZORUNLU
```

Hata kodları (i18n anahtarı `mcp.errors.<CODE>`): `OAUTH_INVALID_REQUEST`, `OAUTH_ACCESS_DENIED`, `MCP_TENANT_OFF`, `IMPERSONATION_FORBIDDEN`, `FORBIDDEN`, `APPROVAL_EXPIRED`, `APPROVAL_REJECTED`, `LIVE_READONLY`, `MAINTENANCE`, `QUOTA_EXCEEDED`, `RATE_LIMITED`, `NOT_FOUND`, bilinmeyen → genel ileti + destek kodu.

## 5. S3 — Bağlı uygulamalar

- Üstte kısa açıklama + "Nasıl bağlanırım?" genişleyen bölüm: 3 adım (1) Yapay zekâ uygulamanızın bağlayıcı/connector ekleme bölümünü açın (2) şu adresi yapıştırın: `serverUrl` (kopyala düğmesi, `aria-live` "Kopyalandı") (3) açılan Entegrasyonik sayfasında izin verin. `serverUrl` `/api/mcp/settings`'ten gelir (herkes okuyabilir; `canEdit` olmayan için de). Tenant `access==='off'` ise adımlar yerine uyarı + (sahipse) S4 bağlantısı.
- **Bekleyen onaylar** bölümü (varsa): `ApprovalView` kartları → S2'ye bağlantı.
- **Bağlantılarım** tablosu (`scope=me`): uygulama (ad + tanınan çipi + host), mağaza, izin çipleri ("Okuma", "İşlem önerme"), bağlandı, son kullanım (göreli), bitiş; satır eylemi "Bağlantıyı kes" → onay diyaloğu (`EkConfirmDialog`: "{clientName} artık hesabınıza erişemeyecek.") → DELETE → iyimser değil, yanıt sonrası listeden düşer + toast.
- `users:manage` olan için sekme "Mağazadaki tüm bağlantılar" (`scope=tenant`, ek sütun kullanıcı) + "Tümünü kes" (yazılı onay: "KES" yazdırılmaz; normal onay diyaloğu yeterli, sayı gösterilir).
- Boş durum: "Henüz bağlı uygulama yok" + "Nasıl bağlanırım?" bölümünü açan düğme.

## 6. S4 — Yapay zekâ bağlantısı ayarı

- Durum kartı: etkin erişim (Kapalı / Yalnız okuma / Okuma + işlem önerme), aktif bağlantı sayısı, `serverUrl` (kopyala).
- `canEdit` → 3 seçenekli radyo (`off`/`read`/`readwrite`) + `currentText.text` bilgilendirme kutusu + onay kutusu "Okudum; mağaza verilerinin kullanıcıların seçtiği yapay zekâ sağlayıcılarına aktarılmasını onaylıyorum." (yalnız `off` dışı seçimde ve onay yoksa/eskiyse zorunlu). Kaydet → PUT. `off`'a almak: bilgi notu "Mevcut bağlantılar askıya alınır; yeniden açınca devam eder. Tamamen kesmek için Bağlı uygulamalar → Tümünü kes."
- `consentOutdated` → uyarı bandı "Bilgilendirme metni güncellendi; bağlantılar yeniden onaylanana kadar kapalı."
- `canEdit === false` → salt-okuma görünüm + "Bu ayarı yalnız mağaza sahibi değiştirebilir."

## 7. Mock (`frontend/src/mocks/mcp.ts` veya mevcut mock düzeni)
Senaryolar (sorgu parametresi ya da mock kontrol paneliyle seçilir): `consent-known-single`, `consent-unknown-multi` (3 mağaza, biri `off`, biri `writeAvailable:false`), `consent-expired`, `consent-impersonation`, `consent-no-eligible`, `approval-pending` (60 sn'lik süre), `approval-executed`, `approval-failed`, `approval-unknown`, `approval-live-readonly`, `approval-expired`, `connections-empty`, `connections-many` (me + tenant), `settings-owner-off`, `settings-owner-outdated`, `settings-admin-readonly`. Mock yanıtları §4 tipleriyle tip denetimli.

## 8. Test beklentileri (bulut çıkış kapısı)
- **Birim (vitest):** tip uyumu (mock → §4), durum eşlemesi (her `status`/hata kodu → doğru görünüm), `redirectTo` dışında URL kurulmadığı (statik test: S1'de `location.assign` yalnız yanıt alanıyla), `preview.lines` düz metin (`v-html` = 0), kopyala düğmesi.
- **Playwright (mock):** S1: bilinen/bilinmeyen istemci, çoklu mağaza seçimi, `off` mağaza devre dışı, yazma kutusu varsayılan boş, reddet/izin ver yönlendirmesi, süresi dolmuş; S2: onayla → executed, reddet, süresi dolmuş, LIVE_READONLY; S3: listele, kes (onay diyaloğu), tenant sekmesi yalnız yetkili, boş durum; S4: sahip kapalıdan okuma+yazmaya (onay kutusu zorunlu), güncel olmayan metin bandı, admin salt-okuma.
- Klavye: tüm akışlar yalnız klavyeyle; odak sırası; diyalog odak tuzağı ve dönüşü. axe 0 (light + dark), 375/800/1280 yatay taşma yok, win32 görsel tabanlar (S1, S2 pending, S3 dolu, S4 sahip).
- i18n: tüm metin `mcp.*` anahtarları (tr/en); tarih/süre `@entegrasyonik/ui/format`.

## 9. Bulut görevi sınırları (CLAUDE.md kural 7)
- Yalnız `frontend/` yazılır; `backend/`, `docs/adr/` salt-okunur. Gerçek backend'e bağlanma yok (MCP-7 yerel).
- Yeni bağımlılık yok. Sade kabuk için mevcut giriş sayfası düzeni yeniden kullanılır.
- Uygulama/ürün adı (hedef yapay zekâ uygulamaları dahil) statik metne yazılmaz (K07); görsel/logo yok.
