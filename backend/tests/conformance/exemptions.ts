// ADR-0033 INT-03: conformance kiti istisna kaydı. TEK yer: adaptör dosyaları burayı DEĞİŞTİRMEZ, kit buradan okur.
//   KNOWN_OPEN     : senaryo bugün adaptörde BAŞARISIZ (gerçek bir açık). Kit senaryoyu yine koşturur ve BAŞARISIZ OLMASINI bekler;
//                    senaryo düzelirse test "artık geçiyor: listeden çıkar" diye kırılır. Sayı `exemptions.ratchet.test.ts` ile
//                    dondurulmuştur (ARTAMAZ; yalnız INT-05'te adaptör düzeldikçe azalır). Davranış bu işte DEĞİŞTİRİLMEZ.
//   NOT_APPLICABLE : senaryo bu adaptör için tanım gereği uygulanmaz (gerekçe zorunlu, ör. yazma yolu yok).
import type { AdapterCode } from '@integration/modules/adapterKeys';

export const SCENARIO_IDS = [
    'C1', 'C2a', 'C2b', 'C3', 'C4', 'C5', 'C6a', 'C6b', 'C7a', 'C7b', 'C8a', 'C8b', 'C9a', 'C9b',
    'C10a', 'C10b', 'C10c', 'C11', 'C12', 'C13', 'C14',
] as const;
export type ScenarioId = typeof SCENARIO_IDS[number];

/** Playbook §5.2 tablosundaki ana senaryo (C1-C14) karşılığı (alt senaryolar a/b/c). */
export const PLAYBOOK_ID = (id: ScenarioId): string => id.replace(/[abc]$/, '');

export type ExemptionTable = Partial<Record<AdapterCode, Partial<Record<ScenarioId, string>>>>;

// Tüm kayıtlar kapandı (faz4-conf-close 2026-09-30): conformance kiti 6 adaptörde 0 KNOWN_OPEN ile yeşil.
export const KNOWN_OPEN: ExemptionTable = {};
export const NOT_APPLICABLE: ExemptionTable = {};
