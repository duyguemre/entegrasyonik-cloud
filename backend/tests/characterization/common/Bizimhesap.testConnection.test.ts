// INT-01 testConnection (Bizimhesap): sipariş listesi TEK kayıt (orderListUrl yoksa ürün listesi). Gerçek ağ YOK.
import Bizimhesap from '@integration/modules/erp/bizimhesap';
import { runTestConnectionSuite } from '../../helpers/testConnectionSuite';

runTestConnectionSuite({
    name: 'Bizimhesap',
    timeoutEnv: 'BIZIMHESAP_HTTP_TIMEOUT_MS',
    build: (baseUrl) => new Bizimhesap({ clientId: 84, integrationSettings: { settings: { key: 'BHKEY-tc-1', secret: 'BHSECRET-tc-2', sellerId: '55' }, urls: { baseUrl, orderListUrl: `${baseUrl}/orders/<SELLERID>` } } }),
    expect: { path: '/orders/55', queryIncludes: ['page=0', 'size=1'] },
    secrets: ['BHKEY-tc-1', 'BHSECRET-tc-2'],
});
