'use strict';
/** ADR-0028 G0 — SALT-OKUMA üyelik ön kontrolü. Kullanım: node dev-tools/precheck-memberships.js [appDb] [--write-report]
 *  Çıkış: 0 temiz, 2 dikkat gerektiren ayrışma (insan karar verir), 1 hata. Yazma yok; e-postalar maskeli. */
const { runPrecheck, runMembershipsCli } = require('./_membershipsCommon');
runMembershipsCli('precheck-memberships', (ctx) => runPrecheck(ctx));
