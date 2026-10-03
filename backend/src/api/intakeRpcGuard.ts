// [ADR-0030 X6-b] Kullanıcı tetiklemeli dış çağrı RPC'lerinin acil durdurma (intake) kapısı. RunOperation'ın tek kancası.
// Kapsam = yetenek kaydı `external === true` VE alan pazaryeri/entegrasyon çağrısı yapan etki alanları (hesap/faturalama
// e-postası ve ödeme sağlayıcı çağrıları motorun kill-switch'i kapsamı DEĞİL). Ayrı RPC listesi tutulmaz.
// Durum: kod girdiden (integrationCode/selectedIntegrations), yoksa [X6-c] kayıt kimliğinden (yalnız bir entegrasyon kısıtlıyken tek sorgu) çözülür; çözülemezse yalnız global _engine.
//  - `off`   : okuma dahil tüm dış çağrılar 503 INTEGRATION_PAUSED.
//  - `drain` : `effect !== 'read'` (yeni dış etkili yazma) reddedilir; okumalar geçer.
import { CAPABILITY_BY_RPC } from '../capabilities';
import type { Domain } from '../capabilities/types';
import { ApplicationError } from '@platform/core/errors/ApplicationError';
import { effectiveIntake, recordIntakeSkip } from '@integration/config/intakeGate';
import { listNonOpenIntakeTargets, type IntakeValue } from '@integration/config/platformOverrideStore';
import { ENGINE_TARGET } from '@integration/config/targets';
import { eventLog } from '@platform/core/logger';
import { ObjectId } from 'mongodb';

const log = eventLog('engine', 'intakeRpcGuard');

const ENGINE_DOMAINS: ReadonlySet<Domain> = new Set<Domain>(['integrations', 'orders', 'claims', 'invoices', 'shipments', 'messages', 'catalog', 'customers', 'finance']);
const RANK: Record<IntakeValue, number> = { on: 0, drain: 1, off: 2 };

/** Girdiden entegrasyon kodları: `integrationCode` (tek) ve `selectedIntegrations` (liste). Çözülemezse boş. */
export function resolveIntegrationCodes(request: any): string[] {
    const out: string[] = [];
    if (typeof request?.integrationCode === 'string' && request.integrationCode) out.push(request.integrationCode);
    if (Array.isArray(request?.selectedIntegrations)) for (const c of request.selectedIntegrations) if (typeof c === 'string' && c) out.push(c);
    return out;
}

export function isIntakeGatedRpc(service: string, operation: string): { gated: boolean; effect?: string } {
    const cap = CAPABILITY_BY_RPC.get(service + '/' + operation);
    if (!cap || cap.external !== true || !ENGINE_DOMAINS.has(cap.domain)) return { gated: false };
    return { gated: true, effect: cap.effect };
}

/** [X6-c] Girdideki kayıt kimlikleri hangi koleksiyondan çözülür (sipariş/iade/fatura/mesaj; sevk kaydı = sipariş). */
export type IdKind = 'order' | 'claim' | 'invoice' | 'message';
const ID_FIELDS: ReadonlyArray<[string, IdKind]> = [
    ['orderId', 'order'], ['orderIds', 'order'], ['shipmentId', 'order'], ['shipmentIds', 'order'],
    ['claimId', 'claim'], ['claimIds', 'claim'], ['invoiceId', 'invoice'], ['invoiceIds', 'invoice'],
    ['messageId', 'message'], ['messageIds', 'message'],
];
const MAX_IDS = 500;

/** Yalnız string (24 hex) veya ObjectId kabul edilir; operatör nesnesi/başka tür yok sayılır. */
function toObjectId(v: unknown): ObjectId | undefined {
    if (v instanceof ObjectId) return v;
    if (typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v)) return new ObjectId(v);
    return undefined;
}

