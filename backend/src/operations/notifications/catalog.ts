// ADR-0029 Karar 1 / docs/NOTIFICATION_PLAN.md §2: TEK olay katalogu (v1: 29 tenant [+ sonradan eklenenler, PRC-R1 BUYBOX_LOST dahil; sayi testte] + 5 platform kodu + LEGACY_* koprusu).
// Kod, kategori, onem, izin, sablon anahtarlari, rota, dedupe/grup kurali, saklama, varsayilan kanallar, zorunluluk burada.
// Degismezler tests/unit/notifications/catalog.test.ts'te. Kod silme/yeniden adlandirma baseline testinde kirilir (alias zorunlu).
import { z } from 'zod';
import { defineNotification } from './defineNotification';
import type { NotificationCatalogDto, NotificationDefinition } from './catalog.types';

const MIN = 60_000;
const HOUR = 60 * MIN;
const q = (v: unknown) => encodeURIComponent(String(v));
// Kisa, PII'siz, sinirli tokenlar (kimlik / kod / sayi). Uzun serbest metin params'a GIRMEZ.
const id = () => z.string().min(1).max(80);
const code = () => z.string().min(1).max(60);
const num = () => z.number().finite();
const dateStr = () => z.string().min(1).max(40);
const optId = () => z.string().max(80).optional();

const dedupe = (s: string) => s; // okunabilirlik: dedupeKey biçimini tek yerde belgelemek icin

