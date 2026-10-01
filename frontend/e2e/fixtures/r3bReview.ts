// fe-r3b — inceleme görüntüleri için sentetik veri (FR3 madde 11: ürün listesi kanal durumu; madde 16: ana sayfa).
// Protokol 7: gerçek kişi/iletişim YOK. Alan adları yalnız backend arayüzlerinden (IProduct.variants[].platforms.<kod>.upload,
// OrderService.getOrderDashboardInsights, StockService.getStockOverview, IntegrationService.getIntegrationHealth).
import { buildProduct } from './apiData'

const up = (status: string, onSale?: boolean, extra: Record<string, any> = {}) => ({
  upload: { TRANSFER: { status }, ...(onSale === undefined ? {} : { onSale }) },
  ...extra,
})

function variant(i: number, platforms: Record<string, any>) {
  return { _id: `v-r3b-${i}`, stockcode: `TS-${i}`, barcode: `86900000005${String(i).padStart(2, '0')}`, stock: 10 - i, order: i, platforms }
}

export const r3bProducts = [
  buildProduct({
    _id: 'p-r3b-1', title: 'Basic pamuklu tişört — oversize kesim', hasVariant: true, stock: 21,
    prices: { minSalePrice: 249.9, maxSalePrice: 279.9 },
    variants: [
      variant(1, { trendyol: up('COMPLETED', true), hepsiburada: up('FAILED') }),
      variant(2, { trendyol: up('COMPLETED', true), hepsiburada: up('WAITING') }),
      variant(3, { trendyol: up('COMPLETED', false) }),
    ],
  }),
  buildProduct({
    _id: 'p-r3b-2', title: 'Koşu ayakkabısı Air Lite', stock: 8,
    variants: [{ stockcode: 'SN-001', barcode: '8690000000401', order: 0, platforms: { trendyol: up('COMPLETED', true), hepsiburada: up('COMPLETED', true), ideasoft: up('SENT'), bizimhesap: up('COMPLETED', true) } }],
    platformUploads: { trendyol: { isUploaded: true, isReady: true }, hepsiburada: { isUploaded: true, isReady: true }, ideasoft: { isReady: true } },
  }),
  buildProduct({
    _id: 'p-r3b-3', title: 'Seramik kupa 350 ml', stock: 0, onsale: false,
    variants: [{ stockcode: 'MG-350', barcode: '8690000000402', order: 0, platforms: { trendyol: up('FAILED') } }],
    platformUploads: { trendyol: { isReady: true } },
  }),
  buildProduct({
    _id: 'p-r3b-4', title: 'Masa lambası', stock: 4,
    variants: [{ stockcode: 'LM-01', barcode: '8690000000403', order: 0 }],
    platformUploads: { hepsiburada: { isReady: true } },
  }),
  buildProduct({
    _id: 'p-r3b-5', title: 'Deri sırt çantası', stock: 15,
    variants: [{ stockcode: 'BG-01', barcode: '8690000000404', order: 0, platforms: { hepsiburada: up('COMPLETED', true), ideasoft: up('PENDING') } }],
    platformUploads: { hepsiburada: { isUploaded: true } },
  }),
]

export const r3bProductPage = {
  products: r3bProducts,
  totalNumberOfRecords: r3bProducts.length,
  fromTo: `1-${r3bProducts.length} / ${r3bProducts.length}`,
  isFiltered: false,
}
