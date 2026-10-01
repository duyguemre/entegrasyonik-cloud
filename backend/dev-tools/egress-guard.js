'use strict';
/**
 * Çıkış (egress) koruması — Protokol 7 ("gerçek/production sistemlere asla istek atılmaz").
 *
 * Yerel geliştirme/ölçüm için: loopback dışındaki TÜM TCP bağlantılarını (HTTP, HTTPS/TLS, Mongo, Redis,
 * S3/R2, SMTP…) bağlantı kurulmadan ve DNS çözümlemesi yapılmadan engeller.
 * Mock kapsamı dışında kalan (ör. *_MOCKABLE_ENDPOINTS listesinde olmayan) bir pazaryeri çağrısı, yerel DB'deki
 * gerçek kimlik bilgileriyle gerçek servise GİDEMEZ.
 *
 * Kullanım:   node -r ./dev-tools/egress-guard.js dist/entegrasyonik.js      (bkz. `npm run start:local`)
 * İzinli ek host'lar (ör. docker ağındaki servis adı):  EGRESS_ALLOW=redis,mongo
 * Sohbet LLM sağlayıcıları (Anthropic/OpenAI/Google; yalnız insan, gerçek anahtarla):  EGRESS_ALLOW_LLM=1
 * Kapsam dışı: UDP/DNS sorguları (yalnızca ad çözümleme; veri taşınmaz).
 */
const net = require('net');

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '::']);
const warned = new Set();
let original = null;
// LIVE-RO (dev-tools/live-readonly-guard.js): canlı salt-okuma kipinde, izinli pazaryeri host'larına TCP bağlantısına da izin veren ek yüklem.
// Varsayılan null => davranış DEĞİŞMEZ (yalnız loopback + EGRESS_ALLOW).
let extraPredicate = null;
function setHostPredicate(fn) { extraPredicate = typeof fn === 'function' ? fn : null; }

function extraAllowed() {
    return (process.env.EGRESS_ALLOW || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

// ADR-0034 BR-5: sohbet LLM saglayicilari (BYOK). VARSAYILAN KAPALI; yalniz `EGRESS_ALLOW_LLM=1` ile bu UC host acilir (insan gercek anahtarla yerelde dener).
// Liste src/platform/llm/catalog.ts::LLM_HOSTS ile AYNI olmak zorunda (tests/dev/egress-guard.test.ts dogrular). Cikarim yazma degildir; yine de kip acik istenmelidir.
const LLM_HOSTS = ['api.anthropic.com', 'api.openai.com', 'generativelanguage.googleapis.com'];
const llmAllowed = () => ['1', 'true'].includes(String(process.env.EGRESS_ALLOW_LLM || '').toLowerCase());

function isAllowedHost(host) {
    if (host === undefined || host === null || host === '') return true; // Node host'suz bağlantıda localhost kullanır
    const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
    return LOOPBACK.has(h) || extraAllowed().includes(h) || (llmAllowed() && LLM_HOSTS.includes(h)) || (extraPredicate !== null && extraPredicate(h) === true);
}

function install() {
    if (original) return;
    original = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function guardedConnect(...args) {
        // Node, net.connect() içinde socket.connect()'i önceden normalize edilmiş bir dizi ([options, cb]) ile çağırır.
        const normalized = Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args);
        const opts = normalized[0] || {};
        if (!opts.path && !isAllowedHost(opts.host)) {
            const target = `${opts.host}:${opts.port}`;
            if (!warned.has(target)) {
                warned.add(target);
                console.warn(`[egress-guard] Çıkış ENGELLENDİ (Protokol 7): ${target}`);
            }
            const err = new Error(`[egress-guard] Loopback dışı bağlantı engellendi: ${target}`);
            err.code = 'EGRESS_BLOCKED';
            process.nextTick(() => this.destroy(err));
            return this;
        }
        return original.apply(this, args);
    };
}

function uninstall() {
    if (!original) return;
    net.Socket.prototype.connect = original;
    original = null;
    extraPredicate = null;
    warned.clear();
}

module.exports = { install, uninstall, isAllowedHost, setHostPredicate, LLM_HOSTS };

// `node -r` ile yüklendiğinde otomatik devreye girer (test ortamı EGRESS_GUARD_NO_AUTOINSTALL=1 ile kapatır).
if (!process.env.EGRESS_GUARD_NO_AUTOINSTALL) install();
