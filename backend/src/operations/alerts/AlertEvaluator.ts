// ADR-0017 Karar 4 (Asama C, NB8): ALARM DEGERLENDIRICISI (zamanlanmis is, worker). Kural bulgulari -> `Alerts` yasam dongusu
// (`firing -> resolved`, histerezis: 2 ardisik temiz degerlendirme) -> bildirim:
//  - tekrar bastirma: yeniden bildirim kritikte 4 sa, uyarida 24 sa (cooldown); uyariyi kritige YUKSELTME aninda hemen bildirir,
//  - susturma (`mutedUntil`) ve bakim penceresi bildirimleri bastirir (degerlendirme ve kayit surer),
//  - firtina korumasi: ayni turda > 5 yeni platform uyarisi -> tek `PLATFORM_ALERT_DIGEST`,
//  - golge mod (`ALERT_SHADOW_UNTIL`): yalniz kayit + defter (`suppressed:shadow`), e-posta ve tenant bildirimi YOK.
// Platform: `platformNotify` (e-posta `ALERT_EMAIL_TO`; yoksa yalniz panel). Tenant: `notify` (INTEGRATION_ERROR_RATE_HIGH / INTEGRATION_AUTH_FAILED).
// Tum bagimliliklar enjekte (testler DB/Redis/SMTP'ye baglanmaz). Bayrak kapaliyken hicbir koleksiyona dokunmaz.
import { logger } from '@platform/core/logger';
import { DEFAULT_THRESHOLDS, evaluateRules, type AlertLevel, type Finding, type RuleSources, type Thresholds } from './alertRules';
import type { NotifyOptions, NotifyResult } from '../notifications/notify';
import type { PlatformNotifyOptions } from '../notifications/platformNotify';
import { ALERT_RETENTION_DAYS } from '@database/application/models/Alert';

const log = logger.child({ module: 'alerts.evaluator' });
const HOUR = 3_600_000;
export const COOLDOWN_MS: Record<AlertLevel, number> = { critical: 4 * HOUR, warning: 24 * HOUR };
export const CLEAN_EVALUATIONS_TO_RESOLVE = 2;
export const STORM_THRESHOLD = 5;

export interface AlertDoc {
    _id?: any; ruleId: string; scopeKey: string; level: AlertLevel; status: 'firing' | 'resolved'; detail?: Record<string, unknown>;
    firstFiredAt: Date; lastSeenAt: Date; lastNotifiedAt?: Date; cleanStreak?: number; resolvedAt?: Date; mutedUntil?: Date; shadow?: boolean; expAt?: Date;
}

export interface AlertModelPort {
    findOne(filter: any): any;
    find(filter: any): any;
    create(doc: any): Promise<any>;
    updateOne(filter: any, update: any): Promise<any>;
}

export interface AlertEvaluatorDeps {
    model: AlertModelPort;
    sources: RuleSources;
    platformNotify(code: string, params: Record<string, unknown>, opts?: PlatformNotifyOptions): Promise<NotifyResult>;
    tenantNotify(code: string, tid: number, params: Record<string, unknown>, opts?: NotifyOptions): Promise<NotifyResult>;
    flags(): { enabled: boolean; shadowUntil?: Date };
    isMaintenance(): boolean;
    now?(): Date;
    thresholds?: Thresholds;
}

export interface EvaluateResult {
    skipped?: string; evaluated: number; newFirings: number; resolved: number; renotified: number;
    platformNotified: number; tenantNotified: number; digest: boolean; shadow: boolean; maintenance: boolean;
}

const isDup = (e: any) => e?.code === 11000 || (typeof e?.message === 'string' && e.message.includes('E11000'));
const lean = async (q: any): Promise<any> => (q && typeof q.lean === 'function' ? q.lean() : q);

export class AlertEvaluator {
    constructor(private readonly d: AlertEvaluatorDeps) {}
    private now(): Date { return this.d.now ? this.d.now() : new Date(); }

