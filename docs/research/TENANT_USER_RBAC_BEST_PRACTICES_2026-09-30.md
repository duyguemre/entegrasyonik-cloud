# Çok Kiracılı B2B SaaS: Kullanıcı Yönetimi ve Yetkilendirme Best Practice (2026-09-30)

Not: Bu dosya sınırlı web araştırması (erişim tarihi 2026-09-30) + yerleşik sektör bilgisi ile hazırlandı. Her bölümde "[K]" = URL ile doğrulandı, "[D-yok]" = doğrulanmadı / genel sektör bilgisi, uygulamadan önce kaynakla teyit edilmeli.

## Kaynaklar (erişim 2026-09-30)
- OWASP API Security Top 10 2023 (BOLA=API1, BFLA=API5, BOPLA=API3; eski mass assignment+excessive data exposure birleşti): https://owasp.org/API-Security/editions/2023/en/0x11-t10/ (özet arama sonuçları: https://www.wiz.io/academy/api-security/owasp-api-security)
- OpenFGA RBAC vs ReBAC: https://openfga.dev/docs/learn/rbac-vs-rebac ; ReBAC: https://openfga.dev/docs/learn/rebac
- Shopify staff permissions: https://help.shopify.com/manual/your-account/staff-accounts/staff-permissions/staff-permissions-description
- GitHub org roles / custom org roles (custom org roles yalnız Enterprise Cloud): https://docs.github.com/en/organizations/managing-peoples-access-to-your-organization-with-roles/roles-in-an-organization
- Impersonation: https://workos.com/blog/support-impersonation-delegated-sessions ; https://www.ory.com/blog/identity-level-impersonation ; https://appmaster.io/blog/secure-admin-impersonation-controls-audit-scope
- Stripe team roles: arama sonucu getirmedi, [D-yok]; Stripe Dashboard "Team and security" dokümanına bakılmalı.

## 1) Yetki modelleri
- RBAC: basit, denetlenebilir; çok kiracıda rol "tenant kapsamlı" olmalı (rol atama = Membership üzerinde, tenant başına). [K] OpenFGA: rol patlaması sorunu tenant/kaynak başına rol çoğaltmayla çıkar.
- ABAC: koşul/öznitelik (ör. tutar limiti, IP, çalışma saati). Az sayıda koşulla RBAC'ı zenginleştirmek için.
- ReBAC (Zanzibar/OpenFGA/SpiceDB): kaynak hiyerarşisi ve paylaşım için (kullanıcı -> mağaza/depo -> ürün). [K] ReBAC RBAC'ın üst kümesi, ABAC'ı koşullarla kapsar.
- Öneri: bugün için hibrit RBAC + kaynak kapsamı (scope) tablosu; harici ReBAC motoru (OpenFGA) gereksiz karmaşıklık, kaynak-bazlı paylaşım ihtiyacı büyürse sonra. Karar arayüzünü (`can(user, perm, resource)`) soyut tut ki motor sonradan değişebilsin.
- Sistem rolleri sabit ve kodda (Owner/Admin/Member/Viewer); özel roller = tenant'ın izin setlerinden oluşturduğu adlandırılmış kümeler (genelde üst plana bağlı, GitHub'da custom org roles Enterprise'a özel [K]).
- İzin adlandırma: `kaynak:eylem` (orders:read, orders:approve, stock:adjust). Varsayılan reddet; en az yetki; izin kataloğu kodda tek kaynak, DB'de yalnız rol->izin eşlemesi.
- Kaynak kapsamı: Membership/rol atamasına `scope: {all | integrationIds[] | storeIds[] | warehouseIds[]}`.

