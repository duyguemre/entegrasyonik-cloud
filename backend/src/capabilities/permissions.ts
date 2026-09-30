// ADR-0028 Karar 2 (WP-A1): İZİN KATALOĞU — kodda TEK kaynak. Adlandırma `kaynak:eylem`; varsayılan ret.
// Her yetenek TAM OLARAK bir izne bağlıdır (`CapabilityDef.permission`, zorunlu). Bir izin anahtarı farklı kademeli
// (minTier) yetenekleri toplayamaz (PERMISSION_MIXED_TIER); gerekirse anahtar bölünür (ör. integrations:read / :manage).
//
// Sapmalar (ADR tablosuna göre; parite kuralı zorunlu kıldı, bkz. MASTER_STATE/BACKLOG WP-A1 notu):
//  - `customers:write` (member) ve `customers:anonymize` (admin) eklendi: customers.update member, customers.anonymize admin.
//  - `stock:write` katalogda YOK: bugün onu kullanan yetenek yok (her izin >=1 yetenekte kullanılır kuralı). İlgili yetenek
//    (stok düzeltme) eklenirken katalog + rol eşlemesine girer. `tenant:transfer` WP-A4'te (sahiplik devri) eklendi.

export const PERMISSIONS = [
    // Katalog
    'catalog:read', 'catalog:write', 'catalog:delete', 'catalog:publish',
    // Stok
    'stock:read',
    // Sipariş / iade
    'orders:read', 'orders:write', 'claims:read', 'claims:write',
    // Müşteri / mesaj
    'customers:read', 'customers:write', 'customers:anonymize', 'messages:read', 'messages:reply',
    // Fatura / kargo / finans
    'invoices:read', 'invoices:write', 'invoices:delete', 'shipments:read', 'shipments:write', 'finance:read',
    // Entegrasyon
    'integrations:read', 'integrations:manage', 'integrations:sync',
    // Rapor / toplu veri
    'reports:read', 'data:export',
    // Ayar
    'settings:read', 'settings:manage',
    // Kullanıcı
    'users:read', 'users:manage',
    // Denetim
    'audit:read',
    // Abonelik
    'billing:read', 'billing:manage',
    // Destek
    'support:use',
    // Tenant (sahip)
    'tenant:export', 'tenant:delete', 'tenant:transfer',
    // Kendi hesabı / kabuk
    'self:manage', 'app:use',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Platform (ga) yetenekleri izin kataloğuna GİRMEZ (ADR-0028 Karar 2): `minTier:'platformAdmin'` yetenekler bu işaretle
 * etiketlenir ve `can` yalnızca `platformAdmin` aktörüne izin verir. Hiçbir tenant rolü bunu taşımaz.
 */
export const PLATFORM_ONLY = 'platform:admin' as const;
export type PlatformOnly = typeof PLATFORM_ONLY;

/** `CapabilityDef.permission` tipi: katalog izni YA DA platform işareti. */
export type CapabilityPermission = Permission | PlatformOnly;

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);
export function isPermission(v: unknown): v is Permission {
    return typeof v === 'string' && PERMISSION_SET.has(v);
}
