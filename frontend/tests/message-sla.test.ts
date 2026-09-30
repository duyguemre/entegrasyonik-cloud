import { describe, expect, it } from 'vitest'
import {
  MESSAGE_WAIT_THRESHOLDS,
  answerLengthState,
  answerRuleFor,
  isAwaitingReply,
  sortAwaitingFirst,
  waitParts,
  waitTone,
  waitingMs,
} from '../src/components/message/messageSla'

/** C2.5 — bekleme süresi + kanal karakter kuralı (saf mantık). */
const H = 3_600_000
const NOW = new Date('2026-09-25T12:00:00.000Z')
const at = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * H).toISOString()

describe('isAwaitingReply', () => {
  it('yanıt ulaşmamış durumlar bekleyendir; cevaplanan/onay bekleyen değildir', () => {
    expect(isAwaitingReply({ status: 'WAITING_SELLER' })).toBe(true)
    expect(isAwaitingReply({ status: 'UNREAD' })).toBe(true)
    expect(isAwaitingReply({ status: 'READ' })).toBe(true)
    expect(isAwaitingReply({ status: 'ANSWERED' })).toBe(false)
    expect(isAwaitingReply({ status: 'WAITING_APPROVAL' })).toBe(false)
    expect(isAwaitingReply({ status: 'ANSWERED', isRejected: true })).toBe(true)
    expect(isAwaitingReply(null)).toBe(false)
  })
})

describe('waitingMs / waitTone', () => {
  it('eşikler öneri sabitidir: 24 sa uyarı, 48 sa üstü kritik', () => {
    expect(MESSAGE_WAIT_THRESHOLDS).toEqual({ warningHours: 24, dangerHours: 48 })
  })

  it('<24 sa neutral, 24–48 sa warning, >48 sa danger', () => {
    expect(waitTone(3 * H)).toBe('neutral')
    expect(waitTone(24 * H - 1)).toBe('neutral')
    expect(waitTone(24 * H)).toBe('warning')
    expect(waitTone(48 * H)).toBe('warning')
    expect(waitTone(48 * H + 1)).toBe('danger')
  })

  it('eşikler parametreyle ayarlanabilir', () => {
    expect(waitTone(5 * H, { warningHours: 4, dangerHours: 8 })).toBe('warning')
    expect(waitTone(9 * H, { warningHours: 4, dangerHours: 8 })).toBe('danger')
  })

  it('bekleyen olmayan veya tarihi okunamayan mesajda null', () => {
    expect(waitingMs({ status: 'ANSWERED', date: at(5) }, NOW)).toBeNull()
    expect(waitingMs({ status: 'WAITING_SELLER', date: 'geçersiz' }, NOW)).toBeNull()
    expect(waitingMs({ status: 'WAITING_SELLER' }, NOW)).toBeNull()
    expect(waitingMs({ status: 'WAITING_SELLER', date: at(3) }, NOW)).toBe(3 * H)
  })

  it('gelecek tarihli mesaj 0 bekleme sayılır (saat kayması)', () => {
    expect(waitingMs({ status: 'WAITING_SELLER', date: at(-1) }, NOW)).toBe(0)
  })

  it('waitParts gün/saat/dakikaya böler', () => {
    expect(waitParts(52 * H + 5 * 60_000)).toEqual({ days: 2, hours: 4, minutes: 5 })
  })
})

describe('kanal karakter kuralı', () => {
  it('yalnız Trendyol için 10–2000 kuralı vardır; bilinmeyen kanal kuralsızdır', () => {
    expect(answerRuleFor('trendyol')).toMatchObject({ min: 10, max: 2000 })
    expect(answerRuleFor('TRENDYOL')).toMatchObject({ min: 10, max: 2000 })
    expect(answerRuleFor('hepsiburada')).toBeNull()
    expect(answerRuleFor(undefined)).toBeNull()
  })

  it('9 karakter kısa, 10 ve 2000 geçerli, 2001 uzun; boşluklar sayılmaz', () => {
    const rule = answerRuleFor('trendyol')
    expect(answerLengthState('123456789', rule)).toEqual({ count: 9, state: 'tooShort' })
    expect(answerLengthState('  123456789  ', rule).state).toBe('tooShort')
    expect(answerLengthState('1234567890', rule).state).toBe('ok')
    expect(answerLengthState('x'.repeat(2000), rule).state).toBe('ok')
    expect(answerLengthState('x'.repeat(2001), rule).state).toBe('tooLong')
    expect(answerLengthState('   ', rule).state).toBe('empty')
  })

  it('kuralsız kanalda her boş olmayan metin geçerlidir', () => {
    expect(answerLengthState('ok', null)).toEqual({ count: 2, state: 'ok' })
  })
})

describe('sortAwaitingFirst (yalnız bu sayfa)', () => {
  it('bekleyenler en uzundan başlar, diğerleri sunucu sırasını korur', () => {
    const rows = [
      { id: 'a', status: 'ANSWERED', date: at(100) },
      { id: 'b', status: 'WAITING_SELLER', date: at(3) },
      { id: 'c', status: 'READ', date: at(1) },
      { id: 'd', status: 'WAITING_SELLER', date: at(50) },
      { id: 'e', status: 'WAITING_APPROVAL', date: at(70) },
    ]
    expect(sortAwaitingFirst(rows, NOW).map(r => r.id)).toEqual(['d', 'b', 'c', 'a', 'e'])
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })
})
