// B1 + B7a-d gövde şemaları (SAF zod). Üst düzey `strictBody`: bilinmeyen alan 400 VALIDATION. `reason` anlamsal alt sınırı (>=10) RunOperation/step-up'ta (admin/stepUp.ts requireReason).
import { z } from 'zod';
import { strictBody } from './common';
import type { RpcRef } from '../types';

// [eslesme-fiyat WP7a] Sipariş kuyrukları: eski `order-sync-queue` + kanal başına `order-sync-<kod>` (orderQueues.ts ile aynı küme).
const queue = z.enum(['order-sync-queue', 'order-sync-trendyol', 'order-sync-hepsiburada', 'order-sync-n11', 'order-sync-pazarama', 'order-sync-ideasoft', 'order-sync-bizimhesap', 'order-sync-other']);
const cursor = z.string().min(1).max(100);
const limit = z.number().int().min(1).max(200);
const reason = z.string().min(1).max(500);
const jobId = z.string().regex(/^[A-Za-z0-9:_.-]{1,128}$/);
const leaseId = z.string().regex(/^[a-f0-9]{24}$/i);

export const BACKOFFICE_ENGINE_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    'BackofficeOverviewService/getHealth': strictBody({}),
    'BackofficeEngineService/getQueues': strictBody({}),
    'BackofficeEngineService/listFailedJobs': strictBody({
        queue, source: z.enum(['bullmq', 'dlq']).optional(), cursor: cursor.optional(), limit: limit.optional(),
        tid: z.number().int().positive().max(2_000_000_000).optional(), integrationCode: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(), errorCode: z.string().regex(/^[A-Z_]{2,32}$/).optional(),
    }),
    'BackofficeEngineService/retryJobs': strictBody({ queue, jobIds: z.array(jobId).min(1).max(50), reason }),
    'BackofficeEngineService/retryJob': strictBody({ queue, jobId, reason }),
    'BackofficeEngineService/discardJob': strictBody({ queue, jobId, reason }),
    'BackofficeEngineService/getStateMachineJobs': strictBody({}),
    'BackofficeEngineService/releaseStuckLease': strictBody({ kind: z.enum(['export', 'import']), id: leaseId, reason }),
    'BackofficeEngineService/listJobRuns': strictBody({
        job: z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/).optional(), status: z.enum(['ok', 'partial', 'failed', 'skipped']).optional(), cursor: cursor.optional(), limit: limit.optional(),
    }),
};
