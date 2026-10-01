// BR-1/BR-5: tenant icin LLM saglayicisi cozumu. Once `AGENT_LLM_SCRIPTED=true` (yerel/test; uretimde reddedilir); aksi halde tenant BYOK anahtari
// (Settings.agent, enc:v1) + SAHIP ONAYI (K38). Anahtar ya da gecerli surum onayi yoksa null -> `SETUP_REQUIRED` (403).
// Cozulen saglayici kullanim sayaciyla sarilir (bilgi amacli; `providerUsage.ts`). Tenant A anahtari YALNIZ tenant A icin cozulur (onbellek tid anahtarli).
import { config } from '@config';
import { ScriptedLlmProvider, assertScriptedAllowed } from '@platform/llm';
import type { ResolvedProvider } from './AgentBroker';
import { getAgentKv } from './kv';
import { getProviderService } from './providerSettings';
import { meterProvider } from './providerUsage';

let scripted: ScriptedLlmProvider | undefined;

/** Sahte saglayici bayragi (yerel/test). Acikken `features.agent` kapali olsa da sohbet acik sayilir (yerel gelistirme kolayligi). */
export function isScriptedMode(): boolean {
    return config.agent.llmScripted === true;
}

export async function resolveLlmProvider(tid: number): Promise<ResolvedProvider | null> {
    if (isScriptedMode()) {
        assertScriptedAllowed(); // uretimde her cagrida reddedilir (onbellekli ornek olsa da)
        scripted ??= new ScriptedLlmProvider();
        return { provider: scripted };
    }
    const r = await getProviderService().createProviderFor(tid);
    if (!r) return null;
    return { provider: meterProvider(r.provider, { tid, surface: 'chat', kv: getAgentKv }), providerId: r.providerId, model: r.model };
}

/** Kurulum durumu (info): anahtar var ama onay yok -> `consentRequired`. Scripted kipte her zaman hazir. */
export async function resolveSetupState(tid: number): Promise<{ configured: boolean; consentRequired: boolean; provider?: 'anthropic' | 'openai' | 'google'; model?: string }> {
    if (isScriptedMode()) return { configured: true, consentRequired: false };
    const s = await getProviderService().resolveState(tid);
    if (s.state === 'ready') return { configured: true, consentRequired: false, provider: s.provider, model: s.model };
    return { configured: s.configured, consentRequired: s.consentRequired, ...(s.provider ? { provider: s.provider } : {}), ...(s.model ? { model: s.model } : {}) };
}
