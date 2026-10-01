// ADR-0033 INT-04: statik "playbook uyum" testi (docs/INTEGRATION_PLAYBOOK.md §8.3). Her ADAPTER_KEYS adaptörü için playbook'un
// zorunlu kıldığı kayıt/dosya/sözleşme noktalarını denetler. MEVCUT 6 adaptörün bilinen açıkları KNOWN_GAPS'te dondurulmuştur (ratchet):
//   - açık artarsa (ya da YENİ adaptör eksikle gelirse) test KIRMIZI olur;
//   - bir açık kapanırsa test yine KIRMIZI olur ("tabanı düşür"): sayı yalnız AŞAĞI iner, yukarı çıkarılamaz.
// Davranış/kod bu testte DEĞİŞTİRİLMEZ; yalnız okunur. Ağ/DB yok.
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { ADAPTER_KEYS, type AdapterCode } from '../../src/integration/modules/adapterKeys';
import { INTEGRATION_DESCRIPTORS } from '../../src/integration/catalog/IntegrationDescriptorRegistry';
import { ALLOWED_OUTBOUND_HOSTS } from '../../src/integration/modules/common/security/outboundHosts';
import { INTEGRATION_HTTP_SETTINGS } from '../../src/integration/config/catalog/integrationHttp';
import type { CapabilityKey, IntegrationCategory, IntegrationDescriptor } from '../../src/integration/catalog/types';

const BACKEND = path.resolve(__dirname, '../..');
const ROOT = path.resolve(BACKEND, '..');
const read = (p: string) => fs.readFileSync(p, 'utf8');
const exists = (p: string) => fs.existsSync(p);
const MODULES = path.join(BACKEND, 'src/integration/modules');

// --- Playbook §2 matrisi (veri olarak burada tutulur; matris değişirse test ve belge AYNI PR'da değişir) ---
// Z ve Z* (gerekçeli not_supported kabul) birlikte "manifestoda yazılı olmalı" sayılır. `anyOf`: listeden en az biri.
const REQUIRED_CAPS: Record<IntegrationCategory, { all: CapabilityKey[]; anyOf?: CapabilityKey[] }> = {
    marketplace: { all: ['products', 'stockPrice', 'orders', 'orderActions', 'shippingNotice', 'invoiceNotice', 'returns', 'categories'] },
    ecommerce: { all: ['products', 'stockPrice', 'orders', 'shippingNotice', 'categories'] },
    erp: { all: ['products', 'stockPrice'] },
    einvoice: { all: ['taxpayerLookup', 'documentStatus', 'documentPdf'], anyOf: ['einvoiceIssue', 'earchiveIssue'] },
    shipping: { all: ['shipmentCreate', 'label', 'tracking'] },
};
// Sözleşme minimumu (playbook §4.2): kimlik deseni `<kod>.<alan>.<işlem>@v<n>`.
const REQUIRED_CONTRACT_AREAS: Record<IntegrationCategory, string[]> = {
    marketplace: ['orders.list', 'batch'], // sipariş listesi + batch/toplu işlem durumu (kategori+öznitelik de istenir; bkz. aşağıda `categories`)
    ecommerce: ['products.list', 'orders.list'],
    erp: ['products.list', 'orders.list'],
    einvoice: ['documents.status'],
    shipping: ['shipments.track'],
};

