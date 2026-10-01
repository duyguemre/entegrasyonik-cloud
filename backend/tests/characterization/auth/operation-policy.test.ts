import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

// ADR-0001 adım 5: OPERATION_POLICY kaydı, kademe çözümü (resolveTier/isAllowed) ve RunOperation/ApiWrapper varsayılan reddi.
// DB/Redis/ağ YOK: servisler sahte sınıflarla değiştirilir; servis kaynakları DB'ye dokunmadan TypeScript AST ile okunur.
// Kimlik bilgisi yok; principal/userContext değerleri sahte, yalnızca test amaçlıdır.

const SRC_API = path.resolve(__dirname, '../../../src/api');
const SRC_RPC = path.join(SRC_API, 'rpc');
const FE_SRC = path.resolve(__dirname, '../../../../frontend/src');

// ---------------------------------------------------------------------------------------------------------------------
// Yardımcı: backend servis kaydı (src/api/rpc/index.ts) ve servislerin genel (public) metotları — AST ile, import ETMEDEN
// ---------------------------------------------------------------------------------------------------------------------
function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
}

/** index.ts'teki `export default { ... }` nesnesinin (yorumsuz) servis adları -> servis dosyası. */
function readServiceRegistry(): Record<string, string> {
  const sf = parse(path.join(SRC_RPC, 'index.ts'));
  const importPaths: Record<string, string> = {};
  const registered: string[] = [];
  sf.forEachChild((n) => {
    if (ts.isImportDeclaration(n) && n.importClause?.name && ts.isStringLiteral(n.moduleSpecifier)) {
      importPaths[n.importClause.name.text] = n.moduleSpecifier.text;
    }
    if (ts.isExportAssignment(n) && ts.isObjectLiteralExpression(n.expression)) {
      for (const p of n.expression.properties) {
        if (ts.isShorthandPropertyAssignment(p)) registered.push(p.name.text);
      }
    }
  });
  const out: Record<string, string> = {};
  for (const name of registered) out[name] = path.join(SRC_RPC, importPaths[name] + '.ts');
  return out;
}

