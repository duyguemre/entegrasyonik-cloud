'use strict';
/** ADR-0028 G1 — GERİ ALINAMAZ temizlik: merkezi Users $unset owner/roleCode/resources; tenant Users $unset password.
 *  VARSAYILAN KAPALI (dry-run). Yazma için hepsi: --apply --i-have-verified-backup --backup-ref backup/<yol>
 *  --confirm-irreversible-unset. Önce backup/g1-dumps/ altına döküm alınır. K3 (MEMBERSHIP_SOURCE=membership, >=14 gün gözlem) sonrası. */
const { runCleanup, runMembershipsCli } = require('./_membershipsCommon');
runMembershipsCli('migrate-memberships-cleanup', (ctx) => runCleanup(ctx));
