// ADR-0034 Karar 9 / AGENT_BROKER_PLAN BR-4: backoffice sohbetinin PLATFORM LLM anahtari (BYOK DEGIL: maliyet platformundur; tek hesap, H4).
// Yer: ApplicationDB `PlatformSettings` koleksiyonunda TEK belge `_id:'agent.platformProvider'` (`target:'_platform'`), alanlar `provider`, `model`,
// `apiKey: 'enc:v1:...'` (FieldCrypto, AES-256-GCM), `lastTest`. NEDEN `_platform` ayar katalogu DEGIL: katalog degerleri revizyon/diff/yayin zincirinden ve
// yonetici UI'sindan duz okunur; sir orada yankilanir. Bu belge hicbir ayar ekranina/public-config'e/diff'e girmez; yanitlarda yalniz 'sensitive'.
// Yeni sema/model/indeks/goc YOK (koleksiyon ilk yazimda olusur; ham surucu erisimi). Tenant anahtari bu belgeden, platform anahtari tenant `Settings`'ten ASLA okunmaz:
// depo `tid === 0` disinda reddeder (`PLATFORM_AGENT_TID` yalniz backoffice baglaminin sentinel'idir; gercek tenant numaralari >= 1).
import { ProviderService, type AgentSettingsStore, type StoredAgentSettings } from './providerSettings';

/** Backoffice sohbetinin sentinel "tenant" numarasi (gercek tenant `order` degerleri >= 1). */
export const PLATFORM_AGENT_TID = 0;
export const PLATFORM_SETTING_ID = 'agent.platformProvider';
const COLLECTION = 'PlatformSettings';

interface RawCollection {
    findOne(filter: Record<string, unknown>, opts?: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown>;
}

async function collection(): Promise<RawCollection> {
    // tembel yukleme: bu modulu yuklemek DB katmanini yuklemez (birim testleri)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseManagerInstance } = require('@database/DatabaseManager') as typeof import('@database/DatabaseManager');
    const app = (await DatabaseManagerInstance.getApplicationDB()) as unknown as { getRootDatabase(): { getConnection(): { collection(n: string): RawCollection } | undefined } };
    const conn = app.getRootDatabase().getConnection();
    if (!conn) throw new Error('uygulama db baglantisi yok');
    return conn.collection(COLLECTION);
}

function assertPlatform(tid: number): void {
    if (tid !== PLATFORM_AGENT_TID) throw new Error('platform ayar deposu yalniz platform baglaminda kullanilir');
}

export const platformSettingsStore: AgentSettingsStore = {
    async read(tid) {
        assertPlatform(tid);
        const doc = await (await collection()).findOne({ _id: PLATFORM_SETTING_ID });
        if (!doc) return undefined;
        const { provider, model, apiKey, lastTest } = doc as StoredAgentSettings;
        return { provider, model, apiKey, lastTest };
    },
    async patch(tid, p) {
        assertPlatform(tid);
        const update: Record<string, Record<string, unknown>> = {};
        const set = { ...(p.set ?? {}), target: '_platform', updatedAt: new Date() };
        update.$set = set;
        if (p.unset?.length) update.$unset = Object.fromEntries(p.unset.map((k) => [k, 1]));
        await (await collection()).updateOne({ _id: PLATFORM_SETTING_ID }, update, { upsert: true });
    },
};

let singleton: ProviderService | undefined;
/** Platform saglayici servisi: tenant KVKK onayi yok (arac sonuclari tenant verisi tasimaz), denetim yuzeyi `backoffice_chat`. */
export function getPlatformProviderService(): ProviderService {
    return (singleton ??= new ProviderService({ store: platformSettingsStore, requireConsent: false, surface: 'backoffice_chat' }));
}
