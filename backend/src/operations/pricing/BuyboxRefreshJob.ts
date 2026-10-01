// PRC-R1 + PRC-CFG: zamanlanmış buybox okuma işi (`pricing.buyboxRefresh`, JobRunRegistry altında, dakikada bir, yalnız worker).
// SALT OKUMA: pazaryerine hiçbir şey YAZILMAZ (R2/R3 ayrı). Her tur:
//  1) kapılar: `features.competition` (global + tenant listesi), Trendyol intake (ADR-0020 kill-switch), kanal bütçesi > 0;
//  2) tenant başına etkin ayar (plan varsayılanı + tenant istisnası) -> izlenen küme (SKU tavanı + öncelik) -> vadeli barkodlar;
//  3) dakikalık çağrı bütçesi tenant'lar arasında round-robin paylaştırılır; kalan ERTELENİR (müşteri "son güncelleme"yi görür);
//  4) her parti (≤10 barkod) okunur, durum geçişi varyanta + seyreltilmiş geçmiş `BuyboxSnapshots`'a yazılır, "kaybedildi" bildirilir.
// Bir tenant'ta okuma hatası: o tenant bu turda atlanır (bütçe yakmaz), diğerleri sürer; sonraki tur yeniden dener.
import type { IBuyboxObservation } from '@interfaces/index';
import type { EffectiveCompetitionSettings } from './competitionSettings';
import { allocateFair, selectDue, type BuyboxCandidate, type TenantQueue } from './buyboxQueue';
import { shouldNotifyLost, transition, type ChannelCompetitionState } from './buyboxState';

export const BUYBOX_JOB_NAME = 'pricing.buyboxRefresh';
export const BUYBOX_CHANNEL = 'trendyol';

/** "Trendyol'da yayında" + barkodlu varyant. Yayın durumu ürün filtresiyle aynı alandan okunur (`platforms.trendyol.upload.TRANSFER.status`). */
export const ELIGIBLE_FILTER = {
    barcode: { $type: 'string', $ne: '' },
    [`platforms.${BUYBOX_CHANNEL}.upload.TRANSFER.status`]: 'COMPLETED',
} as const;

export interface TenantCandidateRow extends BuyboxCandidate {
    variantId: string;
    ownPrice: number | null;
    prev: Partial<ChannelCompetitionState> | null;
}

export interface ApplyItem {
    variantId: string;
    barcode: string;
    state: ChannelCompetitionState;
    snapshot: boolean;
}

export interface BuyboxJobDeps {
    now(): Date;
    /** `features.competition` (tenant verilmezse global anahtar). */
    enabled(tid?: number): boolean;
    intakeOpen(channel: string): boolean;
    budgetPerMin(channel: string): number;
    shadow(): boolean;
    cooldownMs(): number;
    /** Aktif + Trendyol entegrasyonu açık tenant'lar ve etkin ayarları. */
    listTenants(): Promise<Array<{ tid: number; settings: EffectiveCompetitionSettings }>>;
    loadCandidates(tid: number): Promise<TenantCandidateRow[]>;
    read(tid: number, barcodes: string[]): Promise<IBuyboxObservation[]>;
    apply(tid: number, items: ApplyItem[]): Promise<void>;
    notifyLost(tid: number, params: { integ: string; barcode: string; buyboxOrder: number; buyboxPrice: number; day: string }, opts: { shadow: boolean; idempotencyKey: string }): Promise<void>;
    markNotified(tid: number, variantIds: string[], at: Date): Promise<void>;
}

export interface BuyboxRunResult {
    skipped?: string;
    tenants: number;
    calls: number;
    observed: number;
    lost: number;
    notified: number;
    deferred: number;
    failedTenants: number;
}

const istanbulDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export class BuyboxRefreshJob {
    /** Dönen başlangıç (adil sıra); süreç içi — tek worker lease'i altında koşar. */
    private start = 0;

    constructor(private readonly d: BuyboxJobDeps) { }

    async runOnce(): Promise<BuyboxRunResult> {
        const res: BuyboxRunResult = { tenants: 0, calls: 0, observed: 0, lost: 0, notified: 0, deferred: 0, failedTenants: 0 };
        if (!this.d.enabled()) return { ...res, skipped: 'disabled' };
        if (!this.d.intakeOpen(BUYBOX_CHANNEL)) return { ...res, skipped: 'intake_closed' };
        const budget = this.d.budgetPerMin(BUYBOX_CHANNEL);
        if (budget <= 0) return { ...res, skipped: 'no_budget' };
        const now = this.d.now();

        const tenants = (await this.d.listTenants()).filter((t) => this.d.enabled(t.tid) && t.settings.skuCap > 0);
        const rowsByTenant = new Map<number, Map<string, TenantCandidateRow>>();
        const queues: TenantQueue[] = [];
        for (const t of tenants) {
            try {
                const rows = await this.d.loadCandidates(t.tid);
                const sel = selectDue(rows, t.settings, now);
                rowsByTenant.set(t.tid, new Map(rows.map((r) => [r.barcode, r])));
                if (sel.due.length) queues.push({ tid: t.tid, barcodes: sel.due });
            } catch {
                res.failedTenants++;
            }
        }
        res.tenants = tenants.length;

        const plan = allocateFair(queues, budget, this.start);
        this.start = plan.nextStart;
        for (const n of plan.deferred.values()) res.deferred += n;

        const shadow = this.d.shadow();
        const cooldown = this.d.cooldownMs();
        const failed = new Set<number>();
        for (const call of plan.calls) {
            if (failed.has(call.tid)) { res.deferred += call.barcodes.length; continue; }
            let obs: IBuyboxObservation[];
            try {
                obs = await this.d.read(call.tid, call.barcodes);
                res.calls++;
            } catch {
                res.calls++;
                failed.add(call.tid);
                res.failedTenants++;
                continue;
            }
            const rows = rowsByTenant.get(call.tid)!;
            const items: ApplyItem[] = [];
            const lostItems: Array<{ row: TenantCandidateRow; state: ChannelCompetitionState }> = [];
            for (const o of obs) {
                const row = rows.get(o.barcode);
                if (!row) continue;
                const tr = transition(row.prev, o, row.ownPrice, now);
                items.push({ variantId: row.variantId, barcode: o.barcode, state: tr.next, snapshot: tr.writeSnapshot });
                res.observed++;
                if (tr.lost) res.lost++;
                if (shouldNotifyLost(tr, row.prev?.lostNotifiedAt ?? null, cooldown, now)) lostItems.push({ row, state: tr.next });
            }
            try {
                await this.d.apply(call.tid, items);
            } catch {
                failed.add(call.tid);
                res.failedTenants++;
                continue;
            }
            const notifiedIds: string[] = [];
            for (const l of lostItems) {
                try {
                    await this.d.notifyLost(call.tid, {
                        integ: BUYBOX_CHANNEL, barcode: l.row.barcode, buyboxOrder: l.state.buyboxOrder ?? 0, buyboxPrice: l.state.buyboxPrice ?? 0, day: istanbulDay(now),
                    }, { shadow, idempotencyKey: `buybox:${call.tid}:${l.row.barcode}:${Math.floor(now.getTime() / cooldown)}` });
                    notifiedIds.push(l.row.variantId);
                } catch { /* bildirim hatası okumayı düşürmez */ }
            }
            if (notifiedIds.length) {
                res.notified += notifiedIds.length;
                try { await this.d.markNotified(call.tid, notifiedIds, now); } catch { /* sonraki kayıpta soğuma yeniden değerlendirilir */ }
            }
        }
        return res;
    }
}
