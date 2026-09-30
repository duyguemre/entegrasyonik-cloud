import { IService } from '@interfaces/index'
import { BaseApi } from '../BaseApi'
import { getIssueGroups, getIssueTrend, getTrace, getVolumeByCategory, listLogs } from '@platform/runtime/logs'
import { asValidation, auditSensitiveRead, dateOf, truncateLogEntry } from './backoffice-support'

/**
 * ADR-0026 WP-LOG L2 -- `/admin-api` log kontrol merkezi (yalnız platformAdmin; kademe RunOperation'da). L1 `@platform/runtime/logs` üzerine ince sarmalayıcı:
 * gövde zod şemasından (`rpc-input/backoffice.ts`) geçmiştir; L1 `LogQueryError` -> 400 VALIDATION. Ayrıntı/sözleşme: docs/API_BACKOFFICE_LOGS_AUDIT.md.
 * Denetim: `list` ve `trace` (kiracı log içeriği) çağrı başına TEK `backoffice.sensitive_read`; agregat uçlar yazılmaz.
 */
export default class BackofficeLogService extends BaseApi implements IService {
    async get(): Promise<any> { /* IService gereksinimi */ }

    async list(): Promise<any> {
        const r = this.request || {}
        const { cursor, from, to, ...rest } = r
        const filters = { ...pick(rest, ['level', 'source', 'errorClass', 'tenantId', 'integrationCode', 'operation', 'correlationId', 'fingerprint', 'textPrefix', 'limit']), from: dateOf(from), to: dateOf(to) }
        const page = await asValidation(() => listLogs(filters, cursor))
        auditSensitiveRead(this.request, 'BackofficeLogService', 'list', { ...filters, from, to }, page.items.length)
        return { items: page.items.map(truncateLogEntry), nextCursor: page.nextCursor ?? null }
    }

    async issueGroups(): Promise<any> {
        const { from, to, ...rest } = this.request || {}
        const groups = await asValidation(() => getIssueGroups({ ...pick(rest, ['status', 'source', 'module', 'integrationCode', 'sort', 'limit']), from: dateOf(from), to: dateOf(to) }))
        return { items: groups.map(truncateLogEntry) }
    }

    async issueTrend(): Promise<any> {
        const { fingerprint, from, to } = this.request || {}
        return { points: await asValidation(() => getIssueTrend(fingerprint, { from: dateOf(from), to: dateOf(to) })) }
    }

    async trace(): Promise<any> {
        const { correlationId } = this.request || {}
        const items = await asValidation(() => getTrace(correlationId))
        auditSensitiveRead(this.request, 'BackofficeLogService', 'trace', { correlationId }, items.length)
        return { items: items.map(truncateLogEntry) }
    }

    async volume(): Promise<any> {
        const { from, to } = this.request || {}
        return { items: await asValidation(() => getVolumeByCategory({ from: dateOf(from), to: dateOf(to) })) }
    }
}

function pick(o: Record<string, any>, keys: string[]): Record<string, any> {
    const out: Record<string, any> = {}
    for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
    return out
}
