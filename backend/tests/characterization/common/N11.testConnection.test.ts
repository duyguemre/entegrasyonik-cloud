// INT-01 testConnection (N11): REST ürün sorgusu, TEK kayıt. Gerçek ağ YOK.
import N11 from '@integration/modules/marketplace/n11';
import { runTestConnectionSuite } from '../../helpers/testConnectionSuite';

runTestConnectionSuite({
    name: 'N11',
    timeoutEnv: 'N11_HTTP_TIMEOUT_MS',
    build: (baseUrl) => new N11({ clientId: 81, integrationSettings: { settings: { APIKEY: 'N11KEY-tc-1', APISECRET: 'N11SECRET-tc-2' }, urls: { baseUrl } } }),
    expect: { path: '/ms/product-query', queryIncludes: ['page=0', 'size=1'] },
    secrets: ['N11KEY-tc-1', 'N11SECRET-tc-2'],
});
