// Jest ortamı için test-only JWT ayarları (ADR-0001). Gerçek .env değerine test bağımlı değildir:
// her jest sürecinde rastgele üretilir, hiçbir yere yazılmaz. Modüller yüklenmeden ÖNCE çalışır (setupFiles).
const crypto = require('crypto');

process.env.JWT_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_ISSUER = 'entegrasyonik-test';
delete process.env.JWT_SECRET_PREVIOUS;

// ADR-0001 Karar 11: testlerde audit kaydı varsayılan olarak yazılmaz (gerçek DB'ye bağlanılmasın); audit testleri AuditLogger.setSink ile açar.
process.env.AUDIT_LOG_DISABLED = 'true';
// MOB-08: günlük kullanım kaydı testlerde DB'ye gitmez (testler setUsageRecorderForTests ile enjekte eder).
process.env.USAGE_RECORD_DISABLED = 'true';

// ADR-0006 Karar 1: testlerde IntegrationCallMetrics varsayılan olarak yazılmaz (gerçek DB'ye bağlanılmasın); metrik testleri IntegrationCallMetrics.setSink ile açar.
process.env.INTEGRATION_METRICS_DISABLED = 'true';

// ADR-0003 adım 6: test-only alan şifreleme anahtarları (rastgele; her jest sürecinde yeniden üretilir, hiçbir yere yazılmaz/yazdırılmaz).
process.env.FIELD_ENCRYPTION_KEYS = 'test1:' + crypto.randomBytes(32).toString('base64') + ',test0:' + crypto.randomBytes(32).toString('base64');
process.env.FIELD_ENCRYPTION_ACTIVE_KID = 'test1';

// ADR-0003 adım 5: test-only depolama env'leri (sentetik; gerçek R2/ağ yok). Değerler rastgele/uydurma, yazdırılmaz.
process.env.R2_ACCESS_KEY_ID = 'test-' + crypto.randomBytes(8).toString('hex');
process.env.R2_SECRET_ACCESS_KEY = crypto.randomBytes(16).toString('hex');
process.env.R2_ENDPOINT = 'https://r2.test.invalid';
process.env.R2_REGION = 'auto';
process.env.R2_BUCKET_IMAGE = 'test-images-bucket';
process.env.R2_BUCKET_ARCHIVE = 'test-archive-bucket';
process.env.R2_PUBLIC_URL_IMAGE = 'https://images.test.invalid';
process.env.R2_PUBLIC_URL_ARCHIVE = 'https://archive.test.invalid';

// ADR-0008 Aşama A: test-only mock ödeme sağlayıcısı ayarları (rastgele; her jest sürecinde yeniden üretilir).
process.env.PAYMENT_PROVIDER = 'mock';
process.env.PAYMENT_ENV = 'sandbox';
process.env.BILLING_MOCK_HMAC_SECRET = crypto.randomBytes(24).toString('hex');
process.env.AUTH_IDENTITY_CACHE_TTL_MS = '0'; // ADR-0024 P1-CORE: testlerde kimlik önbelleği varsayılan KAPALI (test sızıntısı olmasın); önbellek testleri açıkça configure eder
