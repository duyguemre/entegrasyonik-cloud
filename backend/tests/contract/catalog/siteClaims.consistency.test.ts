// ADR-0018 Karar 1.3 / kategori belgesi §4 "Tek kaynak kuralı" madde 2: site iddia kaydı
// (`site/src/data/integrations.ts`) manifestodan FAZLASINI iddia EDEMEZ. Bu test SALT OKUR (site paketine
// dokunmaz, ayrı bir npm çalışma alanı olduğu için TS olarak import EDİLMEZ — statik metin taraması yapılır,
// tıpkı `site/tests/claims.test.ts`'in backend dosyalarını okuduğu ters yönün simetriği).
import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { getIntegrationDescriptor } from '@integration/catalog/IntegrationDescriptorRegistry';
import type { CapabilityLevel } from '@integration/catalog/types';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SITE_INTEGRATIONS_FILE = path.join(REPO_ROOT, 'site/src/data/integrations.ts');

interface SiteCapabilityClaim { key: string; level: 'supported' | 'limited'; }
interface SiteIntegrationBlock { code: string; capabilities: SiteCapabilityClaim[]; }

/** Yalnızca `status: 'available'` üst düzey blokları (2 boşluk girintili `{ ... },`) ayrıştırır. Roadmap öğeleri (`.map(...)` ile üretilir) bu düzende değildir, otomatik dışarıda kalır. */
function parseSiteIntegrations(src: string): SiteIntegrationBlock[] {
    const blockRe = /^ {2}\{\r?\n {4}code: '([a-z0-9_-]+)',[\s\S]*?\r?\n {2}\},/gm;
    const capRe = /cap\(\s*\r?\n\s*'(\w+)',\s*\r?\n\s*'(supported|limited)',/g;
    const blocks: SiteIntegrationBlock[] = [];
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(src))) {
        const [full, code] = m;
        const caps: SiteCapabilityClaim[] = [];
        let cm: RegExpExecArray | null;
        capRe.lastIndex = 0;
        while ((cm = capRe.exec(full))) caps.push({ key: cm[1], level: cm[2] as 'supported' | 'limited' });
        blocks.push({ code, capabilities: caps });
    }
    return blocks;
}

/** platform_auto işlevsel olarak "supported" ile EŞ DÜZEYDE sayılır (kullanıcı için sonuç aynıdır: işlem
 *  başarıyla tamamlanır, yalnızca platform kendisi yapar). Site'nin iki-düzeyli modeli (supported/limited)
 *  bu ayrımı yapmaz; kategori belgesi §3 de platform_auto'yu "bilinçli no-op" olarak, hata/eksiklik değil. */
const LEVEL_RANK: Record<CapabilityLevel, number> = { not_supported: 0, limited: 1, platform_auto: 3, supported: 3 };
const SITE_LEVEL_RANK: Record<'supported' | 'limited', number> = { limited: 1, supported: 3 };

describe('Site iddia kaydı manifestodan fazlasını iddia etmiyor (ADR-0018 §4 madde 2)', () => {
    const src = fs.readFileSync(SITE_INTEGRATIONS_FILE, 'utf8');
    const blocks = parseSiteIntegrations(src);

    it('site kaydından en az 6 `available` entegrasyon bloğu ayrıştırılabildi (ayrıştırıcı regresyon kontrolü)', () => {
        expect(blocks.length).toBeGreaterThanOrEqual(6);
        expect(blocks.map((b) => b.code).sort()).toEqual(
            ['bizimhesap', 'hepsiburada', 'ideasoft', 'n11', 'pazarama', 'trendyol'].sort(),
        );
    });

    it.each(['trendyol', 'hepsiburada', 'n11', 'pazarama', 'ideasoft', 'bizimhesap'])(
        '%s: sitenin her yetenek iddiası descriptor\'da EN AZ AYNI düzeyde karşılığa sahip',
        (code) => {
            const block = blocks.find((b) => b.code === code);
            expect(block).toBeDefined();
            const descriptor = getIntegrationDescriptor(code);
            expect(descriptor).toBeDefined();
            if (!descriptor) return;

            for (const claim of block!.capabilities) {
                const descCap = descriptor.capabilities[claim.key as keyof typeof descriptor.capabilities];
                // `${code}.${claim.key}: site '${claim.level}' iddia ediyor ama descriptor'da bu yetenek HİÇ yok (örtük not_supported < site iddiası)`
                expect(descCap).toBeDefined();
                const descRank = LEVEL_RANK[descCap!.level];
                const siteRank = SITE_LEVEL_RANK[claim.level];
                // `${code}.${claim.key}: site '${claim.level}' iddia ediyor, descriptor '${descCap!.level}' (site manifestodan FAZLASINI iddia edemez)`
                expect(descRank).toBeGreaterThanOrEqual(siteRank);
            }
        },
    );
});
