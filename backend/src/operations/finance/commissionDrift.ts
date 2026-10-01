// COM-08: komisyon degisim uyarisi. Kategori basina GERCEKLESEN oran (COM-03, hakedis satirlari) referans orandan
// (tenant override COM-04 > statik kanal tablosu) esik kadar saparsa "tablo bayat olabilir" sinyali uretilir.
// Saf karar: `evaluateDrift`. Okuma: `getCommissionDrift` (RPC + gunluk is ayni fonksiyonu kullanir; tek tanim).
// Cikti makinece okunabilir (ADR-0018 API-drift vizyonu): sabit alan adlari + `status` enum; bildirim params'i bu ogenin alt kumesidir.
// Yalniz OKUR. Tenant izolasyonu: `clientDB` secimi + tenant kapsamli override onbellegi.
import { PlatformMappingProvider } from '@integration/modules/provider/PlatformMappingProvider';
import { getSettingWithPublishedOverrides } from '@integration/config/ConfigResolver';
import { CommissionOverrideStore } from './commissionOverrides';
import { tenantOverrideRate } from './commissionSummary';
import { getRealizedCommissionByCategory } from './commissionQueries';

/** Ayar anahtari (ADR-0020 entegrasyon kapsami; `_platform` DEGIL -> ADR-0031 tavanlarina girmez). */
export const DRIFT_THRESHOLD_KEY = 'finance.commissionDriftThresholdPoints';
/** Ayar okunamazsa (katalog/ayar katmani yok) kullanilan esik (puan). Katalog varsayilaniyla AYNI tutulur (test korur). */
export const DRIFT_THRESHOLD_FALLBACK = 2;
/** Bir kategoride karar icin gereken en az hakedis satiri (gurultu kapisi). Kod sabiti: ayar tavani + K03 (bkz. BE_COM08_REPORT). */
export const DRIFT_MIN_SAMPLES = 5;
/** Gerceklesen oran penceresi (gun) — COM-03 varsayilaniyla ayni. */
export const DRIFT_WINDOW_DAYS = 30;
/**
 * Gerceklesen orani olan kanallar. Yalniz Trendyol hakedis (settlements) satirinda komisyon orani tasir (COM-03);
 * HB/N11/Pazarama finans API'si spike asamasinda (COM-05/06) -> eklenince buraya yazilir.
 */
export const DRIFT_CHANNELS = ['trendyol'] as const;

export type DriftReferenceSource = 'override' | 'estimated';
export type DriftStatus = 'drift' | 'ok' | 'no_reference' | 'insufficient_samples';

export interface CommissionDriftItem {
    integrationCode: string;
    categoryId: string;
    platformCategoryId: string | null;
    title: string | null;
    realizedRate: number;
    sampleCount: number;
    referenceRate: number | null;
    referenceSource: DriftReferenceSource | null;
    /** realized - reference (puan, 2 ondalik); referans yoksa null. Pozitif = pazaryeri tablodan FAZLA kesiyor. */
    deltaPoints: number | null;
    status: DriftStatus;
}

export interface CommissionDriftReport {
    integrationCode: string;
    days: number;
    thresholdPoints: number;
    minSamples: number;
    items: CommissionDriftItem[];
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Saf karar. Esik dahil (|delta| >= esik -> drift). Gercek %0 referans korunur (yalniz null = referans yok). */
export function evaluateDrift(
    input: { realizedRate: number; sampleCount: number; referenceRate: number | null },
    opts: { thresholdPoints: number; minSamples: number },
): { deltaPoints: number | null; status: DriftStatus } {
    if (!isNum(input.referenceRate)) return { deltaPoints: null, status: 'no_reference' };
    const deltaPoints = round2(input.realizedRate - input.referenceRate);
    if (input.sampleCount < opts.minSamples) return { deltaPoints, status: 'insufficient_samples' };
    return { deltaPoints, status: Math.abs(deltaPoints) >= opts.thresholdPoints - 1e-9 ? 'drift' : 'ok' };
}

/** Kanal esigi (puan): yayinlanmis platform ayari > katalog varsayilani > kod yedegi. */
export function resolveDriftThreshold(integrationCode: string): number {
    try {
        const v = getSettingWithPublishedOverrides<number>(DRIFT_THRESHOLD_KEY, { integrationCode: integrationCode.toLowerCase() });
        return isNum(v) && v > 0 ? v : DRIFT_THRESHOLD_FALLBACK;
    } catch {
        return DRIFT_THRESHOLD_FALLBACK;
    }
}

/**
 * Son `days` gunun kategori basina gerceklesen orani + referans + karar. Kategorisiz hakedis (categoryId null) atlanir.
 * Siralama: once `drift` (|delta| buyukten kucuge), sonra digerleri (ornek sayisina gore).
 */
export async function getCommissionDrift(clientDB: any, clientId: any, input: { integrationCode: string; days?: number; thresholdPoints?: number }): Promise<CommissionDriftReport> {
    const integrationCode = input.integrationCode.toLowerCase();
    const thresholdPoints = isNum(input.thresholdPoints) && input.thresholdPoints > 0 ? input.thresholdPoints : resolveDriftThreshold(integrationCode);
    const realized = await getRealizedCommissionByCategory(clientDB, { integrationCode, days: input.days ?? DRIFT_WINDOW_DAYS });
    const cats = realized.categories.filter((c): c is typeof c & { categoryId: string } => !!c.categoryId);
    const report: CommissionDriftReport = { integrationCode, days: realized.days, thresholdPoints, minSamples: DRIFT_MIN_SAMPLES, items: [] };
    if (cats.length === 0) return report;

    const provider = new PlatformMappingProvider(clientDB, clientId, integrationCode);
    const overrideRows = await new CommissionOverrideStore(clientDB, clientId, integrationCode).loadRows();
    for (const c of cats) {
        const p: any = await provider.getPlatformCategoryId(c.categoryId);
        const platformCategoryId = p === undefined || p === null || p === '' ? null : String(p);
        const overrideRate = tenantOverrideRate(overrideRows, { platformCategoryId });
        const estimated = isNum(overrideRate) ? null : await provider.getLocalCategoryCommission(c.categoryId);
        const referenceRate = isNum(overrideRate) ? overrideRate : isNum(estimated) ? estimated : null;
        const referenceSource: DriftReferenceSource | null = isNum(overrideRate) ? 'override' : isNum(estimated) ? 'estimated' : null;
        const d = evaluateDrift({ realizedRate: c.avgRate, sampleCount: c.sampleCount, referenceRate }, { thresholdPoints, minSamples: DRIFT_MIN_SAMPLES });
        report.items.push({
            integrationCode, categoryId: c.categoryId, platformCategoryId, title: c.title ?? null,
            realizedRate: c.avgRate, sampleCount: c.sampleCount, referenceRate, referenceSource, deltaPoints: d.deltaPoints, status: d.status,
        });
    }
    report.items.sort((a, b) => (a.status === 'drift' ? 0 : 1) - (b.status === 'drift' ? 0 : 1)
        || Math.abs(b.deltaPoints ?? 0) - Math.abs(a.deltaPoints ?? 0) || b.sampleCount - a.sampleCount);
    return report;
}

/** Bildirim penceresi: takvim ayi (Europe/Istanbul) `YYYY-MM`. Ayni kanal+kategori icin pencere basina EN FAZLA bir bildirim (katalog dedupeKey). */
export function driftWindow(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit' }).format(now);
}
