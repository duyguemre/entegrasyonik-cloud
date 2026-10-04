// [eslesme-fiyat WP5, PLAN §3.4, K-A] Kanal fiyat kuralı (`PriceRules.type:'channel'`) — giriş şeması + SAF hesap motoru (DB/ağ yok).
//
// Rakip fiyatına BAKMAZ: maliyet + kargo + komisyon + KDV + hedef marj → kanal satış fiyatı (ya da ana fiyat ± ayar). Hesap kuruş tamsayı.
// Hukuk (AUTO_PRICING_LEGAL): K1/K17 (rakip/buybox) uygulanmaz; K7 taban/tavan uygulanır; K9 liste (üstü çizili) fiyatı YAPAY YÜKSELTİLMEZ
// (strateji yalnız `keep` = mevcut ana liste fiyatı ya da `same` = satışla aynı; "markup ile liste" seçeneği bilinçli olarak YOK, K11);
// K12 tek seferde değişim sınırı (`maxChangePercent`) otomatik uygulamada engeller. Sonuç `reasons[]` (TR sade dil) explain zincirine girer.
// K4: değerleri satıcı girer (şemada varsayılan YOK).
import { z } from 'zod';
import { profitAt, type MarginContext } from './margin';
import { fromKurus, round2, toKurus } from '@platform/core/pricing/effectivePrice';

/** Kanal kuralının desteklendiği kanallar (fiyat gönderimi olan TÜM kanallar; rekabet kuralı yalnız Trendyol). */
export const CHANNEL_RULE_CHANNELS = ['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft'] as const;

const money = z.number().finite();
export const channelParams = z.object({
    /** `cost`: maliyet+kargo+komisyon+KDV+hedef marj; `salePrice`: ana fiyat ± yüzde/tutar. */
    base: z.enum(['cost', 'salePrice']),
    /** cost tabanında hedef marj (% brüt, KDV dahil fiyata göre kâr). */
    marginPercent: z.number().finite().min(0).max(90).nullable().optional(),
    /** salePrice tabanında ayar: fiyat = ana × (1 + %/100) + tutar. */
    adjustPercent: z.number().finite().min(-50).max(300).nullable().optional(),
    adjustAmount: money.min(-100_000).max(100_000).nullable().optional(),
    /** Komisyon: `auto` = mevcut çözümleme (override > gerçekleşen > tahmini statik), `static` = satıcının girdiği oran. */
    commission: z.object({ source: z.enum(['auto', 'static']), rate: z.number().finite().min(0).max(100).nullable().optional() }).strict(),
    /** Birim kargo maliyeti (TL, KDV hariç; maliyete eklenir). */
    cargoCost: money.min(0).max(100_000),
    rounding: z.object({
        step: money.min(0.01).max(1000),
        direction: z.enum(['up', 'down', 'nearest']),
        /** ,99 ile biten fiyat (yuvarlamadan sonra). */
        psychological: z.boolean(),
    }).strict(),
    /** K7 taban: bu marjın altına inilmez (maliyet/KDV/komisyon gerekir). */
    floorMarginPercent: z.number().finite().min(0).max(90).nullable().optional(),
    /** K7 tavan (TL). */
    ceiling: money.positive().max(10_000_000).nullable().optional(),
    listPrice: z.object({ strategy: z.enum(['keep', 'same']) }).strict(),
    /** K12: tek seferde mevcut kanal fiyatına göre en çok değişim (%); aşılırsa otomatik uygulanmaz (elle onayda uyarı). */
    maxChangePercent: z.number().finite().min(1).max(100).nullable().optional(),
    /** K-A2: insan onaysız uygula (yalnız bu tip; tenant ayarı `channelAutoApply` da açık olmalı). */
    autoApply: z.boolean(),
}).strict().superRefine((c, ctx) => {
    if (c.base === 'cost' && (c.marginPercent === null || c.marginPercent === undefined)) ctx.addIssue({ code: 'custom', path: ['marginPercent'], message: 'MARGIN_REQUIRED' });
    if (c.base === 'salePrice' && (c.adjustPercent ?? null) === null && (c.adjustAmount ?? null) === null) ctx.addIssue({ code: 'custom', path: ['adjustPercent'], message: 'ADJUST_REQUIRED' });
    if (c.commission.source === 'static' && (c.commission.rate === null || c.commission.rate === undefined)) ctx.addIssue({ code: 'custom', path: ['commission', 'rate'], message: 'COMMISSION_RATE_REQUIRED' });
});
export type ChannelParams = z.infer<typeof channelParams>;

