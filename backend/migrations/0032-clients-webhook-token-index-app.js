'use strict';
/**
 * [eslesme-fiyat WP7b, Ek D F-11 / PLAN §3.5] (App, expand): `Clients`
 *  - `integrations_webhookToken` : `{ 'integrations.webhookToken': 1 }`, sparse (çok-anahtarlı; belirteci olmayan öğe/tenant girmez).
 *    Webhook alıcıları (`/hooks/trendyol|hepsiburada|ideasoft/:token`) her çağrıda `Clients.findOne({'integrations.webhookToken': …})`
 *    yapar; indeks yokken tam koleksiyon taramasıdır (D-kuyruk §D eksik 2). UNIQUE DEĞİL: belirteç 32 bayt rastgele (çakışma pratikte yok),
 *    ama şemasız dizide tekillik Mongo'da belge-içi çiftleri yanlış reddeder; eşsizlik `rotateWebhookToken` üretiminde sağlanır.
 * Kanonik beyan: `src/database/application/models/Client.ts` (tests/static/indexManifest.static.test.ts eşleşmeyi korur).
 * plan(): indeks durumu + belirteçli entegrasyon SAYISI (değer yok). YALNIZ onaylı göçte çalışır (CLAUDE.md kural 3 yedek; önce yerel,
 * Atlas ayrı onay). ÇALIŞTIRILMADI. Idempotent. down: yalnız bu indeksi düşürür (veri silinmez).
 */
const { planTargets, upTargets, downTargets, assertCtxDbAllowed, collectionFor } = require('../dev-tools/_migrationIndexes');

const KEY = 'clients';
const COLL = 'Clients';
const TARGETS = [
    {
        key: KEY, defaultCollection: COLL,
        indexes: [
            { fields: { 'integrations.webhookToken': 1 }, options: { sparse: true, name: 'integrations_webhookToken' } },
        ],
    },
];

module.exports = {
    id: '0032-clients-webhook-token-index-app',
    scope: 'app',
    kind: 'index',
    description: 'eslesme-fiyat WP7b (App): Clients integrations_webhookToken (sparse, multikey) — webhook alici belirtec aramasi.',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: indeks durumu + belirteçli entegrasyon sayısı (değer yok). */
    async plan(ctx) {
        assertCtxDbAllowed(ctx);
        const res = await planTargets(ctx, TARGETS);
        const { c } = collectionFor(ctx, KEY, COLL);
        res.collections[0].integrationsWithToken = await c.countDocuments({ 'integrations.webhookToken': { $type: 'string' } });
        return res;
    },
    async up(ctx) { assertCtxDbAllowed(ctx); return upTargets(ctx, TARGETS); },
    async down(ctx) { assertCtxDbAllowed(ctx); return downTargets(ctx, TARGETS); },
};
module.exports.TARGETS = TARGETS;
