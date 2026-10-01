/**
 * MCP-2: tenant MCP ayari servisi (`Settings.mcp`): varsayilan off, yalniz sahip, surumlu aktarim metni onayi (`mcp-v1`), surum artinca etkin `off`,
 * 60 sn onbellek + yazimda gecersiz kilma, denetim alanlari. DB/Redis/ag YOK (bellek-ici depo).
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
    effectiveAccess, McpSettingsService, MCP_TRANSFER_TEXT_VERSION, type McpSettingsActor, type McpSettingsStore, type StoredMcpSettings,
} from '../../../src/operations/mcp/mcpSettings';
import { AuditLogger } from '../../../src/services/audit/AuditLogger';

class MemStore implements McpSettingsStore {
    docs = new Map<number, StoredMcpSettings>();
    reads = 0;
    async read(tid: number) { this.reads++; const d = this.docs.get(tid); return d ? JSON.parse(JSON.stringify(d)) : undefined; }
    async write(tid: number, v: StoredMcpSettings) { this.docs.set(tid, JSON.parse(JSON.stringify(v))); }
}

let store: MemStore; let clock: number; let svc: McpSettingsService; let audit: any[];
const owner: McpSettingsActor = { tid: 1, userId: 'u-owner', isOwner: true, imp: false, ip: '203.0.113.9' };
const admin: McpSettingsActor = { ...owner, userId: 'u-admin', isOwner: false };

beforeEach(() => {
    store = new MemStore(); clock = Date.UTC(2026, 9, 1, 12);
    svc = new McpSettingsService({ store, now: () => clock, userEmail: async (id) => (id === 'u-owner' ? 'sahip@example.test' : undefined) });
    audit = [];
    AuditLogger.setSink(async (r) => { audit.push(r); });
});
afterEach(() => AuditLogger.setSink(undefined));

describe('varsayilan ve etkin deger', () => {
    it('ayar yoksa etkin erisim off; gecersiz deger off', async () => {
        expect(await svc.getAccess(1)).toBe('off');
        expect(effectiveAccess({ access: 'admin' })).toBe('off');
        expect(effectiveAccess({ access: 'readwrite' })).toBe('off'); // onay kaydi yok
    });
    it('onay metni surumu eskiyse etkin off + consentOutdated; guncel onayda kayitli deger', async () => {
        await svc.save(owner, { access: 'readwrite', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION });
        expect(await svc.getAccess(1)).toBe('readwrite');
        store.docs.set(1, { access: 'readwrite', transferConsent: { at: new Date(clock), by: 'u-owner', textVersion: 'mcp-v0' } });
        svc.invalidate(1);
        expect(await svc.getAccess(1)).toBe('off');
        const v = await svc.view(1, { canEdit: true, serverUrl: 'https://api.example.test/mcp', activeConnections: 2 });
        expect(v).toMatchObject({ access: 'off', consentOutdated: true, canEdit: true, activeConnections: 2, currentText: { textVersion: 'mcp-v1' }, consent: { textVersion: 'mcp-v0', byEmail: 'sahip@example.test' } });
    });
});

describe('kaydet: yalniz sahip + onay', () => {
    it('admin (ve diger sahip olmayan) 403 FORBIDDEN; depoya yazilmaz', async () => {
        await expect(svc.save(admin, { access: 'read', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION })).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
        expect(store.docs.size).toBe(0);
    });
    it('impersonation 403 IMPERSONATION_FORBIDDEN (sahip olsa bile)', async () => {
        await expect(svc.save({ ...owner, imp: true }, { access: 'read', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION })).rejects.toMatchObject({ status: 403, code: 'IMPERSONATION_FORBIDDEN' });
        expect(store.docs.size).toBe(0);
    });
    it('onaysiz / yanlis surumlu access!=off 422; off icin onay gerekmez; gecersiz deger 400', async () => {
        await expect(svc.save(owner, { access: 'read' })).rejects.toMatchObject({ status: 422, code: 'VALIDATION' });
        await expect(svc.save(owner, { access: 'readwrite', acceptTextVersion: 'mcp-v0' })).rejects.toMatchObject({ status: 422 });
        await expect(svc.save(owner, { access: 'all', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION })).rejects.toMatchObject({ status: 400 });
        await expect(svc.save(owner, { access: 'read', acceptTextVersion: 5 })).rejects.toMatchObject({ status: 400 });
        expect(store.docs.size).toBe(0);
        await expect(svc.save(owner, { access: 'off' })).resolves.toEqual({ from: 'off', to: 'off' });
    });
    it('sahip onayla acar: onay kaydi (at/by/surum), e-posta depoya YAZILMAZ, view e-postayi cozer', async () => {
        await svc.save(owner, { access: 'read', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION });
        const raw = JSON.stringify(store.docs.get(1));
        expect(raw).toContain('u-owner');
        expect(raw).not.toContain('@');
        const v = await svc.view(1, { canEdit: true, serverUrl: 'x', activeConnections: 0 });
        expect(v.consent).toEqual({ textVersion: 'mcp-v1', at: new Date(clock).toISOString(), byEmail: 'sahip@example.test' });
        expect(v.consentOutdated).toBe(false);
    });
    it('off: onay kaydi korunur (denetim izi), etkin deger off; yeniden acista onay yine zorunlu', async () => {
        await svc.save(owner, { access: 'readwrite', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION });
        await svc.save(owner, { access: 'off' });
        expect(store.docs.get(1)).toMatchObject({ access: 'off', transferConsent: { textVersion: 'mcp-v1' } });
        expect(await svc.getAccess(1)).toBe('off');
        await expect(svc.save(owner, { access: 'read' })).rejects.toMatchObject({ status: 422 });
    });
    it('tenant izolasyonu: A tenant ayari B tenanti etkilemez', async () => {
        await svc.save(owner, { access: 'readwrite', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION });
        expect(await svc.getAccess(2)).toBe('off');
    });
});

describe('onbellek (60 sn) ve denetim', () => {
    it('okuma 60 sn onbellekte; yazim aninda gecersiz kilar; 60 sn sonra depo yeniden okunur', async () => {
        await svc.getAccess(1); await svc.getAccess(1);
        expect(store.reads).toBe(1);
        clock += 59_000; await svc.getAccess(1);
        expect(store.reads).toBe(1);
        clock += 2_000; await svc.getAccess(1);
        expect(store.reads).toBe(2);
        await svc.save(owner, { access: 'read', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION });
        expect(await svc.getAccess(1)).toBe('read'); // onbellek eski off'u tutmaz
    });
    it('denetim: mcp.settings.changed {from,to,textVersion}; metin/e-posta yok; basarisiz denemede kayit yok', async () => {
        await expect(svc.save(admin, { access: 'read', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION })).rejects.toBeDefined();
        await svc.save(owner, { access: 'readwrite', acceptTextVersion: MCP_TRANSFER_TEXT_VERSION });
        await new Promise((r) => setTimeout(r, 5));
        expect(audit).toHaveLength(1);
        expect(audit[0]).toMatchObject({ event: 'mcp.settings.changed', result: 'ok', sub: 'u-owner', tid: 1, ip: '203.0.113.9', surface: 'app', meta: { from: 'off', to: 'readwrite', textVersion: 'mcp-v1' } });
        expect(JSON.stringify(audit)).not.toContain('Yapay zekâ bağlantısı açıldığında');
    });
    it('depo hatasi getAccess\'te FIRLATIR (cagiran reddeder: fail-closed)', async () => {
        store.read = async () => { throw new Error('db down'); };
        await expect(svc.getAccess(1)).rejects.toThrow('db down');
    });
});
