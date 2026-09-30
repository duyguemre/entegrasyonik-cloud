// BR-1: tenant icin LLM saglayicisi cozumu. BR-1'de YALNIZ `AGENT_LLM_SCRIPTED=true` (yerel/test) saglayici dondurur; tenant anahtari
// (BYOK, enc:v1) BR-5'te buraya baglanir. Anahtar yoksa null -> `SETUP_REQUIRED`.
import { config } from '@config';
import { ScriptedLlmProvider, assertScriptedAllowed } from '@platform/llm';
import type { ResolvedProvider } from './AgentBroker';

let scripted: ScriptedLlmProvider | undefined;

/** Sahte saglayici bayragi (yerel/test). Acikken `features.agent` kapali olsa da sohbet acik sayilir (yerel gelistirme kolayligi). */
export function isScriptedMode(): boolean {
    return config.agent.llmScripted === true;
}

export async function resolveLlmProvider(_tid: number): Promise<ResolvedProvider | null> {
    if (isScriptedMode()) {
        assertScriptedAllowed(); // uretimde her cagrida reddedilir (onbellekli ornek olsa da)
        scripted ??= new ScriptedLlmProvider();
        return { provider: scripted };
    }
    return null;
}