    async runOnce(): Promise<EvaluateResult> {
        const res: EvaluateResult = { evaluated: 0, newFirings: 0, resolved: 0, renotified: 0, platformNotified: 0, tenantNotified: 0, digest: false, shadow: false, maintenance: false };
        const f = this.d.flags();
        if (!f.enabled) return { ...res, skipped: 'disabled' };
        const now = this.now();
        const shadow = !!f.shadowUntil && now.getTime() < f.shadowUntil.getTime();
        const maintenance = this.d.isMaintenance();
        res.shadow = shadow; res.maintenance = maintenance;

        const findings = await evaluateRules(this.d.sources, this.d.thresholds ?? DEFAULT_THRESHOLDS, now.getTime());
        res.evaluated = findings.length;
        const seen = new Set(findings.map((x) => `${x.ruleId}\u0000${x.scopeKey}`));

        // 1) bulgulari yasam dongusune isle; bildirilecekleri topla
        const toNotify: Array<{ finding: Finding; alertId: string; kind: 'new' | 'renotify' | 'escalated' }> = [];
        for (const fd of findings) {
            try {
                const r = await this.upsertFiring(fd, now, shadow, maintenance);
                if (r.kind === 'new') res.newFirings++;
                if (r.notify && r.kind !== 'noop') toNotify.push({ finding: fd, alertId: r.alertId, kind: r.kind });
                if (r.kind === 'renotify' || r.kind === 'escalated') res.renotified++;
            } catch (e) { log.error({ err: { message: (e as Error).message }, ruleId: fd.ruleId }, 'uyari islenemedi'); }
        }

        // 2) temiz kalan firing uyarilar: histerezis -> resolved
        const resolvedNow: Array<{ ruleId: string; alertId: string; wasNotified: boolean }> = [];
        const firing: AlertDoc[] = await lean(this.d.model.find({ status: 'firing' }).limit(1000));
        for (const a of firing ?? []) {
            if (seen.has(`${a.ruleId}\u0000${a.scopeKey}`)) continue;
            const streak = (a.cleanStreak ?? 0) + 1;
            if (streak >= CLEAN_EVALUATIONS_TO_RESOLVE) {
                await this.d.model.updateOne({ _id: a._id, status: 'firing' }, { $set: { status: 'resolved', resolvedAt: now, cleanStreak: streak, expAt: new Date(now.getTime() + ALERT_RETENTION_DAYS * 24 * HOUR) } });
                res.resolved++;
                resolvedNow.push({ ruleId: a.ruleId, alertId: String(a._id), wasNotified: !!a.lastNotifiedAt });
            } else {
                await this.d.model.updateOne({ _id: a._id, status: 'firing' }, { $set: { cleanStreak: streak } });
            }
        }

        // 3) bildirimler (bakim penceresi bastirir; susturma upsertFiring'de notify=false yapti)
        if (maintenance) return res;
        const platformItems = toNotify;
        const storm = platformItems.filter((x) => x.kind === 'new').length > STORM_THRESHOLD;
        if (storm) {
            res.digest = true;
            const r = await this.d.platformNotify('PLATFORM_ALERT_DIGEST', { newAlertCount: platformItems.length }, { idempotencyKey: `digest:${Math.floor(now.getTime() / 60_000)}`, shadow, occurredAt: now });
            if (r.status === 'created' || r.status === 'suppressed') res.platformNotified++;
        } else {
            for (const it of platformItems) {
                const code = it.finding.platformCode ?? 'PLATFORM_ALERT_FIRING';
                const params = it.finding.platformParams ?? { ruleId: it.finding.ruleId, alertId: it.alertId, level: it.finding.level };
                const r = await this.d.platformNotify(code, params, { idempotencyKey: `${it.alertId}:${it.kind}:${Math.floor(now.getTime() / 60_000)}`, shadow, occurredAt: now });
                if (r.status === 'created' || r.status === 'suppressed') res.platformNotified++;
            }
        }
        // tenant bildirimleri (yalniz tenant-kapsamli bulgular; golge modda yalniz defter)
        for (const it of toNotify) {
            const tn = it.finding.tenant;
            if (!tn) continue;
            const r = await this.d.tenantNotify(tn.code, tn.tid, tn.params, { module: 'alerts', shadow, occurredAt: now });
            if (r.status === 'created' || r.status === 'grouped' || r.status === 'suppressed') res.tenantNotified++;
        }
        for (const rz of resolvedNow) {
            if (!rz.wasNotified) continue; // hic bildirilmemis (susturulmus/golge) uyari icin "cozuldu" iletisi gonderilmez
            await this.d.platformNotify('PLATFORM_ALERT_RESOLVED', { ruleId: rz.ruleId, alertId: rz.alertId }, { idempotencyKey: `${rz.alertId}:resolved`, shadow, occurredAt: now });
        }
        return res;
    }

    /** Dondurur: kind ('new' yeni/yeniden firing, 'escalated' uyari->kritik, 'renotify' cooldown doldu, 'noop') ve bildirim gerekip gerekmedigi. */
    private async upsertFiring(fd: Finding, now: Date, shadow: boolean, quiet: boolean): Promise<{ kind: 'new' | 'escalated' | 'renotify' | 'noop'; notify: boolean; alertId: string }> {
        const filter = { ruleId: fd.ruleId, scopeKey: fd.scopeKey };
        const existing: AlertDoc | null = await lean(this.d.model.findOne(filter));
        if (!existing) {
            try {
                const created = await this.d.model.create({
                    ...filter, level: fd.level, status: 'firing', detail: fd.detail, firstFiredAt: now, lastSeenAt: now, cleanStreak: 0, shadow,
                    ...(quiet ? {} : { lastNotifiedAt: now }), // bakim penceresinde bildirilmedi: cooldown baslatilmaz
                });
                return { kind: 'new', notify: !quiet, alertId: String(created._id) };
            } catch (e) {
                if (!isDup(e)) throw e;
                return { kind: 'noop', notify: false, alertId: '' }; // baska degerlendirici ekledi; sonraki turda islenir
            }
        }
        const id = String(existing._id);
        const muted = quiet || (!!existing.mutedUntil && existing.mutedUntil.getTime() > now.getTime());
        if (existing.status === 'resolved') {
            await this.d.model.updateOne({ _id: existing._id }, {
                $set: { level: fd.level, status: 'firing', detail: fd.detail, firstFiredAt: now, lastSeenAt: now, cleanStreak: 0, shadow, ...(muted ? {} : { lastNotifiedAt: now }) },
                $unset: { resolvedAt: '', expAt: '' },
            });
            return { kind: 'new', notify: !muted, alertId: id };
        }
        const escalated = existing.level === 'warning' && fd.level === 'critical';
        const last = existing.lastNotifiedAt ? existing.lastNotifiedAt.getTime() : 0;
        const due = !existing.lastNotifiedAt || now.getTime() - last >= COOLDOWN_MS[fd.level];
        const notify = !muted && (escalated || due);
        await this.d.model.updateOne({ _id: existing._id }, { $set: { level: fd.level, detail: fd.detail, lastSeenAt: now, cleanStreak: 0, ...(notify ? { lastNotifiedAt: now } : {}) } });
        return { kind: escalated ? 'escalated' : notify ? 'renotify' : 'noop', notify, alertId: id };
    }
}
