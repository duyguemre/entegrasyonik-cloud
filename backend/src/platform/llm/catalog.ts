// ADR-0034 Karar 9 / BR-5: LLM saglayici KATALOGU. Host'lar ve model izinli listesi KODDA SABITTIR (tenant adres/model-adi-ile-yol yazamaz: K7/SSRF).
// Model kimlikleri yalniz bu listeden secilir; liste degisikligi kod incelemesi ister (sagliyicilarin model adlari zamanla degisir -- insan dogrulamasi: BR-5 notu).

export const LLM_PROVIDER_IDS = ['anthropic', 'openai', 'google'] as const;
export type LlmProviderId = typeof LLM_PROVIDER_IDS[number];

/** Saglayici basina TEK izinli host (tam eslesme; joker yok). `ALLOWED_OUTBOUND_HOSTS` (K7 tek listesi) `llm-<id>` anahtarlariyla BURADAN turer. */
export const LLM_HOSTS: Readonly<Record<LlmProviderId, string>> = {
    anthropic: 'api.anthropic.com',
    openai: 'api.openai.com',
    google: 'generativelanguage.googleapis.com',
};

export interface LlmModelEntry { id: string; label: string; recommended?: boolean }
export interface LlmCatalogEntry { id: LlmProviderId; label: string; keyHelpUrl: string; models: readonly LlmModelEntry[] }

export const LLM_CATALOG: readonly LlmCatalogEntry[] = [
    {
        id: 'anthropic', label: 'Anthropic (Claude)', keyHelpUrl: 'https://console.anthropic.com/settings/keys',
        models: [
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', recommended: true },
            { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
        ],
    },
    {
        id: 'openai', label: 'OpenAI (GPT)', keyHelpUrl: 'https://platform.openai.com/api-keys',
        models: [
            { id: 'gpt-4.1', label: 'GPT-4.1', recommended: true },
            { id: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
        ],
    },
    {
        id: 'google', label: 'Google (Gemini)', keyHelpUrl: 'https://aistudio.google.com/apikey',
        models: [
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', recommended: true },
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
        ],
    },
];

export function isAllowedModel(provider: LlmProviderId, model: string): boolean {
    return LLM_CATALOG.find((c) => c.id === provider)?.models.some((m) => m.id === model) === true;
}
