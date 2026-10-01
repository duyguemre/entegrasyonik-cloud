// K51 (BO1): "dikkat gerektirenler" -- sistem + müşteriler, öncelik sıralı, önerilen eylemlerle. SAF: kaynaklar (mevcut servis/operasyonlar) ENJEKTE edilir;
// DB/Redis'e yeni bağlantı AÇMAZ. Her kontrol bölümü `sectionTimeoutMs` (2 sn) içinde bitmezse ya da hata verirse `degradedSections`'a girer, uç düşmez
// (okunamayan kontrol "sorun yok" demek DEĞİLDİR). Tenant iş verisi/PII dönmez: yalnız tid + başlık, sayaçlar, kodlar. Sözleşme: docs/API_BACKOFFICE_ATTENTION.md.
import { guard, SECTION_TIMEOUT_MS, type SectionError } from '../../operations/backoffice/guarded';

export type Severity = 'critical' | 'warning' | 'info';
export type AttentionGroup = 'system' | 'customers';
export interface Subject { tid: number; name: string | null }
export interface AttentionAction {
    label: string;
    kind: 'navigate' | 'action';
    target?: { route: string; query?: Record<string, string> };
    capabilityId?: string;
}
export interface AttentionItem {
    id: string; group: AttentionGroup; severity: Severity; title: string; why: string;
    count: number | null; countUnit: string | null; impact: string | null; since: string | null; subjects: Subject[]; actions: AttentionAction[];
}
type Weighted = AttentionItem & { weight: number };

// ---- eşikler (sunucu sabiti; operations/alerts/alertRules.ts ile hizalı) --------------------------------------------------------------------------
export const T = {
    queueBacklogWarn: 200, queueBacklogCrit: 1000, queueFailedWarn: 1, queueFailedCrit: 25, dlqWarn: 1, dlqCrit: 10,
    apiMinCalls: 20, apiWarn: 0.2, apiCrit: 0.5,
    leaseWarn: 1, leaseCrit: 10,
    http5xxMinRequests: 50, http5xxWarn: 0.05, http5xxCrit: 0.2,
    slowMinCount: 50, slowBurstFactor: 3, slowCrit: 500,
    syncLagWarnMs: 6 * 3_600_000, syncLagCritMs: 24 * 3_600_000,
    trialDays: 3, trialCritDays: 1, graceCritDays: 2, purgeWarnDays: 3,
    ticketWarnMs: 24 * 3_600_000, ticketCritMs: 72 * 3_600_000,
} as const;
const DAY_MS = 86_400_000;
const SUBJECTS_MAX = 5;
export const DEFAULT_GROUP_LIMIT = 20;
export const MAX_GROUP_LIMIT = 50;

// ---- kaynak sözleşmeleri --------------------------------------------------------------------------------------------------------------------------
export interface QueueRow { name: string; available: boolean; backlog: number | null; failed: number | null; dlqPending: number | null }
export interface CircuitRow { integrationCode: string; open: number; halfOpen: number; lastOpenedAt: string | null }
export interface ApiHealthRowLite { integrationCode: string; total: number; errors: number; errorRate: number }
export interface InfraSnapshot { ready: boolean; mongo: string; redis: string; degradedSections: string[]; red: { requests: number; errors5xx: number; errorRate: number | null } | null }
export interface AlertRowLite { ruleId: string; scopeKey: string; level: 'warning' | 'critical'; detail: Record<string, any>; firstFiredAt: Date | string | null }
export interface TenantAt { tid: number; name: string | null; at: Date | null }

