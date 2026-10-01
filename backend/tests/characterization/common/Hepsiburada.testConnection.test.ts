// INT-05 testConnection (Hepsiburada): sipariş listesi TEK kayıt (limit=1). Gerçek ağ YOK.
import Hepsiburada from '@integration/modules/marketplace/hepsiburada';
import { runTestConnectionSuite } from '../../helpers/testConnectionSuite';

runTestConnectionSuite({
    name: 'Hepsiburada',
    timeoutEnv: 'HB_HTTP_TIMEOUT_MS',
    build: (baseUrl) => new Hepsiburada({ clientId: 85, integrationSettings: { settings: { APIKEY: 'HBKEY-tc-1', APISECRET: 'HBSECRET-tc-2', SELLERID: 'M-55' }, urls: { BASEURL: baseUrl } } }),
    expect: { path: '/orders/merchantid/M-55', queryIncludes: ['limit=1', 'offset=0'] },
    secrets: ['HBKEY-tc-1', 'HBSECRET-tc-2', Buffer.from('HBKEY-tc-1:HBSECRET-tc-2').toString('base64')],
});