const TENANT: NotificationDefinition[] = [
    // ---- order ----
    defineNotification({
        code: 'ORDER_SYNC_WINDOW_OVERFLOW', category: 'order', severity: 'warning', mandatory: false,
        defaultChannels: { inApp: true, email: 'off' }, audience: { permission: 'orders:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code(), reason: code() }).strict(),
        action: (p) => `/integrations/health?code=${q(p.integ)}`,
        group: { key: (p) => `${p.integ}:${p.reason}`, windowMs: HOUR }, retention: 'short', surface: 'tenant',
        example: { integ: 'trendyol', reason: 'window_overflow' },
    }),
    defineNotification({
        code: 'ORDER_SYNC_FAILED', category: 'order', severity: 'error', mandatory: false,
        defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'orders:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code(), errorCode: code(), corrId: optId() }).strict(),
        action: (p) => `/integrations/health?code=${q(p.integ)}`,
        group: { key: (p) => p.integ, windowMs: HOUR }, retention: 'standard', surface: 'tenant',
        example: { integ: 'trendyol', errorCode: 'UPSTREAM_TIMEOUT', corrId: 'c-1' },
    }),
    defineNotification({
        code: 'ORDER_SYNC_LAGGING', category: 'order', severity: (p) => (p.level === 'critical' ? 'critical' : 'warning'), severities: ['warning', 'critical'],
        mandatory: false, defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'orders:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code(), lagMinutes: num(), level: z.enum(['warning', 'critical']) }).strict(),
        action: () => '/integrations/health', group: { key: (p) => p.integ, windowMs: 4 * HOUR }, retention: 'standard', surface: 'tenant',
        example: { integ: 'trendyol', lagMinutes: 95, level: 'warning' },
    }),
    // ---- stock ----
    defineNotification({
        code: 'STOCK_OVERSOLD', category: 'stock', severity: 'critical', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'stock:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code(), lineId: id(), orderId: optId(), sku: optId() }).strict(),
        action: () => '/orders?allocation=OVERSOLD', dedupeKey: (p) => dedupe(p.lineId),
        group: { key: (p) => p.integ, windowMs: 15 * MIN }, retention: 'long', surface: 'tenant',
        example: { integ: 'trendyol', lineId: 'L-1', orderId: 'O-1', sku: 'SKU-1' },
    }),
    defineNotification({
        code: 'STOCK_UNMAPPED_LINE', category: 'stock', severity: 'warning', mandatory: true,
        defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'stock:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code(), lineId: id(), orderId: optId(), sku: optId() }).strict(),
        action: () => '/orders?allocation=UNMAPPED', dedupeKey: (p) => p.lineId,
        group: { key: (p) => p.integ, windowMs: HOUR }, retention: 'long', surface: 'tenant',
        example: { integ: 'hepsiburada', lineId: 'L-2', orderId: 'O-2', sku: 'SKU-2' },
    }),
    defineNotification({
        code: 'STOCK_REALLOCATED', category: 'stock', severity: 'success', mandatory: false,
        defaultChannels: { inApp: true, email: 'off' }, audience: { permission: 'stock:read', fallbackMinTier: 'member' },
        params: z.object({ lineId: id(), orderId: id(), sku: optId() }).strict(),
        action: (p) => `/orders/${q(p.orderId)}`, dedupeKey: (p) => `${p.lineId}:realloc`,
        group: { key: () => 'realloc', windowMs: HOUR }, retention: 'short', surface: 'tenant',
        example: { lineId: 'L-3', orderId: 'O-3', sku: 'SKU-3' },
    }),
    defineNotification({
        code: 'STOCK_LINE_AUTO_CANCELLED', category: 'stock', severity: 'warning', mandatory: false,
        defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'stock:read', fallbackMinTier: 'member' },
        params: z.object({ lineId: id(), orderId: id(), sku: optId() }).strict(),
        action: (p) => `/orders/${q(p.orderId)}`, dedupeKey: (p) => `${p.lineId}:cancel`, retention: 'standard', surface: 'tenant',
        example: { lineId: 'L-4', orderId: 'O-4', sku: 'SKU-4' },
    }),
    defineNotification({
        code: 'STOCK_COMPENSATION_MANUAL', category: 'stock', severity: 'error', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'stock:read', fallbackMinTier: 'member' },
        params: z.object({ lineId: id(), orderId: id(), reason: z.enum(['cancel_uncertain', 'insufficient_stock']) }).strict(),
        action: (p) => `/orders/${q(p.orderId)}`, dedupeKey: (p) => `${p.lineId}:manual:${p.reason}`, retention: 'long', surface: 'tenant',
        example: { lineId: 'L-5', orderId: 'O-5', reason: 'insufficient_stock' },
    }),
    defineNotification({
        code: 'STOCK_OVERSOLD_UNRESOLVED', category: 'stock', severity: 'warning', mandatory: true,
        defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'stock:read', fallbackMinTier: 'member' },
        params: z.object({ count: num() }).strict(), action: () => '/catalog/stock-health',
        group: { key: () => 'tenant', windowMs: 4 * HOUR }, retention: 'long', surface: 'tenant', example: { count: 3 },
    }),
    defineNotification({
        code: 'STOCK_LOW', category: 'stock', severity: 'warning', mandatory: false,
        defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'stock:read', fallbackMinTier: 'member' },
        params: z.object({ variantId: id(), sku: id(), available: num(), threshold: num(), day: dateStr() }).strict(),
        action: () => '/catalog/stock-health?low=1', dedupeKey: (p) => `${p.variantId}:${p.day}`, // gunde en fazla bir kez / varyant (Europe/Istanbul gunu)
        retention: 'short', surface: 'tenant', example: { variantId: 'V-1', sku: 'SKU-6', available: 2, threshold: 5, day: '2026-09-30' },
    }),
    // ---- integration ----
    defineNotification({
        code: 'INTEGRATION_AUTH_FAILED', category: 'integration', severity: 'critical', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'integrations:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code() }).strict(), action: (p) => `/integrations/marketplace?code=${q(p.integ)}`,
        group: { key: (p) => p.integ, windowMs: 24 * HOUR }, retention: 'long', surface: 'tenant', example: { integ: 'n11' },
    }),
    defineNotification({
        code: 'INTEGRATION_CIRCUIT_OPEN', category: 'integration', severity: 'warning', mandatory: false,
        defaultChannels: { inApp: true, email: 'off' }, audience: { permission: 'integrations:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code() }).strict(), action: (p) => `/integrations/health?code=${q(p.integ)}`,
        group: { key: (p) => p.integ, windowMs: 4 * HOUR }, retention: 'standard', surface: 'tenant', example: { integ: 'pazarama' },
    }),
    defineNotification({
        code: 'INTEGRATION_ERROR_RATE_HIGH', category: 'integration', severity: (p) => (p.level === 'critical' ? 'critical' : 'warning'), severities: ['warning', 'critical'],
        mandatory: false, defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'integrations:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code(), ratePercent: num(), level: z.enum(['warning', 'critical']) }).strict(),
        action: (p) => `/integrations/health?code=${q(p.integ)}`, group: { key: (p) => p.integ, windowMs: 4 * HOUR }, retention: 'standard', surface: 'tenant',
        example: { integ: 'trendyol', ratePercent: 22, level: 'warning' },
    }),
    defineNotification({
        code: 'INTEGRATION_CHANGE_NOTICE', category: 'integration', severity: (p) => (p.level === 'warning' ? 'warning' : 'info'), severities: ['info', 'warning'],
        mandatory: false, defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'integrations:manage', fallbackMinTier: 'admin' },
        params: z.object({ integ: code(), findingId: id(), level: z.enum(['info', 'warning']) }).strict(),
        action: (p) => `/integrations/health?code=${q(p.integ)}`, dedupeKey: (p) => p.findingId, retention: 'long', surface: 'tenant',
        example: { integ: 'hepsiburada', findingId: 'F-1', level: 'info' },
    }),
    // ---- catalog ----
    defineNotification({
        code: 'CATALOG_BATCH_SUBMITTED', category: 'catalog', severity: (p) => (p.hasWarnings ? 'warning' : 'success'), severities: ['success', 'warning'],
        mandatory: false, defaultChannels: { inApp: true, email: 'off' }, audience: { permission: 'catalog:read', fallbackMinTier: 'member', actorOnly: true },
        params: z.object({ integ: code(), mode: code(), batchId: id(), itemCount: num(), hasWarnings: z.boolean() }).strict(),
        action: (p) => `/logs?mode=${q(p.mode)}`, dedupeKey: (p) => p.batchId, retention: 'short', surface: 'tenant',
        legacyType: 'BATCH_PROCESS', legacyMode: 'TRANSFER',
        example: { integ: 'trendyol', mode: 'TRANSFER', batchId: 'B-1', itemCount: 40, hasWarnings: false },
    }),
    defineNotification({
        code: 'CATALOG_BATCH_FAILED', category: 'catalog', severity: 'error', mandatory: false,
        defaultChannels: { inApp: true, email: 'off' }, audience: { permission: 'catalog:read', fallbackMinTier: 'member', actorOnly: true },
        params: z.object({ integ: code(), mode: code(), batchId: id(), errorCode: code(), corrId: optId() }).strict(),
        action: (p) => `/logs?mode=${q(p.mode)}`, dedupeKey: (p) => p.batchId, retention: 'standard', surface: 'tenant',
        legacyType: 'BATCH_PROCESS', legacyMode: 'TRANSFER',
        example: { integ: 'trendyol', mode: 'TRANSFER', batchId: 'B-2', errorCode: 'BATCH_REJECTED', corrId: 'c-2' },
    }),
    // PRC-R1 (K57): buybox (Trendyol) bizdeyken başka satıcıya geçti. Soğuma: barkod başına `pricing.buybox.notify.cooldownHours`
    // (üretici denetler) + gün içi dedupe. Gölge mod `pricing.buybox.notify.shadow` (varsayılan AÇIK: yalnız defter) — ADR-0029 NB8 deseni.
    defineNotification({
        code: 'BUYBOX_LOST', category: 'catalog', severity: 'warning', mandatory: false,
        defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'catalog:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code(), barcode: id(), buyboxOrder: num(), buyboxPrice: num(), day: dateStr() }).strict(),
        action: (p) => `/products?buybox=losing&barcode=${q(p.barcode)}`, dedupeKey: (p) => `${p.integ}:${p.barcode}:${p.day}`,
        group: { key: (p) => p.integ, windowMs: HOUR }, retention: 'short', surface: 'tenant',
        example: { integ: 'trendyol', barcode: '8690000000001', buyboxOrder: 2, buyboxPrice: 249.9, day: '2026-10-01' },
    }),
    defineNotification({
        code: 'CATALOG_IMPORT_COMPLETED', category: 'catalog', severity: 'success', mandatory: false,
        defaultChannels: { inApp: true, email: 'off' }, audience: { permission: 'catalog:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code(), jobId: id(), itemCount: num() }).strict(),
        action: (p) => `/logs?mode=IMPORT&job=${q(p.jobId)}`, dedupeKey: (p) => p.jobId, retention: 'short', surface: 'tenant',
        legacyType: 'IMPORT_READY', legacyMode: 'IMPORT', example: { integ: 'trendyol', jobId: 'J-1', itemCount: 120 },
    }),
    defineNotification({
        code: 'CATALOG_IMPORT_FAILED', category: 'catalog', severity: 'error', mandatory: false,
        defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'catalog:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code(), jobId: id(), errorCode: code(), corrId: optId() }).strict(),
        action: (p) => `/logs?mode=IMPORT&job=${q(p.jobId)}`, dedupeKey: (p) => p.jobId, retention: 'standard', surface: 'tenant',
        legacyType: 'IMPORT_READY', legacyMode: 'IMPORT', example: { integ: 'trendyol', jobId: 'J-2', errorCode: 'IMPORT_FAILED', corrId: 'c-3' },
    }),
    defineNotification({
        code: 'CATALOG_EXPORT_ERRORS_DIGEST', category: 'catalog', severity: 'warning', mandatory: false,
        defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'catalog:read', fallbackMinTier: 'member' },
        params: z.object({ integ: code(), failedCount: num() }).strict(), action: () => '/logs?mode=TRANSFER&status=FAILED',
        group: { key: (p) => p.integ, windowMs: HOUR }, retention: 'standard', surface: 'tenant', example: { integ: 'trendyol', failedCount: 7 },
    }),
    // ---- finance ----
    defineNotification({
        code: 'FINANCE_RECONCILIATION_MISMATCH', category: 'finance', severity: 'warning', mandatory: false,
        defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'finance:read', fallbackMinTier: 'admin' },
        params: z.object({ mismatchCount: num() }).strict(), action: () => '/finance',
        group: { key: () => 'tenant', windowMs: 24 * HOUR }, retention: 'long', surface: 'tenant', example: { mismatchCount: 4 },
    }),
    // ---- billing ----
    defineNotification({
        code: 'BILLING_TRIAL_ENDING', category: 'billing', severity: 'warning', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'billing:read', fallbackMinTier: 'owner' },
        params: z.object({ trialEnd: dateStr(), daysLeft: num() }).strict(), action: () => '/subscription',
        dedupeKey: (p) => `${p.trialEnd}:T-3`, retention: 'long', surface: 'tenant', legacyType: 'SYSTEM', legacyMode: 'BILLING',
        example: { trialEnd: '2026-10-05', daysLeft: 3 },
    }),
    defineNotification({
        code: 'BILLING_TRIAL_ENDED', category: 'billing', severity: 'error', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'billing:read', fallbackMinTier: 'owner' },
        params: z.object({ trialEnd: dateStr() }).strict(), action: () => '/subscription',
        dedupeKey: (p) => p.trialEnd, retention: 'long', surface: 'tenant', legacyType: 'SYSTEM', legacyMode: 'BILLING',
        example: { trialEnd: '2026-10-05' },
    }),
    defineNotification({
        code: 'BILLING_SUSPENSION_WARNING', category: 'billing', severity: 'critical', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'billing:read', fallbackMinTier: 'owner' },
        params: z.object({ suspendAt: dateStr(), daysLeft: num() }).strict(), action: () => '/subscription',
        dedupeKey: (p) => `${p.suspendAt}:T-3`, retention: 'long', surface: 'tenant', legacyType: 'SYSTEM', legacyMode: 'BILLING',
        example: { suspendAt: '2026-10-12', daysLeft: 3 },
    }),
    defineNotification({
        code: 'BILLING_SUSPENDED', category: 'billing', severity: 'critical', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'billing:read', fallbackMinTier: 'owner' },
        params: z.object({ suspendAt: dateStr() }).strict(), action: () => '/subscription',
        dedupeKey: (p) => p.suspendAt, retention: 'long', surface: 'tenant', legacyType: 'SYSTEM', legacyMode: 'BILLING',
        example: { suspendAt: '2026-10-12' },
    }),
    defineNotification({
        code: 'BILLING_PAYMENT_FAILED', category: 'billing', severity: 'error', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'billing:read', fallbackMinTier: 'owner' },
        params: z.object({ invoiceId: id(), attempt: num() }).strict(), action: () => '/subscription',
        dedupeKey: (p) => `${p.invoiceId}:${p.attempt}`, retention: 'long', surface: 'tenant', legacyType: 'SYSTEM', legacyMode: 'BILLING',
        example: { invoiceId: 'INV-1', attempt: 1 },
    }),
    // ---- security ----
    defineNotification({
        code: 'SECURITY_PASSWORD_CHANGED', category: 'security', severity: 'warning', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'self:manage', fallbackMinTier: 'member', actorOnly: true },
        params: z.object({ passwordChangedAt: dateStr() }).strict(), action: () => '/account/security',
        dedupeKey: (p) => p.passwordChangedAt, retention: 'long', surface: 'tenant', example: { passwordChangedAt: '2026-09-30T10:00:00Z' },
    }),
    defineNotification({
        code: 'SECURITY_SUPPORT_ACCESS_STARTED', category: 'security', severity: 'warning', mandatory: true,
        defaultChannels: { inApp: true, email: 'off' }, audience: { permission: 'users:read', fallbackMinTier: 'admin' },
        params: z.object({ impSessionId: id() }).strict(), action: () => '/settings/audit-log?event=impersonation',
        dedupeKey: (p) => p.impSessionId, retention: 'long', surface: 'tenant', example: { impSessionId: 'IMP-1' },
    }),
    defineNotification({
        code: 'SECURITY_MEMBER_ROLE_CHANGED', category: 'security', severity: 'info', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'users:read', fallbackMinTier: 'admin' },
        params: z.object({ auditId: id(), newRole: code() }).strict(), action: () => '/settings/users',
        dedupeKey: (p) => p.auditId, retention: 'long', surface: 'tenant', example: { auditId: 'A-1', newRole: 'operator' },
    }),
    defineNotification({
        code: 'SECURITY_OWNERSHIP_TRANSFERRED', category: 'security', severity: 'warning', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'users:read', fallbackMinTier: 'admin' },
        params: z.object({ transferId: id() }).strict(), action: () => '/settings/users',
        dedupeKey: (p) => p.transferId, retention: 'long', surface: 'tenant', example: { transferId: 'T-1' },
    }),
    // [ADR-0028 WP-A4] Askiya alma + sahiplik devri talebi (hedefe; alici `opts.recipients` ile belirtilir, token bildirime GIRMEZ: e-postayla gider).
    defineNotification({
        code: 'SECURITY_MEMBER_SUSPENDED', category: 'security', severity: 'warning', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'users:read', fallbackMinTier: 'admin' },
        params: z.object({ targetUserId: id(), suspendedAt: dateStr() }).strict(), action: () => '/settings/users',
        dedupeKey: (p) => `${p.targetUserId}:${p.suspendedAt}`, retention: 'long', surface: 'tenant',
        example: { targetUserId: 'U-1', suspendedAt: '2026-09-30T10:00:00Z' },
    }),
    defineNotification({
        code: 'SECURITY_OWNERSHIP_TRANSFER_REQUESTED', category: 'security', severity: 'warning', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'self:manage', fallbackMinTier: 'member', actorOnly: true },
        params: z.object({ transferId: id(), expiresAt: dateStr() }).strict(), action: () => '/settings/users',
        dedupeKey: (p) => p.transferId, retention: 'long', surface: 'tenant', example: { transferId: 'T-1', expiresAt: '2026-10-03T10:00:00Z' },
    }),
    // [ADR-0035 MCP-2] Yeni yapay zeka uygulamasi baglantisi (baglanan kullaniciya; `opts.recipients` ile). clientName DCR'dan gelen duz kisa metin (serbest uzun metin degil);
    // `redirectHost` bildirimde gercek kimlik ipucudur (ad taklit edilebilir). Token/kod bildirime GIRMEZ.
    defineNotification({
        code: 'SECURITY_MCP_CONNECTED', category: 'security', severity: 'info', mandatory: true,
        defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'self:manage', fallbackMinTier: 'member', actorOnly: true },
        params: z.object({ familyId: id(), clientName: z.string().max(60), redirectHost: z.string().max(80) }).strict(), action: () => '/account/connected-apps',
        dedupeKey: (p) => p.familyId, retention: 'long', surface: 'tenant', example: { familyId: 'F-1', clientName: 'Ornek Uygulama', redirectHost: 'client.example.test' },
    }),
    // [ADR-0035 MCP-4] Bir yapay zeka uygulamasi yazma islemi onerdi ve KULLANICININ onayini bekliyor (bant disi onay). Kullaniciya (istegi baslatan kisi); tercihe tabi (mandatory:false).
    // Yalniz kisa/duz alanlar: uygulama adi (DCR, <=60) + yetenek basligi (kayittan). Onay on izlemesi/girdi bildirime GIRMEZ (sayfada gosterilir).
    defineNotification({
        code: 'SYSTEM_MCP_APPROVAL_PENDING', category: 'system', severity: 'warning', mandatory: false,
        defaultChannels: { inApp: true, email: 'off' }, audience: { permission: 'app:use', fallbackMinTier: 'member', actorOnly: true },
        params: z.object({ approvalId: id(), clientName: z.string().max(60), title: z.string().max(120) }).strict(), action: (p) => `/approve/${q(p.approvalId)}`,
        dedupeKey: (p) => p.approvalId, retention: 'short', surface: 'tenant', example: { approvalId: 'A-1', clientName: 'Ornek Uygulama', title: 'Siparisleri onayla' },
    }),
    // ---- system ----
    defineNotification({
        code: 'SYSTEM_ANNOUNCEMENT', category: 'system', severity: (p) => (p.kind === 'info' || p.kind === 'release' ? 'info' : 'warning'), severities: ['info', 'warning'],
        // NB7: e-posta varsayilani 'instant' -- duyuru isi kanal secimini notify `opts.email` ile belirler (yalniz inApp duyuruda false); kullanici kategori tercihi (opt-out) gecerli kalir.
        mandatory: false, defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'app:use', fallbackMinTier: 'member' },
        // title/summary: platform yoneticisinin yazdigi duyuru metni (tenant verisi/PII degil); Tr zorunlu degil cunku genel yedek sablon vardir.
        params: z.object({
            announcementId: id(), kind: z.enum(['info', 'release', 'maintenance', 'incident']),
            title: z.string().min(1).max(160).optional(), summary: z.string().min(1).max(600).optional(),
            titleEn: z.string().min(1).max(160).optional(), summaryEn: z.string().min(1).max(600).optional(),
        }).strict(),
        action: (p) => `/notifications?announcement=${q(p.announcementId)}`, dedupeKey: (p) => p.announcementId, retention: 'standard', surface: 'tenant',
        example: { announcementId: 'AN-1', kind: 'maintenance' },
    }),
];