export interface AttentionSources {
    queues(): Promise<QueueRow[]>;
    circuits(): Promise<CircuitRow[]>;
    apiHealth(): Promise<ApiHealthRowLite[]>;
    leases(): Promise<{ count: number; oldestAt: string | null }>;
    infra(): Promise<InfraSnapshot>;
    alerts(): Promise<AlertRowLite[]>;
    slowQueries(): Promise<{ last1h: number; prev23hAvgPerHour: number; firstAt?: string | null }>;
    orderSync(): Promise<TenantAt[]>;       // ACTIVE tenant; at = lastSuccessfulOrderSync (>= 6 sa önce), eskiden yeniye
    trialEnding(): Promise<TenantAt[]>;     // trialing; at = trialEndsAt (<= şimdi + 3 gün)
    suspended(): Promise<TenantAt[]>;       // suspended; at = updatedAt
    pastDue(): Promise<Array<TenantAt & { graceUntil: Date | null }>>;
    deletionPending(): Promise<TenantAt[]>; // at = deletionScheduledAt
    lifecycleFailed(): Promise<Array<TenantAt & { status: string }>>;
    tickets(): Promise<Array<TenantAt & { count?: number }>>; // açık/işlemde talep; at = createdAt (en eski önce); tenant başına en eski talep
    tenantNames(tids: number[]): Promise<Map<number, string | null>>;
}

export interface AttentionDeps { sources: AttentionSources; now?: () => number; sectionTimeoutMs?: number }

const SEV_RANK: Record<Severity, number> = { critical: 3, warning: 2, info: 1 };
const nav = (label: string, route: string, query?: Record<string, string>): AttentionAction => ({ label, kind: 'navigate', target: query ? { route, query } : { route } });
const act = (label: string, capabilityId: string): AttentionAction => ({ label, kind: 'action', capabilityId });
const iso = (v: Date | string | number | null | undefined): string | null => { if (v === null || v === undefined) return null; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };
const n0 = (v: number | null | undefined) => v ?? 0;
const code = (s: string): string => s.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64);
const pct = (r: number) => `%${Math.round(r * 100)}`;
const tr = (n: number) => n.toLocaleString('tr-TR');

function item(p: Omit<AttentionItem, 'subjects' | 'impact' | 'countUnit' | 'since' | 'count'> & Partial<Pick<AttentionItem, 'subjects' | 'impact' | 'countUnit' | 'since' | 'count'>>, weight: number): Weighted {
    return { subjects: [], impact: null, countUnit: null, since: null, count: null, ...p, weight };
}

export class AttentionOps {
    private readonly now: () => number;
    private readonly ms: number;
    constructor(private readonly d: AttentionDeps) { this.now = d.now ?? Date.now; this.ms = d.sectionTimeoutMs ?? SECTION_TIMEOUT_MS; }

