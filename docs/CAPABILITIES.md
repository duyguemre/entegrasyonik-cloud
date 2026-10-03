# CAPABILITIES.md — Yetenek Kaydı (ADR-0019)

**ÜRETİLMİŞ BELGE — ELLE DÜZENLENMEZ.** Kaynak: `backend/src/capabilities/**` (zod-şemalı TypeScript kaydı).
Yeniden üretmek için: `cd backend && npm run capabilities:docs`. Bu belge `docs/OPERATION_POLICY.md`'nin yerine geçer (ADR-0019 §2).

Üretim zamanı: 2026-10-03T22:01:16.824Z · Kaynak commit bilgisi bu betiğin dışında (git) tutulur.

## Özet

- Toplam yetenek: **302** (toplam RPC bağı: 344)
- `effect`: write=126, read=145, destructive=28, propose=3
- `minTier`: platformAdmin=105, member=153, owner=4, admin=40
- MCP: `exposed`=13, `notExposed`=289 (bunun `deferred`=103)
- Yetim (ui.none + mcp.notExposed + agent.allowed:false): 130 (bkz. `capability-baseline.json`, artamaz mandalı)

**Operasyon/yetenek sayısı tutarsızlığı çözümü (ADR-0019 Bağlam):** `operationPolicy.ts`nin bugünkü mekanik sayımı 
(ImageApi sözde-servisi DAHİL, `OPEN_OPERATIONS` HARİÇ) **174** `(servis, operasyon)` çiftidir (member 137, admin 19, owner 2, 
platformAdmin 16). Önceki belgelerdeki "156/158/159" sayıları bu tablonun daha önceki, KVKK/webhook/tenant-yüzlü 
operasyonlar eklenmeden ÖNCEKİ anlık görüntüleridir (bkz. git geçmişi: `1b40095`=151, `100c600`=155, `962930f`=156, 
`34488dd`=159, ...). `docs/OPERATION_POLICY.md`'nin "172" sayısı ise **BillingService'in (3 operasyon: getPlans, 
getMySubscription, startCheckout) o belgenin "Tam tablo" bölümünde hiç listelenmemiş olmasından** kaynaklanan bir belge 
hatasıydı (171 [tablo] + 13 [tenant-yüzlü] = ~aritmetik olarak 172 iddia edildi ama gerçek tablo toplamı 158+13=171'di; 
Billing (3) hiç sayılmamıştı). Bu ADR-0019 içe aktarımı Billing dahil TÜM 174 kaydı `capabilities/domains/billing.ts` 
dahil 14 alan dosyasına taşıdı; **174 RPC operasyonu → 149 iş-odaklı yetenek** (tekli+toplu birleşimi ve CRUD ailelerinin 
iş odaklı gruplanması nedeniyle azaldı — ADR-0019 §4.3 tahmini "156'nın ~100-110 yeteneğe ineceği" tahmininden YÜKSEK 
kaldı; bu Aşama A ölçümüdür, bulgu olarak işaretlendi: bazı domain'ler (integrations, catalog) daha fazla 
birleştirilebilir, Aşama B/C'de gözden geçirilebilir).

3 FE çağrısı (`IntegrationService/checkProductStatus`, `IntegrationService/processPlatformProduct`, 
`IntegrationService/retrieveProductsFromClientMarketplace`) bilinçli olarak yetenek kaydına GİRMEDİ: gerçek bir servis 
metodu yok (bugün de 403/çalışmıyor; `operation-policy.test.ts` `FE_CALLS_WITHOUT_BACKEND` listesi bunu doğrular).

## Alan (domain) başına yetenekler

### account (65)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `account.email_verification.resend` | write | member | AccountService/resendVerificationEmail | notExposed:credential | none (Backend-only: Hesabım/Güvenlik ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `account.password.change` | write | member | AccountService/changePassword | notExposed:credential | none (Backend-only: Hesabım/Güvenlik ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `account.reauthenticate` | write | member | AccountService/reauthenticate | notExposed:credential | none (Backend-only: yeniden doğrulama diyaloğu (ADR-0028 Karar 8) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `account.tenant.data.export` | write | owner | TenantDataService/exportTenantData | notExposed:binary_file | none (Backend-only: dışa aktarma ekranı Faz 2/3 (ADR-0003 F.22; BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `account.tenant.deletion.request` | destructive | owner | TenantDataService/requestDeletion | notExposed:irreversible | none (Backend-only: tenant silme ekranı Faz 2/3 (ADR-0003 F.20; BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | Geri alma yalnızca platformAdmin (platform.tenant.deletion.cancel); tenant kullanıcısı kendi talebini geri alamaz. |
| `agent.confirm` | write | member | POST /agent/confirm | notExposed:ui_plumbing | shell:chat | allowed:false |  |
| `agent.info` | read | member | GET /agent/info | notExposed:ui_plumbing | shell:chat | allowed:false |  |
| `agent.more` | read | member | POST /agent/more | notExposed:ui_plumbing | shell:chat | allowed:false |  |
| `agent.provider.consent` | write | admin | POST /agent/provider/consent | notExposed:credential | shell:chat | allowed:false |  |
| `agent.provider.get` | read | admin | GET /agent/provider | notExposed:credential | shell:chat | allowed:false |  |
| `agent.provider.remove` | write | admin | DELETE /agent/provider | notExposed:credential | shell:chat | allowed:false |  |
| `agent.provider.save` | write | admin | PUT /agent/provider | notExposed:credential | shell:chat | allowed:false |  |
| `agent.provider.test` | read | admin | POST /agent/provider/test | notExposed:credential | shell:chat | allowed:false |  |
| `agent.reset` | write | member | DELETE /agent/conversations/:id | notExposed:ui_plumbing | shell:chat | allowed:false |  |
| `agent.turn` | propose | member | POST /agent/turns | notExposed:ui_plumbing | shell:chat | allowed:false |  |
| `audit.logs.list` | read | admin | AuditService/getAuditLogs | notExposed:deferred→later | none (Backend-only: denetim günlüğü ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `config.get` | read | member | ConfigurationService/get | notExposed:ui_plumbing | shell:init | allowed:false |  |
| `mcp.approvals.decide` | write | member | POST /mcp/approvals/:id | notExposed:ui_plumbing | shell:session | allowed:false |  |
| `mcp.approvals.list` | read | member | GET /mcp/approvals | notExposed:ui_plumbing | ConnectedAppsView | allowed:false |  |
| `mcp.approvals.view` | read | member | GET /mcp/approvals/:id | notExposed:ui_plumbing | shell:session | allowed:false |  |
| `mcp.connections.list` | read | member | GET /mcp/connections | notExposed:ui_plumbing | ConnectedAppsView | allowed:false |  |
| `mcp.connections.revoke` | write | member | DELETE /mcp/connections/:id | notExposed:ui_plumbing | ConnectedAppsView | allowed:false |  |
| `mcp.connections.revoke_all` | write | admin | POST /mcp/connections/revoke-all | notExposed:ui_plumbing | ConnectedAppsView | allowed:false |  |
| `mcp.settings.get` | read | member | GET /mcp/settings | notExposed:ui_plumbing | settings/AiConnectionView | allowed:false |  |
| `mcp.settings.save` | write | admin | PUT /mcp/settings | notExposed:ui_plumbing | settings/AiConnectionView | allowed:false |  |
| `menu.favorites.add` | write | member | MenuService/addFavorite | notExposed:ui_plumbing | shell:menu | allowed:false |  |
| `menu.favorites.list` | read | member | MenuService/retrieveFavorites | notExposed:ui_plumbing | shell:menu | allowed:false |  |
| `menu.favorites.remove` | destructive | member | MenuService/deleteFavorite | notExposed:ui_plumbing | shell:menu | allowed:false |  |
| `menu.favorites.sort` | write | member | MenuService/sortFavorites | notExposed:ui_plumbing | shell:menu | allowed:false |  |
| `menu.get` | read | member | MenuService/get | notExposed:ui_plumbing | shell:menu | allowed:false |  |
| `notifications.announcements.active` | read | member | AnnouncementService/getActive | notExposed:ui_plumbing | none (Backend-only: duyuru bandı (F-N4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `notifications.archive` | write | member | NotificationService/archive, NotificationService/unarchive | notExposed:ui_plumbing | none (Backend-only: bildirim merkezi v2 (F-N1) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `notifications.catalog` | read | member | NotificationService/getCatalog | notExposed:ui_plumbing | none (Backend-only: bildirim merkezi/tercihler FE (F-N1/F-N2) bulut işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `notifications.delete` | destructive | member | NotificationService/delete | notExposed:ui_plumbing | shell:notifications | allowed:false |  |
| `notifications.list` | read | member | NotificationService/get | notExposed:deferred→later | shell:notifications | allowed:false |  |
| `notifications.mark_read` | write | member | NotificationService/markAsRead | notExposed:ui_plumbing | shell:notifications | allowed:false |  |
| `notifications.preferences.get` | read | member | NotificationService/getPreferences | notExposed:ui_plumbing | none (Backend-only: bildirim tercihleri ekranı (F-N2) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `notifications.preferences.update` | write | member | NotificationService/updatePreferences | notExposed:ui_plumbing | none (Backend-only: bildirim tercihleri ekranı (F-N2) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `notifications.push.config` | read | member | NotificationService/getPushConfig | notExposed:ui_plumbing | NotificationPreferencesView | allowed:false |  |
| `notifications.push.subscribe` | write | member | NotificationService/subscribePush | notExposed:ui_plumbing | NotificationPreferencesView | allowed:false |  |
| `notifications.push.unsubscribe` | write | member | NotificationService/unsubscribePush | notExposed:ui_plumbing | NotificationPreferencesView | allowed:false |  |
| `notifications.tenant_defaults.get` | read | admin | NotificationService/getTenantDefaults | notExposed:ui_plumbing | none (Backend-only: tenant varsayılanları ekranı (F-N2) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `notifications.tenant_defaults.update` | write | admin | NotificationService/updateTenantDefaults | notExposed:ui_plumbing | none (Backend-only: tenant varsayılanları ekranı (F-N2) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `notifications.unread_count` | read | member | NotificationService/getUnreadCount | notExposed:ui_plumbing | none (Backend-only: hafif rozet sorgusu, FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `oauth.consent.decide` | write | member | POST /oauth/requests/:id/decision | notExposed:ui_plumbing | shell:session | allowed:false |  |
| `oauth.consent.view` | read | member | GET /oauth/requests/:id | notExposed:ui_plumbing | shell:session | allowed:false |  |
| `resources.list` | read | member | UserService/getResources | notExposed:ui_plumbing | shell:init | allowed:false |  |
| `roles.list` | read | member | UserService/getRoles | notExposed:ui_plumbing | shell:init | allowed:false |  |
| `search.unified` | read | member | SmartService/unifiedSearch | notExposed:deferred→later | shell:app_bar | allowed:false |  |
| `settings.get` | read | member | SettingService/getSettings | notExposed:deferred→later | SettingListView, shell:init | allowed:false |  |
| `settings.logo.upload` | write | admin | ImageApi/uploadIdentity | notExposed:binary_file | SettingListView#uploadLogo | allowed:false | OPERATION_POLICY.md Belirsiz (düşük): admin mı member mi; kiracı logosu ayar niteliğinde olduğu için admin bırakıldı. |
| `settings.update` | write | admin | SettingService/updateSettings | notExposed:deferred→later | SettingListView#save | allowed:false |  |
| `users.create` | write | admin | UserService/createUser | notExposed:deferred→later | user/AuthorizationListView#create | allowed:false | OPERATION_POLICY.md "Bilinen boşluklar": admin, gövdedeki roleCode ile ROLE_OWNER atayabilir (kademe var, hedef-rol kontrolü yok). |
| `users.delete` | destructive | admin | UserService/deleteUser | notExposed:deferred→later | user/AuthorizationListView#delete | allowed:false |  |
| `users.invitation.list` | read | admin | UserService/listInvitations | notExposed:deferred→later | none (Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `users.invitation.resend` | write | admin | UserService/resendInvitation | notExposed:deferred→later | none (Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `users.invitation.revoke` | write | admin | UserService/revokeInvitation | notExposed:deferred→later | none (Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `users.invite` | write | admin | UserService/inviteUser | notExposed:deferred→later | none (Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `users.list` | read | admin | UserService/getUsers | notExposed:deferred→later | user/AuthorizationListView | allowed:false |  |
| `users.ownership.transfer.accept` | write | member | UserService/acceptOwnershipTransfer | notExposed:irreversible | none (Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `users.ownership.transfer.cancel` | write | owner | UserService/cancelOwnershipTransfer | notExposed:irreversible | none (Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `users.ownership.transfer.initiate` | write | owner | UserService/initiateOwnershipTransfer | notExposed:irreversible | none (Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `users.reactivate` | write | admin | UserService/reactivateUser | notExposed:deferred→later | none (Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `users.suspend` | write | admin | UserService/suspendUser | notExposed:deferred→later | none (Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `users.update` | write | admin | UserService/updateUser | notExposed:deferred→later | user/AuthorizationListView#update | allowed:false | OPERATION_POLICY.md "Bilinen boşluklar": admin, gövdedeki roleCode ile ROLE_OWNER atayabilir (kademe var, hedef-rol kontrolü yok). |

### billing (3)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `billing.checkout.start` | write | admin | BillingService/startCheckout | notExposed:irreversible | user/SubscriptionView#checkout | allowed:false |  |
| `billing.plans.list` | read | member | BillingService/getPlans | notExposed:deferred→later | user/SubscriptionView | allowed:false |  |
| `billing.subscription.get` | read | member | BillingService/getMySubscription | notExposed:deferred→later | user/SubscriptionView | allowed:false |  |

### catalog (66)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `brands.create` | write | member | BrandService/addBrand | notExposed:deferred→later | productDefinitions/BrandListView#create | allowed:false |  |
| `brands.delete` | destructive | member | BrandService/deleteBrand | notExposed:deferred→later | productDefinitions/BrandListView#delete | allowed:false | OPERATION_POLICY.md Belirsiz: yıkıcı silme; member bırakıldı. |
| `brands.integration_mapping.save` | write | member | BrandService/saveIntegrationBrand, IntegrationService/saveOrUpdateIntegrationBrand | notExposed:deferred→later | productDefinitions/BrandListView#saveMapping | allowed:false |  |
| `brands.list` | read | member | BrandService/get | notExposed:deferred→later | productDefinitions/BrandListView | allowed:false |  |
| `brands.update` | write | member | BrandService/updateBrand | notExposed:deferred→later | productDefinitions/BrandListView#update | allowed:false |  |
| `categories.create` | write | member | CategoryService/addCategory | notExposed:deferred→later | productDefinitions/CategoryListView#create, definitions/CategoryDefinitionView#create | allowed:false |  |
| `categories.delete` | destructive | member | CategoryService/deleteCategory | notExposed:deferred→later | productDefinitions/CategoryListView#delete | allowed:false | OPERATION_POLICY.md Belirsiz: yıkıcı silme; member bırakıldı. |
| `categories.list` | read | member | CategoryService/get | notExposed:deferred→later | productDefinitions/CategoryListView, definitions/ProductDefinitionView, definitions/ProductUpdateView | allowed:false |  |
| `categories.move` | write | member | CategoryService/moveCategory, CategoryService/changeOrderCategory | notExposed:deferred→later | productDefinitions/CategoryListView#move | allowed:false |  |
| `categories.update` | write | member | CategoryService/updateCategory | notExposed:deferred→later | productDefinitions/CategoryListView#update | allowed:false |  |
| `choices.create` | write | member | ChoiceService/addChoice, ChoiceService/addPreparedChoice | notExposed:deferred→later | productDefinitions/ChoiceListView#create | allowed:false |  |
| `choices.delete` | destructive | member | ChoiceService/removeChoice | notExposed:deferred→later | productDefinitions/ChoiceListView#delete | allowed:false |  |
| `choices.list` | read | member | ChoiceService/get | notExposed:deferred→later | productDefinitions/ChoiceListView | allowed:false |  |
| `choices.update` | write | member | ChoiceService/updateChoice | notExposed:deferred→later | productDefinitions/ChoiceListView#update | allowed:false |  |
| `choices.values.add` | write | member | ChoiceService/addChoiceValue | notExposed:deferred→later | productDefinitions/ChoiceListView#addValue | allowed:false |  |
| `choices.values.remove` | destructive | member | ChoiceService/removeChoiceValue | notExposed:deferred→later | productDefinitions/ChoiceListView#removeValue | allowed:false |  |
| `choices.values.update` | write | member | ChoiceService/updateChoiceValue | notExposed:deferred→later | productDefinitions/ChoiceListView#updateValue | allowed:false |  |
| `hashtags.create` | write | member | HashtagService/addHashtag | notExposed:deferred→later | productDefinitions/HashtagListView#create | allowed:false |  |
| `hashtags.delete` | destructive | member | HashtagService/removeHashtag | notExposed:deferred→later | productDefinitions/HashtagListView#delete | allowed:false |  |
| `hashtags.list` | read | member | HashtagService/get | notExposed:deferred→later | productDefinitions/HashtagListView | allowed:false |  |
| `hashtags.update` | write | member | HashtagService/updateHashtag | notExposed:deferred→later | productDefinitions/HashtagListView#update | allowed:false |  |
| `hashtags.values.add` | write | member | HashtagService/addHashtagValue | notExposed:deferred→later | productDefinitions/HashtagListView#addValue | allowed:false |  |
| `hashtags.values.remove` | destructive | member | HashtagService/removeHashtagValue | notExposed:deferred→later | productDefinitions/HashtagListView#removeValue | allowed:false |  |
| `hashtags.values.update` | write | member | HashtagService/updateHashtagValue | notExposed:deferred→later | productDefinitions/HashtagListView#updateValue | allowed:false |  |
| `images.assign` | write | member | ImageService/assignImages | notExposed:binary_file | definitions/ProductDefinitionView#assignImages, definitions/ProductUpdateView#assignImages | allowed:false |  |
| `images.delete` | destructive | member | ImageApi/deleteImage, ImageApi/deleteImageSelected | notExposed:binary_file | definitions/ProductDefinitionView#deleteImage, definitions/ProductUpdateView#deleteImage | allowed:false |  |
| `images.list` | read | member | ImageApi/getImages | notExposed:binary_file | definitions/ProductDefinitionView, definitions/ProductUpdateView | allowed:false |  |
| `images.sort` | write | member | ImageApi/sortImages | notExposed:binary_file | definitions/ProductDefinitionView#sortImages, definitions/ProductUpdateView#sortImages | allowed:false |  |
| `images.upload` | write | member | ImageApi/upload, ImageService/createUploadUrl, ImageService/confirmUpload | notExposed:binary_file | definitions/ProductDefinitionView#uploadImage, definitions/ProductUpdateView#uploadImage | allowed:false |  |
| `mappings.attribute.get` | read | member | AttributeMappingService/getAttributeMapping | notExposed:deferred→later | productDefinitions/ChoiceListView | allowed:false |  |
| `mappings.attribute.save` | write | member | AttributeMappingService/saveAttributeMapping, AttributeMappingService/saveAttributeValueMapping, AttributeMappingService/copyMappingsFromCategory | notExposed:deferred→later | productDefinitions/ChoiceListView#saveMapping | allowed:false |  |
| `mappings.category.auto_match` | write | member | AttributeMappingService/autoMatchAllCategories | notExposed:deferred→later | productDefinitions/CategoryListView#autoMatch | allowed:false |  |
| `mappings.category.get` | read | member | AttributeMappingService/getCategoryMapping | notExposed:deferred→later | productDefinitions/CategoryListView | allowed:false |  |
| `mappings.category.save` | write | member | AttributeMappingService/saveCategoryMapping | notExposed:deferred→later | productDefinitions/CategoryListView#saveMapping | allowed:false |  |
| `mappings.delete` | destructive | member | AttributeMappingService/deleteFullMapping | notExposed:deferred→later | productDefinitions/CategoryListView#deleteMapping | allowed:false | OPERATION_POLICY.md Belirsiz: eşleme silme; yıkıcı, member bırakıldı. |
| `mappings.list` | read | member | AttributeMappingService/get | notExposed:deferred→later | productDefinitions/CategoryListView | allowed:false |  |
| `pricing.buybox.list` | read | member | PricingService/listBuybox, PricingService/getBuyboxHistory | exposed (catalog) | productDefinitions/ProductListView, definitions/ProductDefinitionView, definitions/ProductUpdateView | allowed:false |  |
| `pricing.cost.list` | read | member | PricingService/listCosts | exposed (catalog) | definitions/ProductDefinitionView, definitions/ProductUpdateView, productDefinitions/ProductListView | allowed:false |  |
| `pricing.cost.set` | write | member | PricingService/setVariantCosts | exposed (catalog) | definitions/ProductDefinitionView#saveCost, definitions/ProductUpdateView#saveCost | allowed:false |  |
| `pricing.margin.preview` | read | member | PricingService/previewMargin | exposed (catalog) | definitions/ProductDefinitionView, definitions/ProductUpdateView | allowed:false |  |
| `pricing.rules.list` | read | member | PricingService/getRules | exposed (catalog) | pricing/PricingRulesView | allowed:false |  |
| `pricing.rules.save` | write | admin | PricingService/saveRule, PricingService/deleteRule | notExposed:deferred→later | pricing/PricingRulesView#saveRule, pricing/PricingRulesView#deleteRule | allowed:false |  |
| `pricing.rules.settings` | write | admin | PricingService/setPricingSettings | notExposed:irreversible | pricing/PricingRulesView#setPricingSettings | allowed:false |  |
| `pricing.suggestions.apply` | write | admin | PricingService/applySuggestions, PricingService/dismissSuggestions | exposed (catalog) | pricing/PricingRulesView#applySuggestions, pricing/PricingRulesView#dismissSuggestions | allowed:false |  |
| `pricing.suggestions.list` | read | member | PricingService/listSuggestions, PricingService/getPriceHistory | exposed (catalog) | pricing/PricingRulesView | allowed:false |  |
| `products.channel_explain.get` | read | member | IntegrationService/explainChannelProduct | notExposed:deferred→later | none (Backend-only (eslesme-fiyat WP1): FE ürün formu kanal sekmesi "Gönderilecek" önizlemesi WP2/WP8 (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `products.channel_preflight.run` | read | member | IntegrationService/preflightExport | notExposed:deferred→later | none (Backend-only (eslesme-fiyat WP1): FE "Hazırlık durumu" paneli WP2/WP8 (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | Kuru çalıştırma: AttributeResolver bellekte çalışır, DB'ye yazılmaz; adaptör validate yan etkisizdir (ağ yok). En çok 200 varyant (truncated bayrağı). |
| `products.create` | write | member | ProductService/saveProduct | notExposed:deferred→later | definitions/ProductDefinitionView#save | allowed:false |  |
| `products.delete` | destructive | member | ProductService/deleteProduct | notExposed:deferred→later | productDefinitions/ProductListView#delete | allowed:false | OPERATION_POLICY.md Belirsiz: yıkıcı silme; member bırakıldı. |
| `products.export` | read | member | ProductService/exportExcel | notExposed:binary_file | productDefinitions/ProductListView#exportExcel | allowed:false | OPERATION_POLICY.md Belirsiz: toplu veri çıkarma; gerekirse admin (tüm-tenant dışa aktarma DEĞİL, o owner: account.tenant.data.export). |
| `products.get` | read | member | ProductService/retrieveProduct | notExposed:deferred→later | definitions/ProductDefinitionView, definitions/ProductUpdateView | allowed:false |  |
| `products.onsale.set` | write | member | ProductService/updateOnsale | notExposed:deferred→later | productDefinitions/ProductListView#onsale | allowed:false |  |
| `products.platform_ready.set` | write | member | IntegrationService/savePlatformUploadIsReadyForProduct | notExposed:deferred→later | productDefinitions/ProductListView#markReady | allowed:false |  |
| `products.search` | read | member | ProductService/getProducts | exposed (core) | productDefinitions/ProductListView | allowed:false |  |
| `products.statistics` | read | member | ProductService/getProductStatistics | notExposed:deferred→later | shell:init | allowed:false |  |
| `products.update` | write | member | ProductService/updateProduct | notExposed:deferred→later | definitions/ProductDefinitionView#save, definitions/ProductUpdateView#save | allowed:false |  |
| `stock.low_list` | read | member | StockService/listLowStock | exposed (core) | none (Backend-only: FE ekranı ADR-0015 sonrası (docs/API_STOCK_FEATURES.md).) | allowed:false | Eşik: istek `threshold` ya da tenant `stockPolicy.lowStockThreshold` (varsayılan yok = kapalı). Tam tarama + maxTimeMS (hesaplanan alan). |
| `stock.movements.list` | read | member | StockService/listMovements | notExposed:deferred→later | none (Backend-only: FE ekranı ADR-0015 sonrası (docs/API_STOCK_FEATURES.md).) | allowed:false | StockMovements (ADR-0021 D14) göçü (0015) çalıştırılmadan indeksler yok; koleksiyon boşken liste boş döner. |
| `stock.overview` | read | member | StockService/getStockOverview | notExposed:deferred→later | none (Backend-only: FE ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `stock.policy.get` | read | admin | IntegrationService/getStockPolicy | notExposed:deferred→later | none (Backend-only: FE ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE; API_TENANT_SURFACE §1).) | allowed:false |  |
| `stock.policy.save` | write | admin | IntegrationService/saveTenantStockPolicy, IntegrationService/saveChannelStockPolicy | notExposed:deferred→later | none (Backend-only: FE ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE; API_TENANT_SURFACE §1).) | allowed:false |  |
| `stock.publish_lag.summary` | read | admin | StockService/getPublishLagSummary | notExposed:deferred→later | none (Backend-only: izleme/backoffice (docs/API_STOCK_FEATURES.md).) | allowed:false | Metrik etiketi tenant taşımaz -> platform kapsamı (admin+). Histogram üst kovası 60 sn: p95 >60 sn ise null+overflow (X12). |
| `variants.add` | write | member | VariantService/addVariant, VariantService/addVariants | notExposed:deferred→later | definitions/ProductDefinitionView#addVariant, definitions/ProductUpdateView#addVariant | allowed:false |  |
| `variants.delete` | destructive | member | VariantService/deleteVariant, VariantService/batchProcessDelete | notExposed:deferred→later | definitions/ProductDefinitionView#deleteVariant, definitions/ProductUpdateView#deleteVariant | allowed:false | OPERATION_POLICY.md Belirsiz: yıkıcı silme (deleteVariant, batchProcessDelete); member bırakıldı. |
| `variants.list` | read | member | VariantService/getVariants, VariantService/getVariantsList | notExposed:deferred→later | definitions/ProductDefinitionView, definitions/ProductUpdateView | allowed:false |  |
| `variants.update` | write | member | VariantService/updateVariants, VariantService/batchProcessUpdate | notExposed:deferred→D | definitions/ProductDefinitionView#updateVariants, definitions/ProductUpdateView#updateVariants | allowed:false |  |

### claims (4)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `claims.approve` | write | member | ClaimService/approveClaim, ClaimService/bulkApproveClaim | notExposed:irreversible | ClaimListView#approve | allowed:false |  |
| `claims.get` | read | member | ClaimService/getClaimById | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `claims.list` | read | member | ClaimService/getClaims | notExposed:deferred→later | ClaimListView | allowed:false |  |
| `claims.reject` | write | member | ClaimService/rejectClaim | notExposed:irreversible | ClaimListView#reject | allowed:false |  |

### customers (4)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `customers.anonymize` | destructive | admin | CustomerService/anonymizeCustomer | notExposed:irreversible | none (Backend-only: müşteri anonimleştirme ekranı Faz 2/3 (ADR-0003 F.23; BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `customers.get` | read | member | CustomerService/getCustomerDetail | notExposed:deferred→later | CustomerListView | allowed:false |  |
| `customers.list` | read | member | CustomerService/getCustomers | notExposed:deferred→later | CustomerListView | allowed:false |  |
| `customers.update` | write | member | CustomerService/updateCustomer | notExposed:deferred→later | CustomerListView#update | allowed:false |  |

### finance (12)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `finance.cargo_invoices.list` | read | member | FinancialService/getCargoInvoices | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | OPERATION_POLICY.md Belirsiz: 5000 satır üst sınırı; finansal veri kademe kararı. |
| `finance.commission.by_barcode` | read | member | FinancialService/getCommissionByBarcodes | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | COM-07 ürün liste/detay net fiyat için; en çok 200 barkod. |
| `finance.commission.drift` | read | member | FinancialService/getCommissionDrift | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | COM-08: COMMISSION_RATE_DRIFT bildiriminin ayrıntısı; makinece okunabilir öğe (status enum, puan cinsinden delta). Eşik: finance.commissionDriftThresholdPoints  |
| `finance.commission.order_summary` | read | member | FinancialService/getOrderCommissionSummary | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | COM-03/COM-07: kaynak = gerçekleşen (hakediş) \| tahmini (kanal tablosu) \| bilinmiyor; override COM-04 (kategori > kanal varsayılan). FE net fiyat gösterimi ba |
| `finance.commission.overrides.delete` | destructive | admin | FinancialService/deleteCommissionOverride | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | COM-04: yalnız override kaydı silinir (geri dönüş: gerçekleşen/tahmini oran). |
| `finance.commission.overrides.list` | read | member | FinancialService/listCommissionOverrides | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | COM-04: entegrasyon ayarları "Komisyon oranları" tablosu (bulut FE); oran bilgisi komisyon okuma RPC leriyle aynı kademede. |
| `finance.commission.overrides.set` | write | admin | FinancialService/setCommissionOverride | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | COM-04: override > gerçekleşen > tahmini önceliğini belirler; X4 denetimi önce/sonra oran. |
| `finance.commission.realized_by_category` | read | member | FinancialService/getRealizedCommissionByCategory | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | COM-03 kabul ölçütü: son 90 gün (en çok 180) kategori başına ortalama gerçekleşen oran. |
| `finance.net_revenue.preview` | read | member | FinancialService/getNetRevenuePreview | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | COM-07: brüt + komisyon (kaynak etiketli) + KDV/hizmet/kargo/stopaj; okuma anında hesaplanır, kalıcı alan yok; bilinmeyen bileşen 0 sayılmaz (confidence). En ço |
| `finance.payouts.detail` | read | member | FinancialService/getPayoutDetails | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | OPERATION_POLICY.md Belirsiz: paymentOrderId yalnızca skaler; finansal veri kademe kararı. |
| `finance.summary` | read | member | FinancialService/getFinancialSummary | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false | OPERATION_POLICY.md Belirsiz (getTransactionData ile ortak kademe kararı). |
| `finance.transactions.list` | read | member | FinancialService/getTransactionData | notExposed:deferred→later | FinancialListView | allowed:false | OPERATION_POLICY.md Belirsiz: finansal veri; operatörden gizlenmesi istenebilir (member bırakıldı). |

### integrations (22)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `integrations.batch.dispatch` | write | member | IntegrationService/batchCreator, IntegrationService/requestFetchFromPlatform | notExposed:deferred→later | productDefinitions/ProductListView | allowed:false |  |
| `integrations.catalog.list` | read | member | IntegrationService/get, IntegrationService/integrationTypes | notExposed:deferred→later | shell:init | allowed:false |  |
| `integrations.catalog.manifest.get` | read | member | IntegrationService/getCatalog | notExposed:deferred→later | none (Backend-only: FE kapsam rozeti ekranı ADR-0018 Aşama A'da (bu görev) yazılmadı; uç hazır, FE bağlanması ayrı görev (ADR-0015 sonrası, bkz. API_TENANT_SURFACE deseni).) | allowed:false |  |
| `integrations.client.list` | read | member | IntegrationService/getClientIntegrations | notExposed:deferred→later | shell:init | allowed:false | OPERATION_POLICY.md Belirsiz: yanıt tüm entegrasyon belgesini projeksiyonsuz döner (C12); maskeleme gerekebilir. |
| `integrations.connection.test` | read | admin | IntegrationService/testConnection | notExposed:deferred→later | none (Backend-only: FE "Bağlantıyı test et" düğmesi bulut önyüz oturumunda eklenecek (docs/API_TENANT_SURFACE.md §Bağlantı testi).) | allowed:false |  |
| `integrations.ecommerce.settings.get` | read | member | IntegrationService/retrieveClientECommerceSettings | notExposed:credential | integrations/ECommerceView | allowed:false |  |
| `integrations.ecommerce.settings.save` | write | admin | IntegrationService/saveClientECommerceSettings | notExposed:credential | integrations/ECommerceView#save | allowed:false |  |
| `integrations.ecommerce.token.exchange` | write | admin | IntegrationService/retrieveAndSetExternalToken | notExposed:credential | integrations/ECommerceView#oauthCallback | allowed:false |  |
| `integrations.erp.settings.get` | read | member | IntegrationService/retrieveClientErpSettings | notExposed:credential | integrations/ErpView | allowed:false | OPERATION_POLICY.md Belirsiz: kimlik bilgisi AÇIK döner (BACKLOG C12). |
| `integrations.erp.settings.save` | write | admin | IntegrationService/saveClientErpSettings | notExposed:credential | integrations/ErpView#save | allowed:false |  |
| `integrations.export.jobs.detail` | read | member | IntegrationService/getExportJobDetail | notExposed:deferred→later | LogListView | allowed:false |  |
| `integrations.export.jobs.list` | read | member | IntegrationService/getExportJobs, IntegrationService/advancedSearchExportJobs | notExposed:deferred→later | LogListView | allowed:false |  |
| `integrations.health.get` | read | admin | IntegrationService/getIntegrationHealth | exposed (core) | none (Backend-only: FE ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE; API_TENANT_SURFACE §3).) | allowed:false |  |
| `integrations.import.jobs.detail` | read | member | IntegrationService/getImportJobByJobId, IntegrationService/getJobReport | notExposed:deferred→later | LogListView | allowed:false |  |
| `integrations.import.jobs.list` | read | member | IntegrationService/getImportJobs, IntegrationService/archiveImportJobs | notExposed:deferred→later | LogListView | allowed:false |  |
| `integrations.marketplace.settings.get` | read | member | IntegrationService/retrieveClientMarketplaceSettings | notExposed:credential | integrations/MarketplaceView | allowed:false | OPERATION_POLICY.md Belirsiz: kimlik bilgisi AÇIK döner (ecommerce'te maskeli, bunda değil; BACKLOG C12). |
| `integrations.marketplace.settings.save` | write | admin | IntegrationService/saveClientMarketplaceSettings | notExposed:credential | integrations/MarketplaceView#save | allowed:false |  |
| `integrations.marketplace.sort` | write | member | IntegrationService/sortClientMarketplaces | notExposed:ui_plumbing | integrations/MarketplaceView | allowed:false | OPERATION_POLICY.md Belirsiz: tenant yapılandırması sayılırsa admin olabilir. |
| `integrations.platform_info.get` | read | member | IntegrationService/retrievePlatformInfos, IntegrationService/retrieveCommisionForCategoryFromIntegration, IntegrationService/retrieveCategoriesFromIntegration, IntegrationService/retrieveBrandsFromIntegration, IntegrationService/retrieveCategoryAttributesFromIntegration, IntegrationService/retrieveCategoryAttributeValuesFromIntegration | notExposed:deferred→later | integrations/MarketplaceView, integrations/ECommerceView, integrations/ShippingView, integrations/ErpView | allowed:false |  |
| `integrations.shipment.settings.get` | read | member | IntegrationService/retrieveClientShipmentSettings | notExposed:credential | integrations/ShippingView | allowed:false | OPERATION_POLICY.md Belirsiz: kimlik bilgisi AÇIK döner (BACKLOG C12). |
| `integrations.shipment.settings.save` | write | admin | IntegrationService/saveClientShipmentSettings | notExposed:credential | integrations/ShippingView#save | allowed:false |  |
| `integrations.webhook_token.generate` | write | admin | IntegrationService/generateWebhookToken | notExposed:credential | none (Backend-only: webhook kurulum ekranı Faz 2/3 (ADR-0005 Karar 8; BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |

### invoices (5)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `invoices.create` | write | member | InvoiceService/createInvoice, InvoiceService/bulkCreateInvoice | notExposed:irreversible | OrderListView#createInvoice | allowed:false |  |
| `invoices.create_manual` | write | member | InvoiceService/createManualInvoice | notExposed:irreversible | InvoiceListView#createManual | allowed:false |  |
| `invoices.delete` | destructive | member | InvoiceService/deleteInvoice | notExposed:irreversible | InvoiceListView#delete | allowed:false | OPERATION_POLICY.md Belirsiz: mali belge silme; günlük operasyon kabul edildi (member), admin gerekebilir. |
| `invoices.list` | read | member | InvoiceService/getInvoices | notExposed:deferred→later | InvoiceListView | allowed:false |  |
| `invoices.reissue` | write | member | InvoiceService/resolveAndReissueInvoice | notExposed:irreversible | OrderListView#reissueInvoice | allowed:false |  |

### messages (4)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `messages.delete` | destructive | member | MessageService/deleteMessage, MessageService/bulkDeleteMessages | notExposed:deferred→later | MessageListView#delete | allowed:false |  |
| `messages.list` | read | member | MessageService/getMessages | notExposed:deferred→later | MessageListView | allowed:false |  |
| `messages.mark_read` | write | member | MessageService/markAsRead | notExposed:deferred→later | MessageListView#markRead | allowed:false |  |
| `messages.reply` | write | member | MessageService/replyMessage | notExposed:irreversible | MessageListView#reply | allowed:false |  |

### orders (5)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `orders.approve` | write | member | OrderService/approveOrder, OrderService/bulkApproveOrder | exposed (orders) | OrderListView#approve | allowed:false |  |
| `orders.cancel` | destructive | member | OrderService/cancelOrder, OrderService/bulkCancelOrder | notExposed:irreversible | OrderListView#cancel | allowed:false |  |
| `orders.list` | read | member | OrderService/getOrders | exposed (core) | OrderListView | allowed:false | Bugünkü servis çıktısı ham müşteri PII içerir; sohbet yolunda `project` ile maskelenir (pii:masked) — UI yolu (jenerik RPC) DEĞİŞMEDİ. |
| `orders.mark_printed` | write | member | OrderService/markAsPrinted | notExposed:ui_plumbing | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE); yalnızca yerel bayrak + platformActions kaydı.) | allowed:false |  |
| `orders.rejection_reasons.list` | read | member | OrderService/getOrderRejectionReasons | notExposed:ui_plumbing | OrderListView#cancel | allowed:false |  |

### platform (105)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `platform.admin.get` | read | platformAdmin | AdminService/get | notExposed:platform_admin | none (FE çağırmıyor (operation-policy.test.ts tek eski istisna: AdminService/get).) | allowed:false |  |
| `platform.admins.disable` | destructive | platformAdmin | BackofficeAdminUserService/disable | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.admins.enable` | write | platformAdmin | BackofficeAdminUserService/enable | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.admins.invite` | write | platformAdmin | BackofficeAdminUserService/invite | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.admins.list` | read | platformAdmin | BackofficeAdminUserService/list | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.admins.reset_mfa` | destructive | platformAdmin | BackofficeAdminUserService/resetMfa | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.agent.confirm` | write | platformAdmin | POST /admin-api/agent/confirm | notExposed:platform_admin | shell:chat | allowed:false |  |
| `platform.agent.info` | read | platformAdmin | GET /admin-api/agent/info | notExposed:platform_admin | shell:chat | allowed:false |  |
| `platform.agent.more` | read | platformAdmin | POST /admin-api/agent/more | notExposed:platform_admin | shell:chat | allowed:false |  |
| `platform.agent.provider.get` | read | platformAdmin | GET /admin-api/agent/provider | notExposed:credential | shell:chat | allowed:false |  |
| `platform.agent.provider.remove` | write | platformAdmin | DELETE /admin-api/agent/provider | notExposed:credential | shell:chat | allowed:false |  |
| `platform.agent.provider.save` | write | platformAdmin | PUT /admin-api/agent/provider | notExposed:credential | shell:chat | allowed:false |  |
| `platform.agent.provider.test` | read | platformAdmin | POST /admin-api/agent/provider/test | notExposed:credential | shell:chat | allowed:false |  |
| `platform.agent.reset` | write | platformAdmin | DELETE /admin-api/agent/conversations/:id | notExposed:platform_admin | shell:chat | allowed:false |  |
| `platform.agent.turn` | propose | platformAdmin | POST /admin-api/agent/turns | notExposed:platform_admin | shell:chat | allowed:false |  |
| `platform.alerts.list` | read | platformAdmin | BackofficeNotificationService/listAlerts | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.alerts.mute` | write | platformAdmin | BackofficeNotificationService/muteAlert | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.announcements.cancel` | destructive | platformAdmin | BackofficeNotificationService/cancelAnnouncement | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.announcements.list` | read | platformAdmin | BackofficeNotificationService/listAnnouncements, BackofficeNotificationService/getAnnouncement, BackofficeNotificationService/previewAnnouncement | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.announcements.save` | write | platformAdmin | BackofficeNotificationService/createAnnouncement, BackofficeNotificationService/updateAnnouncement | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.announcements.schedule` | write | platformAdmin | BackofficeNotificationService/scheduleAnnouncement | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.audit.list` | read | platformAdmin | BackofficeAuditService/list | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.clients.create` | write | platformAdmin | AdminService/createClient | notExposed:platform_admin | adminPanel/AdminClientListView#create | allowed:false |  |
| `platform.clients.delete` | destructive | platformAdmin | AdminService/deleteClient | notExposed:platform_admin | adminPanel/AdminClientListView#delete | allowed:false |  |
| `platform.clients.integrations.list` | read | platformAdmin | AdminService/getClientIntegrations | notExposed:platform_admin | adminPanel/AdminClientListView | allowed:false |  |
| `platform.clients.list` | read | platformAdmin | AdminService/getClients | notExposed:platform_admin | adminPanel/AdminClientListView, adminPanel/AdminTicketListView | allowed:false |  |
| `platform.clients.stats` | read | platformAdmin | AdminService/getClientStats | notExposed:platform_admin | adminPanel/AdminClientListView | allowed:false |  |
| `platform.clients.update` | write | platformAdmin | AdminService/updateClient | notExposed:platform_admin | adminPanel/AdminClientListView#update | allowed:false |  |
| `platform.competition.override.set` | write | platformAdmin | BackofficeBillingService/setCompetitionOverride | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.competition.settings` | read | platformAdmin | BackofficeBillingService/getCompetitionSettings, BackofficeBillingService/getTenantCompetition | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.engine.discard_job` | destructive | platformAdmin | BackofficeEngineService/discardJob | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.engine.failed_jobs` | read | platformAdmin | BackofficeEngineService/listFailedJobs | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.engine.job_runs` | read | platformAdmin | BackofficeEngineService/listJobRuns | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.engine.queues` | read | platformAdmin | BackofficeEngineService/getQueues | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.engine.release_stuck_lease` | write | platformAdmin | BackofficeEngineService/releaseStuckLease | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.engine.retry_job` | write | platformAdmin | BackofficeEngineService/retryJob | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.engine.retry_jobs` | write | platformAdmin | BackofficeEngineService/retryJobs | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.engine.state_machine_jobs` | read | platformAdmin | BackofficeEngineService/getStateMachineJobs | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.exports.detail` | read | platformAdmin | AdminService/getExportDetails | notExposed:platform_admin | adminPanel/AdminSystemManagementView | allowed:false |  |
| `platform.infra.cache_metrics` | read | platformAdmin | BackofficeInfraService/getCacheMetrics | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.infra.flush_cache_family` | write | platformAdmin | BackofficeInfraService/flushCacheFamily | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.infra.mongo_collections` | read | platformAdmin | BackofficeInfraService/getMongoCollections | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.infra.mongo_status` | read | platformAdmin | BackofficeInfraService/getMongoStatus | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.infra.redis_status` | read | platformAdmin | BackofficeInfraService/getRedisStatus | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.infra.slow_queries` | read | platformAdmin | BackofficeInfraService/getSlowQueries | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.integration_compliance.get_detail` | read | platformAdmin | IntegrationComplianceService/getDetail | notExposed:platform_admin | none (Backend-only: ADR-0018 Aşama B admin konsol ekranı ayrı görevde (buluta devredilecek).) | allowed:false |  |
| `platform.integration_compliance.list` | read | platformAdmin | IntegrationComplianceService/list, IntegrationComplianceService/get | notExposed:platform_admin | none (Backend-only: ADR-0018 Aşama B admin konsol ekranı ayrı görevde (buluta devredilecek).) | allowed:false |  |
| `platform.integration_compliance.summary` | read | platformAdmin | IntegrationComplianceService/summary | notExposed:platform_admin | none (Backend-only: ADR-0018 Aşama B admin konsol ekranı ayrı görevde (buluta devredilecek).) | allowed:false |  |
| `platform.integration_compliance.transition` | write | platformAdmin | IntegrationComplianceService/transition | notExposed:platform_admin | none (Backend-only: ADR-0018 Aşama B admin konsol ekranı ayrı görevde (buluta devredilecek).) | allowed:false |  |
| `platform.integration_config.catalog` | read | platformAdmin | IntegrationConfigService/getCatalog | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.integration_config.discard_draft` | write | platformAdmin | IntegrationConfigService/discardDraft | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.integration_config.get` | read | platformAdmin | IntegrationConfigService/get, IntegrationConfigService/getEffectiveConfig | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.integration_config.history` | read | platformAdmin | IntegrationConfigService/history | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.integration_config.preview_publish` | propose | platformAdmin | IntegrationConfigService/previewPublish | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.integration_config.propose_from_finding` | write | platformAdmin | IntegrationConfigService/proposeFromFinding | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.integration_config.publish` | write | platformAdmin | IntegrationConfigService/publish | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.integration_config.rollback` | write | platformAdmin | IntegrationConfigService/rollback | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.integration_config.save_draft` | write | platformAdmin | IntegrationConfigService/saveDraft | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.integration_config.take_over_lock` | write | platformAdmin | IntegrationConfigService/takeOverLock | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.integration_config.test_endpoint` | read | platformAdmin | IntegrationConfigService/testEndpoint | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.integrations.api_health` | read | platformAdmin | BackofficeIntegrationService/getApiHealth | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.integrations.list` | read | platformAdmin | IntegrationConfigService/list | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.integrations.resilience` | read | platformAdmin | BackofficeIntegrationService/getResilienceState | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.integrations.set_intake` | destructive | platformAdmin | IntegrationConfigService/setIntake | notExposed:platform_admin | none (Backend-only: ADR-0020 Aşama C ekranları henüz yok.) | allowed:false |  |
| `platform.logs.issue_groups` | read | platformAdmin | BackofficeLogService/issueGroups | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.logs.issue_set_status` | write | platformAdmin | BackofficeErrorService/setStatus | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.logs.issue_trend` | read | platformAdmin | BackofficeLogService/issueTrend | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.logs.list` | read | platformAdmin | BackofficeLogService/list | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.logs.trace` | read | platformAdmin | BackofficeLogService/trace | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.logs.volume` | read | platformAdmin | BackofficeLogService/volume | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.metrics.global` | read | platformAdmin | AdminService/getGlobalMetrics | notExposed:platform_admin | adminPanel/AdminClientListView | allowed:false |  |
| `platform.notifications.catalog` | read | platformAdmin | BackofficeNotificationService/getCatalog, BackofficeNotificationService/previewTemplate | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.notifications.deliveries.discard` | destructive | platformAdmin | BackofficeNotificationService/discardDelivery | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.notifications.deliveries.read` | read | platformAdmin | BackofficeNotificationService/getDeliveryStats, BackofficeNotificationService/listDeliveries | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.notifications.deliveries.retry` | write | platformAdmin | BackofficeNotificationService/retryDelivery | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.notifications.tenant_history` | read | platformAdmin | BackofficeNotificationService/getTenantHistory | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.notifications.test_email` | write | platformAdmin | BackofficeNotificationService/sendTestEmail | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.overview.attention` | read | platformAdmin | BackofficeOverviewService/getAttention | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.overview.health` | read | platformAdmin | BackofficeOverviewService/getHealth | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.overview.pulse` | read | platformAdmin | BackofficeOverviewService/getPulse | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.prefs.delete_view` | write | platformAdmin | BackofficePrefsService/deleteView | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.prefs.list_views` | read | platformAdmin | BackofficePrefsService/listViews | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.prefs.push_config` | read | platformAdmin | BackofficePrefsService/getPushConfig | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.prefs.push_subscribe` | write | platformAdmin | BackofficePrefsService/subscribePush | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.prefs.push_unsubscribe` | write | platformAdmin | BackofficePrefsService/unsubscribePush | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.prefs.save_view` | write | platformAdmin | BackofficePrefsService/saveView | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.pricing_rules.overview` | read | platformAdmin | BackofficeBillingService/getPricingRulesOverview | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.revenue.metrics` | read | platformAdmin | BackofficeBillingService/getRevenueMetrics | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.store.select` | write | platformAdmin | SecurityService/selectStore | notExposed:platform_admin | shell:session | allowed:false |  |
| `platform.subscriptions.cancel` | destructive | platformAdmin | BackofficeBillingService/cancelSubscription | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.subscriptions.change_plan` | write | platformAdmin | BackofficeBillingService/changePlan | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.subscriptions.extend_trial` | write | platformAdmin | BackofficeBillingService/extendTrial | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.subscriptions.get` | read | platformAdmin | BackofficeBillingService/getSubscription | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.subscriptions.list` | read | platformAdmin | BackofficeBillingService/listSubscriptions | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.system.health` | read | platformAdmin | AdminService/getSystemHealth | notExposed:platform_admin | adminPanel/AdminSystemManagementView | allowed:false |  |
| `platform.tenant.deletion.cancel` | write | platformAdmin | TenantDataService/cancelDeletion | notExposed:platform_admin | none (Backend-only: FE ekranı henüz yok (ADR-0003 F.20; BACKEND_ONLY_NOT_YET_IN_FE).) | allowed:false |  |
| `platform.tenant.deletion.cancel_backoffice` | write | platformAdmin | BackofficeTenantService/cancelDeletion | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.tenant.lifecycle` | read | platformAdmin | BackofficeTenantService/getLifecycle | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.tenants.health_summary` | read | platformAdmin | BackofficeTenantService/getHealthSummary | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.tenants.list` | read | platformAdmin | BackofficeTenantService/listTenants | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.tenants.usage` | read | platformAdmin | BackofficeTenantService/getUsage | notExposed:platform_admin | none (Backoffice SPA (ayrı depo/yüzey): /admin-api üzerinden çağrılır; müşteri arayüzünde ekranı yok.) | allowed:false |  |
| `platform.tickets.create` | write | platformAdmin | AdminService/createTicket | notExposed:platform_admin | adminPanel/AdminTicketListView#create | allowed:false |  |
| `platform.tickets.delete` | destructive | platformAdmin | AdminService/deleteTicket | notExposed:platform_admin | adminPanel/AdminTicketListView#delete | allowed:false |  |
| `platform.tickets.list` | read | platformAdmin | AdminService/getTickets | notExposed:platform_admin | adminPanel/AdminTicketListView | allowed:false |  |
| `platform.tickets.reply` | write | platformAdmin | AdminService/replyToTicket | notExposed:platform_admin | adminPanel/AdminTicketListView#reply | allowed:false |  |

### reports (1)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `reports.sales.summary` | read | member | OrderService/getOrderDashboardInsights | exposed (core) | DashboardView | allowed:false | Bağ ADAY eşlemedir: getOrderDashboardInsights sabit bugün/dün/7 gün penceresi döndürür; ADR-0009 sözleşmesi (from/to, kanal kırılımı) için ileride yeni/genişlet |

### shipments (2)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `shipments.create` | write | member | ShipmentService/createShipment, ShipmentService/bulkCreateShipment | notExposed:irreversible | OrderListView#createShipment | allowed:false |  |
| `shipments.list` | read | member | ShipmentService/getShipments | notExposed:deferred→later | none (Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE); stub — filtre/sıralama yok.) | allowed:false |  |

### support (4)

| id | effect | minTier | RPC bağları | mcp | ui | agent | review |
|---|---|---|---|---|---|---|---|
| `tickets.close` | write | member | TicketService/closeTicket | notExposed:deferred→later | supports/TicketListView#close | allowed:false |  |
| `tickets.list` | read | member | TicketService/getTickets | notExposed:deferred→later | supports/TicketListView | allowed:false |  |
| `tickets.message.send` | write | member | TicketService/sendTicketMessage | notExposed:deferred→later | supports/TicketListView#reply | allowed:false |  |
| `tickets.open` | write | member | TicketService/openTicket | notExposed:deferred→later | supports/TicketListView#open | allowed:false |  |