export interface ChannelRuleInput {
    params: ChannelParams;
    /** Ana fiyat (prices.salePrice / marketPrice). */
    baseSale: number | null;
    baseList: number | null;
    /** Kanalda şu an etkin satış fiyatı (değişim sınırı için). */
    currentSale: number | null;
    /** Kâr bağlamı (maliyet KDV hariç, KDV oranı, çözülmüş komisyon, kesintiler). Komisyon `static` ise motor değiştirir. */
    margin: MarginContext;
    /** true: zamanlanmış otomatik uygulama (değişim sınırı engeller). */
    auto: boolean;
}

export type ChannelBlock = 'cost_missing' | 'vat_missing' | 'commission_unknown' | 'base_price_missing' | 'margin_unreachable' | 'floor_above_ceiling'
    | 'non_positive' | 'change_too_large';

export type ChannelResult =
    | { ok: true; salePrice: number; marketPrice: number; reasons: string[]; warnings: string[] }
    | { ok: false; blocked: ChannelBlock; reasons: string[] };

const tl = (k: number) => fromKurus(k).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Hedef marja (% brüt) ulaşan KDV dahil fiyat: kâr(p) doğrusal → kâr(p) = m·p çözümü (kuruş, yukarı). Ulaşılamazsa null. */
export function priceForMargin(ctx: MarginContext, marginPercent: number): number | null {
    const a = profitAt(0, ctx), b = profitAt(1000, ctx);
    if (a.profit === null || b.profit === null) return null;
    const slope = (b.profit - a.profit) / 1000;
    const denom = slope - marginPercent / 100;
    if (!(denom > 0)) return null;
    const p = -a.profit / denom;
    return p <= 0 ? 0 : Math.ceil(Math.round(p * 1e6) / 1e4);
}

/** Adım + yön + ,99 yuvarlaması (kuruş). */
export function roundPrice(k: number, r: ChannelParams['rounding']): number {
    const step = Math.max(1, toKurus(r.step));
    const q = k / step;
    let out = (r.direction === 'up' ? Math.ceil(q) : r.direction === 'down' ? Math.floor(q) : Math.round(q)) * step;
    if (r.psychological) {
        let c = Math.floor(out / 100) * 100 + 99;
        if (r.direction === 'down') { if (c > out) c -= 100; } else if (c < out) c += 100;
        out = c;
    }
    return out;
}

