/**
 * İddia kaydı ortak türleri (ADR-0014 Karar 2/5).
 *
 * Kural: sitedeki her olgusal iddia markup'a değil `src/data/*.ts` kayıtlarına yazılır ve her kayıt
 * en az bir `EvidenceRef` taşır. `tests/claims.test.ts` şunları derleme öncesi doğrular:
 *   - `path` repo köküne göreli ve dosya MEVCUT;
 *   - `contains` verilmişse o birebir metin dosyada GEÇİYOR (registry başlığı, test adı, kod kesiti);
 *   - `available` entegrasyon kümesi `IntegrationFactory.ts`'in kabul ettiği kod kümesine EŞİT;
 *   - görünür içerikte yasaklı ifade / doğrulanamaz mutlak veya sayısal iddia yok.
 *
 * Sayfalar (S2+) ham kayıtları DEĞİL `getPublic*` seçicilerini kullanır: seçiciler `evidence` ve
 * `internalNotes` alanlarını atar ve gizli yol haritası öğelerini (`ROADMAP_VISIBLE=false`) elemez.
 */

export interface EvidenceRef {
  /** Repo köküne göreli dosya yolu (ör. `INTEGRATIONS_REGISTRY.md`, `backend/tests/...`). */
  path: string
  /** İnsan-okunur atıf: registry bölümü, test adı, ADR maddesi. */
  ref: string
  /** Dosyada birebir geçmesi gereken metin (başlık, test adı, kod kesiti). */
  contains?: string
}

export const evidence = (path: string, ref: string, contains?: string): EvidenceRef => ({ path, ref, contains })

/**
 * Yol haritası (henüz implemente olmayan) öğeleri sitede GÖSTERİLİR mi?
 * ADR-0014 Açık Soru 5: varsayılan HAYIR — insan onayı gelene kadar `false`.
 * `true` yapmak bilinçli bir ürün kararıdır: `tests/claims.test.ts` bu sabiti `false`'a sabitler.
 */
export const ROADMAP_VISIBLE: boolean = false

/** Sık kullanılan kanıt dosyaları. */
export const PATHS = {
  registry: 'INTEGRATIONS_REGISTRY.md',
  factory: 'backend/src/integration/modules/IntegrationFactory.ts',
  backlog: 'BACKLOG.md',
  adr0001: 'docs/adr/0001-kimlik-dogrulama-tenant-kimligi-rbac.md',
  adr0003: 'docs/adr/0003-tenant-sirlari-ve-provisioning.md',
  adr0004: 'docs/adr/0004-zero-oversell-rezervasyon-modeli.md',
  adr0008: 'docs/adr/0008-odeme-saglayicisi-ve-abonelik-modeli.md',
  adr0014: 'docs/adr/0014-tanitim-sitesi-mimari-ve-tasarim.md',
  apiVerification: 'docs/research/2026-09-27-api-verification.md',
} as const

/** `INTEGRATIONS_REGISTRY.md` bölüm kanıtı (başlık metniyle birebir doğrulanır). */
export const registry = (section: string, heading: string): EvidenceRef =>
  evidence(PATHS.registry, `INTEGRATIONS_REGISTRY.md ${section}`, heading)
