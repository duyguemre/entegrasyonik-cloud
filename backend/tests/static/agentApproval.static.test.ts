/**
 * CHAT-BR-2 statik mandal (ADR-0034 Karar 4.4): yazma yetenegi yalniz ONAY ucundan yurutulur.
 *  - `invokeCapability` yalniz tools.ts (sohbet koprusu) tarafindan cagrilir (ileride MCP adaptoru eklenirse bu liste bilincli genisler).
 *  - `approval` (onay kapisini acan nesne) invoke.ts / tools.ts'te tanimlanir; AgentBroker onu YALNIZ beginConfirm'de (claim sonrasi) uretir; turn dongusu (runToolCall) onay VERMEZ.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '../../src');
function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : d.name.endsWith('.ts') ? [path.join(dir, d.name)] : []));
}
const files = walk(SRC);
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');
const read = (f: string) => fs.readFileSync(f, 'utf8');

describe('onay kapisi statik mandali', () => {
    it('invokeCapability yalniz tools.ts tarafindan cagrilir (tanim: capabilities/invoke.ts)', () => {
        const users = files.filter((f) => /\binvokeCapability\(/.test(read(f)) && rel(f) !== 'capabilities/invoke.ts').map(rel);
        expect(users).toEqual(['operations/agent/tools.ts']);
    });
    it('onay nesnesi (`approval`) yalniz invoke.ts ve tools.ts koprusunde tanimlanir/gecer', () => {
        // `approval` kelimesi baska baglamlarda da gecer (siparis "approval" durumu vb.); onay NESNESI = `approval:`/`approval?:` alani ya da Approval tipi.
        const users = files.filter((f) => /\bapproval\??:|\bApproval\b|opts\.approval/.test(read(f))).map(rel).sort();
        expect(users).toEqual(['capabilities/invoke.ts', 'operations/agent/tools.ts']); // AgentBroker nesneyi yalniz konumsal ({ pendingActionId }) gecirir (asagidaki test)
    });
    it('AgentBroker: onay nesnesi tek yerde uretilir ve o yer `claim` sonrasi yurutmedir; tur dongusu (runToolCall) `tools.invoke`u onaysiz cagirir', () => {
        const src = read(path.join(SRC, 'operations/agent/AgentBroker.ts'));
        // Onay nesnesi yalniz YURUTME cagrisinda (tools.invoke 4. arguman) uretilir; denetim satiri (auditAgent) ayni alani yalniz kayit icin tasir.
        const execCalls = src.match(/tools\.invoke\([^)]*\{\s*pendingActionId:\s*claimed\.id\s*\}\)/g) ?? [];
        expect(execCalls).toHaveLength(1);
        const claimAt = src.indexOf('await pending.claim(pa.id)');
        expect(claimAt).toBeGreaterThan(0);
        expect(src.indexOf(execCalls[0]!)).toBeGreaterThan(claimAt);
        const loop = src.slice(src.indexOf('private async runToolCall'), src.indexOf('// Onay / ret'));
        expect(loop).not.toMatch(/pendingActionId\s*:/);
        expect(loop).toMatch(/tools\.invoke\(ctx, tool\.capId, input\)/);
    });
});

describe('MCP-4 statik mandal (ADR-0035 Karar 5): MCP yazma = yalniz bant disi web onayi', () => {
    const mcpFiles = files.filter((f) => rel(f).startsWith('mcp/'));
    it('src/mcp/** onay kaydini TUKETMEZ/KARARLAMAZ: PendingActions/claim/decide/kota tuketimi yok (yalniz `propose`)', () => {
        for (const f of mcpFiles) {
            const src = read(f);
            expect([rel(f), /\bPendingActions\b|McpPendingActions|\.claim\(|\.decide\(|consumeActionQuota/.test(src)]).toEqual([rel(f), false]);
        }
    });
    it('McpServer: `tools.invoke(` yalniz `confirm:none` (okuma) dalinda; yazma dali (`tool.confirm !== \'none\'`) ondan ONCE doner ve invoke\'a hic ulasmaz', () => {
        const src = read(path.join(SRC, 'mcp/McpServer.ts'));
        const calls = src.match(/this\.deps\.tools\.invoke\(/g) ?? [];
        expect(calls).toHaveLength(1);
        const writeAt = src.indexOf("if (tool.confirm !== 'none')");
        const invokeAt = src.indexOf('this.deps.tools.invoke(');
        expect(writeAt).toBeGreaterThan(0);
        expect(invokeAt).toBeGreaterThan(writeAt);
        // yazma dali blogu `return this.writeResponse(...)` ile biter (invoke'a dusmez)
        const block = src.slice(writeAt, invokeAt);
        expect(block).toMatch(/return this\.writeResponse\(/);
        expect(block).not.toMatch(/tools\.invoke\(/);
    });
    it('onayli yurutme tek yerde (mcpApprovals.decideInner): kilit (SET NX) + kota tuketimi + yeniden denetim SONRASI; sonuc yoksa/pending degilse yurutme yok', () => {
        const src = read(path.join(SRC, 'operations/mcp/mcpApprovals.ts'));
        expect(src.match(/tools\.invoke\(/g) ?? []).toHaveLength(1);
        const inv = src.indexOf('tools.invoke(');
        for (const guard of ["setNx(lockKey", 'consumeActionQuota(', 'tools.unavailable?.(', 'APPROVAL_EXPIRED', 'if (res?.mcp) return this.viewOf']) {
            const at = src.indexOf(guard);
            expect([guard, at]).not.toEqual([guard, -1]);
            expect([guard, at < inv]).toEqual([guard, true]);
        }
    });
    it('`McpApprovals.decide` yalniz cerezli onay rotasindan (api/http/mcpRoutes.ts) cagrilir; `propose` yalniz McpServer\'dan', () => {
        const decide = files.filter((f) => /\.decide\(ctx|approvals\(\)\.decide\(/.test(read(f))).map(rel);
        expect(decide).toEqual(['api/http/mcpRoutes.ts']);
        const propose = files.filter((f) => /approvals\.propose\(/.test(read(f))).map(rel);
        expect(propose).toEqual(['mcp/McpServer.ts']);
    });
});
