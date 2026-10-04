import { DatabaseManagerInstance } from '@database/index';
import { eventLog } from '@platform/core/logger';

const log = eventLog('engine', 'integrationAttention');

/**
 * [eslesme-fiyat WP7a, F-04] Art arda AUTH hatasıyla konan `Clients.integrations[].needsAttention` işaretini ve
 * `authFailureCount` sayacını temizler — kanal ayarları (kimlik bilgileri) kaydedildiğinde çağrılır; sipariş üreticisi
 * bir sonraki turda o entegrasyon için yeniden iş üretir. En iyi çaba: ASLA fırlatmaz (ayar kaydını bozmaz).
 */
export async function clearIntegrationAttention(clientId: unknown, integrationCode: unknown): Promise<void> {
    const id = Number(clientId);
    const code = String(integrationCode ?? '');
    if (!Number.isFinite(id) || !code) return;
    try {
        const appDB = await DatabaseManagerInstance.getApplicationDB();
        await appDB.getClientModel().updateOne(
            { clientId: id, integrations: { $elemMatch: { integrationCode: code, $or: [{ needsAttention: { $exists: true } }, { authFailureCount: { $gt: 0 } }] } } },
            { $unset: { 'integrations.$.needsAttention': '' }, $set: { 'integrations.$.authFailureCount': 0 } },
        );
    } catch (err) {
        log.error('INTEGRATIONATTENTION_TEMIZLEME_HATASI', 'needsAttention temizlenemedi (best-effort).', { err });
    }
}
