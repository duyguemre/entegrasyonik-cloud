// COM-07 — kalemli kesinti modeli ve net gelir hesabı. SAF fonksiyon (DB/ağ/ayar okuması YOK); çağıran kuralları çözüp verir.
// Okuma anında hesaplanır, KALICI ALAN YOK (COM-10). Uydurma rakam yok: bilinmeyen bileşen ASLA 0 sayılmaz — `unknown`
// işaretlenir, `net` yalnız bilinen bileşenlerle "tahmini (eksik bileşenler hariç)" döner (confidence 'partial').
//
// Varsayılan hesap biçimi (kaynak ve belirsizlikler: docs/research/MARKETPLACE_COMMISSIONS_2026-09-30.md §4):
//  - komisyon        = brüt (KDV dahil) × oran            (oran KDV dahil listeleme fiyatı üzerinden — HB/Trendyol İ kaynakları)
//  - komisyona KDV   = komisyon × commissionVatRate        (Trendyol'da oranın KDV dahil olup olmadığı DOĞRULANAMADI → kural yoksa unknown)
//  - hizmet bedeli   = sabit + brüt × serviceFeeRate       (en az biri verilmişse bilinir; ikisi de null → unknown)
//  - kargo katkısı   = sipariş kalemi başına sabit tutar   (null → unknown)
//  - e-ticaret stopajı = KDV HARİÇ brüt × withholdingRate  (matrah DOĞRULANAMADI — KDV hariç varsayımı; vatRate yoksa unknown)

export type ComponentKind = 'commission' | 'commissionVat' | 'serviceFee' | 'shipping' | 'withholding';
export type ComponentSource = 'rule' | 'override' | 'actual' | 'unknown';
export type NetConfidence = 'actual' | 'estimated' | 'partial' | 'unknown';
export type CommissionRateSource = 'override' | 'actual' | 'estimated' | 'unknown';

export interface NetRevenueDeductions {
    /** Komisyon tutarına uygulanan KDV oranı (%); null/undefined = bilinmiyor. */
    commissionVatRate?: number | null;
    /** Kalem başına sabit hizmet/işlem bedeli (TL, KDV dahil varsayılır); null = bilinmiyor. */
    serviceFeeFixed?: number | null;
    /** Brüt fiyata uygulanan hizmet bedeli oranı (%); null = bilinmiyor. */
    serviceFeeRate?: number | null;
    /** Kalem başına satıcı kargo katkısı (TL); null = bilinmiyor. */
    shippingContribution?: number | null;
    /** E-ticaret stopaj oranı (%); null = bilinmiyor. */
    withholdingRate?: number | null;
}

export interface NetRevenueInput {
    /** KDV dahil brüt satış fiyatı (TL). */
    grossPrice: number;
    /** Ürün KDV oranı (%) — yalnız stopaj matrahı (KDV hariç) için; bilinmiyorsa null. */
    vatRate?: number | null;
    commission: { rate: number | null; source: CommissionRateSource };
    deductions?: NetRevenueDeductions;
    /** Gerçekleşen hakediş (Trendyol settlements): verilirse komisyon tutarı GERÇEKLEŞENDEN alınır (oran×brüt yerine). */
    settled?: { commissionAmount: number; sellerRevenue?: number | null } | null;
}

export interface NetComponent { kind: ComponentKind; amount: number | null; source: ComponentSource }

