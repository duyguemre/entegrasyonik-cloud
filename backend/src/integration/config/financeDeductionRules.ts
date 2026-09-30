// COM-07 — kanal başına kesinti kurallarını ADR-0020 ayar katmanından çözer (yayınlanmış platform geçersiz kılmaları > varsayılan).
// Değer `null` = BİLİNMİYOR (netRevenue bunu 0 saymaz). Tenant katmanı ADR-0020 Aşama B'de bağlanınca burada `readTenantOverride` geçilir.
import { getSettingWithPublishedOverrides } from './ConfigResolver';
import type { NetRevenueDeductions } from '@operations/finance/netRevenue';

const KEYS = {
    commissionVatRate: 'finance.commissionVatRate',
    withholdingRate: 'finance.withholdingRate',
    serviceFeeFixed: 'finance.serviceFeeFixed',
    serviceFeeRate: 'finance.serviceFeeRate',
    shippingContribution: 'finance.shippingContribution',
} as const;

export function resolveDeductionRules(integrationCode: string): NetRevenueDeductions {
    const code = integrationCode.toLowerCase();
    const out: NetRevenueDeductions = {};
    for (const [field, key] of Object.entries(KEYS)) {
        const v = getSettingWithPublishedOverrides<number | null>(key, { integrationCode: code });
        (out as any)[field] = typeof v === 'number' && Number.isFinite(v) ? v : null;
    }
    return out;
}
