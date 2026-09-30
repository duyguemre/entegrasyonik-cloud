// B1 + B7a-d gövde şemaları (SAF zod). Üst düzey `strictBody`: bilinmeyen alan 400 VALIDATION. `reason` anlamsal alt sınırı (>=10) RunOperation/step-up'ta (admin/stepUp.ts requireReason).
import { z } from 'zod';
import { strictBody } from './common';
import type { RpcRef } from '../types';

const queue = z.enum(['order-sync-queue']);
const cursor = z.string().min(1).max(100);
const limit = z.number().int().min(1).max(200);
const reason = z.string().min(1).max(500);
const jobId = z.string().regex(/^[A-Za-z0-9:_.-]{1,128}$/);
const leaseId = z.string().regex(/^[a-f0-9]{24}$/i);

export const BACKOFFICE_ENGINE_RPC_INPUT: Partial<Record<RpcRef, z.ZodType<any>>> = {
    'BackofficeOverviewService/getHealth': strictBody({}),
    'BackofficeEngineService/getQueues': strictBody({}),
    'BackofficeEngineService/listFailedJobs': strictBody({ queue, source: z.enum(['bullmq', 'dlq']).optional(), cursor: cursor.optional(), limit: limit.optional() }),
    'BackofficeEngineService/retryJob': strictBody({ queue, jobId, reason }),
    'BackofficeEngineService/discardJob': strictBody({ queue, jobId, reason }),
    'BackofficeEngineService/getStateMachineJobs': strictBody({}),
    'BackofficeEngineService/releaseStuckLease': strictBody({ kind: z.enum(['export', 'import']), id: leaseId, reason }),
    'BackofficeEngineService/listJobRuns': strictBody({
        job: z.string().regex(/^[A-Za-z0-9_.:-]{1,100}$/).optional(), status: z.enum(['ok', 'partial', 'failed', 'skipped']).optional(), cursor: cursor.optional(), limit: limit.optional(),
    }),
};
