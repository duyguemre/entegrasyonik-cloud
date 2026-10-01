// INT-01 testConnection (Trendyol): onaylı ürün listesi, TEK kayıt, servis grubu product_read. Gerçek ağ YOK.
import Trendyol from '@integration/modules/marketplace/trendyol';
import { makeParams, SELLER, V2_URLS } from '../../helpers/trendyolProductFixtures';
import { runTestConnectionSuite } from '../../helpers/testConnectionSuite';

runTestConnectionSuite({
    name: 'Trendyol',
    timeoutEnv: 'TY_HTTP_TIMEOUT_MS',
    build: (baseUrl) => new Trendyol(makeParams({ urls: { ...V2_URLS, baseUrl }, settings: { APIKEY: 'TYKEY-tc-1', APISECRET: 'TYSECRET-tc-2' } })),
    expect: { path: `/product/sellers/${SELLER}/products/approved`, queryIncludes: ['page=0', 'size=1'] },
    secrets: ['TYKEY-tc-1', 'TYSECRET-tc-2', Buffer.from('TYKEY-tc-1:TYSECRET-tc-2').toString('base64')],
});
