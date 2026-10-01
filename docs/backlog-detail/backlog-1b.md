# Backlog önerileri — Görev 1b (SaaS çekirdek)

Format: açıklama · seviye · kaynak dosya:satır

- Servis rotalarında JWT imzası doğrulanmıyor (`jwt.decode`); sahte token ile tenant kimliği (`userContext.order`) ve `isGlobalAdmin` taklit edilebilir · critical · backend/src/api/ApiManager.ts:67-72,81-86; backend/src/Webserver.ts:60-70; backend/src/api/RunOperation.ts:25
- Token yokken istek servise ulaşıyor (mock güvenlik); ApplicationDB tabanlı servisler (AdminService dahil) kimlik doğrulamasız çağrılabiliyor görünüyor (canlı doğrulama gerekli) · critical · backend/src/api/RunOperation.ts:19-28; backend/src/Webserver.ts:62-63
- AdminService'te (createClient/updateClient/deleteClient/deleteTicket/getSystemHealth…) rol/isGlobalAdmin kontrolü yok; `updateClient` istemci verisini filtresiz `$set` ediyor · critical · backend/src/api/services/admin-service.ts:642-767
- JWT imza sırrı kaynak koda gömülü (env'den okunmuyor), git geçmişinde; rotasyon + env'e taşıma gerekli · critical · backend/src/api/Security.ts:15
- Tenant oluşturma akışında sabit Atlas dbConfig kimlik bilgisi (iki kopya) · critical · backend/src/api/services/security-service.ts:42-47; backend/src/api/services/admin-service.ts:667-673
- Tenant oluşturmada sabit Cloudflare R2 anahtarları (tüm tenantlar aynı kimlik bilgisi/bucket) kaynak kodda · critical · backend/src/api/services/security-service.ts:54-73
- Ödeme sağlayıcısı, plan/abonelik/faturalama modeli hiç yok (BE+FE); ticari çekirdek eksik · critical · (modül yok; frontend/src/router/index.ts:406 yalnızca boş menü rotası)
- Login/register yanıt gövdesi bcrypt parola hash'ini döndürüyor; UserService.getUsers de hash döndürüyor · critical · backend/src/api/ApiManager.ts:22-31; backend/src/api/services/security-service.ts:139; backend/src/api/services/user-service.ts:33-48
- Sunucu tarafı RBAC yok: GlobalRoles.permissions hiçbir serviste uygulanmıyor; createUser/updateUser `roleCode`'u istemciden alıyor (yetki yükseltme) · critical · backend/src/api/services/user-service.ts:83-145; backend/src/database/application/models/GlobalRole.ts:7
- Register: e-posta tekrar/doğrulama yok, central Users.email unique değil, atomik olmayan `max(order)+1` (yarış), hata halinde geri alma yok, mass assignment (`registerValues` spread), rate limit/captcha yok · critical · backend/src/api/services/security-service.ts:39-111; backend/src/database/application/models/User.ts:4
- Captcha sahte (üretilip saklanmıyor/doğrulanmıyor) · planned · backend/src/api/services/security-service.ts:10-16,166-172
- Parola sıfırlama (unutulan parola) ve parola değiştirme BE uçları yok; FE ForgottenPassword yalnızca iskelet · planned · frontend/src/components/login/ForgottenPasswordComponent.vue; backend/src/api/services/user-service.ts:114-145
- Refresh token yok, logout sunucuda no-op (token iptal listesi yok) · planned · backend/src/api/Security.ts:70-90; backend/src/api/services/security-service.ts:245-251
- API rate limit + helmet + giriş şeması doğrulaması yok; `trust proxy` yok · planned · backend/src/Webserver.ts:77-105
- ApiWrapper operasyon beyaz listesi yok (URL'deki `operation` herhangi bir metodu çağırır); hata yanıtı `request: req.body` geri yansıtıyor · planned · backend/src/api/ApiWrapper.ts:8-16; backend/src/api/ApiManager.ts:18,33,77
- Kullanıcı/yönetici audit log yok (giriş, rol değişimi, tenant silme, impersonation `selectStore`) · planned · (modül yok; backend/src/api/services/admin-service.ts:753-767)
- Tenant limit/kota (ürün, kullanıcı, entegrasyon, API çağrısı) ve plan bağlı özellik kapıları yok; StatisticsTracker yalnızca ölçüyor · planned · backend/src/services/statistics/StatisticsTracker.ts
- MailService hiçbir yerden çağrılmıyor (hoş geldin, sıfırlama, doğrulama e-postası akışları yok) · planned · backend/src/services/mail/MailService.ts:55; backend/src/api/services/security-service.ts:19
- Tenant silme/KVKK silme+dışa aktarma: deleteClient tenant DB ve R2 verisini silmiyor; kullanıcı verisi dışa aktarma yok · planned · backend/src/api/services/admin-service.ts:753-767
- Kayıtta yasal onay kaydı (zaman damgası/sürüm) ve çerez onayı yok; LicenceView/PrivacyView yer tutucu · planned · frontend/src/components/login/RegisterComponent.vue:34-37; frontend/src/views/unsecure/LicenceView.vue
- Tenant provisioning iki kopya kodda (register + createClient) → tek servise birleştirme (mimari karar: architect) · planned · backend/src/api/services/security-service.ts:18-145; backend/src/api/services/admin-service.ts:642-733
- `selectStore` imzalı token'ı yanıt gövdesinde döndürüyor, cookie set edilmiyor görünüyor (doğrulanamadı) · planned · backend/src/api/services/security-service.ts:218-243; frontend/src/composables/user.ts:41-48
- adminPanel FE rotasında rol koruması yok, redirect hedefi geçersiz (`/adminPanel/clientList`) · planned · frontend/src/router/index.ts:306-347,124-145
- Admin arama `$regex` kullanıcı girdisi kaçışsız (ReDoS/regex enjeksiyonu) · planned · backend/src/api/services/admin-service.ts:28-33
- SubscriptionView.vue geliştirici roadmap tablosu (6662 satır), gerçek abonelik ekranı değil; yanlış yerleştirilmiş/üretim dışı içerik · nice-to-have · frontend/src/views/secure/user/SubscriptionView.vue
- API versiyonlama (`/api/v1`) ve OpenAPI şeması yok · nice-to-have · backend/src/api/ApiManager.ts:67-93
- Ölü/artık kod: RegisterService.hebeleService, `marketplace-service.ts1`, yorumlu ECommerceService/MarketplaceService kayıtları · nice-to-have · backend/src/api/services/register-service.ts:9; backend/src/api/index.ts:4,21
- Ticket numarası `Math.random` (çakışma olası) · nice-to-have · backend/src/api/services/admin-service.ts:209
