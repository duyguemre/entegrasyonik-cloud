// ADR-0034 / BR-5: saglayici fabrikasi + anahtar dogrulama. Model YALNIZ katalog izinli listesinden; aksi LLM_MODEL_UNAVAILABLE (istek atilmaz).
import { LlmError, type LlmProvider } from '../LlmProvider';
import { isAllowedModel, type LlmProviderId } from '../catalog';
import { AnthropicProvider, verifyAnthropic } from './anthropic';
import { GoogleProvider, verifyGoogle } from './google';
import { OpenAiProvider, verifyOpenAi } from './openai';
import type { ProviderHttpOptions } from './http';

export interface ProviderCredentials { apiKey: string; model: string }

function assertModel(id: LlmProviderId, model: string): void {
    if (!isAllowedModel(id, model)) throw new LlmError('LLM_MODEL_UNAVAILABLE');
}

export function createLlmProvider(id: LlmProviderId, cred: ProviderCredentials, http: ProviderHttpOptions = {}): LlmProvider {
    assertModel(id, cred.model);
    switch (id) {
        case 'anthropic': return new AnthropicProvider(cred.apiKey, cred.model, http);
        case 'openai': return new OpenAiProvider(cred.apiKey, cred.model, http);
        case 'google': return new GoogleProvider(cred.apiKey, cred.model, http);
    }
}

/** Hafif, SALT-OKUMA dogrulama (model getirme ucu; cikarim/uretim cagrisi yok). Basarisizsa siniflanmis `LlmError` firlatir. */
export async function verifyProviderKey(id: LlmProviderId, cred: ProviderCredentials, signal: AbortSignal, http: ProviderHttpOptions = {}): Promise<void> {
    assertModel(id, cred.model);
    switch (id) {
        case 'anthropic': return verifyAnthropic(cred.apiKey, cred.model, signal, http);
        case 'openai': return verifyOpenAi(cred.apiKey, cred.model, signal, http);
        case 'google': return verifyGoogle(cred.apiKey, cred.model, signal, http);
    }
}

export { AnthropicProvider, OpenAiProvider, GoogleProvider };
export type { ProviderHttpOptions } from './http';
