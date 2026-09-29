// ADR-0018 Karar 2b (Aşama B) — Aktif probe (canary): zamanlanmış salt-okunur sözleşme testi.
//
// BU GÖREVDE GERÇEK AĞ İSTEĞİ ATILMAZ. `PROBES_LIVE` varsayılan `false`dır ve bu dosya canlı modda dahi
// bugün hiçbir gerçek HTTP çağrısı YAPMAZ (bkz. `runLiveProbes` yorumu) -- platform düzeyi test hesabı
// bugün yok (ADR Karar 6 #3). Yalnız iki şey KURULUR:
//   (a) replay modu: `descriptor.contracts[]`'te kayıtlı zod sözleşmelerini, KAYITLI (redakte/sentetik)
//       fikstürlerle doğrulayan bir "sözleşme regresyon testi". Fikstür şemaya uyuyorsa (beklenen durum)
//       HİÇBİR `IntegrationFinding` ÜRETİLMEZ -- yalnız altyapının uçtan uca çalıştığı kanıtlanır
//       (ADR Aşama B DoD: "probe replay 6 entegrasyonda yeşil", burada Trendyol'un 2 sözleşmesiyle).
//   (b) canlı mod KAPISI: `PROBES_LIVE=true` + herhangi bir entegrasyonun mock modu AÇIK ise FAIL-FAST
//       (ADR: "Probe başlatıcısı PROBES_LIVE=true ile mock modunun aynı anda açık olmasını fail-fast reddeder").
//       Bu koşulun dışında `PROBES_LIVE=true` bugün yalnız `skipped:'live_probe_pending_platform_credentials'`
//       döner -- gerçek uç noktaya gitmez (bkz. Karar 6 #3: platform test hesapları insan kararı bekliyor).
import type { ZodTypeAny } from 'zod';
import { config } from '@config';
import { logger as rootLogger, Logger } from '@platform/core/logger';
import type { JobOutcome } from '@platform/runtime/scheduler';
import { listIntegrationDescriptors } from '@integration/catalog/IntegrationDescriptorRegistry';
import type { IntegrationDescriptor } from '@integration/catalog/types';
import { TRENDYOL_ORDERS_LIST_CONTRACT } from '@integration/modules/marketplace/trendyol/contracts/orders.list';
import { TRENDYOL_CLAIMS_LIST_CONTRACT } from '@integration/modules/marketplace/trendyol/contracts/claims.list';

export interface ReplayFixtureEntry {
    integrationCode: string;
    category: string;
    contractId: string;
    schema: ZodTypeAny;
    fixture: unknown;
}

/**
 * Aşama A'nın zaten doğrulanmış Trendyol örnekleriyle AYNI biçimde (bkz.
 * `tests/contract/catalog/trendyolContracts.test.ts`) -- YENİ bir sözleşme/şema İCAT EDİLMEDİ, yalnız
 * mevcut `orders.list@v2`/`claims.list@v1` sözleşmelerinin replay probu için tek bir yerde toplanmış,
 * sentetik (gerçek müşteri verisi İÇERMEYEN) bilinen-iyi örnekleri. Diğer 5 adaptörün `descriptor.contracts`
 * dizisi bugün BOŞTUR (Aşama A kapsamı yalnız Trendyol) -- bu yüzden burada yalnız Trendyol vardır; yeni bir
 * adaptöre sözleşme eklenince (Aşama B'nin ayrı bir DoD maddesi) buraya yeni bir `ReplayFixtureEntry` eklenir.
 */
export const REPLAY_FIXTURES: readonly ReplayFixtureEntry[] = [
    {
        integrationCode: 'trendyol',
        category: 'marketplace',
        contractId: TRENDYOL_ORDERS_LIST_CONTRACT.id,
        schema: TRENDYOL_ORDERS_LIST_CONTRACT.schema,
        fixture: {
            content: [{
                shipmentPackageId: 123456, orderNumber: 'TY123456', status: 'Created',
                customerFirstName: 'Ahmet', customerLastName: 'Yılmaz', customerEmail: 'a@mock.com',
                customerId: 123456, currencyCode: 'TRY', packageGrossAmount: 150, packageTotalPrice: 150,
                cargoProviderName: 'Trendyol Express', orderDate: 1234567890000,
                shipmentAddress: { fullName: 'Ahmet Yılmaz', city: 'İstanbul' },
                lines: [{ lineId: 1, barcode: 'B1', productName: 'Ürün', quantity: 1, lineUnitPrice: 150, vatRate: 20, stockCode: 'SK1' }],
            }],
            totalPages: 1, totalElements: 1,
        },
    },
    {
        integrationCode: 'trendyol',
        category: 'marketplace',
        contractId: TRENDYOL_CLAIMS_LIST_CONTRACT.id,
        schema: TRENDYOL_CLAIMS_LIST_CONTRACT.schema,
        fixture: {
            content: [{
                claimId: 'C1', orderNumber: 'TY1', status: 'Created', currencyCode: 'TRY',
                totalRefundAmount: 50, items: [{ orderLine: { id: 1 }, claimItems: [{ id: 2 }] }],
                cargoProviderName: 'Aras',
            }],
            totalPages: 1,
        },
    },
];

