'use strict';
/**
 * DB-15 / ADR-0021 D16 (Tenant, CONTRACT, ilk sira): `Messages.externalMessageId_1` (UNIQUE, tek alanli) drift indeksini dusurur.
 * Sema `{integrationCode, externalMessageId}` BILESIK unique ister (`client/models/Message.ts`); tek alanli unique farkli kanallarda ayni
 * dis kimligi olan mesajlari SESSIZCE kaybettirir (E11000). Sira: (1) bilesik unique `integrationCode_1_externalMessageId_1` kurulur
 * (var ise no-op), (2) tek alanli unique dusurulur. Diger D16 kalemleri (Orders.orderDate_1, Invoices.orderId_1_type_1, onek-ortusen tekiller)
 * `$indexStats` kanitina baglidir ve BU gocte YOK (ayri is).
 * YALNIZ onayli gocte calisir (kural 3 yedek; once yerel, Atlas ayri onay). CALISTIRILMADI. kind=contract: down icin
 * `--i-understand-irreversible` gerekir. Idempotent (ikinci up no-op).
 * down: `externalMessageId_1` UNIQUE'i geri kurar. UYARI: up sonrasi farkli kanallarda ayni externalMessageId ile mesaj yazildiysa
 * down E11000 ile basarisiz olur (veri degistirilmez; runner 'failed' isaretler) -- once cakisan belgeler elle cozulmeli.
 */
const {
    assertCtxDbAllowed, collectionFor, listIndexes, ensureIndex, dropIndexIfExists, classify,
} = require('../dev-tools/_migrationIndexes');

const COMPOUND = { fields: { integrationCode: 1, externalMessageId: 1 }, options: { unique: true, name: 'integrationCode_1_externalMessageId_1' } };
const LEGACY = { fields: { externalMessageId: 1 }, options: { unique: true, name: 'externalMessageId_1' } };
const KEY = 'messages';
const COLL = 'Messages';
const TARGETS = [{ key: KEY, defaultCollection: COLL, indexes: [COMPOUND] }];

module.exports = {
    id: '0010-messages-external-id-drift-tenant',
    scope: 'tenant',
    kind: 'contract',
    description: 'DB-15 / D16 (Tenant, contract): Messages.externalMessageId_1 (tek alanli unique drift) dusurulur; bilesik unique {integrationCode,externalMessageId} garanti edilir.',
    batchSize: 500,
    throttleMs: 50,

    /** SALT-OKUMA: eylem = ne yapilacagi; koleksiyon/indeks yaratmaz. */
    async plan(ctx) {
        assertCtxDbAllowed(ctx);
        const { name, c } = collectionFor(ctx, KEY, COLL);
        const list = await listIndexes(c);
        const legacy = list.find((i) => i.name === LEGACY.options.name);
        return {
            collections: [{
                collection: name,
                indexes: [
                    { name: COMPOUND.options.name, ...classify(list, COMPOUND) },
                    { name: LEGACY.options.name, action: legacy ? (legacy.unique ? 'drop-unique-legacy' : 'drop-legacy') : 'absent' },
                ],
            }],
        };
    },

    async up(ctx) {
        assertCtxDbAllowed(ctx);
        const { name, c, db } = collectionFor(ctx, KEY, COLL);
        const indexes = [await ensureIndex(c, db, COMPOUND)]; // bilesik ONCE (yerine gecen indeks kurulmadan tek alanli dusurulmez)
        indexes.push(await dropIndexIfExists(c, LEGACY.options.name));
        return { collections: [{ collection: name, indexes }] };
    },

    async down(ctx) {
        assertCtxDbAllowed(ctx);
        const { name, c, db } = collectionFor(ctx, KEY, COLL);
        return { collections: [{ collection: name, indexes: [await ensureIndex(c, db, LEGACY)] }] };
    },
};
module.exports.TARGETS = TARGETS;
