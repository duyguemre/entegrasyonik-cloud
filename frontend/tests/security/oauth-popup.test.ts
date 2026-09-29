// R7 / G-06, BR-34 — OAuth popup mesajı origin/source doğrulaması.
import { describe, it, expect } from 'vitest'
import { isTrustedPopupMessage } from '../../src/utils/oauthPopup'

const popup = { name: 'popup' }
const good = { origin: 'https://app.entegrasyonik.com', source: popup, data: { type: 'redirectParams', data: { code: 'c', state: 's' } } }
const expected = { origin: 'https://app.entegrasyonik.com', popup }

describe('isTrustedPopupMessage', () => {
  it('kendi origin + kendi popup + redirectParams -> güvenilir', () => {
    expect(isTrustedPopupMessage(good, expected)).toBe(true)
  })
  it('yabancı origin reddedilir (state doğru olsa bile)', () => {
    expect(isTrustedPopupMessage({ ...good, origin: 'https://evil.example' }, expected)).toBe(false)
  })
  it('başka pencere/çerçeveden gelen mesaj (source farklı) reddedilir', () => {
    expect(isTrustedPopupMessage({ ...good, source: { name: 'other' } }, expected)).toBe(false)
  })
  it('popup açılmadıysa (null) hiçbir mesaj güvenilir değil', () => {
    expect(isTrustedPopupMessage(good, { origin: expected.origin, popup: null })).toBe(false)
  })
  it('başka tür mesajlar (ör. devtools/uzantı) yok sayılır', () => {
    expect(isTrustedPopupMessage({ ...good, data: { type: 'other' } }, expected)).toBe(false)
    expect(isTrustedPopupMessage({ ...good, data: undefined }, expected)).toBe(false)
  })
})