## 2) Yaşam döngüsü
- Model: User (global kimlik) <-> Membership(tenantId, roles[], scope, status) <-> Tenant. Bir kullanıcı çok tenant'a üye olabilir; oturumda "aktif tenant" seçilir; yetki daima aktif Membership'ten okunur.
- Davet: tek kullanımlık, rastgele yüksek entropili token (DB'de yalnız hash), süreli (ör. 7 gün), e-postaya bağlı, kabulde e-posta doğrulanmış sayılır; iptal/yeniden gönderim; rol yükseltme davetinde davet edenin yetkisini aşamaz (privilege ceiling).
- Durumlar: invited -> active -> suspended -> removed. Askıya alma oturum/token'ları hemen düşürür.
- Silme: Membership kaldırılır (tenant bağı), User silme ayrı; kişisel veri KVKK/GDPR gereği silme veya anonimleştirme, ancak audit/fatura kayıtları hukuki saklama için aktör kimliği takma ad (pseudonym) ile korunur [D-yok: saklama süreleri hukuk danışmanıyla teyit].
- Sahiplik: en az bir aktif Owner zorunlu; son Owner silinemez/düşürülemez/askıya alınamaz; devir iki adımlı (kabul + parola/MFA yeniden doğrulama).
- E-posta değişikliği: yeni adrese doğrulama, eskiye bildirim, step-up, tüm oturumlar düşer.

## 3) Oturum/kimlik
- MFA: TOTP zorunlu seçenek; WebAuthn/passkey tercih; Owner/Admin için zorunlu kılma politikası (tenant ayarı); yedek kodlar.
- SSO (SAML/OIDC) + SCIM: kurumsal plan özelliği (entitlement); JIT provizyon + SCIM deprovision -> Membership askıya al.
- Oturum listesi + uzaktan sonlandırma; oturum kaydında cihaz/IP/son kullanım.
- Token versiyonu: Membership/User'da `authVersion`; rol/kapsam/durum değişince artır, JWT içindeki sürüm eşleşmezse reddet (kısa ömürlü access + yenileme).
- Step-up: parola/e-posta değişimi, MFA sıfırlama, API anahtarı oluşturma, sahiplik devri, abonelik/fatura, toplu silme, kullanıcı rolü verme.

## 4) Impersonation (destek)
[K] WorkOS/Ory/AppMaster ortak öneriler:
- Yalnız özel `support` platform rolü; her oturum için zorunlu gerekçe (ticket no) ve kısa süre (10-20 dk, yenilemede gerekçe tekrarı).
- İki kimlik oturumda birlikte taşınır: `sub`=müşteri kullanıcısı, `act`=destek personeli (RFC 8693 actor claim mantığı [D-yok: RFC bu aramada doğrulanmadı]).
- Başlangıç/bitiş ve her işlem audit'te "kim adına kim"; ekranda belirgin banner.
- Varsayılan yasaklar: parola/e-posta/MFA değişimi, faturalama, silme, dışa aktarım, API anahtarı, kullanıcı/rol yönetimi. Salt-okuma varsayılan, yazma ayrıca yetki.
- Müşteri tarafı: tenant ayarı ile "destek erişimine önceden onay" veya en azından e-posta/uygulama içi bildirim; müşteri audit görünümünde destek erişimleri görünür.
- Platform admin kimliği ayrı backoffice IdP'sinde, MFA zorunlu.

## 5) Denetim (audit)
- Olaylar: giriş/çıkış/başarısız giriş, MFA değişimi, davet/kabul/rol değişimi/askıya alma/silme, sahiplik devri, entegrasyon kimlik bilgisi değişimi, API anahtarı, faturalama, toplu işlemler, veri dışa aktarımı, impersonation, yetki reddi (403) örüntüleri.
- Alanlar: zaman (UTC), tenantId, actorId, actorType, onBehalfOf, eylem, hedef kaynak, önce/sonra (sırlar maskeli), IP, user agent, requestId, sonuç.
- Değiştirilemezlik: append-only koleksiyon, uygulama hesabında update/delete yok, hash zinciri veya WORM arşiv.
- Saklama: bölgesel/hukuki gereksinime göre (ör. 1-2 yıl sıcak; güvenlik olayları daha uzun) [D-yok: kesin süre hukuk teyidi].
- Müşteriye: Owner/Admin için tenant kapsamlı audit görünümü + dışa aktarma; platform içi olaylar (impersonation) dahil.

## 6) API tarafı
- Yetki tek merkezde: route başına deklaratif `requirePermission('orders:approve')` guard + servis katmanında kaynak kontrolü; handler'larda dağınık `if role` yok.
- BOLA (API1): her nesne erişiminde tenantId (+ scope) filtresi repository katmanında zorunlu; tenant filtresiz sorgu üretilemeyecek şekilde tasarla.
- BFLA (API5): yönetsel uç noktalar ayrı prefix/guard; HTTP metodu bazında izin.
- BOPLA (API3, mass assignment birleşti [K]): DTO allow-list; `role`, `tenantId`, `isOwner` gibi alanlar istemciden alınmaz; yanıtlarda alan bazlı filtre (sırlar zaten 'sensitive').
- Önbellek: izin çözümlemesi kısa TTL + `authVersion` ile geçersizleme; rol değişince açıkça invalidate.
- FE'ye `capabilities` (izin listesi + kapsam + entitlement) dön; UI gizleme yalnız kolaylık, sunucu her zaman zorlar. Testler: her route için yetkisiz rol matrisi, cross-tenant erişim testi.

## 7) Rakip/benzer (kısa)
| Ürün | Özellik | Kaynak |
|---|---|---|
| Shopify | Granüler staff izinleri (Orders, Products, Customers, Analytics, Users, Settings, Finance vb.), izin bazlı seçim | [K] Shopify yardım linki |
| GitHub | Org rolleri (owner/member vb.), custom repo rolleri, custom org rolleri Enterprise'a özel | [K] |
| Stripe | Sabit takım rolleri (Admin, Developer, Analyst, Support vb.) | [D-yok] |
| Türk entegratörler (ör. Entegra, Ticimax, Akinsoft, Dopigo) ve global çok kanallı (Linnworks, Brightpearl, ChannelAdvisor) | Genelde kullanıcı başına modül/menü izinleri, bazılarında depo/mağaza kısıtı | [D-yok: doğrulanmadı; ürün dokümanlarıyla karşılaştırma ayrıca yapılmalı] |

## 8) Hedef model önerisi
Roller: Owner (faturalama+kullanıcı+her şey, en az 1), Admin (Owner hariç tüm operasyon+kullanıcı yönetimi, faturalama yok), Manager/Operasyon (katalog, stok, sipariş, iade, mesaj), Finans (fatura/finans/raporlar), Support-Agent (mesaj/iade, salt katalog), Viewer (salt-okuma), Özel roller. Platform: platformAdmin ayrı katman (tenant Membership'i değil); `platformSupport` (impersonation), `platformBilling`, `platformReadonly`.

İzin kataloğu (öneri):
- catalog: products:read/write/delete/publish, categories:write, mappings:write
- stock: stock:read, stock:adjust, stock:sync
- orders: orders:read, orders:approve, orders:cancel, orders:ship
- returns: returns:read, returns:process
- messages: messages:read, messages:reply
- finance: invoices:read/issue, finance:read, payouts:read
- integrations: integrations:read, integrations:configure (kimlik bilgisi), integrations:credentials:rotate
- users: users:read, users:invite, users:roles:assign, users:suspend, users:remove
- billing: billing:read, billing:manage, subscription:change
- reports: reports:read, reports:export
- api: apikeys:read, apikeys:create, apikeys:revoke
- audit: audit:read

Entitlement != permission: entitlement = tenant planının ne kullanabileceği (ör. maksimum kullanıcı, özel roller, SSO, entegrasyon sayısı); permission = kullanıcının tenant içinde ne yapabileceği. Etkili yetki = permission AND entitlement AND scope. Entitlement reddi 402/403 + `upgrade_required` kodu ile ayrı ele alınır, capabilities'te ayrı alanlar olarak iletilir.

## Önerilen 10 madde
Bkz. handback mesajı.
