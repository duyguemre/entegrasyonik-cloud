// INT-01 testConnection (Ideasoft): Bearer token ile ürün listesi TEK kayıt. Gerçek ağ YOK (token hazır; OAuth akışı kapsam dışı).
import Ideasoft from '@integration/modules/ecommerce/ideasoft';
import { runTestConnectionSuite } from '../../helpers/testConnectionSuite';

runTestConnectionSuite({
    name: 'Ideasoft',
    timeoutEnv: 'IDEASOFT_HTTP_TIMEOUT_MS',
    build: (baseUrl) => new Ideasoft({ clientId: 83, integrationSettings: { settings: { storeName: 'test', key: 'IDKEY-tc-1', secret: 'IDSECRET-tc-2' }, urls: { baseUrl } } }),
    prepare: (a) => (a as any).service.setCurrentToken('tok-id-tc'),
    expect: { path: '/products', queryIncludes: ['limit=1', 'page=1'] },
    secrets: ['IDKEY-tc-1', 'IDSECRET-tc-2', 'tok-id-tc'],
});
