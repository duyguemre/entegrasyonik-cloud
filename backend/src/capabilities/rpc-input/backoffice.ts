// [ADR-0026 WP-LOG L2] Backoffice log kontrol merkezi + denetim ekranı gövde şemaları (SAF zod). Üst düzey `strictBody`: bilinmeyen alan 400 VALIDATION.
// Anlamsal sınırlar (aralık <=31 gün, sayfa <=200, önek araması) L1 `logQuery` / servis içinde ayrıca uygulanır.
import { z } from 'zod';
import { strictBody } from './common';
import type { RpcRef } from '../types';

const iso = z.string().min(10).max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'geçersiz tarih');
const str = z.string().min(1).max(256);
const strList = z.array(str).max(20);
const range = { from: iso.optional(), to: iso.optional() };
const cursor = z.string().min(1).max(100);
const limit = z.number().int().min(1).max(200);

const adminSub = z.string().regex(/^[a-f0-9]{24}$/i);
const adminReason = z.string().min(1).max(500); // anlamsal alt sınır (>=10) requireReason'da (admin/stepUp.ts)

export const ERROR_STATUS_VALUES = ['open', 'acknowledged', 'resolved', 'muted'] as const;

export const BACKOFFICE_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    'BackofficeLogService/list': strictBody({
        ...range, level: strList.optional(), source: strList.optional(), errorClass: strList.optional(),
        tenantId: z.number().int().positive().max(2_000_000_000).optional(), integrationCode: str.optional(), operation: str.optional(),
        correlationId: str.optional(), fingerprint: str.optional(), textPrefix: str.optional(), limit: limit.optional(), cursor: cursor.optional(),
    }),
    'BackofficeLogService/issueGroups': strictBody({
        ...range, status: z.enum(ERROR_STATUS_VALUES).optional(), source: z.enum(['server', 'client']).optional(), module: str.optional(),
        integrationCode: str.optional(), sort: z.enum(['lastSeen', 'count', 'tenantCount', 'firstSeen']).optional(), limit: limit.optional(),
    }),
    'BackofficeLogService/issueTrend': strictBody({ fingerprint: str, ...range }),
    'BackofficeLogService/trace': strictBody({ correlationId: str }),
    'BackofficeLogService/volume': strictBody({ ...range }),
    'BackofficeErrorService/setStatus': strictBody({ fingerprint: str, status: z.enum(ERROR_STATUS_VALUES) }),
    // B12: yönetici yönetimi (hepsi step-up + gerekçe ister; `reason` gövdede zorunlu)
    'BackofficeAdminUserService/list': strictBody({}),
    'BackofficeAdminUserService/invite': strictBody({ email: z.string().max(254).email(), reason: adminReason }),
    'BackofficeAdminUserService/disable': strictBody({ sub: adminSub, reason: adminReason }),
    'BackofficeAdminUserService/enable': strictBody({ sub: adminSub, reason: adminReason }),
    'BackofficeAdminUserService/resetMfa': strictBody({ sub: adminSub, reason: adminReason }),
    'BackofficeAuditService/list': strictBody({
        ...range, tid: z.number().int().positive().max(2_000_000_000).optional(), event: z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/).optional(),
        actor: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(), imp: z.boolean().optional(), result: z.enum(['ok', 'fail', 'error']).optional(),
        service: z.string().regex(/^[A-Za-z0-9_]{1,64}$/).optional(), operation: z.string().regex(/^[A-Za-z0-9_]{1,64}$/).optional(),
        limit: limit.optional(), cursor: cursor.optional(),
    }),
};
