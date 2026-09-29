// ADR-0018 Aşama A / ADR-0016 §3.2 — "tek manifesto modeli": bu kayıt, `IntegrationDescriptor`'ların salt-okuma
// birleşik görünümüdür (ayrı bir liste/kaynak DEĞİLDİR). Saf, statik; I/O yapmaz.
import type { IntegrationDescriptor } from './types';
import TrendyolDescriptor from '@integration/modules/marketplace/trendyol/descriptor';
import HepsiburadaDescriptor from '@integration/modules/marketplace/hepsiburada/descriptor';
import N11Descriptor from '@integration/modules/marketplace/n11/descriptor';
import PazaramaDescriptor from '@integration/modules/marketplace/pazarama/descriptor';
import IdeasoftDescriptor from '@integration/modules/ecommerce/ideasoft/descriptor';
import BizimhesapDescriptor from '@integration/modules/erp/bizimhesap/descriptor';

/** Bugün var olan 6 adaptörün manifestoları (ADR-0018 Aşama A kapsamı). Sıra: `IntegrationFactory.ts` switch sırasıyla aynı. */
export const INTEGRATION_DESCRIPTORS: readonly IntegrationDescriptor[] = [
    TrendyolDescriptor,
    PazaramaDescriptor,
    N11Descriptor,
    HepsiburadaDescriptor,
    IdeasoftDescriptor,
    BizimhesapDescriptor,
];

/** Tüm manifestoları döner (salt-okuma kopya; çağıran mutasyon yapamaz). */
export function listIntegrationDescriptors(): IntegrationDescriptor[] {
    return [...INTEGRATION_DESCRIPTORS];
}

/** Koda göre manifesto (küçük harfe normalize edilir); bulunamazsa `undefined`. */
export function getIntegrationDescriptor(code: string): IntegrationDescriptor | undefined {
    const key = String(code || '').trim().toLowerCase();
    return INTEGRATION_DESCRIPTORS.find((d) => d.code === key);
}

/** Belirli bir kategorideki tüm manifestolar. */
export function listIntegrationDescriptorsByCategory(category: IntegrationDescriptor['category']): IntegrationDescriptor[] {
    return INTEGRATION_DESCRIPTORS.filter((d) => d.category === category);
}
