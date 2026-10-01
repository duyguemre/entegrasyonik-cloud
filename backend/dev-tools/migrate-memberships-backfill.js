'use strict';
/** ADR-0028 E1/E2 — Users -> Memberships türetme (idempotent upsert, $setOnInsert). Varsayılan DRY-RUN (diff raporu).
 *  Yazma: --apply --i-have-verified-backup --backup-ref backup/<yol> (+ Memberships benzersiz indeksi kurulu olmalı;
 *  sahipsiz tenant varsa ayrıca --accept-ownerless). Geri alma: --down --apply (createdBy 'migration:0004' silinir).
 *  Onay olmadan ÇALIŞTIRMAYIN (insan adımı: docs/audits/TENANT_USER_RBAC_AUDIT_2026-09-30.md WP-A6). */
const { runBackfill, runMembershipsCli } = require('./_membershipsCommon');
runMembershipsCli('migrate-memberships-backfill', (ctx) => runBackfill(ctx));
