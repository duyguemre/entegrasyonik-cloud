import { ObjectId } from 'mongodb'
import { containsRegex } from '@utils/search'

/**
 * ADR-0024 Dalga 3 (P3-CAT): ürün listesi/dışa aktarma arama formundan Mongo filtresi kuran SAFİ fonksiyonlar
 * (ProductService'ten taşındı; sorgu çalıştırmaz, regex kaçışı `containsRegex` ile yapılır — GV-01).
 */
export function buildVariantFilterQuery(searchProductForm: any) {
    let filterQuery: any = {};
    const searchMatch: any = [];

    if (searchProductForm?.searchText) {
        const searchText = searchProductForm.searchText;
        searchMatch.push({
            $or: [
                { stockcode: containsRegex(searchText) }, // [GV-01]
                { barcode: containsRegex(searchText) }
            ]
        });
    }

    if (searchProductForm?.stockcode) searchMatch.push({ 'stockcode': searchProductForm.stockcode });
    if (searchProductForm?.barcode) searchMatch.push({ 'barcode': searchProductForm.barcode });

    if (searchProductForm?.transferStatuses?.length > 0) {
        const transferStatusOr: any[] = [];
        for (const transferStatus of searchProductForm.transferStatuses) {
            const [status, integrationCode] = transferStatus.split('|');
            const statusPath = `platforms.${integrationCode}.upload.TRANSFER.status`;
            const onSalePath = `platforms.${integrationCode}.upload.onSale`;

            let statusQuery: any = {};
            if (status === 'PENDING') {
                statusQuery = { $or: [{ [statusPath]: 'PENDING' }, { [statusPath]: { $exists: false } }] };
            } else {
                statusQuery = { [statusPath]: status };
            }

            if (searchProductForm.onSale !== undefined && searchProductForm.onSale !== -1) {
                statusQuery[onSalePath] = searchProductForm.onSale === 1;
            }
            transferStatusOr.push(statusQuery);
        }
        searchMatch.push({ $or: transferStatusOr });
    }

    if (searchMatch.length > 0) filterQuery = { $and: searchMatch };
    return filterQuery;
}

export function buildProductFilterQuery(searchProductForm: any): any {
    let filterQuery: any = {};
    if (searchProductForm?.searchText) {
        const searchText = searchProductForm.searchText;
        const orArray: any[] = [{ title: containsRegex(searchText) }]; // [GV-01]
        if (ObjectId.isValid(searchText)) orArray.push({ _id: new ObjectId(searchText) });
        filterQuery = { $or: orArray };
    } else {
        const searchMatch: any = buildMatchQuery(searchProductForm);
        if (searchMatch.length > 0) filterQuery = { $and: searchMatch };
    }
    return filterQuery;
}

export function buildMatchQuery(searchProductForm: any): any[] {
    const searchMatch: any = [];
    if (!searchProductForm) return searchMatch;
    if (searchProductForm.title) searchMatch.push({ 'title': containsRegex(searchProductForm.title) }); // [GV-01]
    if (searchProductForm.category && searchProductForm.category !== -1) searchMatch.push({ 'category': new ObjectId(searchProductForm.category) });
    if (searchProductForm.brand && searchProductForm.brand !== -1) searchMatch.push({ 'brand': new ObjectId(searchProductForm.brand) });
    if (searchProductForm.prices?.minSalePrice) searchMatch.push({ 'prices.minSalePrice': { $gte: searchProductForm.prices.minSalePrice } });
    if (searchProductForm.prices?.maxSalePrice > 0) searchMatch.push({ 'prices.maxSalePrice': { $lte: searchProductForm.prices.maxSalePrice } });
    return searchMatch;
}