/** Bilinen açıklar: { kontrol: { 'kod[:ayrıntı]': sayı } }. Yalnız AŞAĞI iner. Yeni adaptör buraya EKLENEMEZ (eksiksiz gelmeli). */
const KNOWN_GAPS: Record<string, Record<string, number>> = {
    // yetenek manifestosunda Z/Z* satırı yazılı değil (INT-05: adaptör geçişinde gerekçeli not_supported ya da supported yazılır)
    P1_capabilities: { 'bizimhesap:yetenek-yok:stockPrice': 1 },
    P2_docs: {},
    // mock tabanı `http://localhost:6015/<kod>` değil (tarihsel: Trendyol 3005/integration, Pazarama 3006/apigateway; INT-05)
    P3_hosts_mock: { 'trendyol:mock-tabani-varsayilan-degil': 1, 'pazarama:mock-tabani-varsayilan-degil': 1 },
    // sözleşme minimumu / contracts klasörü (F-09 pasif şemalar hb/n11/pazarama'da connector içinde; descriptor.contracts boş)
    P4_contracts: {
        'trendyol:sozlesme-yok:batch': 1, 'trendyol:contracts-index-yok': 1,
        'hepsiburada:sozlesme-yok:orders.list': 1, 'hepsiburada:sozlesme-yok:batch': 1,
        'n11:sozlesme-yok:orders.list': 1, 'n11:sozlesme-yok:batch': 1,
        'pazarama:sozlesme-yok:orders.list': 1, 'pazarama:sozlesme-yok:batch': 1,
        'ideasoft:sozlesme-yok:products.list': 1, 'ideasoft:sozlesme-yok:orders.list': 1,
        'bizimhesap:sozlesme-yok:products.list': 1, 'bizimhesap:sozlesme-yok:orders.list': 1,
    },
    // docs/research/INTEGRATION_<KOD>.md yok (mevcut 6 için tarihsel: araştırma INTEGRATIONS_REGISTRY + 2026-09-2x research dosyalarında)
    P5_research: {
        'trendyol:on-kesif-yok': 1, 'hepsiburada:on-kesif-yok': 1, 'n11:on-kesif-yok': 1,
        'pazarama:on-kesif-yok': 1, 'ideasoft:on-kesif-yok': 1, 'bizimhesap:on-kesif-yok': 1,
    },
    // conformance bağlantısı: trendyol + bizimhesap INT-03'te, hepsiburada + ideasoft + pazarama + n11 INT-05'te bağlandı; kalan yok
    P6_conformance: {},
    P7_docs_registry: {},
    // N11 doğrudan axios INT-05'te kapandı (SOAP taban `post`'una, REST tabana geçti)
    P9_module_hygiene: {},
    P10_limits: {},
    // EN etiketleri (integrations.apikey/apisecret/sellerid/storename) ve ideasoft/bizimhesap `key`/`secret` alan etiketleri yok
    P11_ui_i18n: {
        'trendyol:en-etiket-yok:integrations.sellerid': 1, 'trendyol:en-etiket-yok:integrations.apikey': 1, 'trendyol:en-etiket-yok:integrations.apisecret': 1,
        'hepsiburada:en-etiket-yok:integrations.apisecret': 1, 'hepsiburada:en-etiket-yok:integrations.apikey': 1, 'hepsiburada:en-etiket-yok:integrations.sellerid': 1,
        'n11:en-etiket-yok:integrations.apikey': 1, 'n11:en-etiket-yok:integrations.apisecret': 1,
        'pazarama:en-etiket-yok:integrations.apikey': 1, 'pazarama:en-etiket-yok:integrations.apisecret': 1,
        'ideasoft:en-etiket-yok:integrations.storename': 1, 'ideasoft:tr-etiket-yok:integrations.key': 1, 'ideasoft:en-etiket-yok:integrations.key': 1,
        'ideasoft:tr-etiket-yok:integrations.secret': 1, 'ideasoft:en-etiket-yok:integrations.secret': 1,
        'bizimhesap:tr-etiket-yok:integrations.key': 1, 'bizimhesap:en-etiket-yok:integrations.key': 1,
        'bizimhesap:tr-etiket-yok:integrations.secret': 1, 'bizimhesap:en-etiket-yok:integrations.secret': 1,
    },
    P12_seed: {},
};

type Gaps = Record<string, Record<string, number>>;
const add = (g: Gaps, check: string, key: string, n = 1) => { (g[check] ??= {})[key] = (g[check][key] ?? 0) + n; };