    async getAttention(limitInput?: number): Promise<any> {
        const limit = Math.min(MAX_GROUP_LIMIT, Math.max(1, Number.isInteger(limitInput) ? limitInput! : DEFAULT_GROUP_LIMIT));
        const nowMs = this.now();
        const s = this.d.sources;
        const run = <T>(section: string, fn: () => Promise<T>) => guard(this.ms, fn).then((g) => ({ section, g }));

        const [queues, circuits, apiHealth, leases, infra, alerts, slow, orderSync, trial, susp, pastDue, delPend, lcFail, tickets] = await Promise.all([
            run('queues', s.queues), run('circuits', s.circuits), run('apiHealth', s.apiHealth), run('leases', s.leases), run('infra', s.infra),
            run('alerts', s.alerts), run('slowQueries', s.slowQueries), run('orderSync', s.orderSync), run('trialEnding', s.trialEnding),
            run('suspended', s.suspended), run('pastDue', s.pastDue), run('deletionPending', s.deletionPending), run('lifecycleFailed', s.lifecycleFailed), run('tickets', s.tickets),
        ]);
        const degradedSections: Array<{ section: string; error: SectionError }> = [];
        const val = <T>(r: { section: string; g: { ok: true; value: T } | { ok: false; error: SectionError } }): T | null => {
            if (r.g.ok) return r.g.value;
            degradedSections.push({ section: r.section, error: r.g.error }); return null;
        };

        const sys: Weighted[] = [];
        const cus: Weighted[] = [];

        const q = val(queues); if (q) sys.push(...this.queueItems(q));
        const c = val(circuits); if (c) sys.push(...this.circuitItems(c));
        const a = val(apiHealth); if (a) sys.push(...this.apiItems(a, nowMs));
        const l = val(leases); if (l) sys.push(...this.leaseItems(l));
        const inf = val(infra); if (inf) sys.push(...this.infraItems(inf, nowMs));
        const sl = val(slow); if (sl) sys.push(...this.slowItems(sl, nowMs));
        const al = val(alerts);
        if (al) { sys.push(...this.systemAlertItems(al)); cus.push(...(await this.customerAlertItems(al))); }
        const os = val(orderSync); if (os) cus.push(...this.syncLagItems(os, nowMs));
        const tr_ = val(trial); if (tr_) cus.push(...this.trialItems(tr_, nowMs));
        const su = val(susp); if (su) cus.push(...this.suspendedItems(su));
        const pd = val(pastDue); if (pd) cus.push(...this.pastDueItems(pd, nowMs));
        const dp = val(delPend); if (dp) cus.push(...this.deletionItems(dp, nowMs));
        const lf = val(lcFail); if (lf) cus.push(...this.lifecycleFailedItems(lf));
        const tk = val(tickets); if (tk) cus.push(...this.ticketItems(tk, nowMs));

        await this.fillNames([...sys, ...cus]);
        const finish = (list: Weighted[]) => {
            const sorted = [...list].sort((x, y) => SEV_RANK[y.severity] - SEV_RANK[x.severity] || y.weight - x.weight
                || (x.since ?? '9999').localeCompare(y.since ?? '9999') || x.id.localeCompare(y.id));
            return { total: sorted.length, truncated: sorted.length > limit, items: sorted.slice(0, limit).map(({ weight: _w, ...rest }) => rest) };
        };
        const all = [...sys, ...cus];
        const summary = { critical: all.filter((i) => i.severity === 'critical').length, warning: all.filter((i) => i.severity === 'warning').length, info: all.filter((i) => i.severity === 'info').length };
        return {
            generatedAt: new Date(nowMs).toISOString(),
            status: degradedSections.length > 0 ? 'degraded' : all.length > 0 ? 'attention' : 'ok',
            summary, degradedSections,
            groups: { system: finish(sys), customers: finish(cus) },
        };
    }

    /** Ad eksik `subjects` için (alarm detail'inde yalnız tid var) tek toplu arama; hata olursa adlar null kalır. */
    private async fillNames(items: Weighted[]): Promise<void> {
        const missing = [...new Set(items.flatMap((i) => i.subjects.filter((s) => s.name === null).map((s) => s.tid)))];
        if (missing.length === 0) return;
        const g = await guard(this.ms, () => this.d.sources.tenantNames(missing));
        if (!g.ok) return;
        for (const i of items) for (const s of i.subjects) if (s.name === null) s.name = g.value.get(s.tid) ?? null;
    }