export interface NetRevenueResult {
    gross: number | null;
    commissionAmount: number | null;
    commissionVat: number | null;
    serviceFee: number | null;
    shipping: number | null;
    withholding: number | null;
    /** Brüt − bilinen bileşenler. Komisyon bilinmiyorsa veya brüt geçersizse null (yanıltıcı net üretilmez). */
    net: number | null;
    components: NetComponent[];
    /** Net'e dahil EDİLEMEYEN (unknown) bileşen türleri. */
    missing: ComponentKind[];
    confidence: NetConfidence;
    /** Gerçekleşen hakediş raporlandıysa pazaryerinin bildirdiği satıcı alacağı (bilgi; hesaba karışmaz). */
    reportedSellerRevenue: number | null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * TEK yuvarlama noktası: 2 ondalık, YARIM-YUKARI (sıfırdan uzağa). Gerekçe: bankacı yuvarlaması (yarım-çift) kuruş
 * düzeyinde pazaryeri faturalarıyla sistematik 1 kuruş farkı üretir; Türkiye'de fatura/hakediş hesapları yarım-yukarı
 * kullanır. Onluk kaydırma ('e2') ikili kayan nokta hatasını (1.005*100=100.49999…) önler.
 */
export function roundMoney(n: number): number {
    if (!isNum(n)) return n;
    const sign = n < 0 ? -1 : 1;
    const abs = Math.abs(n);
    const s = String(abs);
    if (s.includes('e')) return sign * Math.round(abs * 100) / 100; // çok küçük/büyük: üstel gösterim, onluk kaydırma geçersiz
    return sign * Number(Math.round(Number(`${s}e2`)) + 'e-2');
}

const cents = (n: number) => Math.round(roundMoney(n) * 100);

export function computeNetRevenue(input: NetRevenueInput): NetRevenueResult {
    const d = input.deductions ?? {};
    const components: NetComponent[] = [];
    const empty = (over: Partial<NetRevenueResult> = {}): NetRevenueResult => ({
        gross: null, commissionAmount: null, commissionVat: null, serviceFee: null, shipping: null, withholding: null, net: null,
        components, missing: [], confidence: 'unknown', reportedSellerRevenue: null, ...over,
    });
    if (!isNum(input.grossPrice) || input.grossPrice < 0) {
        (['commission', 'commissionVat', 'serviceFee', 'shipping', 'withholding'] as ComponentKind[]).forEach(k => components.push({ kind: k, amount: null, source: 'unknown' }));
        return empty({ missing: components.map(c => c.kind) });
    }
    const gross = roundMoney(input.grossPrice);

    // Bileşenler kuruş cinsinden (tam sayı) toplanır: gösterilen bileşenlerin toplamı brütle TAM tutar.
    const c: Record<ComponentKind, number | null> = { commission: null, commissionVat: null, serviceFee: null, shipping: null, withholding: null };

    // 1) Komisyon
    let commissionSource: ComponentSource = 'unknown';
    if (input.settled && isNum(input.settled.commissionAmount)) {
        c.commission = cents(Math.abs(input.settled.commissionAmount)); commissionSource = 'actual';
    } else if (isNum(input.commission.rate) && input.commission.source !== 'unknown') {
        c.commission = cents(gross * input.commission.rate / 100);
        commissionSource = input.commission.source === 'override' ? 'override' : 'rule';
    }
    components.push({ kind: 'commission', amount: c.commission === null ? null : c.commission / 100, source: commissionSource });

    // 2) Komisyona KDV (komisyon bilinmiyorsa hesaplanamaz)
    let vatSource: ComponentSource = 'unknown';
    if (c.commission !== null && isNum(d.commissionVatRate)) {
        c.commissionVat = cents(c.commission / 100 * d.commissionVatRate / 100); vatSource = 'rule';
    }
    components.push({ kind: 'commissionVat', amount: c.commissionVat === null ? null : c.commissionVat / 100, source: vatSource });

    // 3) Hizmet/işlem bedeli: sabit ve/veya oran — en az biri tanımlıysa bilinir
    let feeSource: ComponentSource = 'unknown';
    if (isNum(d.serviceFeeFixed) || isNum(d.serviceFeeRate)) {
        c.serviceFee = (isNum(d.serviceFeeFixed) ? cents(d.serviceFeeFixed) : 0) + (isNum(d.serviceFeeRate) ? cents(gross * d.serviceFeeRate / 100) : 0);
        feeSource = 'rule';
    }
    components.push({ kind: 'serviceFee', amount: c.serviceFee === null ? null : c.serviceFee / 100, source: feeSource });

    // 4) Kargo katkısı
    let shipSource: ComponentSource = 'unknown';
    if (isNum(d.shippingContribution)) { c.shipping = cents(d.shippingContribution); shipSource = 'rule'; }
    components.push({ kind: 'shipping', amount: c.shipping === null ? null : c.shipping / 100, source: shipSource });

    // 5) Stopaj: KDV hariç matrah (varsayım); KDV oranı yoksa matrah bilinmez → unknown
    let whSource: ComponentSource = 'unknown';
    if (isNum(d.withholdingRate) && isNum(input.vatRate) && input.vatRate >= 0) {
        c.withholding = cents(gross / (1 + input.vatRate / 100) * d.withholdingRate / 100); whSource = 'rule';
    }
    components.push({ kind: 'withholding', amount: c.withholding === null ? null : c.withholding / 100, source: whSource });

    const missing = components.filter(x => x.source === 'unknown').map(x => x.kind);
    const knownSum = Object.values(c).reduce<number>((a, v) => a + (v ?? 0), 0);
    const reportedSellerRevenue = input.settled && isNum(input.settled.sellerRevenue) ? roundMoney(input.settled.sellerRevenue) : null;
    const out = (k: ComponentKind) => (c[k] === null ? null : (c[k] as number) / 100);

    let confidence: NetConfidence;
    let net: number | null;
    if (c.commission === null) { net = null; confidence = 'unknown'; }            // ana kalem yok: net iddia edilmez
    else {
        net = (Math.round(gross * 100) - knownSum) / 100;
        if (missing.length > 0) confidence = 'partial';
        else confidence = commissionSource === 'actual' ? 'actual' : 'estimated';
    }
    return {
        gross, commissionAmount: out('commission'), commissionVat: out('commissionVat'), serviceFee: out('serviceFee'),
        shipping: out('shipping'), withholding: out('withholding'), net, components, missing, confidence, reportedSellerRevenue,
    };
}