export function extractRecordIds(request: any): Partial<Record<IdKind, ObjectId[]>> {
    const out: Partial<Record<IdKind, ObjectId[]>> = {};
    for (const [field, kind] of ID_FIELDS) {
        const raw = request?.[field];
        const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
        for (const v of list.slice(0, MAX_IDS)) {
            const id = toObjectId(v);
            if (id) (out[kind] ??= []).push(id);
        }
    }
    return out;
}

export type RecordCodeResolver = (tenantId: number, ids: Partial<Record<IdKind, ObjectId[]>>) => Promise<string[]>;

/** Varsayılan çözücü: tenant DB'de koleksiyon başına tek hafif sorgu (`_id $in`, projeksiyon `integrationCode`). */
const dbResolver: RecordCodeResolver = async (tenantId, ids) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- TS6-01: node16 CJS, tembel yukleme (dinamik import yerine)
    const { DatabaseManagerInstance } = (require('@database/DatabaseManager') as typeof import('@database/DatabaseManager'));
    const db: any = await DatabaseManagerInstance.getClientDB(tenantId);
    if (!db) throw new Error('tenant DB yok');
    const models: Record<IdKind, () => any> = {
        order: () => db.getOrderModel(), claim: () => db.getClaimModel(), invoice: () => db.getInvoiceModel(), message: () => db.getMessageModel(),
    };
    const codes = new Set<string>();
    for (const kind of Object.keys(ids) as IdKind[]) {
        const list = ids[kind]; if (!list?.length) continue;
        const rows: any[] = await models[kind]().find({ _id: { $in: list } }, { integrationCode: 1 }).lean();
        for (const r of rows) if (typeof r?.integrationCode === 'string' && r.integrationCode) codes.add(r.integrationCode);
    }
    return [...codes];
};

/** Kapalıysa 503 INTEGRATION_PAUSED fırlatır; aksi halde sessizce döner. Gözlem asla akışı bozmaz. */
export async function enforceIntakeForRpc(service: string, operation: string, request: any, surface?: string, tenantId?: number, resolver: RecordCodeResolver = dbResolver): Promise<void> {
    if (surface === 'backoffice') return;
    const { gated, effect } = isIntakeGatedRpc(service, operation);
    if (!gated) return;
    const codes = resolveIntegrationCodes(request);
    check(codes, effect);
    if (codes.length) return; // kod girdide var: DB'ye gerek yok
    // [X6-c] Kayıttan kod çözümü yalnız EN AZ BİR entegrasyon kısıtlıyken (sıcak yol: bellek haritası, DB yok).
    const restricted = listNonOpenIntakeTargets().filter(t => t.target !== ENGINE_TARGET);
    if (!restricted.length || !tenantId) return;
    if (effect === 'read' && restricted.every(t => t.intake === 'drain')) return; // okuma drain'de zaten geçer
    const ids = extractRecordIds(request);
    if (!Object.keys(ids).length) return;
    let resolved: string[];
    try {
        resolved = await resolver(tenantId, ids);
    } catch (e: any) {
        // Fail-open DEĞİL, fail-soft: mevcut (X6-b) davranış korunur (yalnız global _engine); kesinti kullanıcıyı kilitlemesin, uyarı izi bırakılır.
        log.warn('INTAKE_RESOLVE_FAILED', 'Kayıttan entegrasyon kodu çözülemedi; yalnız global _engine uygulandı.', { operation: service + '/' + operation, error: String(e?.message ?? e) });
        return;
    }
    check(resolved, effect);
}

function check(codes: string[], effect: string | undefined): void {
    let state: IntakeValue = 'on';
    let blamed: string | undefined;
    for (const c of codes.length ? codes : [undefined]) {
        const s = effectiveIntake(c);
        if (RANK[s] > RANK[state]) { state = s; blamed = c; }
    }
    if (state === 'on') return;
    if (state === 'drain' && effect === 'read') return;
    recordIntakeSkip('rpc', blamed, 'new');
    throw new ApplicationError('Bu entegrasyon geçici olarak durduruldu.', 503, 'INTEGRATION_PAUSED');
}
