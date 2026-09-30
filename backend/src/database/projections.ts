/**
 * [DB-03 / DBR-14, DBR-16] Sıcak okuma projeksiyonları (tek yerde; okuma davranışı DEĞİŞMEZ, yalnız taşınan bayt azalır).
 */

/**
 * `ClientIntegrations` belgesinin %95'i ERP kataloğudur (`erp[].settings.catalog`, Bizimhesap). Katalog yalnız kendi
 * servislerinin (BrandService/CategoryService: `$elemMatch` + kendi projeksiyonu) okuduğu yerlerde gerekir; sıcak yollar
 * (stok yayın/mutabakat işleri, sağlık/istatistik, adaptör yapılandırma çözümü) `findOne()` ile onu ve sırları boşuna okuyordu.
 */
export const CLIENT_INTEGRATION_HOT_PROJECTION = { 'erp.settings.catalog': 0 } as const;

/** Kanal kodu projeksiyon yolu (`platforms.<kod>.…`) için güvenli mi? (nokta/`$`/boşluk içeren kod yolu bozar). */
export function isSafeChannelCode(code: unknown): code is string {
    return typeof code === 'string' && /^[A-Za-z0-9_-]+$/.test(code);
}

/**
 * StockPublishTrigger kirli-varyant taraması için alan listesi. Okunan alanlar (kod taramasıyla doğrulandı):
 * `stock`/`reserved` (available), `barcode`/`stockcode` (matchKey + staged payload), `productId` (staged kaydı),
 * `stockVersion`/`stockDirtyAt` (X2 koşullu temizleme filtresi), `platforms.<kod>.upload.TRANSFER.status` (TRANSFER kapısı),
 * `platforms.<kod>.stockSync` (lastPublishedQty). Bilinmeyen/güvensiz kod varsa `undefined` (tam belge; eski davranış).
 */
export function stockScanProjection(channelCodes: unknown[]): Record<string, 1> | undefined {
    if (!channelCodes.every(isSafeChannelCode)) return undefined;
    const proj: Record<string, 1> = { _id: 1, stock: 1, reserved: 1, barcode: 1, stockcode: 1, productId: 1, stockVersion: 1, stockDirtyAt: 1 };
    for (const code of channelCodes as string[]) {
        proj[`platforms.${code}.upload.TRANSFER.status`] = 1;
        proj[`platforms.${code}.stockSync`] = 1;
    }
    return proj;
}