function walk(dir: string, exts: string[]): string[] {
    if (!exists(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? walk(p, exts) : (exts.some(x => e.name.endsWith(x)) ? [p] : []);
    });
}
// Yorum satırlarını atar (yalnız `//` ve `/* */`); dizge içi sahte eşleşme riski kabul edilir (ratchet tabanı bunu yansıtır).
const stripComments = (s: string) => s.replace(/(^|[^:'"`])\/\/.*$/gm, '$1').replace(/\/\*[\s\S]*?\*\//g, '');

function flatKeys(obj: any, prefix = ''): Set<string> {
    const out = new Set<string>();
    for (const [k, v] of Object.entries(obj ?? {})) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object') for (const x of flatKeys(v, key)) out.add(x); else out.add(key);
    }
    return out;
}

function playbookAnchors() {
    const pb = read(path.join(ROOT, 'docs/INTEGRATION_PLAYBOOK.md'));
    const exA = pb.slice(pb.indexOf('## Ek A'), pb.indexOf('## Ek B'));
    const codesInEkA = [...exA.matchAll(/^\|\s*([a-z0-9]+)\s*\|/gm)].map(m => m[1]).filter(c => c !== 'kod');
    const pathsBlock = pb.slice(pb.indexOf('<!-- playbook-paths:start -->'), pb.indexOf('<!-- playbook-paths:end -->'));
    const refPaths = [...pathsBlock.matchAll(/`([^`]+)`/g)].map(m => m[1]);
    const head = pb.match(/\*\*Sürüm:\*\*\s*([0-9]+\.[0-9]+\.[0-9]+)\s*·\s*\*\*Tarih:\*\*\s*(\d{4}-\d{2}-\d{2})/);
    const changelog = pb.slice(pb.indexOf('### 8.4'));
    return { pb, codesInEkA, refPaths, version: head?.[1], date: head?.[2], changelog };
}

function compute(): Gaps {
    const g: Gaps = {};
    const registry = exists(path.join(ROOT, 'INTEGRATIONS_REGISTRY.md')) ? read(path.join(ROOT, 'INTEGRATIONS_REGISTRY.md')) : '';
    const { codesInEkA } = playbookAnchors();
    const seed = read(path.join(BACKEND, 'src/operations/tenant/TenantProvisioningService.ts'));
    const frontendDir = path.join(ROOT, 'frontend/src');
    const hasFrontend = exists(frontendDir);
    const loc = hasFrontend ? {
        tr: flatKeys(JSON.parse(read(path.join(frontendDir, 'plugins/locales/tr.json')))),
        en: flatKeys(JSON.parse(read(path.join(frontendDir, 'plugins/locales/en.json')))),
    } : undefined;
    const httpDefaults = (key: string) => (INTEGRATION_HTTP_SETTINGS.find(s => s.key === key)?.default ?? {}) as Record<string, unknown>;

    for (const k of ADAPTER_KEYS) {
        const code: AdapterCode = k.code;
        const dir = path.join(MODULES, k.category, code);
        const d: IntegrationDescriptor | undefined = INTEGRATION_DESCRIPTORS.find(x => x.code === code);

        // P1 - descriptor kayıtlı + zorunlu alanlar + kategorinin Z yetenekleri manifestoda
        if (!d) { add(g, 'P1_capabilities', `${code}:descriptor-yok`); }
        else {
            for (const f of ['displayName', 'category', 'status', 'adapterVersion', 'protocol', 'auth', 'capabilities', 'limitations', 'rateLimits', 'api', 'config', 'mock', 'contracts', 'verification'] as const) {
                if ((d as any)[f] === undefined) add(g, 'P1_capabilities', `${code}:alan-yok:${f}`);
            }
            if (d.category !== k.category) add(g, 'P1_capabilities', `${code}:kategori-uyusmaz`);
            const req = REQUIRED_CAPS[k.category];
            for (const cap of req.all) if (!d.capabilities[cap]) add(g, 'P1_capabilities', `${code}:yetenek-yok:${cap}`);
            if (req.anyOf && !req.anyOf.some(c => d.capabilities[c])) add(g, 'P1_capabilities', `${code}:yetenek-yok:${req.anyOf.join('|')}`);
        }

        if (d) {
            // P2 - en az bir resmi kaynak; 'auto' izleme yoksa erişim notu
            if (!d.api.docs.some(x => x.official)) add(g, 'P2_docs', `${code}:resmi-kaynak-yok`);
            if (!d.api.docs.some(x => x.monitor === 'auto') && !d.api.docs.some(x => (x.accessNote ?? '').trim())) add(g, 'P2_docs', `${code}:auto-izleme-ve-accessNote-yok`);

            // P3 - host izin listesi eşitliği + mock öneki + mock tabanı kuralı (http://localhost:6015/<kod>)
            if (!d.config.hosts?.length) add(g, 'P3_hosts_mock', `${code}:config.hosts-bos`);
            if (JSON.stringify([...(d.config.hosts ?? [])]) !== JSON.stringify([...(ALLOWED_OUTBOUND_HOSTS[code] ?? [])])) add(g, 'P3_hosts_mock', `${code}:hosts-ALLOWED-ile-ayni-degil`);
            if (d.mock.available && d.mock.prefix !== k.mockPrefix) add(g, 'P3_hosts_mock', `${code}:mock.prefix-ADAPTER_KEYS-ile-ayni-degil`);
            if (!new RegExp(`^http://(localhost|127\\.0\\.0\\.1):6015/${code}$`).test(k.mockDefaultBase)) add(g, 'P3_hosts_mock', `${code}:mock-tabani-varsayilan-degil`);

            // P4 - sözleşme minimumu + kimlik biçimi + contracts klasörü (+ index.ts)
            for (const id of d.contracts) if (!new RegExp(`^${code}\\.[a-z]+\\.[a-z]+@v\\d+$`).test(id)) add(g, 'P4_contracts', `${code}:kimlik-bicimi:${id}`);
            for (const area of REQUIRED_CONTRACT_AREAS[k.category]) {
                if (!d.contracts.some(id => id.startsWith(`${code}.${area}`))) add(g, 'P4_contracts', `${code}:sozlesme-yok:${area}`);
            }
            const cdir = path.join(dir, 'contracts');
            if (!exists(cdir)) add(g, 'P4_contracts', `${code}:contracts-klasoru-yok`);
            else if (!exists(path.join(cdir, 'index.ts'))) add(g, 'P4_contracts', `${code}:contracts-index-yok`);
        }

        // P5 - ön keşif dosyası; P6 - conformance bağlantısı
        if (!exists(path.join(ROOT, `docs/research/INTEGRATION_${code.toUpperCase()}.md`))) add(g, 'P5_research', `${code}:on-kesif-yok`);
        if (!exists(path.join(BACKEND, `tests/conformance/${code}.conformance.test.ts`))) add(g, 'P6_conformance', `${code}:conformance-yok`);

        // P7 - INTEGRATIONS_REGISTRY başlığı + playbook Ek A satırı
        if (!registry.includes(`M/${k.category}/${code}/`)) add(g, 'P7_docs_registry', `${code}:registry-basligi-yok`);
        if (!codesInEkA.includes(code)) add(g, 'P7_docs_registry', `${code}:ekA-satiri-yok`);

        // P9 - modül dizini hijyeni: console.*, doğrudan axios/fetch, setInterval (yalnız sayım; ratchet)
        let consoleN = 0; let rawHttpN = 0; let timerN = 0;
        for (const f of walk(dir, ['.ts'])) {
            const src = stripComments(read(f));
            consoleN += (src.match(/\bconsole\.(log|info|warn|error|debug)\s*\(/g) ?? []).length;
            rawHttpN += (src.match(/import\s+axios\b|import\s+\*\s+as\s+axios\b|require\(\s*['"]axios['"]\s*\)|\baxios\.(get|post|put|patch|delete|request|create)\b|\baxios\s*\(|(?<![\w.])fetch\s*\(/g) ?? []).length;
            timerN += (src.match(/\bsetInterval\s*\(/g) ?? []).length;
        }
        if (consoleN) add(g, 'P9_module_hygiene', `${code}:console`, consoleN);
        if (rawHttpN) add(g, 'P9_module_hygiene', `${code}:dogrudan-axios-fetch`, rawHttpN);
        if (timerN) add(g, 'P9_module_hygiene', `${code}:setInterval`, timerN);

        // P10 - HTTP politika kataloğunda adaptöre özgü zaman aşımı + eşzamanlılık varsayılanı (yedek `_` yetmez); descriptor.rateLimits.configured dolu
        for (const key of ['resilience.timeoutMs', 'resilience.maxConcurrent']) {
            if (!(code in httpDefaults(key))) add(g, 'P10_limits', `${code}:katalog-varsayilani-yok:${key}`);
        }
        if (d && !d.rateLimits?.configured) add(g, 'P10_limits', `${code}:rateLimits.configured-yok`);

        // P11 - UI: bağlantı formu bileşeni + her requiredSettings alanı için tr/en etiket anahtarı (`integrations.<alan küçük harf>`)
        if (hasFrontend && d && loc) {
            const folder = path.join(frontendDir, 'components/integrations', (k.category as string) === 'shipping' ? 'shipment' : k.category);
            const want = `${d.displayName.replace(/\s+/g, '')}component.vue`.toLowerCase();
            if (!exists(folder) || !fs.readdirSync(folder).some(f => f.toLowerCase() === want)) add(g, 'P11_ui_i18n', `${code}:form-bileseni-yok`);
            for (const s of d.auth.requiredSettings) {
                const key = `integrations.${s.toLowerCase()}`;
                if (!loc.tr.has(key)) add(g, 'P11_ui_i18n', `${code}:tr-etiket-yok:${key}`);
                if (!loc.en.has(key)) add(g, 'P11_ui_i18n', `${code}:en-etiket-yok:${key}`);
            }
        }

        // P12 - yeni tenant seed'inde (TenantProvisioningService) kod var
        if (!new RegExp(`['"]${code}['"]`).test(seed)) add(g, 'P12_seed', `${code}:tenant-seed-yok`);
    }
    return g;
}

describe('statik: playbook uyum testi (INT-04, docs/INTEGRATION_PLAYBOOK.md §8.3)', () => {
    const gaps = compute();

    it('bilinen açıklar ratchet: yeni/artan açık YOK, kapanan açık tabandan düşürüldü', () => {
        const worse: string[] = []; const better: string[] = [];
        const checks = new Set([...Object.keys(gaps), ...Object.keys(KNOWN_GAPS)]);
        for (const c of checks) {
            const cur = gaps[c] ?? {}; const base = KNOWN_GAPS[c] ?? {};
            for (const key of new Set([...Object.keys(cur), ...Object.keys(base)])) {
                const a = cur[key] ?? 0; const b = base[key] ?? 0;
                if (a > b) worse.push(`${c} ${key}: ${b} -> ${a}`);
                else if (a < b) better.push(`${c} ${key}: ${b} -> ${a}`);
            }
        }
        if (worse.length || better.length) {
            throw new Error(
                (worse.length ? `YENİ/ARTAN playbook açığı (yeni adaptör eksiksiz gelmeli):\n  ${worse.join('\n  ')}\n` : '') +
                (better.length ? `Açık kapandı/azaldı: KNOWN_GAPS tabanını aşağı çek (yalnız AŞAĞI):\n  ${better.join('\n  ')}\n` : '') +
                `Güncel ölçüm:\n${JSON.stringify(gaps, null, 2)}`);
        }
        expect(worse).toEqual([]);
    });

    it('P8: playbook başlığındaki Sürüm/Tarih ayrıştırılır, §8.4 günlüğünde o sürüm var; §8.2 referans yolları mevcut', () => {
        const a = playbookAnchors();
        expect(a.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(a.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(a.changelog).toContain(`| ${a.version} |`);
        expect(a.refPaths.length).toBeGreaterThan(5);
        const missing = a.refPaths.filter(p => !exists(path.join(ROOT, p)));
        expect(missing).toEqual([]);
    });

    it('Ek A tablosundaki kodlar ADAPTER_KEYS ile birebir aynı (belge <-> kod)', () => {
        expect([...playbookAnchors().codesInEkA].sort()).toEqual(ADAPTER_KEYS.map(k => k.code).sort());
    });

    it('KNOWN_GAPS toplamı tavanı aşmaz', () => {
        const total = Object.values(KNOWN_GAPS).reduce((n, row) => n + Object.values(row).reduce((x, y) => x + y, 0), 0);
        expect(total).toBeLessThanOrEqual(MAX_TOTAL);
    });
});

const MAX_TOTAL = 48; // 2026-09-30 ilk ölçüm: 50 açık (yalnız AŞAĞI iner); faz4-conf-close: bizimhesap + ideasoft contracts/ klasörü eklendi -> 48
