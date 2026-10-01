import { IOrder } from '@interfaces/order';

/**
 * [faz4-order-guard] Upsert yolu (bulkWrite/updateOne) `runValidators` çalıştırmaz; şemada `required` olan alanlar
 * boş string/undefined gelse de sessizce yazılır. Bu yardımcı siparişi REDDETMEZ (içe alım durmasın):
 *  - kalem `externalLineItemId` boşsa deterministik `${externalOrderId}:${index}` ile doldurur (stok idempotency
 *    anahtarı ve `items.externalLineItemId` eşleşmesi bu alana dayanır; boş değer kalemleri çakıştırır),
 *  - diğer eksik required alanları yalnızca SAYAR (PII/değer içermez) — çağıran uyarı logu basar.
 */
const ADDRESS_REQUIRED = ['firstName', 'addressLine1', 'city', 'state'] as const;
const ITEM_REQUIRED = ['externalItemId', 'productName', 'sku'] as const;

// 'undefined'/'null' metni: mapper'ların String(undefined) artığı (ör. Pazarama OrderItemId) — boş sayılır.
const isBlank = (v: unknown): boolean =>
    v === undefined || v === null || (typeof v === 'string' && ['', 'undefined', 'null'].includes(v.trim()));

export interface RequiredGapReport {
    /** alan yolu -> eksik sayısı (ör. `shippingAddress.city`, `items.sku`). */
    gaps: Record<string, number>;
    /** Geri dönüşle doldurulan kalem kimliği sayısı. */
    lineIdsFilled: number;
}

export function guardOrderRequiredFields(orders: IOrder[]): RequiredGapReport {
    const gaps: Record<string, number> = {};
    let lineIdsFilled = 0;
    const bump = (k: string) => { gaps[k] = (gaps[k] ?? 0) + 1; };

    for (const o of orders) {
        for (const top of ['externalOrderId', 'orderNumber', 'externalStatus'] as const) {
            if (isBlank((o as any)[top])) bump(top);
        }
        for (const side of ['billingAddress', 'shippingAddress'] as const) {
            const a: any = (o as any)[side];
            if (!a) { bump(side); continue; }
            for (const f of ADDRESS_REQUIRED) if (isBlank(a[f])) bump(`${side}.${f}`);
        }
        const items: any[] = Array.isArray(o.items) ? o.items : [];
        items.forEach((it, index) => {
            if (!it) return;
            if (isBlank(it.externalLineItemId)) {
                it.externalLineItemId = `${o.externalOrderId}:${index}`;
                lineIdsFilled++;
                bump('items.externalLineItemId');
            }
            for (const f of ITEM_REQUIRED) if (isBlank(it[f])) bump(`items.${f}`);
        });
    }
    return { gaps, lineIdsFilled };
}
