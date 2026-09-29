/**
 * "Nasıl bağlanırsınız" kaydı (ADR-0014 Karar 2, `/entegrasyonlar/[kod]`, BACKLOG 3b/S2b).
 *
 * YALNIZCA kimlik bilgisi TÜRLERİ yazılır (etiket) — hiçbir sır, örnek değer veya gerçek alan adı örneği YOK.
 * Etiketler `IntegrationFactory` adaptörlerinin `requiredSettings` listesinden türetilir; her kayıt bunu
 * `evidence.contains` ile kanıtlar (statik test dosyada geçtiğini doğrular). Sayfalar yalnızca
 * `getConnectGuide()` seçicisini kullanır (evidence atılır). Yol haritası öğesi için kayıt YOKTUR.
 */
import { evidence, type EvidenceRef } from './evidence'
import type { IntegrationKind } from './integrations'

export interface ConnectGuide {
  code: string
  /** Kullanıcının pazaryeri/sağlayıcı panelinden edineceği kimlik bilgisi türleri (etiket). */
  credentials: string[]
  /** Görünür ek not (yalnızca kanıtlı sınır). */
  note?: string
  evidence: EvidenceRef[]
}

export interface PublicConnectGuide {
  code: string
  credentials: string[]
  note?: string
  steps: string[]
}

const M = 'backend/src/integration/modules'

export const connectGuides: ConnectGuide[] = [
  {
    code: 'trendyol',
    credentials: ['Satıcı kimliği', 'API anahtarı', 'API gizli anahtarı'],
    evidence: [
      evidence(`${M}/marketplace/trendyol/index.ts`, 'trendyol zorunlu ayarlar', "requiredSettings = ['SELLERID', 'APIKEY', 'APISECRET']"),
    ],
  },
  {
    code: 'hepsiburada',
    credentials: ['Satıcı (mağaza) kimliği', 'API anahtarı', 'API gizli anahtarı'],
    evidence: [
      evidence(`${M}/marketplace/hepsiburada/index.ts`, 'hepsiburada zorunlu ayarlar', "requiredSettings = ['APISECRET', 'APIKEY', 'SELLERID']"),
    ],
  },
  {
    code: 'n11',
    credentials: ['API anahtarı', 'API gizli anahtarı'],
    evidence: [evidence(`${M}/marketplace/n11/index.ts`, 'n11 zorunlu ayarlar', "requiredSettings = ['APIKEY', 'APISECRET']")],
  },
  {
    code: 'pazarama',
    credentials: ['API anahtarı', 'API gizli anahtarı'],
    evidence: [
      evidence(`${M}/marketplace/pazarama/index.ts`, 'pazarama zorunlu ayarlar', "requiredSettings = ['APIKEY', 'APISECRET']"),
    ],
  },
  {
    code: 'ideasoft',
    credentials: ['Mağaza adı', 'Anahtar (key)', 'Gizli anahtar (secret)'],
    note: 'Gerçek mağaza bağlantısında yetkilendirme (OAuth) adımı bu sürümde tamamlanmamıştır; entegrasyon şu an test ortamında çalışır.',
    evidence: [
      evidence(`${M}/ecommerce/ideasoft/index.ts`, 'ideasoft zorunlu ayarlar', "requiredSettings = ['storeName', 'key', 'secret']"),
    ],
  },
  {
    code: 'bizimhesap',
    credentials: ['Anahtar (key)', 'Gizli anahtar (secret)'],
    evidence: [evidence(`${M}/erp/bizimhesap/index.ts`, 'bizimhesap zorunlu ayarlar', "requiredSettings = ['key', 'secret']")],
  },
]

/** Kimlik bilgilerinin nereden edinileceği — tür bazında genel ifade (kanala özgü menü yolu YAZILMAZ). */
const WHERE: Record<IntegrationKind, string> = {
  marketplace: 'İlgili pazaryerinin satıcı panelinden API kimlik bilgilerinizi edinin.',
  ecommerce: 'Mağaza panelinizden entegrasyon kimlik bilgilerinizi edinin.',
  erp: 'ERP hesabınızdan entegrasyon kimlik bilgilerinizi edinin.',
  shipping: '',
  einvoice: '',
}

const COMMON_STEPS = [
  "Entegrasyonik'te ilgili entegrasyonun ayar ekranını açın ve bilgileri girin.",
  'Kaydedin. Eksik bir alan olduğunda ekran hangi bilginin gerektiğini belirtir.',
]

/** Sayfaların tek girişi: evidence atılır, adımlar tür bilgisiyle birleştirilir. */
export function getConnectGuide(code: string, kind: IntegrationKind): PublicConnectGuide | undefined {
  const g = connectGuides.find((x) => x.code === code)
  if (!g) return undefined
  return {
    code: g.code,
    credentials: [...g.credentials],
    ...(g.note ? { note: g.note } : {}),
    steps: [WHERE[kind], ...COMMON_STEPS].filter(Boolean),
  }
}