    // ---------------------------------------------------------------------------------------------------------------- SİSTEM
    private queueItems(rows: QueueRow[]): Weighted[] {
        const out: Weighted[] = [];
        for (const r of rows.slice(0, 20)) {
            const nm = code(r.name);
            if (!r.available) {
                out.push(item({ id: 'sys.queue.unavailable', group: 'system', severity: 'critical', title: 'Kuyruk okunamıyor', why: 'Redis hazır değil; kuyruk sayaçları alınamadı.', impact: 'Sipariş senkronu duruyor olabilir.', actions: [nav('Altyapıya git', '/altyapi')] }, 100));
                continue;
            }
            const backlog = n0(r.backlog), failed = n0(r.failed), dlq = n0(r.dlqPending);
            if (backlog >= T.queueBacklogWarn) out.push(item({
                id: `sys.queue.backlog:${nm}`, group: 'system', severity: backlog >= T.queueBacklogCrit ? 'critical' : 'warning', title: 'Kuyrukta birikim',
                why: `Bekleyen iş sayısı ${tr(backlog)}; işlenmeyi bekleyen iş eşiğin (${T.queueBacklogWarn}) üstünde.`, count: backlog, countUnit: 'iş', impact: 'Sipariş senkronu gecikiyor.',
                actions: [nav('Kuyruğa git', '/motor', { tab: 'queues' })],
            }, backlog));
            if (failed >= T.queueFailedWarn) out.push(item({
                id: `sys.queue.failed:${nm}`, group: 'system', severity: failed >= T.queueFailedCrit ? 'critical' : 'warning', title: 'Başarısız kuyruk işleri',
                why: `${tr(failed)} iş başarısız durumda; yeniden denenebilir.`, count: failed, countUnit: 'iş', impact: 'İlgili müşterilerin senkronu eksik kalabilir.',
                actions: [nav('Başarısız işlere git', '/motor', { tab: 'failed' }), act('Toplu yeniden dene', 'platform.engine.retry_jobs')],
            }, failed));
            if (dlq >= T.dlqWarn) out.push(item({
                id: `sys.queue.dlq:${nm}`, group: 'system', severity: dlq >= T.dlqCrit ? 'critical' : 'warning', title: 'Ölü mektup kuyruğunda bekleyen iş',
                why: `${tr(dlq)} iş elle inceleme bekliyor (deneme hakkı tükendi ya da kalıcı hata).`, count: dlq, countUnit: 'iş', impact: 'Bu işler kendiliğinden yeniden denenmez.',
                actions: [nav('Ölü mektuplara git', '/motor', { tab: 'failed', source: 'dlq' })],
            }, dlq));
        }
        return out;
    }

    private circuitItems(rows: CircuitRow[]): Weighted[] {
        const out: Weighted[] = [];
        for (const r of rows.slice(0, 50)) {
            if (r.open <= 0 && r.halfOpen <= 0) continue;
            const open = r.open > 0;
            out.push(item({
                id: `sys.circuit.open:${code(r.integrationCode)}`, group: 'system', severity: open ? 'critical' : 'warning', title: open ? 'Devre kesici açık' : 'Devre kesici deneme aşamasında',
                why: open ? `${code(r.integrationCode)} entegrasyonu için ${r.open} devre kesici açık; çağrılar engelleniyor.` : `${code(r.integrationCode)} entegrasyonunda devre kesici yarı açık (toparlanma deneniyor).`,
                count: open ? r.open : r.halfOpen, countUnit: 'pod', impact: open ? 'Bu entegrasyona giden çağrılar hızlı hata alıyor.' : null, since: iso(r.lastOpenedAt),
                actions: [nav('Dayanıklılık durumuna git', '/entegrasyonlar', { tab: 'resilience', integrationCode: code(r.integrationCode) })],
            }, open ? 90 + r.open : 10));
        }
        return out;
    }

    private apiItems(rows: ApiHealthRowLite[], _nowMs: number): Weighted[] {
        const out: Weighted[] = [];
        for (const r of rows.slice(0, 50)) {
            if (r.total < T.apiMinCalls || r.errorRate < T.apiWarn) continue;
            const crit = r.errorRate >= T.apiCrit;
            out.push(item({
                id: `sys.api.errorrate:${code(r.integrationCode)}`, group: 'system', severity: crit ? 'critical' : 'warning', title: 'Entegrasyon API hata oranı yüksek',
                why: `${code(r.integrationCode)} için son 1 saatte çağrıların ${pct(r.errorRate)} kadarı hata aldı (${tr(r.errors)}/${tr(r.total)}).`, count: r.errors, countUnit: 'çağrı',
                impact: 'Bu entegrasyonu kullanan müşterilerde senkron sorunu olabilir.',
                actions: [nav('API sağlığına git', '/entegrasyonlar', { tab: 'api-health', integrationCode: code(r.integrationCode), range: '1h' })],
            }, Math.round(r.errorRate * 100)));
        }
        return out;
    }

