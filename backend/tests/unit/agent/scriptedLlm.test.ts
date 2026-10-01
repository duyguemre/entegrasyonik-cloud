import { describe, it, expect, afterEach } from '@jest/globals';
import { parseEnv, ConfigError } from '../../../src/config/env';
import { LlmError, ScriptedLlmProvider, FALLBACK_TEXT, type LlmEvent, type LlmStreamRequest } from '../../../src/platform/llm';
import { resolveLlmProvider } from '../../../src/operations/agent/providerResolver';
import { ProviderService, setProviderServiceForTest } from '../../../src/operations/agent/providerSettings';

const noSleep = async () => { /* bekleme yok */ };
const req = (text: string, tools: LlmStreamRequest['tools'] = [], extra: Partial<LlmStreamRequest> = {}): LlmStreamRequest => ({
    system: 's', messages: [{ role: 'user', content: text }], tools, maxTokens: 100, signal: new AbortController().signal, ...extra,
});
async function collect(p: ScriptedLlmProvider, r: LlmStreamRequest): Promise<LlmEvent[]> {
    const out: LlmEvent[] = [];
    for await (const e of p.stream(r)) out.push(e);
    return out;
}
const tool = (name: string) => ({ name, description: 'd', inputSchema: {} });

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; setProviderServiceForTest(undefined); });

describe('ScriptedLlmProvider', () => {
    it('eslesme yoksa fallback metni + done', async () => {
        const evs = await collect(new ScriptedLlmProvider({ sleep: noSleep }), req('alakasiz bir soru'));
        expect(evs[0]).toEqual({ type: 'text-delta', text: FALLBACK_TEXT });
        expect(evs[evs.length - 1]).toEqual({ type: 'done', reason: 'stop' });
    });
    it('long-stream: ~120 delta, toplam 2500 karakter', async () => {
        const evs = await collect(new ScriptedLlmProvider({ sleep: noSleep }), req('uzun rapor ver'));
        const deltas = evs.filter((e) => e.type === 'text-delta') as Array<{ text: string }>;
        expect(deltas.length).toBeGreaterThanOrEqual(100);
        expect(deltas.reduce((n, d) => n + d.text.length, 0)).toBe(2500);
    });
    it('arac senaryosu yalniz arac SUNULDUYSA calisir (yoksa fallback); sunulduysa tool-call, sonuc sonrasi metin', async () => {
        const p = new ScriptedLlmProvider({ sleep: noSleep });
        const without = await collect(p, req('onay bekleyen siparişler'));
        expect(without.some((e) => e.type === 'tool-call')).toBe(false);
        const withTool = await collect(p, req('Onay bekleyen siparişler', [tool('orders_list')]));
        expect(withTool.find((e) => e.type === 'tool-call')).toMatchObject({ name: 'orders_list' });
        const after = await collect(p, req('onay bekleyen siparişler', [tool('orders_list')], {
            messages: [{ role: 'user', content: 'onay bekleyen siparişler' }, { role: 'tool', toolCallId: 'call_orders_1', name: 'orders_list', content: '{}' }],
        }));
        expect(after.some((e) => e.type === 'text-delta')).toBe(true);
    });
    it('onayla, onay bekleyen senaryosundan once eslesir (daha belirgin)', async () => {
        const p = new ScriptedLlmProvider({ sleep: noSleep });
        expect(p.match(req('siparişleri onayla', [tool('orders_approve'), tool('orders_list')]))?.id).toBe('approve-orders');
    });
    it('hata senaryolari LlmError sinifiyla yukselir (anahtar, yogun)', async () => {
        const p = new ScriptedLlmProvider({ sleep: noSleep });
        await expect(collect(p, req('anahtarim'))).rejects.toMatchObject({ code: 'LLM_KEY_INVALID' });
        await expect(collect(p, req('çok yoğun'))).rejects.toMatchObject({ code: 'LLM_RATE_LIMITED', retryAfterSec: 20 });
        expect(new LlmError('LLM_QUOTA')).toBeInstanceOf(Error);
    });
    it('iptal: signal abort edilince akis sessizce biter', async () => {
        const ac = new AbortController();
        const out: LlmEvent[] = [];
        const p = new ScriptedLlmProvider({ sleep: noSleep });
        for await (const e of p.stream(req('uzun rapor', [], { signal: ac.signal }))) { out.push(e); if (out.length === 3) ac.abort(); }
        expect(out.length).toBe(3);
    });
});

describe('scripted saglayici URETIMDE reddedilir', () => {
    it('APP_ENV=production iken ScriptedLlmProvider kurulamaz', () => {
        process.env.APP_ENV = 'production';
        expect(() => new ScriptedLlmProvider()).toThrow(/uretimde/);
    });
    it('NODE_ENV=production iken de kurulamaz', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.APP_ENV;
        expect(() => new ScriptedLlmProvider()).toThrow(/uretimde/);
    });
    it('AGENT_LLM_SCRIPTED=true + production: strict env dogrulamasi surec baslatmaz (yalniz degisken adi)', () => {
        const base = { ...process.env, DB_URL: 'mongodb://127.0.0.1:27017', AGENT_LLM_SCRIPTED: 'true' };
        let err: unknown;
        try { parseEnv({ ...base, APP_ENV: 'production', NODE_ENV: 'production' }, { strict: true }); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(ConfigError);
        expect((err as ConfigError).issues.join(' ')).toContain('AGENT_LLM_SCRIPTED');
        // yerelde strict dogrulama gecer
        expect(parseEnv({ ...base, APP_ENV: 'local', NODE_ENV: 'test' }, { strict: true }).agent.llmScripted).toBe(true);
    });
    it('AGENT_LLM_SCRIPTED=true yerelde (local) kabul edilir ve config.agent.llmScripted true olur', () => {
        const cfg = parseEnv({ ...process.env, APP_ENV: 'local', NODE_ENV: 'test', AGENT_LLM_SCRIPTED: 'true' }, { strict: false });
        expect(cfg.agent.llmScripted).toBe(true);
        expect(parseEnv({ ...process.env, APP_ENV: 'local', AGENT_LLM_SCRIPTED: undefined }, { strict: false }).agent.llmScripted).toBe(false);
    });
    it('saglayici cozucu: bayrak kapali -> null (SETUP_REQUIRED); acik -> scripted; production+bayrak -> firlatir', async () => {
        delete process.env.AGENT_LLM_SCRIPTED;
        // BR-5: bayrak kapaliyken tenant BYOK ayarina bakilir; burada DB'siz bos depo (anahtar yok -> null)
        setProviderServiceForTest(new ProviderService({ store: { read: async () => undefined, patch: async () => undefined } }));
        expect(await resolveLlmProvider(1)).toBeNull();
        process.env.AGENT_LLM_SCRIPTED = 'true';
        expect((await resolveLlmProvider(1))?.provider.id).toBe('scripted');
        process.env.APP_ENV = 'production';
        await expect(resolveLlmProvider(1)).rejects.toThrow(/uretimde/);
    });
});
