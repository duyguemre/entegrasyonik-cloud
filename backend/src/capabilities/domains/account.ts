// Hesap, kullanıcı/rol, ayar, menü, bildirim, arama, denetim ve tenant KVKK yetenekleri.
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens, onShell, noUi } from '../define';

const SETTINGS = 'SettingListView';
const USERS = 'user/AuthorizationListView';
const PLUMBING = (what: string) => nx('ui_plumbing', `${what}: kullanıcının işi değil, uygulama kabuğunun iç işi (menü/oturum/başlangıç); sohbet kanalına açılmaz.`);

export const ACCOUNT_CAPABILITIES = [
    // --- Kendi hesabı / tenant yaşam döngüsü (ADR-0003, API_ACCOUNT_LIFECYCLE) ---
    c({
        id: 'account.password.change', domain: 'account', summary: { tr: 'Kendi parolamı değiştir', en: 'Change my own password' },
        effect: 'write', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'AccountService/changePassword' }],
        ui: noUi('Backend-only: Hesabım/Güvenlik ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('credential', 'Parola/kimlik bilgisi işlemi; LLM kanalından geçemez (MCP form elicitation\'da sır yasak).'), agent: NO_AGENT,
    }),
    c({
        id: 'account.email_verification.resend', domain: 'account', summary: { tr: 'E-posta doğrulama bağlantısını yeniden gönder', en: 'Resend my email verification link' },
        effect: 'write', minTier: 'member', permission: 'self:manage', scope: 'user', external: true, bindings: [{ rpc: 'AccountService/resendVerificationEmail' }],
        ui: noUi('Backend-only: Hesabım/Güvenlik ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('credential', 'Hesap doğrulama akışı (e-posta ile token gönderir); dışarı veri gönderen yetenek MCP\'ye açılmaz (ADR-0019 §5.6).'), agent: NO_AGENT,
    }),
    c({
        id: 'account.tenant.deletion.request', domain: 'account', summary: { tr: 'Mağaza (tenant) silme talebi (30 gün askı)', en: 'Request tenant deletion (30-day grace period)' },
        effect: 'destructive', minTier: 'owner', permission: 'tenant:delete', undo: { kind: 'softDelete', days: 30 }, bindings: [{ rpc: 'TenantDataService/requestDeletion' }],
        ui: noUi('Backend-only: tenant silme ekranı Faz 2/3 (ADR-0003 F.20; BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('irreversible', 'Tenant silme (30 gün sonra kalıcı purge); hukuki/geri alınamaz, yalnız ekranda ve yeniden kimlik doğrulamayla.'), agent: NO_AGENT,
        review: 'Geri alma yalnızca platformAdmin (platform.tenant.deletion.cancel); tenant kullanıcısı kendi talebini geri alamaz.',
    }),
    c({
        id: 'account.tenant.data.export', domain: 'account', summary: { tr: 'Tüm tenant verisini dışa aktar (KVKK taşınabilirlik)', en: 'Export all tenant data (GDPR/KVKK portability)' },
        effect: 'write', minTier: 'owner', permission: 'tenant:export', pii: 'raw', rateCost: 10, bindings: [{ rpc: 'TenantDataService/exportTenantData' }],
        ui: noUi('Backend-only: dışa aktarma ekranı Faz 2/3 (ADR-0003 F.22; BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('binary_file', 'NDJSON+zip artefaktı üretir ve imzalı indirme belirteci döndürür; tüm PII içerir, dosya kanalı LLM dışıdır.'), agent: NO_AGENT,
    }),

    // --- Kullanıcı / rol ---
    c({
        id: 'users.list', domain: 'account', summary: { tr: 'Kullanıcıları listele', en: 'List users' },
        effect: 'read', minTier: 'admin', permission: 'users:read', pii: 'raw', bindings: [{ rpc: 'UserService/getUsers' }],
        ui: onScreens(USERS), mcp: deferred('later', 'Kullanıcı/rol yönetimi; ayrıcalık yükseltme riski (bilinen boşluk: createUser hedef-rol kontrolü yok) çözülmeden açılmaz.'), agent: NO_AGENT,
    }),
    c({
        id: 'users.create', domain: 'account', summary: { tr: 'Kullanıcı oluştur', en: 'Create a user' },
        effect: 'write', minTier: 'admin', permission: 'users:manage', pii: 'raw', bindings: [{ rpc: 'UserService/createUser' }],
        ui: onScreens([USERS, 'create']), mcp: deferred('later', 'Kullanıcı/rol yönetimi; ayrıcalık yükseltme riski (bilinen boşluk: createUser hedef-rol kontrolü yok) çözülmeden açılmaz.'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md "Bilinen boşluklar": admin, gövdedeki roleCode ile ROLE_OWNER atayabilir (kademe var, hedef-rol kontrolü yok).',
    }),
    c({
        id: 'users.update', domain: 'account', summary: { tr: 'Kullanıcıyı güncelle', en: 'Update a user' },
        effect: 'write', minTier: 'admin', permission: 'users:manage', pii: 'raw', bindings: [{ rpc: 'UserService/updateUser' }],
        ui: onScreens([USERS, 'update']), mcp: deferred('later', 'Kullanıcı/rol yönetimi; ayrıcalık yükseltme riski (bilinen boşluk: updateUser hedef-rol kontrolü yok) çözülmeden açılmaz.'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md "Bilinen boşluklar": admin, gövdedeki roleCode ile ROLE_OWNER atayabilir (kademe var, hedef-rol kontrolü yok).',
    }),
    c({
        id: 'users.delete', domain: 'account', summary: { tr: 'Kullanıcıyı sil', en: 'Delete a user' },
        effect: 'destructive', minTier: 'admin', permission: 'users:manage', bindings: [{ rpc: 'UserService/deleteUser' }],
        ui: onScreens([USERS, 'delete']), mcp: deferred('later', 'Kullanıcı yönetimi yıkıcı işlem; geri alma yok, yalnız ekranda (confirm:typed uygunluğu için undo gerekir).'), agent: NO_AGENT,
    }),
    c({
        id: 'users.invite', domain: 'account', summary: { tr: 'Kullanıcı davet et (e-posta ile)', en: 'Invite a user by email' },
        effect: 'write', minTier: 'admin', permission: 'users:manage', pii: 'raw', external: true, bindings: [{ rpc: 'UserService/inviteUser' }],
        ui: noUi('Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: deferred('later', 'Kullanıcı yönetimi (davet/askı/devir): ayrıcalık ve hesap devralma riski; yalnız ekranda, MCP açılımı ayrı güvenlik incelemesi.'), agent: NO_AGENT,
    }),
    c({
        id: 'users.invitation.resend', domain: 'account', summary: { tr: 'Daveti yeniden gönder', en: 'Resend an invitation' },
        effect: 'write', minTier: 'admin', permission: 'users:manage', external: true, bindings: [{ rpc: 'UserService/resendInvitation' }],
        ui: noUi('Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: deferred('later', 'Kullanıcı yönetimi (davet/askı/devir): ayrıcalık ve hesap devralma riski; yalnız ekranda, MCP açılımı ayrı güvenlik incelemesi.'), agent: NO_AGENT,
    }),
    c({
        id: 'users.invitation.revoke', domain: 'account', summary: { tr: 'Daveti iptal et', en: 'Revoke an invitation' },
        effect: 'write', minTier: 'admin', permission: 'users:manage', bindings: [{ rpc: 'UserService/revokeInvitation' }],
        ui: noUi('Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: deferred('later', 'Kullanıcı yönetimi (davet/askı/devir): ayrıcalık ve hesap devralma riski; yalnız ekranda, MCP açılımı ayrı güvenlik incelemesi.'), agent: NO_AGENT,
    }),
    c({
        id: 'users.invitation.list', domain: 'account', summary: { tr: 'Davetleri listele', en: 'List invitations' },
        effect: 'read', minTier: 'admin', permission: 'users:read', pii: 'raw', bindings: [{ rpc: 'UserService/listInvitations' }],
        ui: noUi('Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: deferred('later', 'Kullanıcı yönetimi (davet/askı/devir): ayrıcalık ve hesap devralma riski; yalnız ekranda, MCP açılımı ayrı güvenlik incelemesi.'), agent: NO_AGENT,
    }),
    c({
        id: 'users.suspend', domain: 'account', summary: { tr: 'Kullanıcıyı askıya al (oturumlar düşer)', en: 'Suspend a user (sessions end)' },
        effect: 'write', minTier: 'admin', permission: 'users:manage', bindings: [{ rpc: 'UserService/suspendUser' }],
        ui: noUi('Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: deferred('later', 'Kullanıcı yönetimi (davet/askı/devir): ayrıcalık ve hesap devralma riski; yalnız ekranda, MCP açılımı ayrı güvenlik incelemesi.'), agent: NO_AGENT,
    }),
    c({
        id: 'users.reactivate', domain: 'account', summary: { tr: 'Kullanıcıyı yeniden etkinleştir', en: 'Reactivate a user' },
        effect: 'write', minTier: 'admin', permission: 'users:manage', bindings: [{ rpc: 'UserService/reactivateUser' }],
        ui: noUi('Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: deferred('later', 'Kullanıcı yönetimi (davet/askı/devir): ayrıcalık ve hesap devralma riski; yalnız ekranda, MCP açılımı ayrı güvenlik incelemesi.'), agent: NO_AGENT,
    }),
    c({
        id: 'users.ownership.transfer.initiate', domain: 'account', summary: { tr: 'Sahiplik devrini başlat (step-up gerekir)', en: 'Start ownership transfer (step-up required)' },
        effect: 'write', minTier: 'owner', permission: 'tenant:transfer', external: true, bindings: [{ rpc: 'UserService/initiateOwnershipTransfer' }],
        ui: noUi('Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: nx('irreversible', 'Sahiplik devri: hukuki/geri alınamaz nitelikte; yalnız ekranda ve yeniden kimlik doğrulamayla.'), agent: NO_AGENT,
    }),
    c({
        id: 'users.ownership.transfer.cancel', domain: 'account', summary: { tr: 'Bekleyen sahiplik devrini iptal et', en: 'Cancel pending ownership transfer' },
        effect: 'write', minTier: 'owner', permission: 'tenant:transfer', bindings: [{ rpc: 'UserService/cancelOwnershipTransfer' }],
        ui: noUi('Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: nx('irreversible', 'Sahiplik devri: hukuki/geri alınamaz nitelikte; yalnız ekranda ve yeniden kimlik doğrulamayla.'), agent: NO_AGENT,
    }),
    c({
        id: 'users.ownership.transfer.accept', domain: 'account', summary: { tr: 'Sahiplik devrini kabul et', en: 'Accept ownership transfer' },
        effect: 'write', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'UserService/acceptOwnershipTransfer' }],
        ui: noUi('Backend-only: davet/askıya alma/devir ekranları (AuthorizationListView davet akışı, ADR-0028 F-A4) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: nx('irreversible', 'Sahiplik devri: hukuki/geri alınamaz nitelikte; yalnız ekranda ve yeniden kimlik doğrulamayla.'), agent: NO_AGENT,
    }),
    c({
        id: 'account.reauthenticate', domain: 'account', summary: { tr: 'Parolamı yeniden doğrula (adım yükseltme, 5 dk)', en: 'Re-verify my password (step-up, 5 min)' },
        effect: 'write', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'AccountService/reauthenticate' }],
        ui: noUi('Backend-only: yeniden doğrulama diyaloğu (ADR-0028 Karar 8) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('credential', 'Parola doğrulama; LLM kanalından geçemez.'), agent: NO_AGENT,
    }),
    c({
        id: 'roles.list', domain: 'account', summary: { tr: 'Rol listesini getir', en: 'List roles' },
        effect: 'read', minTier: 'member', permission: 'app:use', bindings: [{ rpc: 'UserService/getRoles' }],
        ui: onShell('init'), mcp: PLUMBING('Rol listesi (initApp/kullanıcı formu verisi)'), agent: NO_AGENT,
    }),
    c({
        id: 'resources.list', domain: 'account', summary: { tr: 'Kaynak/menü görünürlüğünü getir', en: 'Get resource/menu visibility' },
        effect: 'read', minTier: 'member', permission: 'app:use', bindings: [{ rpc: 'UserService/getResources' }],
        ui: onShell('init'), mcp: PLUMBING('Menü/kaynak görünürlüğü (initApp)'), agent: NO_AGENT,
    }),

    // --- Ayarlar / yapılandırma ---
    c({
        id: 'settings.get', domain: 'account', summary: { tr: 'Mağaza ayarlarını getir', en: 'Get store settings' },
        effect: 'read', minTier: 'member', permission: 'settings:read', bindings: [{ rpc: 'SettingService/getSettings' }],
        ui: { screens: [{ screen: SETTINGS }, { screen: 'shell:init' }] }, mcp: deferred('later', 'Mağaza adı/logo vb. genel ayarlar; değeri düşük, toolset genişlemesinde (account) değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'settings.update', domain: 'account', summary: { tr: 'Mağaza ayarlarını güncelle', en: 'Update store settings' },
        effect: 'write', minTier: 'admin', permission: 'settings:manage', bindings: [{ rpc: 'SettingService/updateSettings' }],
        ui: onScreens([SETTINGS, 'save']), mcp: deferred('later', 'Tenant ayarı yazma; onay akışı (Aşama D) ve alan bazlı şema gerekir.'), agent: NO_AGENT,
    }),
    c({
        id: 'settings.logo.upload', domain: 'account', summary: { tr: 'Mağaza logosu/kimliği yükle', en: 'Upload store logo/identity' },
        effect: 'write', minTier: 'admin', permission: 'settings:manage', bindings: [{ rpc: 'ImageApi/uploadIdentity' }],
        ui: onScreens([SETTINGS, 'uploadLogo']), mcp: nx('binary_file', 'İkili dosya yükleme (multipart); yerel araç + mevcut yükleme API\'si üzerinden (ADR-0009 §6), MCP JSON kanalı değil.'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz (düşük): admin mı member mi; kiracı logosu ayar niteliğinde olduğu için admin bırakıldı.',
    }),
    c({
        id: 'config.get', domain: 'account', summary: { tr: 'Uygulama yapılandırmasını getir (menü/katalog özeti)', en: 'Get application configuration' },
        effect: 'read', minTier: 'member', permission: 'app:use', bindings: [{ rpc: 'ConfigurationService/get' }],
        ui: onShell('init'), mcp: PLUMBING('Uygulama yapılandırma okuması (initApp)'), agent: NO_AGENT,
    }),

    // --- Menü / favoriler ---
    c({
        id: 'menu.get', domain: 'account', summary: { tr: 'Menüyü getir', en: 'Get the menu' },
        effect: 'read', minTier: 'member', permission: 'app:use', bindings: [{ rpc: 'MenuService/get' }],
        ui: onShell('menu'), mcp: PLUMBING('Menü ağacı'), agent: NO_AGENT,
    }),
    c({
        id: 'menu.favorites.list', domain: 'account', summary: { tr: 'Favori menü öğelerini listele', en: 'List favorite menu items' },
        effect: 'read', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'MenuService/retrieveFavorites' }],
        ui: onShell('menu'), mcp: PLUMBING('Kişisel favoriler'), agent: NO_AGENT,
    }),
    c({
        id: 'menu.favorites.add', domain: 'account', summary: { tr: 'Menü öğesini favorilere ekle', en: 'Add a menu item to favorites' },
        effect: 'write', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'MenuService/addFavorite' }],
        ui: onShell('menu'), mcp: PLUMBING('Kişisel favoriler'), agent: NO_AGENT,
    }),
    c({
        id: 'menu.favorites.remove', domain: 'account', summary: { tr: 'Menü öğesini favorilerden çıkar', en: 'Remove a menu item from favorites' },
        effect: 'destructive', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'MenuService/deleteFavorite' }],
        ui: onShell('menu'), mcp: PLUMBING('Kişisel favoriler'), agent: NO_AGENT,
    }),
    c({
        id: 'menu.favorites.sort', domain: 'account', summary: { tr: 'Favori menü sırasını değiştir', en: 'Reorder favorite menu items' },
        effect: 'write', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'MenuService/sortFavorites' }],
        ui: onShell('menu'), mcp: PLUMBING('Kişisel favori sıralaması'), agent: NO_AGENT,
    }),

    // --- Bildirimler ---
    c({
        id: 'notifications.list', domain: 'account', summary: { tr: 'Bildirimlerimi listele', en: 'List my notifications' },
        effect: 'read', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'NotificationService/get' }],
        ui: onShell('notifications'), mcp: deferred('later', 'Kullanıcının kendi bildirimleri; sohbette "bildirimlerim" için aday, toolset genişlemesinde değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.mark_read', domain: 'account', summary: { tr: 'Bildirimi okundu işaretle', en: 'Mark a notification as read' },
        effect: 'write', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'NotificationService/markAsRead' }],
        ui: onShell('notifications'), mcp: PLUMBING('Bildirim çekmecesi durumu'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.delete', domain: 'account', summary: { tr: 'Bildirimi sil', en: 'Delete a notification' },
        effect: 'destructive', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'NotificationService/delete' }],
        ui: onShell('notifications'), mcp: PLUMBING('Bildirim çekmecesi durumu'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.unread_count', domain: 'account', summary: { tr: 'Okunmamış bildirim sayısı (rozet)', en: 'Unread notification count (badge)' },
        effect: 'read', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'NotificationService/getUnreadCount' }],
        ui: noUi('Backend-only: hafif rozet sorgusu, FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: PLUMBING('Rozet sayacı'), agent: NO_AGENT,
    }),

    // [ADR-0029 NB4] yeni bildirim uçları: backend hazır, FE (F-N1 bildirim merkezi v2 / F-N2 tercihler) bulut işi.
    c({
        id: 'notifications.archive', domain: 'account', summary: { tr: 'Bildirimi arşivle / arşivden çıkar', en: 'Archive / unarchive a notification' },
        effect: 'write', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'NotificationService/archive' }, { rpc: 'NotificationService/unarchive' }],
        ui: noUi('Backend-only: bildirim merkezi v2 (F-N1) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: PLUMBING('Bildirim çekmecesi durumu'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.catalog', domain: 'account', summary: { tr: 'Bildirim kataloğunu getir', en: 'Get the notification catalog' },
        effect: 'read', minTier: 'member', permission: 'app:use', bindings: [{ rpc: 'NotificationService/getCatalog' }],
        ui: noUi('Backend-only: bildirim merkezi/tercihler FE (F-N1/F-N2) bulut işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: PLUMBING('Bildirim katalogu (FE tek kaynak)'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.preferences.get', domain: 'account', summary: { tr: 'Bildirim tercihlerimi getir', en: 'Get my notification preferences' },
        effect: 'read', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'NotificationService/getPreferences' }],
        ui: noUi('Backend-only: bildirim tercihleri ekranı (F-N2) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: PLUMBING('Kişisel bildirim tercihleri'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.preferences.update', domain: 'account', summary: { tr: 'Bildirim tercihlerimi kaydet', en: 'Save my notification preferences' },
        effect: 'write', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'NotificationService/updatePreferences' }],
        ui: noUi('Backend-only: bildirim tercihleri ekranı (F-N2) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: PLUMBING('Kişisel bildirim tercihleri'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.tenant_defaults.get', domain: 'account', summary: { tr: 'Mağaza bildirim varsayılanlarını getir', en: 'Get store notification defaults' },
        effect: 'read', minTier: 'admin', permission: 'settings:manage', bindings: [{ rpc: 'NotificationService/getTenantDefaults' }],
        ui: noUi('Backend-only: tenant varsayılanları ekranı (F-N2) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: PLUMBING('Tenant bildirim varsayılanları'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.tenant_defaults.update', domain: 'account', summary: { tr: 'Mağaza bildirim varsayılanlarını kaydet', en: 'Save store notification defaults' },
        effect: 'write', minTier: 'admin', permission: 'settings:manage', bindings: [{ rpc: 'NotificationService/updateTenantDefaults' }],
        ui: noUi('Backend-only: tenant varsayılanları ekranı (F-N2) bulut FE işi (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: PLUMBING('Tenant bildirim varsayılanları'), agent: NO_AGENT,
    }),

    // [MOB-04] web push: kullanıcı × cihaz aboneliği (tercih matrisindeki 'push' sütunu notifications.preferences.* ile).
    c({
        id: 'notifications.push.config', domain: 'account', summary: { tr: 'Anlık bildirim durumu ve cihazlarım', en: 'Push notification status and my devices' },
        effect: 'read', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'NotificationService/getPushConfig' }],
        ui: onShell('notifications'), mcp: PLUMBING('Cihaz push durumu (tarayıcıya bağlı)'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.push.subscribe', domain: 'account', summary: { tr: 'Bu cihazda anlık bildirimleri aç', en: 'Enable push notifications on this device' },
        effect: 'write', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'NotificationService/subscribePush' }],
        ui: onShell('notifications'), mcp: PLUMBING('Cihaz push aboneliği (tarayıcı izni + service worker)'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.push.unsubscribe', domain: 'account', summary: { tr: 'Cihazda anlık bildirimleri kapat', en: 'Disable push notifications on a device' },
        effect: 'write', minTier: 'member', permission: 'self:manage', scope: 'user', bindings: [{ rpc: 'NotificationService/unsubscribePush' }],
        ui: onShell('notifications'), mcp: PLUMBING('Cihaz push aboneliği (kişisel)'), agent: NO_AGENT,
    }),

    // --- Arama / denetim ---
    c({
        id: 'search.unified', domain: 'account', summary: { tr: 'Birleşik arama (sipariş/ürün/müşteri)', en: 'Unified search (orders/products/customers)' },
        effect: 'read', minTier: 'member', permission: 'app:use', pii: 'raw', bindings: [{ rpc: 'SmartService/unifiedSearch' }],
        ui: onShell('app_bar'), mcp: deferred('later', 'Çok varlıklı arama PII döndürür (maskeleme yok); araç bütçesi için products.search/orders.list önceliklidir.'), agent: NO_AGENT,
    }),
    c({
        id: 'audit.logs.list', domain: 'account', summary: { tr: 'Denetim günlüğünü listele (kim-ne-zaman)', en: 'List the audit log (who-did-what-when)' },
        effect: 'read', minTier: 'admin', permission: 'audit:read', pii: 'masked', bindings: [{ rpc: 'AuditService/getAuditLogs' }],
        ui: noUi('Backend-only: denetim günlüğü ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: deferred('later', 'Yönetim bilgisi (admin+); salt-okunur ama sohbet kanalına açılması ayrı güvenlik incelemesi ister.'), agent: NO_AGENT,
    }),
];