    private leaseItems(l: { count: number; oldestAt: string | null }): Weighted[] {
        if (l.count < T.leaseWarn) return [];
        return [item({
            id: 'sys.lease.stuck', group: 'system', severity: l.count >= T.leaseCrit ? 'critical' : 'warning', title: 'Takılı kira var',
            why: `${tr(l.count)} katalog işi sahibi pod tarafından bırakılmadan beklemede.`, count: l.count, countUnit: 'kayıt', impact: 'İlgili katalog senkronu ilerlemiyor.', since: l.oldestAt,
            actions: [nav('Durum makinesine git', '/motor', { tab: 'state-machine' }), act('Takılı kirayı bırak', 'platform.engine.release_stuck_lease')],
        }, l.count)];
    }

    private infraItems(i: InfraSnapshot, _nowMs: number): Weighted[] {
        const out: Weighted[] = [];
        const depDown = !i.ready || (i.mongo !== 'ok') || (i.redis !== 'ok' && i.redis !== 'n/a');
        if (depDown) {
            const which = [i.mongo !== 'ok' ? 'MongoDB' : null, i.redis !== 'ok' && i.redis !== 'n/a' ? 'Redis' : null].filter(Boolean).join(' ve ') || 'bağımlılık';
            out.push(item({ id: 'sys.infra.degraded', group: 'system', severity: 'critical', title: 'Altyapı bağımlılığı sağlıksız', why: `${which} hazır değil.`, impact: 'İstekler ve arka plan işleri etkilenebilir.', actions: [nav('Altyapıya git', '/altyapi')] }, 100));
        } else if (i.degradedSections.length > 0) {
            out.push(item({ id: 'sys.infra.degraded', group: 'system', severity: 'warning', title: 'Sağlık bölümü okunamadı', why: `Sağlık panosunda ${i.degradedSections.length} bölüm okunamadı (${i.degradedSections.slice(0, 4).map(code).join(', ')}).`, count: i.degradedSections.length, countUnit: 'kayıt', actions: [nav('Altyapıya git', '/altyapi')] }, 20));
        }
        const red = i.red;
        if (red && red.requests >= T.http5xxMinRequests && red.errorRate !== null && red.errorRate >= T.http5xxWarn) {
            out.push(item({
                id: 'sys.http.5xx', group: 'system', severity: red.errorRate >= T.http5xxCrit ? 'critical' : 'warning', title: 'Sunucu hata (5xx) oranı yüksek',
                why: `Son 1 saatte isteklerin ${pct(red.errorRate)} kadarı 5xx döndü (${tr(red.errors5xx)}/${tr(red.requests)}).`, count: red.errors5xx, countUnit: 'çağrı', impact: 'Kullanıcılar hata görüyor olabilir.',
                actions: [nav('Açık sorunlara git', '/loglar', { tab: 'issues', status: 'open' })],
            }, Math.round(red.errorRate * 100)));
        }
        return out;
    }

    private slowItems(sl: { last1h: number; prev23hAvgPerHour: number; firstAt?: string | null }, _nowMs: number): Weighted[] {
        const base = Math.max(1, sl.prev23hAvgPerHour);
        if (sl.last1h < T.slowMinCount || sl.last1h < T.slowBurstFactor * base) return [];
        return [item({
            id: 'sys.slowquery.burst', group: 'system', severity: sl.last1h >= T.slowCrit ? 'critical' : 'warning', title: 'Yavaş sorgu patlaması',
            why: `Son 1 saatte ${tr(sl.last1h)} yavaş sorgu (önceki saatlik ortalama ${tr(Math.round(sl.prev23hAvgPerHour))}).`, count: sl.last1h, countUnit: 'sorgu', impact: 'Yanıt süreleri uzayabilir.', since: sl.firstAt ?? null,
            actions: [nav('Yavaş sorgulara git', '/altyapi', { tab: 'slow-queries', range: '1h' })],
        }, sl.last1h)];
    }