/** Dosyadaki ilk sınıfın private/protected/static OLMAYAN metot ve arrow-özellik adları. */
function publicMethods(file: string): string[] {
  const sf = parse(file);
  const names: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isClassDeclaration(n) && names.length === 0) {
      for (const m of n.members) {
        const mods = ts.canHaveModifiers(m) ? ts.getModifiers(m) ?? [] : [];
        const hidden = mods.some((x) => x.kind === ts.SyntaxKind.PrivateKeyword || x.kind === ts.SyntaxKind.ProtectedKeyword || x.kind === ts.SyntaxKind.StaticKeyword);
        if (hidden) continue;
        if (ts.isMethodDeclaration(m) && ts.isIdentifier(m.name)) names.push(m.name.text);
        if (ts.isPropertyDeclaration(m) && ts.isIdentifier(m.name) && m.initializer && (ts.isArrowFunction(m.initializer) || ts.isFunctionExpression(m.initializer))) names.push(m.name.text);
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return names;
}

const SERVICE_FILES = readServiceRegistry();
const SERVICE_METHODS: Record<string, string[]> = Object.fromEntries(Object.entries(SERVICE_FILES).map(([s, f]) => [s, publicMethods(f)]));

// ---------------------------------------------------------------------------------------------------------------------
// Yardımcı: FE'nin çağırdığı operasyon envanteri (statik tarama)
// ---------------------------------------------------------------------------------------------------------------------
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|vue|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * FE'nin dinamik (değişken/şablon) ilk argümanla `restApi.post/get/postImage/getExternal` çağırdığı dosyalar, ELLE çözülmüştür:
 * bu dosyaların gerçek uç noktaları aynı dosyalarda/composable'larda 'XService/op' DÜZ METİN sabitleri olarak geçer ve
 * "düz metin sabit" taramasıyla yakalanır (ör. useOrderActions.ts'teki config haritası). Yeni bir dosya dinamik çağrı
 * eklerse bu test kırılır: uç noktaları çöz, kayda ekle, sonra dosyayı buraya ekle.
 */
const DYNAMIC_CALL_FILES_RESOLVED = [
  'components/order/composables/useOrderActions.ts',
  'components/productDefinitions/products/BatchActions/useBatchActions.ts',
  'views/secure/ClaimListView.vue',          // executeClaimAction -> components/claim/composables/useClaimActions.ts sabitleri
  'views/secure/CustomerListView.vue',       // executeAction -> components/customer/composables/useCustomerActions.ts sabitleri
  'views/secure/OrderListView.vue',          // executeOrderAction -> useOrderActions/useOrderCancel sabitleri + bulkCancelOrder
  'views/secure/user/AuthorizationListView.vue', // 'UserService/createUser' | 'UserService/updateUser' üçlü ifadesi
  'components/adminPanel/integrations/useIntegrationConfigApi.ts', // ADR-0020 C: `call(operation,...)` -> `IntegrationConfigService/${operation}`;
  // operation her çağrı sitesinde düz metin sabit ('list'/'getEffectiveConfig'/'history'/'saveDraft'/'discardDraft'/
  // 'previewPublish'/'publish'/'rollback'/'takeOverLock'/'testEndpoint') — backend `integration-config-service.ts`'in
  // GERÇEK public metotlarıyla birebir eşleşiyor, doğrulandı.
  'components/adminPanel/integrations/useIntegrationComplianceApi.ts', // ADR-0018 B: `call(operation,...)` ->
  // `IntegrationComplianceService/${operation}`; sabitler 'list'/'summary'/'getDetail'/'transition' — backend
  // `integration-compliance-service.ts` public metotları ve capabilities/domains/platform.ts bağlarıyla eşleşiyor (2026-09-30).
];

/**
 * FE'nin çağırdığı AMA backend'de karşılığı olmayan (bugün de çalışmayan: "Operation not implemented"/servis yok) uç noktalar.
 * Kayda GİRMEZ (ölü kayıt olmaz). Backend'e metot eklenirse test kırılır: kayda taşınmalıdır.
 */
/**
 * [ADR-0003 adım 8] Kayıtta OLAN ama FE'nin HENÜZ çağırmadığı operasyonlar: KVKK/tenant yaşam döngüsü uçları
 * backend-only olarak bu görevde eklendi; FE ekranları (hesap/tenant silme, dışa aktarma, müşteri anonimleştirme)
 * Faz 2/3 kapsamındadır (bu görevin KAPSAMI DIŞI). `AdminService/get` (tek eski istisna) ile aynı desen.
 */
const BACKEND_ONLY_NOT_YET_IN_FE = [
  'TenantDataService/cancelDeletion',
  // [ADR-0028 WP-A4] davet/askıya alma/sahiplik devri/step-up: backend hazır, FE ekranları (F-A4) bulut işi.
  'UserService/inviteUser', 'UserService/resendInvitation', 'UserService/revokeInvitation', 'UserService/listInvitations',
  'UserService/suspendUser', 'UserService/reactivateUser', 'UserService/initiateOwnershipTransfer', 'UserService/cancelOwnershipTransfer',
  'UserService/acceptOwnershipTransfer', 'AccountService/reauthenticate',
  'CustomerService/anonymizeCustomer',
  // [ADR-0005 Karar 8] webhook token üretme/rotasyon; FE ekranı Faz 2/3 kapsamında (bugün webhook kurulumu yok)
  'IntegrationService/generateWebhookToken',
  // Hesap yaşam döngüsü (docs/API_ACCOUNT_LIFECYCLE.md): FE ekranları (Hesabım/Güvenlik, ChangePasswordView yeniden yazımı) ADR-0015 sonrası.
  // Kimliksiz üç uç (requestPasswordReset/confirmPasswordReset/verifyEmail) kayıtta DEĞİL, OPEN_OPERATIONS'tadır.
  // [API_TENANT_SURFACE] tenant-yüzlü yeni uçlar: backend hazır, FE ekranları ADR-0015 sonrası (bkz. docs/API_TENANT_SURFACE.md)
  'IntegrationService/getIntegrationHealth', // §3 entegrasyon sağlığı
  // [ADR-0018 Aşama A] yetenek manifestosu; uç hazır, FE kapsam rozeti bağlanması ayrı görev (ADR-0015 sonrası).
  'IntegrationService/getCatalog',
  // [ADR-0027 §C] doğrudan (imzalı PUT) görsel yükleme bileti + onayı: backend hazır, FE sözleşmesi docs/IMAGE_UPLOAD_CONTRACT.md (bulut FE görevi).
  'ImageService/createUploadUrl', 'ImageService/confirmUpload',
  'StockService/getStockOverview', // §2 OVERSOLD/rezervasyon özeti
  // [Faz-3] stok özellikleri (docs/API_STOCK_FEATURES.md): backend hazır, FE ekranları ADR-0015 sonrası.
  'StockService/listLowStock', 'StockService/listMovements', 'StockService/getPublishLagSummary',
  'AuditService/getAuditLogs', // §4 denetim günlüğü okuma
  // [COM-04] tenant komisyon override (docs/API_TENANT_SURFACE.md §10): backend hazır, FE "Komisyon oranları" tablosu bulut FE görevi.
  'FinancialService/listCommissionOverrides', 'FinancialService/setCommissionOverride', 'FinancialService/deleteCommissionOverride',
  'IntegrationService/testConnection', // [INT-01] baglantiyi test et (API_TENANT_SURFACE 11): FE dugmesi bulut FE gorevi
  // [ADR-0020 Aşama B] entegrasyon/motor ayar yönetimi: backend hazır, FE ekranları ADR-0020 Aşama C kapsamında.
  'IntegrationConfigService/list', 'IntegrationConfigService/get', 'IntegrationConfigService/getEffectiveConfig', 'IntegrationConfigService/history',
  'IntegrationConfigService/saveDraft', 'IntegrationConfigService/discardDraft', 'IntegrationConfigService/previewPublish',
  'IntegrationConfigService/publish', 'IntegrationConfigService/rollback', 'IntegrationConfigService/takeOverLock',
  'IntegrationConfigService/testEndpoint',
  // [ADR-0020 Aşama D] kill-switch + drift önerisi: backend hazır, FE ekranları ADR-0020 Aşama C kapsamında.
  'IntegrationConfigService/proposeFromFinding', 'IntegrationConfigService/setIntake',
  // [ADR-0018 Karar 2/4 Aşama B] entegrasyon uyum bulguları: backend hazır, FE "Entegrasyon uyum" konsol ekranı ayrı görevde (buluta devredilecek).
  'IntegrationComplianceService/list', 'IntegrationComplianceService/get', 'IntegrationComplianceService/summary',
  'IntegrationComplianceService/getDetail', 'IntegrationComplianceService/transition',
  // [ADR-0026 WP-LOG L2] backoffice log kontrol merkezi + denetim ekranı (yalnız /admin-api): backoffice SPA ayrı yüzey; bu FE kökleri çağırmaz.
  'BackofficeLogService/list', 'BackofficeLogService/issueGroups', 'BackofficeLogService/issueTrend', 'BackofficeLogService/trace', 'BackofficeLogService/volume',
  'BackofficeErrorService/setStatus', 'BackofficeAuditService/list',
  // [B12] platform yöneticisi yönetimi (yalnız /admin-api): backoffice SPA ayrı yüzey.
  'BackofficeAdminUserService/list', 'BackofficeAdminUserService/invite', 'BackofficeAdminUserService/disable', 'BackofficeAdminUserService/enable', 'BackofficeAdminUserService/resetMfa',
  // [B2/B4] abonelik + gelir + tenant yaşam döngüsü (yalnız /admin-api): backoffice SPA ayrı yüzey.
  'BackofficeBillingService/listSubscriptions', 'BackofficeBillingService/getSubscription', 'BackofficeBillingService/extendTrial', 'BackofficeBillingService/cancelSubscription', 'BackofficeBillingService/changePlan', 'BackofficeBillingService/getRevenueMetrics',
  // [PRC-CFG] rekabet modülü ayarları + tenant istisnası (yalnız /admin-api): backoffice SPA ayrı yüzey.
  'BackofficeBillingService/getCompetitionSettings', 'BackofficeBillingService/getTenantCompetition', 'BackofficeBillingService/setCompetitionOverride',
  // [PRC-R2] fiyat kuralları kill-switch durumu + toplam istatistik (yalnız /admin-api): backoffice SPA ayrı yüzey.
  'BackofficeBillingService/getPricingRulesOverview',
  'BackofficeTenantService/getLifecycle', 'BackofficeTenantService/cancelDeletion', 'BackofficeTenantService/listTenants', 'BackofficeTenantService/getHealthSummary',
  'BackofficePrefsService/listViews', 'BackofficePrefsService/saveView', 'BackofficePrefsService/deleteView',
  // [B5/B6/B8/B9] entegrasyon sağlığı + altyapı gözlemi + cache (yalnız /admin-api).
  'BackofficeIntegrationService/getApiHealth', 'BackofficeIntegrationService/getResilienceState',
  // [ADR-0029 NB7/NB8] duyuru bandı (F-N4 bulut FE işi) + backoffice bildirim/duyuru/uyarı (yalnız /admin-api).
  'AnnouncementService/getActive',
  'BackofficeNotificationService/listAnnouncements', 'BackofficeNotificationService/getAnnouncement', 'BackofficeNotificationService/createAnnouncement', 'BackofficeNotificationService/updateAnnouncement', 'BackofficeNotificationService/scheduleAnnouncement', 'BackofficeNotificationService/cancelAnnouncement', 'BackofficeNotificationService/previewAnnouncement',
  'BackofficeNotificationService/getDeliveryStats', 'BackofficeNotificationService/listDeliveries', 'BackofficeNotificationService/retryDelivery', 'BackofficeNotificationService/discardDelivery', 'BackofficeNotificationService/getTenantHistory', 'BackofficeNotificationService/getCatalog', 'BackofficeNotificationService/previewTemplate', 'BackofficeNotificationService/sendTestEmail',
  'BackofficeNotificationService/listAlerts', 'BackofficeNotificationService/muteAlert',
  'BackofficeInfraService/getRedisStatus', 'BackofficeInfraService/getMongoStatus', 'BackofficeInfraService/getMongoCollections', 'BackofficeInfraService/getSlowQueries', 'BackofficeInfraService/getCacheMetrics', 'BackofficeInfraService/flushCacheFamily',
  'IntegrationConfigService/getCatalog',
  // [B1/B7] genel bakış + motor ve kuyruklar (yalnız /admin-api): backoffice SPA ayrı yüzey.
  'BackofficeOverviewService/getHealth', 'BackofficeOverviewService/getAttention', 'BackofficeOverviewService/getPulse', 'BackofficeEngineService/getQueues', 'BackofficeEngineService/listFailedJobs', 'BackofficeEngineService/retryJob', 'BackofficeEngineService/retryJobs', 'BackofficeEngineService/discardJob', 'BackofficeEngineService/getStateMachineJobs', 'BackofficeEngineService/releaseStuckLease', 'BackofficeEngineService/listJobRuns',
  // §6 politika kaydı eksik olan, FE'nin (N9/N14/N15/iade detayı) ihtiyaç duyacağı güvenli/tenant-izole salt-okunur + düşük riskli uçlar
  'FinancialService/getFinancialSummary', 'FinancialService/getCargoInvoices', 'FinancialService/getPayoutDetails',
  // [COM-03/COM-07] komisyon kaynagi RPC'leri: FE net fiyat gosterimi (COM-07 FE) bagli degil
  'FinancialService/getOrderCommissionSummary', 'FinancialService/getCommissionByBarcodes', 'FinancialService/getNetRevenuePreview', 'FinancialService/getRealizedCommissionByCategory',
  'ShipmentService/getShipments', 'OrderService/markAsPrinted', 'ClaimService/getClaimById', 'NotificationService/getUnreadCount',
  // [ADR-0029 NB4] bildirim merkezi v2 / tercihler: backend hazır, FE bulut işi (F-N1/F-N2)
  'NotificationService/archive', 'NotificationService/unarchive', 'NotificationService/getCatalog', 'NotificationService/getPreferences',
  'NotificationService/updatePreferences', 'NotificationService/getTenantDefaults', 'NotificationService/updateTenantDefaults',
];

// ADR-0008 frontend SONUÇ (Faz 3): `LgsService/retrieveLGS`/`saveLGS` (LgsService zaten HİÇ yoktu) yalnızca
// `SubscriptionView.vue`'nun ürünle ilgisiz LGS/eğitim yer tutucu içeriğinde geçiyordu (ADR-0011 Karar 2 "P1-yeni") —
// o içerik gerçek abonelik/plan ekranıyla DEĞİŞTİRİLDİĞİNDEN literal artık FE'de YOK, listeden ÇIKARILDI (bu satırın
// kendi kuralı: "FE'den silinirse kırılır").
const FE_CALLS_WITHOUT_BACKEND = [
  'SecurityService/getCaptcha', // [WP-A5] backend'de KALDIRILDI (sahte captcha); FE çağrısı yalnız eski requireCaptcha dalında (artık tetiklenmez) — FE temizliği bulut görevi
  'ECommerceService/retrieveProductsFromIntegration', // ECommerceService kayıtlı değil (api/rpc/index.ts'te yorum satırı)
  'IntegrationService/checkProductStatus', 'IntegrationService/processPlatformProduct', 'IntegrationService/retrieveProductsFromClientMarketplace',
  'ProductService/batchProcessUpdate', 'ProductService/batchProcessDelete', // yalnızca VariantService'te var
  'ClaimService/bulkDeleteClaims', 'CustomerService/bulkDeleteCustomers', 'CustomerService/deleteCustomer',
  'ImageApi/getImage', 'ImageApi/downloadImage', // ImageApiManager rotası var ama ImageService.getImage metodu HİÇ yok (bugün de 500)
];

interface FeInventory {
  ops: Set<string>;           // 'Servis/op' ve 'ImageApi/route'
  dynamicFiles: Set<string>;  // dinamik ilk argümanlı çağrı içeren dosyalar (FE_SRC'ye göre)
}

function scanFrontend(): FeInventory {
  const ops = new Set<string>();
  const dynamicFiles = new Set<string>();
  const literalRe = /['"`]([A-Z][A-Za-z]*Service)\/([A-Za-z_]+)['"`]/g; // düz metin 'Servis/op' (doğrudan ve dolaylı çağrılar)
  const callRe = /\b(?:restApi|useRestApi\(\))\s*\.\s*(post|get|postImage|getExternal|postImageUpload|postIdentityUpload|downloadImage|getImage)\s*\(\s*([^,)\n]*)/g;
  for (const f of walk(FE_SRC)) {
    const text = fs.readFileSync(f, 'utf8');
    const rel = path.relative(FE_SRC, f).split(path.sep).join('/');
    let m: RegExpExecArray | null;
    literalRe.lastIndex = 0;
    while ((m = literalRe.exec(text))) ops.add(m[1] + '/' + m[2]);
    callRe.lastIndex = 0;
    while ((m = callRe.exec(text))) {
      const method = m[1];
      const arg = m[2].trim();
      const lit = /^(['"`])([^'"`$]*)\1$/.exec(arg);
      if (method === 'get' && lit && /^[A-Z][A-Za-z]*Service$/.test(lit[2])) ops.add(lit[2] + '/get'); // GET /api/:service -> get()
      else if (method === 'postImage' && lit) ops.add('ImageApi/' + lit[2]);
      else if (method === 'postImageUpload') ops.add('ImageApi/upload');
      else if (method === 'postIdentityUpload') ops.add('ImageApi/uploadIdentity');
      else if (method === 'downloadImage') ops.add('ImageApi/downloadImage');
      else if (method === 'getImage') ops.add('ImageApi/getImage');
      else if ((method === 'post' || method === 'get' || method === 'postImage' || method === 'getExternal') && !lit) dynamicFiles.add(rel);
    }
  }
  // Uygulama açılışında kullanılan yardımcı çağrılar: restApi.get('checkAuthentication'/'userContext') özel rotadır, kayıt dışıdır.
  return { ops, dynamicFiles };
}

const feAvailable = fs.existsSync(FE_SRC);
const describeFe = feAvailable ? describe : describe.skip;
if (!feAvailable) console.warn('[operation-policy.test] frontend/src bulunamadı: FE envanter testleri atlandı (monorepo dışı çalıştırma).');

// ---------------------------------------------------------------------------------------------------------------------
// Sahte servislerle RunOperation (gerçek OPERATION_POLICY kaydı kullanılır)
// ---------------------------------------------------------------------------------------------------------------------
const calls: string[] = [];
function fakeService(name: string, methods: string[]) {
  class Fake {
    constructor(public clientId: any, public request: any) { calls.push(`new ${name}`); }
    async init() { calls.push(`init ${name}`); }
  }
  for (const m of methods) (Fake.prototype as any)[m] = async function () { calls.push(`${name}.${m}`); return { ok: name + '.' + m, clientId: (this as any).clientId }; };
  return Fake;
}

function loadRunWithRealPolicy(apis: Record<string, any>) {
  let mod: any;
  jest.isolateModules(() => {
    jest.doMock('../../../src/api/rpc/index', () => ({ __esModule: true, default: apis }));
    jest.doMock('../../../src/api/rpc/requestValidation', () => ({ validateRpcRequest: (_s: string, _o: string, b: unknown) => b })); // [ADR-0023] yetki testi: gövde şeması ayrı sınanır (tests/unit/api/requestValidation.test.ts)
    mod = { run: require('../../../src/api/rpc/RunOperation').default, runImageApi: require('../../../src/api/rpc/RunOperation').runImageApi, policy: require('../../../src/api/rpc/operationPolicy') };
  });
  return mod as { run: any; runImageApi: any; policy: typeof import('../../../src/api/rpc/operationPolicy') };
}

// Aktörler (userContext = sunucuda DB'den kurulan bağlam; principal = doğrulanmış token içeriği)
const P = (over: any = {}) => ({ sub: 'u1', tid: 1, ga: false, tv: 0, imp: false, auth_time: 1, iat: 1, exp: 2, iss: 'i', aud: 'web', ...over });
const ACTORS = {
  operator: { uc: { _id: 'u1', order: 1, roleCode: 'ROLE_OPERATOR', owner: false }, pr: P() },
  noRole: { uc: { _id: 'u1', order: 1, owner: false }, pr: P() },
  unknownRole: { uc: { _id: 'u1', order: 1, roleCode: 'ROLE_WHATEVER', owner: false }, pr: P() },
  admin: { uc: { _id: 'u1', order: 1, roleCode: 'ROLE_ADMIN', owner: false }, pr: P() },
  roleOwnerNoFlag: { uc: { _id: 'u1', order: 1, roleCode: 'ROLE_OWNER', owner: false }, pr: P() },
  owner: { uc: { _id: 'u1', order: 1, roleCode: 'ROLE_OWNER', owner: true }, pr: P() },
  ownerFlagOnOperatorRole: { uc: { _id: 'u1', order: 1, roleCode: 'ROLE_OPERATOR', owner: true }, pr: P() },
  ga: { uc: { _id: 'g1', order: 4, roleCode: 'ROLE_ADMIN', isGlobalAdmin: true, owner: false }, pr: P({ sub: 'g1', ga: true, tid: 4, imp: true }) },
  gaNoStore: { uc: { _id: 'g1', roleCode: 'ROLE_ADMIN', isGlobalAdmin: true }, pr: P({ sub: 'g1', ga: true, tid: undefined, imp: false }) },
};

beforeEach(() => { calls.length = 0; });

// =====================================================================================================================
describe('resolveTier / isAllowed (kademe modeli)', () => {
  const { resolveTier, isAllowed } = require('../../../src/api/rpc/operationPolicy') as typeof import('../../../src/api/rpc/operationPolicy');
  const tierOf = (a: keyof typeof ACTORS) => resolveTier(ACTORS[a].uc, ACTORS[a].pr);

  it('tenant kullanıcısı kademeleri: OPERATOR/rolsüz/bilinmeyen rol = member; ROLE_ADMIN ve ROLE_OWNER = admin; owner:true = owner', () => {
    expect(tierOf('operator')).toEqual({ tier: 'member', platformAdmin: false });
    expect(tierOf('noRole')).toEqual({ tier: 'member', platformAdmin: false });
    expect(tierOf('unknownRole')).toEqual({ tier: 'member', platformAdmin: false });
    expect(tierOf('admin')).toEqual({ tier: 'admin', platformAdmin: false });
    expect(tierOf('roleOwnerNoFlag')).toEqual({ tier: 'admin', platformAdmin: false });
    expect(tierOf('owner')).toEqual({ tier: 'owner', platformAdmin: false });
    expect(tierOf('ownerFlagOnOperatorRole')).toEqual({ tier: 'owner', platformAdmin: false }); // owner bayrağı role bakmaz
  });

  it('kademe matrisi: member < admin < owner; platformAdmin ayrı dikey (tenant kademesi onu SAĞLAMAZ)', () => {
    const rows: Array<[keyof typeof ACTORS, boolean, boolean, boolean, boolean]> = [
      //                 member admin  owner  platformAdmin
      ['operator',        true, false, false, false],
      ['admin',           true, true,  false, false],
      ['roleOwnerNoFlag', true, true,  false, false],
      ['owner',           true, true,  true,  false],
      ['ga',              true, true,  false, true],
    ];
    for (const [a, m, ad, ow, pa] of rows) {
      const actor = tierOf(a);
      expect([a, 'member', isAllowed('member', actor)]).toEqual([a, 'member', m]);
      expect([a, 'admin', isAllowed('admin', actor)]).toEqual([a, 'admin', ad]);
      expect([a, 'owner', isAllowed('owner', actor)]).toEqual([a, 'owner', ow]);
      expect([a, 'platformAdmin', isAllowed('platformAdmin', actor)]).toEqual([a, 'platformAdmin', pa]);
    }
  });

  it('süper yönetici (ga + imp) tenant bağlamında ADMIN kademesindedir, OWNER DEĞİL (belgesinde owner:true olsa bile); platformAdmin çağırabilir', () => {
    for (const a of ['ga', 'gaNoStore'] as const) {
      const actor = tierOf(a);
      expect(actor).toEqual({ tier: 'admin', platformAdmin: true });
      expect(isAllowed('admin', actor)).toBe(true);
      expect(isAllowed('owner', actor)).toBe(false);
      expect(isAllowed('platformAdmin', actor)).toBe(true);
    }
    const gaWithOwnerDoc = resolveTier({ owner: true, roleCode: 'ROLE_OWNER' }, P({ ga: true, imp: true }));
    expect(isAllowed('owner', gaWithOwnerDoc)).toBe(false);
  });

  it('kademe yalnızca güvenilir kaynaktan: principal.role claim\'i ve userContext.isGlobalAdmin bayrağı KADEME VERMEZ; platformAdmin yalnızca principal.ga === true', () => {
    // token'daki role claim'i ROLE_OWNER dese de sunucudaki roleCode OPERATOR ise member
    expect(resolveTier({ roleCode: 'ROLE_OPERATOR' }, P({ role: 'ROLE_OWNER' })).tier).toBe('member');
    // userContext.isGlobalAdmin true ama doğrulanmış principal.ga false: platformAdmin DEĞİL
    expect(resolveTier({ isGlobalAdmin: true, roleCode: 'ROLE_ADMIN' }, P({ ga: false })).platformAdmin).toBe(false);
    // ga yalnızca === true ("true" string'i, 1 vb. sayılmaz)
    expect(resolveTier({}, P({ ga: 'true' })).platformAdmin).toBe(false);
    expect(resolveTier({}, P({ ga: 1 })).platformAdmin).toBe(false);
  });

  it('principal yoksa aktör yok: hiçbir kademe sağlanmaz (fail-closed); userContext tek başına yetmez', () => {
    const actor = resolveTier({ owner: true, roleCode: 'ROLE_OWNER' }, undefined);
    expect(actor).toEqual({ tier: undefined, platformAdmin: false });
    for (const t of ['member', 'admin', 'owner', 'platformAdmin'] as const) expect(isAllowed(t, actor)).toBe(false);
    expect(isAllowed('member', undefined as any)).toBe(false);
  });

  it('bozuk/bilinmeyen kademe adı hiçbir aktöre izin vermez', () => {
    expect(isAllowed('superuser' as any, tierOf('owner'))).toBe(false);
    expect(isAllowed(undefined as any, tierOf('ga'))).toBe(false);
  });
});

// =====================================================================================================================
describe('getRequiredTier: yalnızca kendi (own) kayıtlar; varsayılan ret', () => {
  const { getRequiredTier } = require('../../../src/api/rpc/operationPolicy') as typeof import('../../../src/api/rpc/operationPolicy');

  it('kayıtlı operasyon kademesini döner; kayıtsız/prototip/_önekli/tip hatalı girdi undefined (= ret)', () => {
    expect(getRequiredTier('MenuService', 'retrieveFavorites')).toBe('member');
    expect(getRequiredTier('UserService', 'createUser')).toBe('admin');
    expect(getRequiredTier('SecurityService', 'selectStore')).toBe('platformAdmin');
    for (const [s, o] of [
      ['MenuService', 'init'], ['MenuService', 'constructor'], ['MenuService', 'toString'], ['MenuService', 'hasOwnProperty'],
      ['MenuService', '__proto__'], ['MenuService', '_gizli'], ['MenuService', 'olmayan'],
      ['constructor', 'toString'], ['__proto__', 'get'], ['toString', 'get'], ['NoSuchService', 'get'], ['menuservice', 'get'], ['MenuService', 'RetrieveFavorites'],
    ]) expect([s, o, getRequiredTier(s, o)]).toEqual([s, o, undefined]);
    expect(getRequiredTier(undefined as any, 'get')).toBeUndefined();
    expect(getRequiredTier('MenuService', 123 as any)).toBeUndefined();
  });

  it('bozulmuş kayıt değeri (geçersiz kademe) da reddedilir', () => {
    const mod: any = require('../../../src/api/rpc/operationPolicy');
    mod.OPERATION_POLICY.__TmpBroken = { x: 'root' };
    try { expect(mod.getRequiredTier('__TmpBroken', 'x')).toBeUndefined(); } finally { delete mod.OPERATION_POLICY.__TmpBroken; }
  });
});

// =====================================================================================================================
describe('Kayıt bütünlüğü (ölü kayıt yok)', () => {
  const { OPERATION_POLICY, IMAGE_API_TARGETS, IMAGE_API_ROUTES_WITHOUT_BACKEND, PSEUDO_SERVICES } = require('../../../src/api/rpc/operationPolicy') as typeof import('../../../src/api/rpc/operationPolicy');

  it('servis kaydı (api/rpc/index.ts) AST ile okunabildi ve beklenen servisleri içerir', () => {
    expect(Object.keys(SERVICE_FILES).length).toBeGreaterThanOrEqual(24);
    expect(SERVICE_FILES.AdminService).toBeDefined();
    expect(SERVICE_METHODS.AdminService).toContain('getClients');
    expect(SERVICE_METHODS.SecurityService).toEqual(expect.arrayContaining(['login', 'register', 'selectStore', 'logout']));
  });

  it('kayıttaki her (servis, operasyon) çifti api/rpc/index.ts\'te kayıtlı bir servisin GERÇEK bir genel metoduna karşılık gelir', () => {
    const dead: string[] = [];
    for (const [service, ops] of Object.entries(OPERATION_POLICY)) {
      if (PSEUDO_SERVICES.includes(service)) continue;
      if (!SERVICE_METHODS[service]) { dead.push(`${service} (servis kayıtlı değil)`); continue; }
      for (const op of Object.keys(ops)) if (!SERVICE_METHODS[service].includes(op)) dead.push(`${service}/${op}`);
    }
    expect(dead).toEqual([]);
  });

  it('kayıtta yasaklı operasyon adı yok: init, constructor, _önekli, Object.prototype üyeleri; her kademe değeri geçerli', () => {
    for (const [service, ops] of Object.entries(OPERATION_POLICY)) {
      for (const [op, tier] of Object.entries(ops)) {
        expect([service, op, op === 'init' || op === 'constructor' || op.startsWith('_') || op in Object.prototype]).toEqual([service, op, false]);
        expect(['member', 'admin', 'owner', 'platformAdmin']).toContain(tier);
      }
    }
  });

  it('ImageApi sözde-servisi: kayıt ile IMAGE_API_TARGETS anahtarları birebir aynı; hedefler gerçek servis metotlarıdır', () => {
    expect(Object.keys(OPERATION_POLICY.ImageApi).sort()).toEqual(Object.keys(IMAGE_API_TARGETS).sort());
    for (const [route, [svc, op]] of Object.entries(IMAGE_API_TARGETS)) {
      expect([route, svc, SERVICE_METHODS[svc]?.includes(op)]).toEqual([route, svc, true]);
    }
    expect(PSEUDO_SERVICES).toContain('ImageApi');
    expect(SERVICE_FILES.ImageApi).toBeUndefined(); // gerçek servis değil
  });

  it('ImageApi rotaları ImageApiManager.ts\'teki gerçek rota adlarıyla eşleşir (upload, uploadIdentity, getImages, deleteImage, sortImages, deleteImageSelected + hedefsiz getImage, downloadImage)', () => {
    const src = fs.readFileSync(path.join(SRC_API, 'files', 'ImageApiManager.ts'), 'utf8');
    const routes = [...src.matchAll(/app\.(?:get|post)\(context \+ '\/([A-Za-z]+)/g)].map((m) => m[1]).sort();
    expect(routes).toEqual([...Object.keys(IMAGE_API_TARGETS), ...IMAGE_API_ROUTES_WITHOUT_BACKEND].sort());
    for (const r of IMAGE_API_ROUTES_WITHOUT_BACKEND) expect([r, r in OPERATION_POLICY.ImageApi, r in IMAGE_API_TARGETS]).toEqual([r, false, false]);
    // her rota runImageApi("<rota>") ile politika kaydına bağlıdır; ham runOperation kullanımı KALMAMIŞTIR (yorum satırları hariç)
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/\brunOperation\s*\(/);
    for (const r of routes) expect(code).toContain(`runImageApi("${r}"`);
  });
});

// =====================================================================================================================
describeFe('FE envanteri kayıtla uyumlu (statik tarama: frontend/src)', () => {
  const { OPERATION_POLICY, IMAGE_API_TARGETS } = require('../../../src/api/rpc/operationPolicy') as typeof import('../../../src/api/rpc/operationPolicy');
  const inv = feAvailable ? scanFrontend() : { ops: new Set<string>(), dynamicFiles: new Set<string>() };
  const registered = new Set(Object.entries(OPERATION_POLICY).flatMap(([s, ops]) => Object.keys(ops).map((o) => `${s}/${o}`)));

  it('tarama makul sayıda operasyon buldu (tarayıcı bozulmadıysa ~150)', () => {
    expect(inv.ops.size).toBeGreaterThan(120);
  });

  it('FE\'nin çağırdığı HER operasyon ya kayıttadır ya da bilinen "backend karşılığı olmayan" listesindedir (yeni FE çağrısı + unutulan kayıt = kırılır)', () => {
    const missing = [...inv.ops].filter((op) => !registered.has(op) && !FE_CALLS_WITHOUT_BACKEND.includes(op) && !/^SecurityService\/(login|register|logout)$/.test(op) && !/^AccountService\/(requestPasswordReset|confirmPasswordReset|verifyEmail|getInvitation|acceptInvitation)$/.test(op)).sort();
    expect(missing).toEqual([]);
  });

  it('"backend karşılığı olmayan" liste güncel: hâlâ gerçekten karşılıksız ve FE\'de hâlâ çağrılıyor (backend\'e eklenirse/FE\'den silinirse kırılır)', () => {
    for (const op of FE_CALLS_WITHOUT_BACKEND) {
      const [svc, name] = op.split('/');
      const backendHas = svc === 'ImageApi' ? name in IMAGE_API_TARGETS : !!SERVICE_METHODS[svc]?.includes(name);
      expect([op, 'backendde var mı', backendHas]).toEqual([op, 'backendde var mı', false]);
      expect([op, 'FE çağırıyor mu', inv.ops.has(op)]).toEqual([op, 'FE çağırıyor mu', true]);
      expect([op, 'kayıtta mı', registered.has(op)]).toEqual([op, 'kayıtta mı', false]);
    }
  });

  it('kayıtta FE\'nin çağırmadığı operasyon YOK (ADR: FE\'nin çağırmadığı kayda girmez); istisnalar AdminService/get + ADR-0003 adım 8 backend-only KVKK uçları (bkz. BACKEND_ONLY_NOT_YET_IN_FE)', () => {
    const notCalled = [...registered].filter((op) => !inv.ops.has(op) && op !== 'AdminService/get' && !BACKEND_ONLY_NOT_YET_IN_FE.includes(op)).sort();
    expect(notCalled).toEqual([]);
  });

  it('BACKEND_ONLY_NOT_YET_IN_FE listesi güncel: hâlâ kayıtta VE hâlâ FE tarafından çağrılMIYOR (FE eklerse/kayıttan çıkarsa kırılır)', () => {
    for (const op of BACKEND_ONLY_NOT_YET_IN_FE) {
      expect([op, 'kayıtta mı', registered.has(op)]).toEqual([op, 'kayıtta mı', true]);
      expect([op, 'FE çağırıyor mu', inv.ops.has(op)]).toEqual([op, 'FE çağırıyor mu', false]);
    }
  });

  it('dinamik (değişken/şablon) ilk argümanlı restApi çağrıları yalnızca ELLE ÇÖZÜLMÜŞ dosyalarda (bkz. DYNAMIC_CALL_FILES_RESOLVED); yeni dinamik çağrı kırar', () => {
    const unresolved = [...inv.dynamicFiles].filter((f) => !DYNAMIC_CALL_FILES_RESOLVED.includes(f)).sort();
    expect(unresolved).toEqual([]);
  });

  it('elle çözülmüş dinamik dosyaların uç noktaları (düz metin sabitleri) tarama tarafından yakalanmıştır', () => {
    for (const op of [
      'InvoiceService/createInvoice', 'ShipmentService/createShipment', 'OrderService/cancelOrder', 'OrderService/approveOrder', 'OrderService/bulkCancelOrder',
      'InvoiceService/bulkCreateInvoice', 'ShipmentService/bulkCreateShipment', 'OrderService/bulkApproveOrder', 'OrderService/getOrderRejectionReasons',
      'ProductService/exportExcel', 'IntegrationService/batchCreator', 'ClaimService/approveClaim', 'ClaimService/rejectClaim', 'ClaimService/bulkApproveClaim',
      'UserService/createUser', 'UserService/updateUser',
    ]) expect([op, inv.ops.has(op)]).toEqual([op, true]);
  });

  it('kritik atamalar: kullanıcı yönetimi/ayar yazma/kimlik bilgisi yazma = admin; AdminService ve selectStore = platformAdmin; günlük operasyonlar = member', () => {
    const t = (s: string, o: string) => (OPERATION_POLICY as any)[s][o];
    for (const [s, o] of [['UserService', 'createUser'], ['UserService', 'updateUser'], ['UserService', 'deleteUser'], ['UserService', 'getUsers'],
      ['SettingService', 'updateSettings'], ['IntegrationService', 'saveClientMarketplaceSettings'], ['IntegrationService', 'saveClientErpSettings'],
      ['IntegrationService', 'saveClientShipmentSettings'], ['IntegrationService', 'saveClientECommerceSettings'], ['ImageApi', 'uploadIdentity']]) expect([s, o, t(s, o)]).toEqual([s, o, 'admin']);
    expect(t('SecurityService', 'selectStore')).toBe('platformAdmin');
    for (const [s, o] of [['OrderService', 'getOrders'], ['ProductService', 'saveProduct'], ['MenuService', 'get'], ['SettingService', 'getSettings'], ['UserService', 'getResources'], ['ImageApi', 'upload']]) expect([s, o, t(s, o)]).toEqual([s, o, 'member']);
  });
});

// =====================================================================================================================
describe('RunOperation + gerçek OPERATION_POLICY: kademe matrisi', () => {
  const apis = () => ({
    MenuService: fakeService('MenuService', ['retrieveFavorites']),
    UserService: fakeService('UserService', ['createUser', 'getResources']),
    IntegrationService: fakeService('IntegrationService', ['saveClientMarketplaceSettings']),
    SettingService: fakeService('SettingService', ['updateSettings', 'getSettings', 'uploadLogo']),
    SecurityService: fakeService('SecurityService', ['selectStore', 'login', 'register', 'logout', 'get']),
  });
  const cases: Array<[string, string, Array<keyof typeof ACTORS>, Array<keyof typeof ACTORS>]> = [
    // servis, operasyon, İZİN VERİLENLER, REDDEDİLENLER
    ['MenuService', 'retrieveFavorites', ['operator', 'noRole', 'unknownRole', 'admin', 'owner', 'ga'], []],
    ['UserService', 'getResources', ['operator', 'admin', 'owner', 'ga'], []],
    ['UserService', 'createUser', ['admin', 'roleOwnerNoFlag', 'owner', 'ga'], ['operator', 'noRole', 'unknownRole']],
    ['IntegrationService', 'saveClientMarketplaceSettings', ['admin', 'owner', 'ga'], ['operator']],
    ['SettingService', 'updateSettings', ['admin', 'owner', 'ga'], ['operator']],
    ['SecurityService', 'selectStore', ['ga', 'gaNoStore'], ['operator', 'admin', 'roleOwnerNoFlag', 'owner', 'ownerFlagOnOperatorRole']],
  ];

  for (const [service, op, allowed, denied] of cases) {
    it(`${service}/${op}: izinli=[${allowed.join(',')}] reddedilen=[${denied.join(',')}]`, async () => {
      const { run } = loadRunWithRealPolicy(apis());
      for (const a of allowed) {
        calls.length = 0;
        const r = await run(ACTORS[a].uc, service, op, {}, ACTORS[a].pr);
        expect([a, r.ok]).toEqual([a, `${service}.${op}`]);
      }
      for (const a of denied) {
        calls.length = 0;
        await expect(run(ACTORS[a].uc, service, op, {}, ACTORS[a].pr)).rejects.toMatchObject({ message: 'Forbidden', statusCode: 403 });
        expect([a, calls]).toEqual([a, []]); // servis örneklenmedi, init çalışmadı, metot çağrılmadı
      }
    });
  }

  it('owner kademeli operasyon (henüz kayıtta yok; ADR 0003 veri dışa aktarma/silme için): yalnızca owner; ga/admin 403', async () => {
    const { run, policy } = loadRunWithRealPolicy({ ExportService: fakeService('ExportService', ['exportTenantData']) });
    (policy.OPERATION_POLICY as any).ExportService = { exportTenantData: 'owner' };
    expect((await run(ACTORS.owner.uc, 'ExportService', 'exportTenantData', {}, ACTORS.owner.pr)).ok).toBe('ExportService.exportTenantData');
    for (const a of ['admin', 'roleOwnerNoFlag', 'operator', 'ga'] as const) {
      await expect(run(ACTORS[a].uc, 'ExportService', 'exportTenantData', {}, ACTORS[a].pr)).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it('ga+imp aktör tenant servisini admin kademesiyle çağırır ve tenant = doğrulanmış tid (userContext.order); owner kademesi gerektiren işleme giremez', async () => {
    const { run } = loadRunWithRealPolicy(apis());
    const r = await run(ACTORS.ga.uc, 'UserService', 'createUser', {}, ACTORS.ga.pr);
    expect(r.clientId).toBe(4);
  });

  it('kimlik yoksa: kayıtlı operasyon 401 (servis çağrılmaz); kayıtsız operasyon 403', async () => {
    const { run } = loadRunWithRealPolicy(apis());
    await expect(run(undefined, 'MenuService', 'retrieveFavorites', {})).rejects.toMatchObject({ statusCode: 401 });
    await expect(run(ACTORS.owner.uc, 'MenuService', 'retrieveFavorites', {}, undefined)).rejects.toMatchObject({ statusCode: 401 });
    await expect(run(undefined, 'MenuService', 'olmayan', {})).rejects.toMatchObject({ statusCode: 403 });
    expect(calls).toEqual([]);
  });

  it('gövdeye konan sahte principal/userContext kademe yükseltmez (sunucu ezer; kademe yalnızca argümandaki doğrulanmış principal\'dan)', async () => {
    const { run } = loadRunWithRealPolicy(apis());
    await expect(run(ACTORS.operator.uc, 'UserService', 'createUser', { principal: { ga: true }, userContext: { owner: true, roleCode: 'ROLE_OWNER' } }, ACTORS.operator.pr))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(calls).toEqual([]);
  });
});

// =====================================================================================================================
describe('AdminService: TAMAMI platformAdmin (sıradan owner bile 403)', () => {
  const { OPERATION_POLICY } = require('../../../src/api/rpc/operationPolicy') as typeof import('../../../src/api/rpc/operationPolicy');

  it('AdminService\'in TÜM genel metotları kayıtta ve platformAdmin; kayıtta fazladan operasyon yok', () => {
    const methods = [...SERVICE_METHODS.AdminService].sort();
    expect(methods.length).toBeGreaterThanOrEqual(14);
    expect(Object.keys(OPERATION_POLICY.AdminService).sort()).toEqual(methods);
    for (const m of methods) expect([m, OPERATION_POLICY.AdminService[m]]).toEqual([m, 'platformAdmin']);
  });

  it('her AdminService operasyonu: owner/admin/operator 403 ve servis örneklenmez (init/DB yok); ga (ve mağaza seçmemiş ga) çağırabilir', async () => {
    const methods = SERVICE_METHODS.AdminService;
    const { run } = loadRunWithRealPolicy({ AdminService: fakeService('AdminService', methods) });
    for (const op of methods) {
      for (const a of ['owner', 'ownerFlagOnOperatorRole', 'roleOwnerNoFlag', 'admin', 'operator'] as const) {
        calls.length = 0;
        await expect(run(ACTORS[a].uc, 'AdminService', op, {}, ACTORS[a].pr)).rejects.toMatchObject({ message: 'Forbidden', statusCode: 403 });
        expect([op, a, calls]).toEqual([op, a, []]);
      }
      for (const a of ['ga', 'gaNoStore'] as const) {
        const r = await run(ACTORS[a].uc, 'AdminService', op, {}, ACTORS[a].pr);
        expect(r.ok).toBe('AdminService.' + op);
      }
    }
  });

  it('AdminService, kayıtta olmayan (yardımcı/init) adlarla da çağrılamaz: ga bile 403', async () => {
    const { run } = loadRunWithRealPolicy({ AdminService: fakeService('AdminService', ['getClients', 'internalHelper']) });
    for (const op of ['init', 'internalHelper', 'constructor', 'toString', '_x']) {
      await expect(run(ACTORS.ga.uc, 'AdminService', op, {}, ACTORS.ga.pr)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(calls).toEqual([]);
  });
});

// =====================================================================================================================
describe('Varsayılan ret: init / yardımcı / prototip / _önekli / bilinmeyen servis-operasyon', () => {
  const apis = () => ({ MenuService: fakeService('MenuService', ['retrieveFavorites', 'helper', '_gizli', 'toString']) });

  it('init, constructor, toString, hasOwnProperty, _gizli, yardımcı, bilinmeyen operasyon: 403 ve servis ÇAĞRILMAZ (member/owner/ga için de)', async () => {
    const { run } = loadRunWithRealPolicy(apis());
    for (const a of ['operator', 'owner', 'ga'] as const) {
      for (const op of ['init', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__', '_gizli', 'helper', 'olmayanOp', '']) {
        await expect(run(ACTORS[a].uc, 'MenuService', op, {}, ACTORS[a].pr)).rejects.toMatchObject({ message: 'Forbidden', statusCode: 403 });
      }
    }
    expect(calls).toEqual([]); // ne örnekleme, ne init, ne metot
  });

  it('bilinmeyen servis, farklı harf büyüklüğü, prototip adı, sözde-servis (ImageApi) jenerik RPC ile: 403', async () => {
    const { run } = loadRunWithRealPolicy(apis());
    for (const svc of ['NoSuchService', 'menuservice', 'MENUSERVICE', 'constructor', '__proto__', 'toString', 'ImageApi', '']) {
      await expect(run(ACTORS.owner.uc, svc, 'get', {}, ACTORS.owner.pr)).rejects.toMatchObject({ statusCode: 403 });
      await expect(run(ACTORS.owner.uc, svc, 'upload', {}, ACTORS.owner.pr)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(calls).toEqual([]);
  });

  it('kayıtlı operasyonun sınıfta gerçek çalışmasını engellemez: retrieveFavorites member için çalışır (pozitif kontrol)', async () => {
    const { run } = loadRunWithRealPolicy(apis());
    expect((await run(ACTORS.operator.uc, 'MenuService', 'retrieveFavorites', {}, ACTORS.operator.pr)).ok).toBe('MenuService.retrieveFavorites');
    expect(calls).toEqual(['new MenuService', 'init MenuService', 'MenuService.retrieveFavorites']);
  });

  it('FE\'nin çağırmadığı/servisin yardımcı metotları (ör. ProductService.copyTempImages, ImageService.deleteImage, ImageService.addImages) jenerik RPC ile 403', async () => {
    const { run } = loadRunWithRealPolicy({ ProductService: fakeService('ProductService', ['copyTempImages', 'getProducts']), ImageService: fakeService('ImageService', ['addImages', 'deleteImage', 'assignImages']) });
    await expect(run(ACTORS.owner.uc, 'ProductService', 'copyTempImages', {}, ACTORS.owner.pr)).rejects.toMatchObject({ statusCode: 403 });
    await expect(run(ACTORS.owner.uc, 'ImageService', 'addImages', {}, ACTORS.owner.pr)).rejects.toMatchObject({ statusCode: 403 });
    await expect(run(ACTORS.owner.uc, 'ImageService', 'deleteImage', {}, ACTORS.owner.pr)).rejects.toMatchObject({ statusCode: 403 });
    expect((await run(ACTORS.owner.uc, 'ImageService', 'assignImages', {}, ACTORS.owner.pr)).ok).toBe('ImageService.assignImages'); // FE'nin çağırdığı
    expect((await run(ACTORS.owner.uc, 'ProductService', 'getProducts', {}, ACTORS.owner.pr)).ok).toBe('ProductService.getProducts');
  });

  it('ApiWrapper doğrudan: yaşam döngüsü/iç/prototip adları örneklemeden 403 (ikinci savunma hattı)', async () => {
    const Wrapper = require('../../../src/api/rpc/ApiWrapper').default;
    const { isCallableOperationName } = require('../../../src/api/rpc/ApiWrapper');
    const w = new Wrapper(fakeService('X', ['ok', '_p']));
    for (const op of ['init', 'constructor', 'toString', 'hasOwnProperty', '__proto__', '_p', '', undefined, 5]) {
      await expect(w.process(1, op, {})).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(calls).toEqual([]);
    expect((await w.process(1, 'ok', {})).ok).toBe('X.ok');
    expect(isCallableOperationName('getOrders')).toBe(true);
    expect(isCallableOperationName('isPrototypeOf')).toBe(false);
  });
});

// =====================================================================================================================
describe('ImageApi sözde-servisi (runImageApi): aynı politika kaydı', () => {
  const apis = () => ({
    ImageService: fakeService('ImageService', ['addImages', 'getImages', 'getImage', 'deleteImage', 'deleteImages', 'sortImages']), // getImage sahtede var; gerçekte YOK
    SettingService: fakeService('SettingService', ['uploadLogo']),
  });

  it('upload/getImages/deleteImage/deleteImageSelected/sortImages: member dahil herkes; hedef gerçek servis metodudur; getImage/downloadImage (hedef metot yok) 403', async () => {
    const { runImageApi } = loadRunWithRealPolicy(apis());
    const expected: Record<string, string> = {
      upload: 'ImageService.addImages', getImages: 'ImageService.getImages',
      deleteImage: 'ImageService.deleteImage', deleteImageSelected: 'ImageService.deleteImages', sortImages: 'ImageService.sortImages',
    };
    for (const [route, target] of Object.entries(expected)) {
      const r = await runImageApi(route, ACTORS.operator.uc, {}, ACTORS.operator.pr);
      expect([route, r.ok]).toEqual([route, target]);
    }
    calls.length = 0;
    for (const route of ['getImage', 'downloadImage']) {
      await expect(runImageApi(route, ACTORS.owner.uc, {}, ACTORS.owner.pr)).rejects.toMatchObject({ statusCode: 403 }); // eskiden 500 "Operation not implemented"
    }
    expect(calls).toEqual([]);
  });

  it('uploadIdentity (logo/kimlik = ayar niteliğinde): admin+ ve ga çağırır; member 403 ve servis çağrılmaz', async () => {
    const { runImageApi } = loadRunWithRealPolicy(apis());
    await expect(runImageApi('uploadIdentity', ACTORS.operator.uc, {}, ACTORS.operator.pr)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls).toEqual([]);
    for (const a of ['admin', 'owner', 'ga'] as const) expect((await runImageApi('uploadIdentity', ACTORS[a].uc, {}, ACTORS[a].pr)).ok).toBe('SettingService.uploadLogo');
  });

  it('principal yok: 401; bilinmeyen/prototip rota adı: 403; jenerik RPC ile ImageApi/* veya ImageService/addImages: 403', async () => {
    const { runImageApi, run } = loadRunWithRealPolicy(apis());
    await expect(runImageApi('upload', undefined, {}, undefined)).rejects.toMatchObject({ statusCode: 401 });
    for (const route of ['nope', 'constructor', 'toString', '__proto__', '_x', '']) {
      await expect(runImageApi(route, ACTORS.owner.uc, {}, ACTORS.owner.pr)).rejects.toMatchObject({ statusCode: 403 });
    }
    await expect(run(ACTORS.owner.uc, 'ImageApi', 'upload', {}, ACTORS.owner.pr)).rejects.toMatchObject({ statusCode: 403 });
    await expect(run(ACTORS.owner.uc, 'ImageService', 'addImages', {}, ACTORS.owner.pr)).rejects.toMatchObject({ statusCode: 403 });
    expect(calls).toEqual([]);
  });
});

// =====================================================================================================================
describe('Açık rotalar (login/register/logout) politika kaydına takılmaz', () => {
  const OPEN = ['login', 'register', 'logout'];

  it('OPEN_OPERATIONS ile authenticate.OPEN_ROUTES aynı kaynaktan: 3 SecurityService + 3 AccountService POST açık operasyon + GET checkAuthentication', () => {
    const { OPEN_OPERATIONS } = require('../../../src/api/rpc/operationPolicy');
    jest.isolateModules(() => {
      jest.doMock('@database/DatabaseManager', () => ({ DatabaseManagerInstance: {} }));
      const { OPEN_ROUTES } = require('../../../src/api/http/authenticate');
      const ACCOUNT_OPEN = ['requestPasswordReset', 'confirmPasswordReset', 'verifyEmail', 'getInvitation', 'acceptInvitation'].map((o) => 'AccountService/' + o); // hesap yaşam döngüsü
      const IMP_OPEN = ['SecurityService/redeemImpersonation']; // [ADR-0026 Karar 4.9] bilet = kimlik (dedicated rota)
      expect(OPEN_OPERATIONS).toEqual([...OPEN.map((o) => 'SecurityService/' + o), ...ACCOUNT_OPEN, ...IMP_OPEN]);
      expect(OPEN_ROUTES).toEqual([...OPEN.map((o) => ['POST', 'SecurityService/' + o]), ...ACCOUNT_OPEN.map((o) => ['POST', o]), ...IMP_OPEN.map((o) => ['POST', o]), ['GET', 'checkAuthentication'], ['GET', 'public-config']]);
    });
  });

  it('kayıtta yok (kayıt yalnızca kimlikli operasyonlar) ama RunOperation kimliksiz (userContext/principal YOK) çağırır', async () => {
    const { OPERATION_POLICY } = require('../../../src/api/rpc/operationPolicy');
    for (const o of OPEN) expect(OPERATION_POLICY.SecurityService[o]).toBeUndefined();
    const { run } = loadRunWithRealPolicy({ SecurityService: fakeService('SecurityService', [...OPEN, 'selectStore', 'get']) });
    for (const o of OPEN) expect((await run(undefined, 'SecurityService', o, {})).ok).toBe('SecurityService.' + o);
  });

  it('kimlikli (ör. operator) kullanıcı da açık operasyonu çağırabilir (logout gibi); ama açık liste dışı SecurityService operasyonları (get/init) 403', async () => {
    const { run } = loadRunWithRealPolicy({ SecurityService: fakeService('SecurityService', [...OPEN, 'selectStore', 'get']) });
    expect((await run(ACTORS.operator.uc, 'SecurityService', 'logout', {}, ACTORS.operator.pr)).ok).toBe('SecurityService.logout');
    await expect(run(undefined, 'SecurityService', 'get', {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(run(ACTORS.operator.uc, 'SecurityService', 'get', {}, ACTORS.operator.pr)).rejects.toMatchObject({ statusCode: 403 });
    await expect(run(ACTORS.operator.uc, 'SecurityService', 'init', {}, ACTORS.operator.pr)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('açık muafiyet TAM eşleşmedir: farklı harf büyüklüğüyle (securityservice/LOGIN, SecurityService/Login) kimliksiz çağrı 403', async () => {
    const { run } = loadRunWithRealPolicy({ SecurityService: fakeService('SecurityService', [...OPEN, 'Login']), securityservice: fakeService('securityservice', ['LOGIN']) });
    await expect(run(undefined, 'SecurityService', 'Login', {})).rejects.toMatchObject({ statusCode: 403 });
    await expect(run(undefined, 'securityservice', 'LOGIN', {})).rejects.toMatchObject({ statusCode: 403 });
    expect(calls).toEqual([]);
  });
});