const platformAlert = (c: string, severity: 'info' | 'warning' | 'critical', email: 'instant' | 'digest', paramsShape: z.ZodRawShape, example: Record<string, unknown>) =>
    defineNotification({
        code: c, category: 'system', severity, mandatory: false, defaultChannels: { inApp: true, email },
        audience: { permission: 'app:use', fallbackMinTier: 'owner' }, params: z.object(paramsShape).strict(),
        retention: 'standard', surface: 'platform', example,
    });

const PLATFORM: NotificationDefinition[] = [
    // Kural onemi params.level ile gelir; kritik: anlik e-posta (ADR-0029 §2.2).
    defineNotification({
        code: 'PLATFORM_ALERT_FIRING', category: 'system', severity: (p) => (p.level === 'critical' ? 'critical' : 'warning'), severities: ['warning', 'critical'],
        mandatory: false, defaultChannels: { inApp: true, email: 'instant' }, audience: { permission: 'app:use', fallbackMinTier: 'owner' },
        params: z.object({ ruleId: code(), alertId: id(), level: z.enum(['warning', 'critical']) }).strict(), retention: 'standard', surface: 'platform',
        example: { ruleId: 'R1', alertId: 'AL-1', level: 'critical' },
    }),
    platformAlert('PLATFORM_ALERT_RESOLVED', 'info', 'digest', { ruleId: code(), alertId: id() }, { ruleId: 'R1', alertId: 'AL-1' }),
    platformAlert('PLATFORM_ALERT_DIGEST', 'warning', 'instant', { newAlertCount: num() }, { newAlertCount: 8 }),
    platformAlert('PLATFORM_DELIVERY_DEAD_LETTERS', 'warning', 'digest', { deadCount: num() }, { deadCount: 12 }),
    defineNotification({
        code: 'PLATFORM_COMPLIANCE_FINDING', category: 'system', severity: (p) => (p.level === 'warning' ? 'warning' : 'info'), severities: ['info', 'warning'],
        mandatory: false, defaultChannels: { inApp: true, email: 'digest' }, audience: { permission: 'app:use', fallbackMinTier: 'owner' },
        params: z.object({ findingId: id(), integ: code(), level: z.enum(['info', 'warning']) }).strict(), retention: 'standard', surface: 'platform',
        example: { findingId: 'F-2', integ: 'trendyol', level: 'info' },
    }),
];

