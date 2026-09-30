// [Backoffice B2/B4] Abonelik/gelir/tenant yaşam döngüsü gövde şemaları (SAF zod). Üst düzey `strictBody`: bilinmeyen alan 400 VALIDATION.
// `reason` (>=10 karakter) step-up katmanında (`admin/stepUp.ts requireReason`) ayrıca doğrulanır; burada yalnız üst sınır.
import { z } from 'zod';
import { strictBody } from './common';
import type { RpcRef } from '../types';

const tid = z.number().int().positive().max(2_000_000_000);
const reason = z.string().min(1).max(500);
const planCode = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export const SUBSCRIPTION_STATUS_VALUES = ['trialing', 'active', 'past_due', 'suspended', 'canceled', 'expired'] as const;

export const BACKOFFICE_BILLING_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    'BackofficeBillingService/listSubscriptions': strictBody({
        status: z.enum(SUBSCRIPTION_STATUS_VALUES).optional(), planCode: planCode.optional(), cursor: z.string().min(1).max(100).optional(), limit: z.number().int().min(1).max(200).optional(),
    }),
    'BackofficeBillingService/getSubscription': strictBody({ tid }),
    'BackofficeBillingService/extendTrial': strictBody({ tid, days: z.number().int().min(1).max(30), reason }),
    'BackofficeBillingService/cancelSubscription': strictBody({ tid, atPeriodEnd: z.boolean(), reason }),
    'BackofficeBillingService/changePlan': strictBody({ tid, planCode, reason }),
    'BackofficeBillingService/getRevenueMetrics': strictBody({ range: z.enum(['7d', '30d', '90d']).optional() }),
    'BackofficeTenantService/getLifecycle': strictBody({ tid }),
    'BackofficeTenantService/cancelDeletion': strictBody({ tid, reason }),
};
