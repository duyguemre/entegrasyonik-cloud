// ADR-0033 INT-08: `npm run integration:new` iskelet üreticisi. Ağ/DB yok; çıktı proje içi geçici dizine (backend/.tmp) yazılır, sonda silinir.
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

const BACKEND = path.resolve(__dirname, '../../..');
const TMP = path.join(BACKEND, '.tmp', 'integration-new-test-' + process.pid);
const GEN = path.join(BACKEND, 'dev-tools', 'integration-new.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const gen = require(GEN) as { run(argv: string[], io?: { log: (s: string) => void }): { files: string[]; written: boolean } };

const KINDS: Array<[string, string]> = [
    ['marketplace', 'demom'], ['ecommerce', 'demoe'], ['erp', 'demor'], ['einvoice', 'demoi'], ['shipping', 'demos'],
];

function listAll(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? listAll(p) : [p];
    });
}
const slash = (p: string) => p.replace(/\\/g, '/');

describe('integration:new iskelet üretici (INT-08)', () => {
    const logs: string[] = [];
    const io = { log: (s: string) => { logs.push(s); } };

    beforeAll(() => { fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true }); });
    afterAll(() => {
        fs.rmSync(TMP, { recursive: true, force: true });
        const parent = path.join(BACKEND, '.tmp');
        if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
    });

    it('--dry-run dosyaları listeler ama hiçbir şey yazmaz', () => {
        const root = path.join(TMP, 'dry');
        const r = gen.run(['--kind', 'erp', '--code', 'dryrun', '--dry-run', '--out-root', root], io);
        expect(r.written).toBe(false);
        expect(r.files).toContain('backend/src/integration/modules/erp/dryrun/services/Service.ts');
        expect(r.files).toContain('backend/tests/conformance/dryrun.conformance.test.ts');
        expect(r.files).toContain('docs/research/INTEGRATION_DRYRUN.md');
        expect(fs.existsSync(root)).toBe(false);
        expect(fs.existsSync(path.join(BACKEND, 'src/integration/modules/erp/dryrun'))).toBe(false);
    });

    it('var olan kodu (ADAPTER_KEYS) reddeder', () => {
        expect(() => gen.run(['--kind', 'erp', '--code', 'bizimhesap', '--out-root', path.join(TMP, 'x1')], io)).toThrow(/zaten kayıtlı/);
        expect(fs.existsSync(path.join(TMP, 'x1'))).toBe(false);
    });

    it('geçersiz kod / tür / --force reddedilir', () => {
        expect(() => gen.run(['--kind', 'erp', '--code', 'Bad-Code', '--dry-run'], io)).toThrow(/geçersiz --code/);
        expect(() => gen.run(['--kind', 'nope', '--code', 'okcode', '--dry-run'], io)).toThrow(/geçersiz --kind/);
        expect(() => gen.run(['--kind', 'erp', '--code', 'okcode', '--force'], io)).toThrow(/--force yoktur/);
        expect(() => gen.run(['--kind', 'erp'], io)).toThrow(/kullanım/);
    });

    it('var olan klasöre yazmayı reddeder ve hiçbir dosyayı ezmez', () => {
        const root = path.join(TMP, 'exists');
        gen.run(['--kind', 'erp', '--code', 'twice', '--out-root', root], io);
        const svc = path.join(root, 'backend/src/integration/modules/erp/twice/services/Service.ts');
        fs.appendFileSync(svc, '\n// elle değişiklik\n');
        expect(() => gen.run(['--kind', 'erp', '--code', 'twice', '--out-root', root], io)).toThrow(/zaten var/);
        expect(fs.readFileSync(svc, 'utf8')).toContain('// elle değişiklik');
    });

    it('cargo takma adı shipping kategorisine yazar', () => {
        const r = gen.run(['--kind', 'cargo', '--code', 'cargoalias', '--dry-run'], io);
        expect(r.files[0]).toContain('modules/shipping/cargoalias/');
    });

    it('5 kategori için iskelet üretir; ekrana §3.3 parçacıkları basılır; mevcut dosyalara dokunulmaz', () => {
        const root = path.join(TMP, 'gen');
        const keysFile = path.join(BACKEND, 'src/integration/modules/adapterKeys.ts');
        const before = fs.readFileSync(keysFile, 'utf8');
        logs.length = 0;
        for (const [kind, code] of KINDS) gen.run(['--kind', kind, '--code', code, '--name', 'Demo ' + kind, '--out-root', root], io);
        const out = logs.join('\n');
        expect(out).toContain("{ code: 'demom', category: 'marketplace', mockPrefix: 'DEMOM', envPrefix: 'DEMOM'");
        expect(out).toContain('ALLOWED_OUTBOUND_HOSTS');
        expect(out).toContain("case 'demom': moduleInstance = new Demom(config); break;");
        expect(out).toContain('IntegrationDescriptorRegistry.ts');
        expect(out).toContain('run-tests.js');
        expect(out).toContain('SONRAKİ ADIMLAR');
        expect(fs.readFileSync(keysFile, 'utf8')).toBe(before);
        const all = listAll(root).map(p => slash(path.relative(root, p)));
        expect(all.every(p => /^(backend\/src\/integration\/modules\/|backend\/tests\/conformance\/|docs\/research\/)/.test(p))).toBe(true);
        for (const [kind, code] of KINDS) {
            for (const f of ['descriptor.ts', 'index.ts', 'constants.ts', 'limits.ts', 'services/Service.ts', 'contracts/index.ts']) {
                expect(all).toContain('backend/src/integration/modules/' + kind + '/' + code + '/' + f);
            }
            expect(all).toContain('backend/tests/conformance/' + code + '.conformance.test.ts');
            expect(all).toContain('docs/research/INTEGRATION_' + code.toUpperCase() + '.md');
        }
        // modül ağacında console.* / zamanlayıcı yok (playbook §4.4/§4.7)
        const src = all.filter(p => p.endsWith('.ts') && p.includes('/modules/')).map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
        expect(src).not.toMatch(/console\.|setInterval|setTimeout/);
    });

    it('üretilen TypeScript dosyaları tsc ile derlenir (kayıt öncesi "henüz kayıtlı değil" modunda)', () => {
        const root = path.join(TMP, 'gen');
        const confDir = path.join(root, 'backend/tests/conformance');
        // üretilen testin './kit' importu için gerçek kite köprü (gerçek tipler derlenir)
        fs.writeFileSync(path.join(confDir, 'kit.ts'), "export * from '" + slash(path.join(BACKEND, 'tests/conformance/kit')) + "';\n");
        const files = listAll(root).filter(p => p.endsWith('.ts')).map(slash);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const tsLib = require('typescript');
        const base = tsLib.readConfigFile(path.join(BACKEND, 'tsconfig.json'), tsLib.sys.readFile).config.compilerOptions;
        const paths: Record<string, string[]> = { ...base.paths };
        for (const [kind, code] of KINDS) {
            const dir = slash(path.join(root, 'backend/src/integration/modules', kind, code));
            paths['@integration/modules/' + kind + '/' + code] = [dir + '/index.ts'];
            paths['@integration/modules/' + kind + '/' + code + '/*'] = [dir + '/*'];
        }
        const cfg = {
            extends: '../../tsconfig.json',
            compilerOptions: { composite: false, declaration: false, declarationMap: false, sourceMap: false, inlineSources: false, noEmit: true, paths },
            include: [] as string[],
            files,
        };
        const cfgPath = path.join(TMP, 'tsconfig.json');
        fs.writeFileSync(cfgPath, JSON.stringify(cfg));
        const r = spawnSync(process.execPath, [path.join(BACKEND, 'node_modules/typescript/bin/tsc'), '-p', cfgPath], { cwd: BACKEND, encoding: 'utf8' });
        expect(r.stdout + r.stderr).toBe('');
        expect(r.status).toBe(0);
    }, 240000);

    it('CLI: var olan kodla çıkış kodu 1, --dry-run ile 0', () => {
        const bad = spawnSync(process.execPath, [GEN, '--kind', 'erp', '--code', 'n11'], { encoding: 'utf8' });
        expect(bad.status).toBe(1);
        expect(bad.stderr).toContain('HATA');
        const ok = spawnSync(process.execPath, [GEN, '--kind', 'erp', '--code', 'clidry', '--dry-run'], { encoding: 'utf8' });
        expect(ok.status).toBe(0);
        expect(ok.stdout).toContain('hiçbir şey yazılmadı');
    });
});
