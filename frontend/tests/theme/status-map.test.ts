import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ORDER_STATUS_TONE,
  CLAIM_STATUS_TONE,
  MESSAGE_STATUS_TONE,
  TICKET_STATUS_TONE,
  INVOICE_STATUS_TONE,
  JOB_STATUS_TONE,
  SUBSCRIPTION_STATUS_TONE,
  INTEGRATION_CONNECTION_TONE,
  storeStatusTone,
  type StatusMapEntry,
  type StatusTone,
} from '../../src/design/status-map'

const VALID_TONES: StatusTone[] = ['success', 'warning', 'danger', 'info', 'neutral']

/** `tr.json` içindeki `status.*` ad alanından, nokta-yollu anahtarla (ör. "status.order.approved") değer okur. */
function readTrJsonKey(dottedKey: string): string | undefined {
  const trJsonPath = resolve(__dirname, '../../src/plugins/locales/tr.json')
  const trJson = JSON.parse(readFileSync(trJsonPath, 'utf8'))
  return dottedKey.split('.').reduce((acc: any, part: string) => (acc == null ? undefined : acc[part]), trJson)
}

const ALL_MAPS: Record<string, Record<string, StatusMapEntry>> = {
  order: ORDER_STATUS_TONE,
  claim: CLAIM_STATUS_TONE,
  message: MESSAGE_STATUS_TONE,
  ticket: TICKET_STATUS_TONE,
  invoice: INVOICE_STATUS_TONE,
  job: JOB_STATUS_TONE,
  subscription: SUBSCRIPTION_STATUS_TONE,
  integration: INTEGRATION_CONNECTION_TONE,
}

describe('status-map.ts — ADR-0015 Karar 3.3 (tek anlamsal palet, 5 ton)', () => {
  for (const [domain, map] of Object.entries(ALL_MAPS)) {
    describe(`domain: ${domain}`, () => {
      for (const [code, entry] of Object.entries(map)) {
        it(`"${code}" → geçerli ton ("success/warning/danger/info/neutral")`, () => {
          expect(VALID_TONES).toContain(entry.tone)
        })

        it(`"${code}" → labelKey "tr.json"'da MEVCUT (çevrilmemiş anahtar sızmaz)`, () => {
          const value = readTrJsonKey(entry.labelKey)
          expect(typeof value).toBe('string')
          expect(value).not.toHaveLength(0)
        })
      }
    })
  }

  it('storeStatusTone(true/false) → success/neutral', () => {
    expect(storeStatusTone(true).tone).toBe('success')
    expect(storeStatusTone(false).tone).toBe('neutral')
    expect(readTrJsonKey(storeStatusTone(true).labelKey)).toBe('Aktif')
    expect(readTrJsonKey(storeStatusTone(false).labelKey)).toBe('Pasif')
  })
})