    private systemAlertItems(rows: AlertRowLite[]): Weighted[] {
        // Tenant'a özgü uyarılar MÜŞTERİLER grubunda; devre (`circuit:*`, circuits kontrolü) ve kuyruk (R4, queues kontrolü) tekrar edilmez.
        const byRule = new Map<string, AlertRowLite[]>();
        for (const a of rows) {
            if (a.detail?.tid !== undefined) continue;
            if (a.scopeKey.startsWith('circuit:') || a.ruleId === 'R4') continue;
            byRule.set(a.ruleId, [...(byRule.get(a.ruleId) ?? []), a]);
        }
        return [...byRule.entries()].map(([ruleId, list]) => {
            const crit = list.some((a) => a.level === 'critical');
            const since = list.map((a) => iso(a.firstFiredAt)).filter((x): x is string => !!x).sort()[0] ?? null;
            return item({
                id: `sys.alert.firing:${code(ruleId)}`, group: 'system', severity: crit ? 'critical' : 'warning', title: 'Açık platform uyarısı', why: `${code(ruleId)} kuralı için ${list.length} uyarı açık ve susturulmamış.`,
                count: list.length, countUnit: 'uyarı', since, actions: [nav('Uyarılara git', '/bildirimler/uyarilar', { status: 'firing', ruleId: code(ruleId) }), act('Uyarıyı sustur', 'platform.alerts.mute')],
            }, list.length);
        });
    }

    // ---------------------------------------------------------------------------------------------------------------- MÜŞTERİLER
    private async customerAlertItems(rows: AlertRowLite[]): Promise<Weighted[]> {
        type K = { kind: 'integration' | 'auth' | 'other'; integ: string; ruleId: string };
        const groups = new Map<string, { k: K; list: AlertRowLite[] }>();
        for (const a of rows) {
            const tid = Number(a.detail?.tid);
            if (!Number.isInteger(tid) || tid <= 0) continue;
            const k: K = { kind: a.ruleId === 'R2' ? 'auth' : a.ruleId === 'R1' ? 'integration' : 'other', integ: code(String(a.detail?.integ ?? '')), ruleId: a.ruleId };
            const key = `${k.kind}:${k.kind === 'other' ? code(a.ruleId) : k.integ}`;
            const g = groups.get(key) ?? { k, list: [] }; g.list.push(a); groups.set(key, g);
        }
        const out: Weighted[] = [];
        for (const [key, g] of groups) {
            const tids = [...new Set(g.list.map((a) => Number(a.detail.tid)))];
            const crit = g.list.some((a) => a.level === 'critical');
            const since = g.list.map((a) => iso(a.firstFiredAt)).filter((x): x is string => !!x).sort()[0] ?? null;
            const subjects = tids.slice(0, SUBJECTS_MAX).map((tid) => ({ tid, name: null as string | null }));
            const target = tids.length === 1 ? nav('Müşteriye git', `/musteriler/${tids[0]}`) : nav('Sorunlu müşterilere git', '/musteriler', { hasIssues: '1' });
            const integName = g.k.integ || 'entegrasyon';
            if (g.k.kind === 'auth') out.push(item({
                id: `cus.integration.auth:${g.k.integ}`, group: 'customers', severity: 'critical', title: 'Entegrasyon kimlik hatası', why: `${tids.length} müşteride ${integName} kimlik bilgisi reddediliyor; müşterinin anahtarı yenilemesi gerekebilir.`,
                count: tids.length, countUnit: 'müşteri', impact: 'Bu müşterilerde senkron çalışmıyor.', since, subjects, actions: [target],
            }, 50 + tids.length));
            else if (g.k.kind === 'integration') out.push(item({
                id: `cus.integration.error:${g.k.integ}`, group: 'customers', severity: crit ? 'critical' : 'warning', title: 'Entegrasyon hata oranı yüksek', why: `${tids.length} müşteride ${integName} çağrılarının önemli bölümü hata alıyor.`,
                count: tids.length, countUnit: 'müşteri', impact: 'Bu müşterilerde senkron gecikebilir.', since, subjects, actions: [target],
            }, tids.length));
            else out.push(item({
                id: `cus.alert:${code(g.k.ruleId)}`, group: 'customers', severity: crit ? 'critical' : 'warning', title: 'Müşteri uyarısı', why: `${code(g.k.ruleId)} kuralı ${tids.length} müşteri için açık.`,
                count: tids.length, countUnit: 'müşteri', since, subjects, actions: [nav('Uyarılara git', '/bildirimler/uyarilar', { status: 'firing', ruleId: code(g.k.ruleId) })],
            }, tids.length));
            void key;
        }
        return out;
    }