// sendClientNotification koprusu (ADR-0029 Karar 9): duz title/message'a izin verilen TEK aile; goc bitince kaldirilir.
const LEGACY_TYPES = ['BATCH_PROCESS', 'ORDER', 'STOCK_ALERT', 'INFO', 'SYSTEM', 'EXPORT_READY', 'IMPORT_READY'] as const;
const LEGACY_CATEGORY = { BATCH_PROCESS: 'catalog', ORDER: 'order', STOCK_ALERT: 'stock', INFO: 'system', SYSTEM: 'system', EXPORT_READY: 'catalog', IMPORT_READY: 'catalog' } as const;
const LEGACY: NotificationDefinition[] = LEGACY_TYPES.map((t) => defineNotification({
    code: `LEGACY_${t}`, category: LEGACY_CATEGORY[t], severity: 'info', severities: ['info', 'success', 'warning', 'error', 'critical'], mandatory: false,
    defaultChannels: { inApp: true, email: 'off' }, audience: { permission: 'app:use', fallbackMinTier: 'member' },
    params: z.object({ title: z.string().min(1).max(200), message: z.string().min(1).max(1000) }).passthrough(),
    retention: 'standard', surface: 'tenant', legacy: true, legacyType: t, example: { title: 'Baslik', message: 'Ileti' },
}));

