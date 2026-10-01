// K51 (BO1) gövde şemaları (SAF zod): dashboard (getAttention/getPulse), müşteri operasyon özeti (BE-01/02), kayıtlı görünümler (BE-05).
// Üst düzey `strictBody`: bilinmeyen alan 400 VALIDATION. Sözleşme: docs/API_BACKOFFICE_ATTENTION.md.
import { z } from 'zod';
import { strictBody } from './common';
import type { RpcRef } from '../types';

const tid = z.number().int().positive().max(2_000_000_000);
const cursor = z.string().min(1).max(100);
const limit = z.number().int().min(1).max(200);
const SUB_STATUS = z.enum(['trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired']);

/** NT-03 URL süzgeç modeli: ≤ 20 anahtar, değer string ya da ≤ 20 string; `$`/`.` içeren anahtar yok. */
const viewKey = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/);
const viewVal = z.string().max(200);
export const viewQuery = z.record(viewKey, z.union([viewVal, z.array(viewVal).max(20)]))
    .refine((o) => Object.keys(o).length <= 20, { message: 'query: en fazla 20 anahtar' });

export const BACKOFFICE_ATTENTION_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    'BackofficeOverviewService/getAttention': strictBody({ limit: z.number().int().min(1).max(50).optional() }),
    'BackofficeOverviewService/getPulse': strictBody({}),
    'BackofficeTenantService/listTenants': strictBody({
        hasIssues: z.boolean().optional(), subscriptionStatus: z.array(SUB_STATUS).min(1).max(6).optional(),
        status: z.array(z.string().regex(/^[A-Z_]{2,40}$/)).min(1).max(10).optional(), q: z.string().min(1).max(60).optional(),
        sortBy: z.enum(['tid', 'name', 'openIssues', 'lastErrorAt', 'failedJobs24h']).optional(), sortDir: z.enum(['asc', 'desc']).optional(),
        cursor: cursor.optional(), limit: limit.optional(),
    }),
    'BackofficeTenantService/getHealthSummary': strictBody({ tid }),
    'BackofficePrefsService/listViews': strictBody({ screen: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/).optional() }),
    'BackofficePrefsService/saveView': strictBody({ screen: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/), name: z.string().trim().min(1).max(60), query: viewQuery }),
    'BackofficePrefsService/deleteView': strictBody({ id: z.string().regex(/^[a-f0-9]{24}$/i) }),
};