    private subj(rows: Array<{ tid: number; name: string | null }>): Subject[] { return rows.slice(0, SUBJECTS_MAX).map((r) => ({ tid: r.tid, name: r.name })); }
    private oldest(rows: TenantAt[]): string | null { return rows.map((r) => iso(r.at)).filter((x): x is string => !!x).sort()[0] ?? null; }

    private syncLagItems(rows: TenantAt[], nowMs: number): Weighted[] {
        const lag = rows.filter((r) => r.at && nowMs - r.at.getTime() >= T.syncLagWarnMs);
        if (lag.length === 0) return [];
        const crit = lag.some((r) => nowMs - r.at!.getTime() >= T.syncLagCritMs);
        const sorted = [...lag].sort((a, b) => a.at!.getTime() - b.at!.getTime());
        return [item({
            id: 'cus.sync.lag', group: 'customers', severity: crit ? 'critical' : 'warning', title: 'Sipariş senkronu gecikti', why: `${lag.length} aktif müşterinin son başarılı sipariş senkronu ${crit ? '24' : '6'} saatten eski.`,
            count: lag.length, countUnit: 'müşteri', impact: 'Siparişler geç görünüyor olabilir.', since: this.oldest(lag), subjects: this.subj(sorted), actions: [nav('Sorunlu müşterilere git', '/musteriler', { hasIssues: '1' })],
        }, lag.length)];
    }

    private trialItems(rows: TenantAt[], nowMs: number): Weighted[] {
        const list = rows.filter((r) => r.at && r.at.getTime() <= nowMs + T.trialDays * DAY_MS);
        if (list.length === 0) return [];
        const crit = list.some((r) => r.at!.getTime() <= nowMs + T.trialCritDays * DAY_MS);
        const sorted = [...list].sort((a, b) => a.at!.getTime() - b.at!.getTime());
        return [item({
            id: 'cus.trial.ending', group: 'customers', severity: crit ? 'critical' : 'warning', title: 'Deneme süresi bitiyor', why: `${list.length} müşterinin deneme süresi ${T.trialDays} gün içinde doluyor.`,
            count: list.length, countUnit: 'müşteri', impact: 'Süre dolunca erişim kısıtlanır.', since: null, subjects: this.subj(sorted),
            actions: [nav('Denemedeki aboneliklere git', '/abonelikler', { status: 'trialing', endingInDays: String(T.trialDays) }), act('Denemeyi uzat', 'platform.subscriptions.extend_trial')],
        }, list.length)];
    }

    private suspendedItems(rows: TenantAt[]): Weighted[] {
        if (rows.length === 0) return [];
        return [item({
            id: 'cus.sub.suspended', group: 'customers', severity: 'warning', title: 'Askıdaki abonelikler', why: `${rows.length} müşterinin aboneliği askıda.`, count: rows.length, countUnit: 'müşteri',
            impact: 'Bu müşteriler özellikleri kullanamıyor.', since: this.oldest(rows), subjects: this.subj(rows), actions: [nav('Askıdaki aboneliklere git', '/abonelikler', { status: 'suspended' })],
        }, rows.length)];
    }

