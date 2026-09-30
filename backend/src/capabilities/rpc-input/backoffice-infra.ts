// B5/B6/B6b + B8a-d + B9 gövde şemaları (SAF zod). Üst düzey `strictBody`: bilinmeyen alan 400 VALIDATION. `reason` anlamsal alt sınırı (>=10) step-up'ta (admin/stepUp.ts).
import { z } from 'zod';
import { strictBody } from './common';
import type { RpcRef } from '../types';

const code = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const limit = z.number().int().min(1).max(200);
const cursor = z.string().min(1).max(100);

export const BACKOFFICE_INFRA_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    'BackofficeIntegrationService/getApiHealth': strictBody({ integrationCode: code.optional(), range: z.enum(['1h', '24h', '7d']) }),
    'BackofficeIntegrationService/getResilienceState': strictBody({}),
    'IntegrationConfigService/getCatalog': strictBody({ target: z.string().min(1).max(100).optional() }),
    'BackofficeInfraService/getRedisStatus': strictBody({}),
    'BackofficeInfraService/getMongoStatus': strictBody({}),
    'BackofficeInfraService/getMongoCollections': strictBody({ db: z.union([z.literal('app'), z.number().int().positive().max(2_000_000_000)]), cursor: cursor.optional(), limit: limit.optional() }),
    'BackofficeInfraService/getSlowQueries': strictBody({ range: z.enum(['1h', '24h', '7d', '30d']) }),
    'BackofficeInfraService/getCacheMetrics': strictBody({}),
    'BackofficeInfraService/flushCacheFamily': strictBody({ family: z.string().regex(/^[A-Za-z0-9_.-]{1,120}$/), reason: z.string().min(1).max(500) }),
};
