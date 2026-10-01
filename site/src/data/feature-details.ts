/**
 * `/ozellikler` derin anlatım maddeleri (ADR-0014 Karar 2). Yalnızca KAYITLI yetenekler için ve yalnızca
 * kodda/ADR'de doğrulanabilen davranışlar; her madde `evidence` taşır. Sayfalar `getFeaturePoints()` kullanır.
 */
import { PATHS, evidence, type EvidenceRef } from './evidence'

export interface FeaturePoint {
  text: string
  evidence: EvidenceRef[]
}

/** Anahtar: `capabilities.ts` yetenek `id`'si. */
export const featureDetails: Record<string, FeaturePoint[]> = {
  'stock-reservation': [
    {
      text: 'Kullanılabilir stok, eldeki stoktan rezerve edilen miktar düşülerek hesaplanır.',
      evidence: [evidence(PATHS.adr0004, 'ADR-0004 kullanılabilir stok tanımı', 'available = stock − reserved')],
    },
    {
      text: 'Aynı sipariş size birden fazla kez ulaşsa da stoğunuzdan yalnızca bir kez düşülür.',
      evidence: [evidence(PATHS.adr0004, 'ADR-0004 idempotent rezervasyon', 'sipariş satırı anahtarıyla idempotent')],
    },
    {
      text: 'Kullanılabilir stoku aşan sipariş satırı aşırı satış olarak işaretlenir.',
      evidence: [evidence(PATHS.adr0004, 'ADR-0004 OVERSOLD durumu', 'OVERSOLD')],
    },
  ],
}

/** Sayfaların tek girişi (evidence atılır). */
export function getFeaturePoints(capabilityId: string): string[] {
  return (featureDetails[capabilityId] ?? []).map((p) => p.text)
}
