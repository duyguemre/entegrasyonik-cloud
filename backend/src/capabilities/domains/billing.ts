// Abonelik/plan (ADR-0008). FE: SubscriptionView.
import { defineCapability as c, deferred, nx, NO_AGENT, onScreens } from '../define';

const SUB = 'user/SubscriptionView';

export const BILLING_CAPABILITIES = [
    c({
        id: 'billing.plans.list', domain: 'billing', summary: { tr: 'Abonelik planlarını listele', en: 'List subscription plans' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'BillingService/getPlans' }],
        ui: onScreens(SUB), mcp: deferred('later', 'Plan listesi; salt-okunur ve düşük riskli, ancak sohbet değeri düşük olduğundan toolset genişlemesinde (account) değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'billing.subscription.get', domain: 'billing', summary: { tr: 'Kendi abonelik durumumu getir', en: 'Get my subscription status' },
        effect: 'read', minTier: 'member', bindings: [{ rpc: 'BillingService/getMySubscription' }],
        ui: onScreens(SUB), mcp: deferred('later', 'Abonelik durumu/kota bilgisi; mcpCallsPerDay ile birlikte account toolset genişlemesinde değerlendirilir.'), agent: NO_AGENT,
    }),
    c({
        id: 'billing.checkout.start', domain: 'billing', summary: { tr: 'Plan seçimi/değişimi için ödeme oturumu başlat', en: 'Start a checkout session to choose/change a plan' },
        effect: 'write', minTier: 'admin', external: true, bindings: [{ rpc: 'BillingService/startCheckout' }],
        ui: onScreens([SUB, 'checkout']), mcp: nx('irreversible', 'Faturaya yansıyan parasal işlem (ödeme sağlayıcısı); yalnız ekranda ve kullanıcı onayıyla, sohbet kanalına açılmaz.'), agent: NO_AGENT,
    }),
];
