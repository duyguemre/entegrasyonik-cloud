// INT-01 testConnection (Pazarama): OAuth2 token + ürün listesi TEK kayıt. Gerçek ağ YOK.
import Pazarama from '@integration/modules/marketplace/pazarama';
import { runTestConnectionSuite } from '../../helpers/testConnectionSuite';

runTestConnectionSuite({
    name: 'Pazarama',
    timeoutEnv: 'PAZARAMA_HTTP_TIMEOUT_MS',
    build: (baseUrl) => new Pazarama({ clientId: 82, integrationSettings: { settings: { APIKEY: 'PZKEY-tc-1', APISECRET: 'PZSECRET-tc-2' }, urls: { baseUrl, tokenUrl: `${baseUrl}/connect/token` } } }),
    preHandle: (req, res) => {
        if (!req.url?.includes('/connect/token')) return false;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'tok-pz-tc', expires_in: 3600 }));
        return true;
    },
    expect: { path: '/product/products', queryIncludes: ['page=1', 'size=1'] },
    secrets: ['PZKEY-tc-1', 'PZSECRET-tc-2', 'tok-pz-tc'],
});
