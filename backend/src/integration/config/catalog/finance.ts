// COM-07 — kanal başına KESİNTİ KURALLARI (net gelir hesabı; src/operations/finance/netRevenue.ts). ADR-0020 entegrasyon ayarları.
// Varsayılan İLKESİ: yalnız resmi (R) ya da birbiriyle tutarlı en az iki ikincil (İ) kaynağı olan değer dolu; aksi halde
// `null` = BİLİNMİYOR (hesapta 0 sayılmaz, "eksik bileşen" olarak gösterilir). Kaynak: docs/research/MARKETPLACE_COMMISSIONS_2026-09-30.md §4.
import { z } from 'zod';
import type { SettingDef } from '../types';

const rate = z.number().min(0).max(100).nullable();
const money = z.number().min(0).max(100_000).nullable();
const DOC = 'docs/research/MARKETPLACE_COMMISSIONS_2026-09-30.md';

const base = {
    group: 'order.support' as const, scope: 'integration' as const, type: 'decimal' as const, danger: 'caution' as const, applies: 'immediate' as const,
    overridable: true, consumers: ['config/financeDeductionRules.ts'], since: '2026-09-30',
};

export const FINANCE_SETTINGS: SettingDef<any>[] = [
    { ...base, key: 'finance.commissionVatRate', schema: rate, unit: 'percent', safeRange: { min: 0, max: 100 },
        // Yalnız Hepsiburada: "kesilen komisyona ayrıca KDV eklenir" (İ: parasut) + genel KDV oranı. Trendyol'da oranın KDV dahil olup olmadığı
        // iki İ kaynakta çelişkili (DOĞRULANAMADI) → null; N11/Pazarama yalnız S/tek İ → null.
        default: { _: null, hepsiburada: 20 },
        label: { tr: 'Komisyona uygulanan KDV oranı', en: 'VAT rate on commission' },
        help: { tr: `Komisyon tutarının üzerine eklenen KDV (%). Boş = bilinmiyor (net hesapta "eksik bileşen"). Varsayılan yalnız Hepsiburada için %20; Trendyol'da oranın KDV dahil olup olmadığı doğrulanamadı. Kaynak: ${DOC} §4.`, en: `VAT (%) added on top of the commission amount. Empty = unknown (shown as a missing component). Default only for Hepsiburada (20%); whether Trendyol rates already include VAT is unverified. Source: ${DOC} §4.` } },
    { ...base, key: 'finance.withholdingRate', schema: rate, unit: 'percent', safeRange: { min: 0, max: 100 },
        // E-ticaret stopajı %1: 7524 sayılı Kanun / CB Kararı 9284, 01.01.2025 (İ/S: erdem-erdem.av.tr, cnbce). Tüm kanallar için geçerli; matrah (KDV hariç) DOĞRULANAMADI.
        default: { _: 1 },
        label: { tr: 'E-ticaret stopaj oranı', en: 'E-commerce withholding rate' },
        help: { tr: `Pazaryerinin ödemeden kestiği e-ticaret stopajı (%). Varsayılan %1 (7524 sayılı Kanun, 2025). Matrah KDV hariç tutar varsayılır; muhasebe teyidi bekliyor. Kaynak: ${DOC} §4.`, en: `E-commerce withholding (%) the marketplace deducts at payout. Default 1% (Law 7524, 2025). Base assumed VAT-exclusive; pending accounting confirmation. Source: ${DOC} §4.` } },
    { ...base, key: 'finance.serviceFeeFixed', schema: money, unit: undefined,
        // HB sabit işlem/hizmet bedeli var ama tutar DOĞRULANAMADI; Trendyol platform hizmet bedeli tutarı bulunamadı → null.
        default: { _: null },
        label: { tr: 'Sabit hizmet/işlem bedeli (TL)', en: 'Fixed service/transaction fee (TL)' },
        help: { tr: `Kalem başına sabit bedel (TL). Boş = bilinmiyor. Hepsiburada/Trendyol'da bedel var ama tutarı resmi kaynakla doğrulanamadı, bu yüzden varsayılan boş. Kaynak: ${DOC} §4.`, en: `Fixed fee per item (TL). Empty = unknown. Hepsiburada/Trendyol charge one but the amount is unverified, hence empty by default. Source: ${DOC} §4.` } },
    { ...base, key: 'finance.serviceFeeRate', schema: rate, unit: 'percent', safeRange: { min: 0, max: 100 },
        // N11 pazarlama (%1) + pazaryeri (%0,67) hizmet bedeli yalnız S (arama özeti) → null.
        default: { _: null },
        label: { tr: 'Hizmet bedeli oranı', en: 'Service fee rate' },
        help: { tr: `Brüt fiyata uygulanan hizmet bedeli (%). Boş = bilinmiyor. N11 oranları yalnız arama özetine dayanır (doğrulanamadı), bu yüzden varsayılan boş. Kaynak: ${DOC} §4.`, en: `Service fee (%) applied to the gross price. Empty = unknown. N11 figures rest on a search summary only (unverified), hence empty by default. Source: ${DOC} §4.` } },
    { ...base, key: 'finance.shippingContribution', schema: money, unit: undefined,
        // Satıcı kargo katkısı kargo sözleşmesine bağlıdır; araştırmada kanıtlı değer yok → null.
        default: { _: null },
        label: { tr: 'Kargo katkısı (TL / kalem)', en: 'Shipping contribution (TL / item)' },
        help: { tr: `Satıcının kalem başına kargo katkısı (TL); kargo sözleşmesine bağlıdır. Boş = bilinmiyor. Kaynak: ${DOC} §4 (kanıtlı değer yok).`, en: `Seller's shipping contribution per item (TL); depends on the carrier contract. Empty = unknown. Source: ${DOC} §4 (no verified value).` } },
    // COM-08: gerçekleşen oran (hakediş) ile referans (tenant override > statik tablo) arasındaki sapma eşiği. Kanal kapsamı (ADR-0020),
    // `_platform` DEĞİL (ADR-0031 platform.* tavanlarına girmez). Başlangıç 2 puan: araştırmadaki KDV dahil/hariç farkı (~%20 göreli)
    // ve seviye indirimleri (2,5+ puan) bu eşiği aşar; ölçülmedi, yeniden başlatmasız ayardır. Okuyucu: operations/finance/commissionDrift.ts.
    { ...base, key: 'finance.commissionDriftThresholdPoints', schema: z.number().min(0.5).max(50), unit: 'percent', safeRange: { min: 1, max: 10 },
        danger: 'safe', applies: 'next_cycle', consumers: ['../operations/finance/commissionDrift.ts'], since: '2026-10-01',
        default: { _: 2 },
        label: { tr: 'Komisyon sapma uyarı eşiği (puan)', en: 'Commission drift alert threshold (points)' },
        help: { tr: `Gerçekleşen komisyon oranı (hakediş), tenant geçersiz kılması ya da kanal tablosundaki orandan en az bu kadar puan saparsa "komisyon tablosu bayat olabilir" bildirimi üretilir (kanal + kategori başına ayda en çok bir kez). Kaynak: ${DOC}.`, en: `When the realized commission rate (settlements) differs from the tenant override or the channel table rate by at least this many points, a "commission table may be stale" notification is raised (at most once a month per channel + category). Source: ${DOC}.` } },
];
