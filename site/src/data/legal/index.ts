/**
 * Yasal belge kaydı (ADR-0014 Karar 5 / S5). Site, yasal metinlerin TEK kanonik kaynağıdır.
 * Sıra ve slug'lar `src/data/navigation.ts` `legalNav` ile birebir aynıdır (tests/legal.test.ts korur).
 */
import type { LegalDoc } from './types'
import { kvkkAydinlatma } from './kvkk-aydinlatma'
import { gizlilik } from './gizlilik'
import { cerez } from './cerez'
import { kullanimKosullari } from './kullanim-kosullari'
import { abonelikSozlesmesi } from './abonelik-sozlesmesi'
import { onBilgilendirme } from './on-bilgilendirme'
import { iptalIade } from './iptal-iade'
import { kunye } from './kunye'

/**
 * Hukuki inceleme durumu. `false` iken HER yasal sayfada "TASLAK — hukuki inceleme bekliyor (Protokol 12)"
 * bandı gösterilir ve sayfalar `noindex` olur. `true` yapılması yalnızca insan/hukuk onayıyla (Protokol 12).
 */
export const LEGAL_REVIEWED = false

export const LEGAL_DRAFT_BANNER = 'TASLAK — hukuki inceleme bekliyor (Protokol 12)'

export const legalDocs: LegalDoc[] = [
  kvkkAydinlatma,
  gizlilik,
  cerez,
  kullanimKosullari,
  abonelikSozlesmesi,
  onBilgilendirme,
  iptalIade,
  kunye,
]

export const legalHref = (slug: string): string => `/yasal/${slug}`