    private pastDueItems(rows: Array<TenantAt & { graceUntil: Date | null }>, nowMs: number): Weighted[] {
        if (rows.length === 0) return [];
        const crit = rows.some((r) => r.graceUntil && r.graceUntil.getTime() <= nowMs + T.graceCritDays * DAY_MS);
        return [item({
            id: 'cus.payment.problem', group: 'customers', severity: crit ? 'critical' : 'warning', title: 'Ödeme sorunu', why: `${rows.length} müşterinin ödemesi alınamadı${crit ? '; ödemesiz kalma süresi ' + T.graceCritDays + ' gün içinde doluyor' : ''}.`,
            count: rows.length, countUnit: 'müşteri', impact: 'Süre dolunca abonelik askıya alınır.', since: this.oldest(rows), subjects: this.subj(rows), actions: [nav('Ödemesi geciken aboneliklere git', '/abonelikler', { status: 'past_due' })],
        }, rows.length)];
    }

    private deletionItems(rows: TenantAt[], nowMs: number): Weighted[] {
        if (rows.length === 0) return [];
        const soon = rows.some((r) => r.at && r.at.getTime() <= nowMs + T.purgeWarnDays * DAY_MS);
        const sorted = [...rows].sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity));
        return [item({
            id: 'cus.deletion.pending', group: 'customers', severity: soon ? 'warning' : 'info', title: 'Silme talebi bekliyor', why: `${rows.length} müşteri silinmeyi bekliyor${soon ? '; biri ' + T.purgeWarnDays + ' gün içinde kalıcı silinecek' : ''}.`,
            count: rows.length, countUnit: 'müşteri', impact: 'Bekleme süresi dolunca veri kalıcı silinir (geri alınabilir).', since: null, subjects: this.subj(sorted),
            actions: [nav('Yaşam döngüsüne git', '/musteriler/yasam-dongusu', { status: 'DELETION_PENDING' })],
        }, rows.length)];
    }

    private lifecycleFailedItems(rows: Array<TenantAt & { status: string }>): Weighted[] {
        if (rows.length === 0) return [];
        return [item({
            id: 'cus.lifecycle.failed', group: 'customers', severity: 'critical', title: 'Müşteri yaşam döngüsü adımı başarısız', why: `${rows.length} müşteride kurulum ya da kalıcı silme adımı hata verdi.`,
            count: rows.length, countUnit: 'müşteri', impact: 'Müşteri yarım kalmış durumda.', since: this.oldest(rows), subjects: this.subj(rows), actions: [nav('Yaşam döngüsüne git', '/musteriler/yasam-dongusu', { status: 'failed' })],
        }, rows.length)];
    }

    private ticketItems(rows: TenantAt[], nowMs: number): Weighted[] {
        const aged = rows.filter((r) => r.at && nowMs - r.at.getTime() >= T.ticketWarnMs);
        if (aged.length === 0) return [];
        const crit = aged.some((r) => nowMs - r.at!.getTime() >= T.ticketCritMs);
        const sorted = [...aged].sort((a, b) => a.at!.getTime() - b.at!.getTime());
        return [item({
            id: 'cus.ticket.aging', group: 'customers', severity: crit ? 'critical' : 'warning', title: 'Yanıt bekleyen destek talepleri', why: `${aged.length} müşterinin açık destek talebi ${crit ? '72' : '24'} saatten uzun süredir bekliyor.`,
            count: aged.length, countUnit: 'müşteri', impact: 'Müşteri memnuniyeti etkilenebilir.', since: this.oldest(aged), subjects: this.subj(sorted), actions: [nav('Destek taleplerine git', '/musteriler/destek', { status: 'open', olderThanHours: '24' })],
        }, aged.length)];
    }
}
