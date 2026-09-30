// Son kullanıcı (tenant'ın müşterisi) yetenekleri (CustomerService). FE: CustomerListView.
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens, noUi } from '../define';

const CUS = 'CustomerListView';

export const CUSTOMERS_CAPABILITIES = [
    c({
        id: 'customers.list', domain: 'customers', summary: { tr: 'Müşterileri listele', en: 'List customers' },
        effect: 'read', minTier: 'member', permission: 'customers:read', pii: 'raw', bindings: [{ rpc: 'CustomerService/getCustomers' }],
        ui: onScreens(CUS), mcp: deferred('later', 'Müşteri listesi PII içerir; maskeleme (pii:masked) olmadan açılmaz (toolset: customers).'), agent: NO_AGENT,
    }),
    c({
        id: 'customers.get', domain: 'customers', summary: { tr: 'Müşteri ayrıntısını getir', en: 'Get customer detail' },
        effect: 'read', minTier: 'member', permission: 'customers:read', pii: 'raw', bindings: [{ rpc: 'CustomerService/getCustomerDetail' }],
        ui: onScreens(CUS), mcp: deferred('later', 'Müşteri detayı PII içerir; maskeleme (pii:masked) olmadan açılmaz (toolset: customers).'), agent: NO_AGENT,
    }),
    c({
        id: 'customers.update', domain: 'customers', summary: { tr: 'Müşteri bilgisini güncelle', en: 'Update a customer' },
        effect: 'write', minTier: 'member', permission: 'customers:write', pii: 'raw', bindings: [{ rpc: 'CustomerService/updateCustomer' }],
        ui: onScreens([CUS, 'update']), mcp: deferred('later', 'PII yazma; onay akışı (Aşama D) ve alan bazlı şema olmadan açılmaz.'), agent: NO_AGENT,
    }),
    c({
        id: 'customers.anonymize', domain: 'customers', summary: { tr: 'Müşteriyi anonimleştir (KVKK silme talebi)', en: 'Anonymize a customer (GDPR/KVKK erasure)' },
        effect: 'destructive', minTier: 'admin', permission: 'customers:anonymize', pii: 'raw', bindings: [{ rpc: 'CustomerService/anonymizeCustomer' }],
        ui: noUi('Backend-only: müşteri anonimleştirme ekranı Faz 2/3 (ADR-0003 F.23; BACKEND_ONLY_NOT_YET_IN_FE).'),
        mcp: nx('irreversible', 'PII geri döndürülemez maskeleme (hukuki, ADR-0003 F.23); yalnız ekranda ve yeniden kimlik doğrulamayla.'), agent: NO_AGENT,
    }),
];
