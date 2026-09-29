// Hesap, kullanıcı/rol, ayar, menü, bildirim, arama, denetim ve tenant KVKK yetenekleri.
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens, onShell, noUi } from '../define';

const SETTINGS = 'SettingListView';
const USERS = 'user/AuthorizationListView';
const PLUMBING = (what: string) => nx('ui_plumbing', `${what}: kullanıcının işi değil, uygulama kabuğunun iç işi (menü/oturum/başlangıç); sohbet kanalına açılmaz.`);

export const ACCOUNT_CAPABILITIES = [
    // --- Kendi hesabı / tenant yaşam döngüsü (ADR-0003, API_ACCOUNT_LIFECYCLE) ---
    c({
        id: 'account.password.change', domain: 'account', summary: { tr: 'Kendi parolamı değiştir', en: 'Change my own password' },
        effect: 'write', minTier: 'member', scope: 'user', bindings: [{ rpc: 'AccountService/changePassword' }],
        ui: noUi('Backend-only: Hesabım/Güvenlik ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('credential', 'Parola/kimlik bilgisi işlemi; LLM kanalından geçemez (MCP form elicitation\'da sır yasak).'), agent: NO_AGENT,
    }),
    c({
        id: 'account.email_verification.resend', domain: 'account', summary: { tr: 'E-posta doğrulama bağlantısını yeniden gönder', en: 'Resend my email verification link' },
        effect: 'write', minTier: 'member', scope: 'user', external: true, bindings: [{ rpc: 'AccountService/resendVerificationEmail' }],
        ui: noUi('Backend-only: Hesabım/Güvenlik ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('credential', 'Hesap doğrulama akışı (e-posta ile token gönderir); dışarı veri gönderen yetenek MCP\'ye açılmaz (ADR-0019 §5.6).'), agent: NO_AGENT,
    }),
    c({
        id: 'account.tenant.deletion.request', domain: 'account', summary: { tr: 'Mağaza (tenant) silme talebi (30 gün askı)', en: 'Request tenant deletion (30-day grace period)' },
        effect: 'destructive', minTier: 'owner', undo: { kind: 'softDelete', days: 30 }, bindings: [{ rpc: 'TenantDataService/requestDeletion' }],
        ui: noUi('Backend-only: tenant silme ekranı Faz 2/3 (ADR-0003 F.20; BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('irreversible', 'Tenant silme (30 gün sonra kalıcı purge); hukuki/geri alınamaz, yalnız ekranda ve yeniden kimlik doğrulamayla.'), agent: NO_AGENT,
        review: 'Geri alma yalnızca platformAdmin (platform.tenant.deletion.cancel); tenant kullanıcısı kendi talebini geri alamaz.',
    }),
    c({
        id: 'account.tenant.data.export', domain: 'account', summary: { tr: 'Tüm tenant verisini dışa aktar (KVKK taşınabilirlik)', en: 'Export all tenant data (GDPR/KVKK portability)' },
        effect: 'write', minTier: 'owner', pii: 'raw', rateCost: 10, bindings: [{ rpc: 'TenantDataService/exportTenantData' }],
        ui: noUi('Backend-only: dışa aktarma ekranı Faz 2/3 (ADR-0003 F.22; BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('binary_file', 'NDJSON+zip artefaktı üretir ve imzalı indirme belirteci döndürür; tüm PII içerir, dosya kanalı LLM dışıdır.'), agent: NO_AGENT,
    }),

    // --- Kullanıcı / rol ---
    c({
        id: 'users.list', domain: 'account', summary: { tr: 'Kullanıcıları listele', en: 'List users' },
        effect: 'read', minTier: 'admin', pii: 'raw', bindings: [{ rpc: 'UserService/getUsers' }],
        ui: onScreens(USERS), mcp: deferred('later', 'Kullanıcı/rol yönetimi; ayrıcalık yükseltme riski (bilinen boşluk: createUser hedef-rol kontrolü yok) çözülmeden açılmaz.'), agent: NO_AGENT,
    }),
    c({
        id: 'users.create', domain: 'account', summary: { tr: 'Kullanıcı oluştur', en: 'Create a user' },
        effect: 'write', minTier: 'admin', pii: 'raw', bindings: [{ rpc: 'UserService/createUser' }],
        ui: onScreens([USERS, 'create']), mcp: deferred('later', 'Kullanıcı/rol yönetimi; ayrıcalık yükseltme riski (bilinen boşluk: createUser hedef-rol kontrolü yok) çözülmeden açılmaz.'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md "Bilinen boşluklar": admin, gövdedeki roleCode ile ROLE_OWNER atayabilir (kademe var, hedef-rol kontrolü yok).',
    }),
    c({
        id: 'users.update', domain: 'account', summary: { tr: 'Kullanıcıyı güncelle', en: 'Update a user' },
        effect: 'write', minTier: 'admin', pii: 'raw', bindings: [{ rpc: 'UserService/updateUser' }],
        ui: onScreens([USERS, 'update']), mcp: deferred('later', 'Kullanıcı/rol yönetimi; ayrıcalık yükseltme riski (bilinen boşluk: updateUser hedef-rol kontrolü yok) çözülmeden açılmaz.'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md "Bilinen boşluklar": admin, gövdedeki roleCode ile ROLE_OWNER atayabilir (kademe var, hedef-rol kontrolü yok).',
    }),
    c({
        id: 'users.delete', domain: 'account', summary: { tr: 'Kullanıcıyı sil', en: 'Delete a user' },
        effect: 'destructive', minTier: 'admin', bindings: [{ rpc: 'UserService/deleteUser' }],
        ui: onScreens([USERS, 'delete']), mcp: deferred('later', 'Kullanıcı yönetimi yıkıcı işlem; geri alma yok, yalnız ekranda (confirm:typed uygunluğu için undo gerekir).'), agent: NO_AGENT,
    }),
    c({
        id: 'roles.list', domain: 'account', summary: { tr: 'Rol listesini getir', en: 'List roles' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'UserService/getRoles' }],
        ui: onShell('init'), mcp: PLUMBING('Rol listesi (initApp/kullanıcı formu verisi)'), agent: NO_AGENT,
    }),
    c({
        id: 'resources.list', domain: 'account', summary: { tr: 'Kaynak/menü görünürlüğünü getir', en: 'Get resource/menu visibility' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'UserService/getResources' }],
        ui: onShell('init'), mcp: PLUMBING('Menü/kaynak görünürlüğü (initApp)'), agent: NO_AGENT,
    }),

    // --- Ayarlar / yapılandırma ---
    c({
        id: 'settings.get', domain: 'account', summary: { tr: 'Mağaza ayarlarını getir', en: 'Get store settings' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'SettingService/getSettings' }],
        ui: { screens: [{ screen: SETTINGS }, { screen: 'shell:init' }] }, mcp: deferred('later', 'Mağaza adı/logo vb. genel ayarlar; değeri düşük, toolset genişlemesinde (account) değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'settings.update', domain: 'account', summary: { tr: 'Mağaza ayarlarını güncelle', en: 'Update store settings' },
        effect: 'write', minTier: 'admin', bindings: [{ rpc: 'SettingService/updateSettings' }],
        ui: onScreens([SETTINGS, 'save']), mcp: deferred('later', 'Tenant ayarı yazma; onay akışı (Aşama D) ve alan bazlı şema gerekir.'), agent: NO_AGENT,
    }),
    c({
        id: 'settings.logo.upload', domain: 'account', summary: { tr: 'Mağaza logosu/kimliği yükle', en: 'Upload store logo/identity' },
        effect: 'write', minTier: 'admin', bindings: [{ rpc: 'ImageApi/uploadIdentity' }],
        ui: onScreens([SETTINGS, 'uploadLogo']), mcp: nx('binary_file', 'İkili dosya yükleme (multipart); yerel araç + mevcut yükleme API\'si üzerinden (ADR-0009 §6), MCP JSON kanalı değil.'), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz (düşük): admin mı member mi; kiracı logosu ayar niteliğinde olduğu için admin bırakıldı.',
    }),
    c({
        id: 'config.get', domain: 'account', summary: { tr: 'Uygulama yapılandırmasını getir (menü/katalog özeti)', en: 'Get application configuration' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'ConfigurationService/get' }],
        ui: onShell('init'), mcp: PLUMBING('Uygulama yapılandırma okuması (initApp)'), agent: NO_AGENT,
    }),

    // --- Menü / favoriler ---
    c({
        id: 'menu.get', domain: 'account', summary: { tr: 'Menüyü getir', en: 'Get the menu' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'MenuService/get' }],
        ui: onShell('menu'), mcp: PLUMBING('Menü ağacı'), agent: NO_AGENT,
    }),
    c({
        id: 'menu.favorites.list', domain: 'account', summary: { tr: 'Favori menü öğelerini listele', en: 'List favorite menu items' },
        effect: 'read', minTier: 'member', scope: 'user', bindings: [{ rpc: 'MenuService/retrieveFavorites' }],
        ui: onShell('menu'), mcp: PLUMBING('Kişisel favoriler'), agent: NO_AGENT,
    }),
    c({
        id: 'menu.favorites.add', domain: 'account', summary: { tr: 'Menü öğesini favorilere ekle', en: 'Add a menu item to favorites' },
        effect: 'write', minTier: 'member', scope: 'user', bindings: [{ rpc: 'MenuService/addFavorite' }],
        ui: onShell('menu'), mcp: PLUMBING('Kişisel favoriler'), agent: NO_AGENT,
    }),
    c({
        id: 'menu.favorites.remove', domain: 'account', summary: { tr: 'Menü öğesini favorilerden çıkar', en: 'Remove a menu item from favorites' },
        effect: 'destructive', minTier: 'member', scope: 'user', bindings: [{ rpc: 'MenuService/deleteFavorite' }],
        ui: onShell('menu'), mcp: PLUMBING('Kişisel favoriler'), agent: NO_AGENT,
    }),
    c({
        id: 'menu.favorites.sort', domain: 'account', summary: { tr: 'Favori menü sırasını değiştir', en: 'Reorder favorite menu items' },
        effect: 'write', minTier: 'member', scope: 'user', bindings: [{ rpc: 'MenuService/sortFavorites' }],
        ui: onShell('menu'), mcp: PLUMBING('Kişisel favori sıralaması'), agent: NO_AGENT,
    }),

    // --- Bildirimler ---
    c({
        id: 'notifications.list', domain: 'account', summary: { tr: 'Bildirimlerimi listele', en: 'List my notifications' },
        effect: 'read', minTier: 'member', scope: 'user', bindings: [{ rpc: 'NotificationService/get' }],
        ui: onShell('notifications'), mcp: deferred('later', 'Kullanıcının kendi bildirimleri; sohbette "bildirimlerim" için aday, toolset genişlemesinde değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.mark_read', domain: 'account', summary: { tr: 'Bildirimi okundu işaretle', en: 'Mark a notification as read' },
        effect: 'write', minTier: 'member', scope: 'user', bindings: [{ rpc: 'NotificationService/markAsRead' }],
        ui: onShell('notifications'), mcp: PLUMBING('Bildirim çekmecesi durumu'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.delete', domain: 'account', summary: { tr: 'Bildirimi sil', en: 'Delete a notification' },
        effect: 'destructive', minTier: 'member', scope: 'user', bindings: [{ rpc: 'NotificationService/delete' }],
        ui: onShell('notifications'), mcp: PLUMBING('Bildirim çekmecesi durumu'), agent: NO_AGENT,
    }),
    c({
        id: 'notifications.unread_count', domain: 'account', summary: { tr: 'Okunmamış bildirim sayısı (rozet)', en: 'Unread notification count (badge)' },
        effect: 'read', minTier: 'member', scope: 'user', bindings: [{ rpc: 'NotificationService/getUnreadCount' }],
        ui: noUi('Backend-only: hafif rozet sorgusu, FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).'), mcp: PLUMBING('Rozet sayacı'), agent: NO_AGENT,
    }),

    // --- Arama / denetim ---
    c({
        id: 'search.unified', domain: 'account', summary: { tr: 'Birleşik arama (sipariş/ürün/müşteri)', en: 'Unified search (orders/products/customers)' },
        effect: 'read', minTier: 'member', pii: 'raw', bindings: [{ rpc: 'SmartService/unifiedSearch' }],
        ui: onShell('app_bar'), mcp: deferred('later', 'Çok varlıklı arama PII döndürür (maskeleme yok); araç bütçesi için products.search/orders.list önceliklidir.'), agent: NO_AGENT,
    }),
    c({
        id: 'audit.logs.list', domain: 'account', summary: { tr: 'Denetim günlüğünü listele (kim-ne-zaman)', en: 'List the audit log (who-did-what-when)' },
        effect: 'read', minTier: 'admin', pii: 'masked', bindings: [{ rpc: 'AuditService/getAuditLogs' }],
        ui: noUi('Backend-only: denetim günlüğü ekranı ADR-0015 sonrası (BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: deferred('later', 'Yönetim bilgisi (admin+); salt-okunur ama sohbet kanalına açılması ayrı güvenlik incelemesi ister.'), agent: NO_AGENT,
    }),
];
