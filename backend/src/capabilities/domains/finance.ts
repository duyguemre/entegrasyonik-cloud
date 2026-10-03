// Finans (FinancialService). FE: FinancialListView (screens.ts'te kayıtlı DEĞİL). Tümü salt-okunur, aynı tenant DB'si.
import { defineCapability as c, deferred, NO_AGENT, onScreens, noUi } from '../define';

const NOTE = 'Finansal veri (mali özet/ödeme dökümü); operatörden gizlenme kararı (kademe) netleşmeden sohbet kanalına açılmaz (toolset: finance).';
const NEVER_CALLED = 'Backend-only: FE henüz çağırmıyor (BACKEND_ONLY_NOT_YET_IN_FE).';

export const FINANCE_CAPABILITIES = [
    c({
        id: 'finance.transactions.list', domain: 'finance', summary: { tr: 'Finansal işlemleri listele', en: 'List financial transactions' },
        effect: 'read', minTier: 'member', permission: 'finance:read', bindings: [{ rpc: 'FinancialService/getTransactionData' }],
        ui: onScreens('FinancialListView'), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: finansal veri; operatörden gizlenmesi istenebilir (member bırakıldı).',
    }),
    c({
        id: 'finance.summary', domain: 'finance', summary: { tr: 'Finansal özet', en: 'Financial summary' },
        effect: 'read', minTier: 'member', permission: 'finance:read', bindings: [{ rpc: 'FinancialService/getFinancialSummary' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz (getTransactionData ile ortak kademe kararı).',
    }),
    c({
        id: 'finance.cargo_invoices.list', domain: 'finance', summary: { tr: 'Kargo faturası mutabakatını listele', en: 'List cargo invoice reconciliation' },
        effect: 'read', minTier: 'member', permission: 'finance:read', bindings: [{ rpc: 'FinancialService/getCargoInvoices' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: 5000 satır üst sınırı; finansal veri kademe kararı.',
    }),
    c({
        id: 'finance.payouts.detail', domain: 'finance', summary: { tr: 'Ödeme emri dökümünü getir', en: 'Get payout order details' },
        effect: 'read', minTier: 'member', permission: 'finance:read', bindings: [{ rpc: 'FinancialService/getPayoutDetails' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'OPERATION_POLICY.md Belirsiz: paymentOrderId yalnızca skaler; finansal veri kademe kararı.',
    }),
    c({
        id: 'finance.commission.order_summary', domain: 'finance', summary: { tr: 'Sipariş kalemi komisyon özeti (kaynak etiketli)', en: 'Order line commission summary (source-labelled)' },
        effect: 'read', minTier: 'member', permission: 'finance:read', bindings: [{ rpc: 'FinancialService/getOrderCommissionSummary' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'COM-03/COM-07: kaynak = gerçekleşen (hakediş) | tahmini (kanal tablosu) | bilinmiyor; override COM-04 (kategori > kanal varsayılan). FE net fiyat gösterimi bağlanınca ui güncellenir.',
    }),
    c({
        id: 'finance.commission.by_barcode', domain: 'finance', summary: { tr: 'Barkod bazlı komisyon kaynağı ve oranı', en: 'Commission source and rate by barcode' },
        effect: 'read', minTier: 'member', permission: 'finance:read', bindings: [{ rpc: 'FinancialService/getCommissionByBarcodes' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'COM-07 ürün liste/detay net fiyat için; en çok 200 barkod.',
    }),
    c({
        id: 'finance.net_revenue.preview', domain: 'finance', summary: { tr: 'Net fiyat / net gelir önizlemesi (kalemli kesintiler)', en: 'Net price / net revenue preview (itemised deductions)' },
        effect: 'read', minTier: 'member', permission: 'finance:read', bindings: [{ rpc: 'FinancialService/getNetRevenuePreview' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'COM-07: brüt + komisyon (kaynak etiketli) + KDV/hizmet/kargo/stopaj; okuma anında hesaplanır, kalıcı alan yok; bilinmeyen bileşen 0 sayılmaz (confidence). En çok 200 öğe. FE bağlanınca ui güncellenir.',
    }),
    c({
        id: 'finance.commission.realized_by_category', domain: 'finance', summary: { tr: 'Kategori başına gerçekleşen komisyon oranı (son N gün)', en: 'Realized commission rate per category (last N days)' },
        effect: 'read', minTier: 'member', permission: 'finance:read', bindings: [{ rpc: 'FinancialService/getRealizedCommissionByCategory' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'COM-03 kabul ölçütü: son 90 gün (en çok 180) kategori başına ortalama gerçekleşen oran.',
    }),
    c({
        id: 'finance.commission.overrides.list', domain: 'finance', summary: { tr: 'Tenant komisyon oranı geçersiz kılmalarını listele', en: 'List tenant commission rate overrides' },
        effect: 'read', minTier: 'member', permission: 'finance:read', bindings: [{ rpc: 'FinancialService/listCommissionOverrides' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', NOTE), agent: NO_AGENT,
        review: 'COM-04: entegrasyon ayarları "Komisyon oranları" tablosu (bulut FE); oran bilgisi komisyon okuma RPC leriyle aynı kademede.',
    }),
    c({
        id: 'finance.commission.overrides.set', domain: 'finance', summary: { tr: 'Tenant komisyon oranını geçersiz kıl (kanal varsayılan / kategori)', en: 'Set tenant commission rate override (channel default / category)' },
        effect: 'write', minTier: 'admin', permission: 'integrations:manage', bindings: [{ rpc: 'FinancialService/setCommissionOverride' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', 'Net fiyat/kâr görünümünü değiştiren finansal yapılandırma (admin+); onay akışı (Aşama D) olmadan açılmaz.'), agent: NO_AGENT,
        review: 'COM-04: override > gerçekleşen > tahmini önceliğini belirler; X4 denetimi önce/sonra oran.',
    }),
    c({
        id: 'finance.commission.overrides.delete', domain: 'finance', summary: { tr: 'Tenant komisyon oranı geçersiz kılmasını sil', en: 'Delete tenant commission rate override' },
        effect: 'destructive', minTier: 'admin', permission: 'integrations:manage', bindings: [{ rpc: 'FinancialService/deleteCommissionOverride' }],
        ui: noUi(NEVER_CALLED), mcp: deferred('later', 'Finansal yapılandırma silme (admin+); onay akışı (Aşama D) olmadan açılmaz.'), agent: NO_AGENT,
        review: 'COM-04: yalnız override kaydı silinir (geri dönüş: gerçekleşen/tahmini oran).',
    }),
];