/** Kod -> tanim. Yalniz v1 katalogu (LEGACY_* haric); `getDefinition` ikisini de cozer. */
export const NOTIFICATION_CATALOG: ReadonlyArray<NotificationDefinition> = Object.freeze([...TENANT, ...PLATFORM]);
export const LEGACY_CATALOG: ReadonlyArray<NotificationDefinition> = Object.freeze(LEGACY);
const BY_CODE = new Map<string, NotificationDefinition>([...NOTIFICATION_CATALOG, ...LEGACY_CATALOG].map((d) => [d.code, d]));
/** Kalici takma adlar: eski kod -> guncel kod (kod yeniden adlandirma yalniz burada). */
export const CODE_ALIASES: Readonly<Record<string, string>> = Object.freeze({});

export function getDefinition(c: string): NotificationDefinition | undefined {
    return BY_CODE.get(CODE_ALIASES[c] ?? c);
}

/** FE ve backoffice icin katalog gorunumu (params semasi/fonksiyonlar HARIC). */
export function getCatalogDto(surface?: 'tenant' | 'platform'): NotificationCatalogDto[] {
    return [...NOTIFICATION_CATALOG, ...LEGACY_CATALOG].filter((d) => !surface || d.surface === surface).map((d) => ({
        code: d.code, category: d.category, severities: [...d.severities], mandatory: d.mandatory, defaultChannels: d.defaultChannels,
        permission: d.audience.permission, retention: d.retention, surface: d.surface, titleKey: d.template.titleKey, bodyKey: d.template.bodyKey,
        grouped: !!d.group, legacy: !!d.legacy,
    }));
}