export interface ProbeReplayResult {
    integrationCode: string;
    contractId: string;
    ok: boolean;
    /** yalnız zod issue KODLARI (ör. 'unrecognized_keys'); değer/gövde ASLA yok. */
    issueCodes?: string[];
}

/**
 * Replay modu: kayıtlı fikstürleri KENDİ sözleşme şemalarına karşı doğrular. `IntegrationFinding` ÜRETMEZ
 * (ADR Aşama B: "replay modunda... sonuçlar zaten bilinen/sabit fikstürle eşleşir"). Fikstür beklenenden
 * FARKLI ayrışırsa (şema fikstürden habersiz sıkılaştırıldıysa) bu bir REGRESYONDUR -- çağıran (ProbeRunner.run)
 * bunu `JobOutcome.failed`'e yansıtır (JobRunRegistry'de görünür), yalnız FindingService'e YAZMAZ.
 */
export function runReplayProbes(fixtures: readonly ReplayFixtureEntry[] = REPLAY_FIXTURES): ProbeReplayResult[] {
    return fixtures.map((f) => {
        const result = f.schema.safeParse(f.fixture);
        if (result.success) return { integrationCode: f.integrationCode, contractId: f.contractId, ok: true };
        return {
            integrationCode: f.integrationCode,
            contractId: f.contractId,
            ok: false,
            issueCodes: result.error.issues.map((i) => i.code),
        };
    });
}

export class ProbeLiveModeConflictError extends Error {
    constructor(conflicting: string[]) {
        super(`PROBES_LIVE=true ile mock modu AÇIK entegrasyon(lar) aynı anda bulundu (${conflicting.join(', ')}); ` +
            'canlı probe fail-fast reddedildi (ADR-0018 Karar 2b).');
        this.name = 'ProbeLiveModeConflictError';
    }
}

/**
 * `PROBES_LIVE=true` iken HERHANGİ bir entegrasyonun mock modu açıksa fail-fast fırlatır (ADR-0018 Karar 2b).
 * `isMockEnabled` test enjeksiyonu için ayrılmıştır; varsayılan `config.mock[prefix].enabled` okur.
 */
export function assertNoLiveModeMockConflict(
    descriptors: readonly IntegrationDescriptor[] = listIntegrationDescriptors(),
    isMockEnabled: (prefix: string) => boolean = (prefix) => Boolean((config.mock as any)[prefix]?.enabled),
): void {
    const conflicting = descriptors
        .filter((d) => d.mock.prefix && isMockEnabled(d.mock.prefix))
        .map((d) => d.code);
    if (conflicting.length > 0) throw new ProbeLiveModeConflictError(conflicting);
}

export interface ProbeRunnerDeps {
    probesLive?: boolean;
    descriptors?: readonly IntegrationDescriptor[];
    fixtures?: readonly ReplayFixtureEntry[];
    isMockEnabled?: (prefix: string) => boolean;
    logger?: Logger;
}

/**
 * Zamanlanmış turun tek girişi (`ProbeScheduler` bunu `runJob` içinde çağırır). ASLA gerçek ağ isteği atmaz.
 * - `probesLive=false` (varsayılan): replay -- tüm kayıtlı fikstürleri doğrular, bulgu ÜRETMEZ.
 * - `probesLive=true`: ÖNCE mock çakışması fail-fast kontrolü (throw -> `runJob` bunu `failed` olarak işler),
 *   SONRA -- bugün gerçek bir canlı yürütücü YOK (Karar 6 #3) -- `skipped` döner (network YOK).
 */
export async function runProbes(deps: ProbeRunnerDeps = {}): Promise<JobOutcome> {
    const log = deps.logger ?? rootLogger.child({ module: 'compliance:ProbeRunner' });
    const probesLive = deps.probesLive ?? config.compliance.probesLive;
    const descriptors = deps.descriptors ?? listIntegrationDescriptors();

    if (probesLive) {
        assertNoLiveModeMockConflict(descriptors, deps.isMockEnabled);
        // Canlı yürütücü bugün YOK (Karar 6 #3: platform düzeyi test hesapları insan kararı bekliyor).
        // GERÇEK AĞ İSTEĞİ ATILMAZ; yalnız görünür bir "beklemede" durumu kaydedilir.
        log.warn({}, 'PROBES_LIVE=true ancak canlı probe yürütücüsü henüz uygulanmadı (platform test hesabı bekleniyor); tur atlandı.');
        return { skipped: 'live_probe_pending_platform_credentials', processed: 0 };
    }

    const results = runReplayProbes(deps.fixtures);
    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
        log.error({ failed: failed.map((f) => ({ contractId: f.contractId, issueCodes: f.issueCodes })) },
            'replay probu: kayıtlı fikstür artık sözleşmeyle uyuşmuyor (regresyon) -- FindingService ÇAĞRILMADI, yalnız iş turu partial.');
    }
    return { processed: results.length, failed: failed.length, note: 'replay', skipped: false };
}