export function computeChannelPrice(i: ChannelRuleInput): ChannelResult {
    const p = i.params;
    const reasons: string[] = [];
    const warnings: string[] = [];
    const margin: MarginContext = {
        ...i.margin,
        costPrice: isNum(i.margin.costPrice) ? i.margin.costPrice + p.cargoCost : null,
        commission: p.commission.source === 'static' ? { rate: p.commission.rate ?? null, source: 'override' } : i.margin.commission,
    };
    const needCost = p.base === 'cost' || isNum(p.floorMarginPercent);
    if (needCost) {
        if (!isNum(i.margin.costPrice)) return { ok: false, blocked: 'cost_missing', reasons: ['Maliyet girilmemiş.'] };
        if (!isNum(margin.vatRate)) return { ok: false, blocked: 'vat_missing', reasons: ['KDV oranı girilmemiş.'] };
        if (!isNum(margin.commission.rate) || margin.commission.source === 'unknown') return { ok: false, blocked: 'commission_unknown', reasons: ['Komisyon oranı bilinmiyor.'] };
    }

    let k: number;
    if (p.base === 'cost') {
        const target = priceForMargin(margin, p.marginPercent as number);
        if (target === null) return { ok: false, blocked: 'margin_unreachable', reasons: [`%${p.marginPercent} marja bu komisyon/KDV ile ulaşılamıyor.`] };
        k = target;
        reasons.push(`maliyet ${tl(toKurus(i.margin.costPrice as number))} + kargo ${tl(toKurus(p.cargoCost))}; komisyon %${margin.commission.rate} (${margin.commission.source}); KDV %${margin.vatRate}; hedef marj %${p.marginPercent} → ${tl(k)}`);
    } else {
        if (!isNum(i.baseSale) || i.baseSale <= 0) return { ok: false, blocked: 'base_price_missing', reasons: ['Ana satış fiyatı yok.'] };
        const pct = p.adjustPercent ?? 0, amt = p.adjustAmount ?? 0;
        k = Math.round(toKurus(i.baseSale) * (1 + pct / 100)) + toKurus(amt);
        reasons.push(`ana fiyat ${tl(toKurus(i.baseSale))}${pct ? ` ${pct > 0 ? '+' : ''}%${pct}` : ''}${amt ? ` ${amt > 0 ? '+' : ''}${tl(toKurus(amt))}` : ''} → ${tl(k)}`);
    }

    const rounded = roundPrice(k, p.rounding);
    if (rounded !== k) reasons.push(`yuvarlama (${tl(toKurus(p.rounding.step))}, ${p.rounding.direction}${p.rounding.psychological ? ', ,99' : ''}) → ${tl(rounded)}`);
    k = rounded;

    const floorK = isNum(p.floorMarginPercent) ? priceForMargin(margin, p.floorMarginPercent) : null;
    if (isNum(p.floorMarginPercent) && floorK === null) return { ok: false, blocked: 'margin_unreachable', reasons: [...reasons, `taban marjı %${p.floorMarginPercent} ulaşılamıyor.`] };
    const ceilK = isNum(p.ceiling) ? toKurus(p.ceiling) : null;
    if (floorK !== null && ceilK !== null && floorK > ceilK) return { ok: false, blocked: 'floor_above_ceiling', reasons: [...reasons, `taban ${tl(floorK)} tavandan (${tl(ceilK)}) yüksek.`] };
    if (floorK !== null && k < floorK) { k = floorK; reasons.push(`taban (marj %${p.floorMarginPercent}) uygulandı → ${tl(k)}`); }
    if (ceilK !== null && k > ceilK) { k = ceilK; reasons.push(`tavan uygulandı → ${tl(k)}`); }
    if (!(k > 0)) return { ok: false, blocked: 'non_positive', reasons: [...reasons, 'hesaplanan fiyat 0 ya da negatif.'] };

    if (isNum(p.maxChangePercent) && isNum(i.currentSale) && i.currentSale > 0) {
        const cur = toKurus(i.currentSale);
        const change = Math.abs(k - cur) / cur * 100;
        if (change > p.maxChangePercent) {
            const msg = `değişim %${round2(change)} > sınır %${p.maxChangePercent} (mevcut ${tl(cur)})`;
            if (i.auto) return { ok: false, blocked: 'change_too_large', reasons: [...reasons, msg] };
            warnings.push(msg);
        }
    }

    const sale = fromKurus(k);
    const keepList = isNum(i.baseList) && i.baseList > 0 ? round2(i.baseList) : sale;
    const marketPrice = p.listPrice.strategy === 'same' ? sale : Math.max(keepList, sale);
    if (p.listPrice.strategy === 'keep' && isNum(i.baseList) && i.baseList > 0 && i.baseList < sale) warnings.push('liste fiyatı satış fiyatının altında kaldı; satışa eşitlendi');
    const prof = needCost ? profitAt(sale, margin) : null;
    if (prof?.marginPercent !== null && prof?.marginPercent !== undefined) reasons.push(`tahmini kâr ${tl(toKurus(prof.profit as number))} (%${prof.marginPercent})`);
    return { ok: true, salePrice: sale, marketPrice, reasons, warnings };
}
