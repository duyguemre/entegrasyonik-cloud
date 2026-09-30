// C2.2 — abonelik durum eşlemesi (SubscriptionView ile ORTAK) + kabuk bandı karar kuralları.
import { describe, it, expect } from 'vitest'
import {
  SUBSCRIPTION_STATUS_META,
  daysUntil,
  resolveSubscriptionBanner,
  subscriptionStatusMessage,
  subscriptionStatusMeta,
  type MySubscriptionResponse,
} from '@/composables/subscriptionStatus'
import tr from '@/plugins/locales/tr.json'
import en from '@/plugins/locales/en.json'

const NOW = new Date('2026-09-30T09:00:00.000Z')
const iso = (days: number) => new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000).toISOString()

function res(status: string, sub: Record<string, any> = {}, access = { read: true, write: true, engine: true }): MySubscriptionResponse {
  return { status, subscription: { planCode: 'growth', status, billingExempt: false, ...sub }, access }
}

describe('ortak durum eşlemesi (SubscriptionView davranışı aynı)', () => {
  it('bilinmeyen/boş durum "Abonelik Yok" karşılığına düşer', () => {
    expect(subscriptionStatusMeta(undefined)).toBe(SUBSCRIPTION_STATUS_META.no_subscription)
    expect(subscriptionStatusMeta('weird')).toBe(SUBSCRIPTION_STATUS_META.no_subscription)
    expect(subscriptionStatusMeta('past_due').label).toBe('Ödeme Bekliyor')
  })

  it('metinler: reason varsa past_due/suspended/expired onu gösterir, yoksa varsayılan', () => {
    expect(subscriptionStatusMessage('past_due', null, 'Sunucu gerekçesi')).toBe('Sunucu gerekçesi')
    expect(subscriptionStatusMessage('past_due', null)).toMatch(/kart bilgilerinizi güncelleyin/)
    expect(subscriptionStatusMessage('active', null)).toMatch(/aboneliğiniz aktif/i)
    expect(subscriptionStatusMessage(undefined, null)).toMatch(/Henüz aktif bir aboneliğiniz yok/)
    expect(subscriptionStatusMessage('trialing', { trialEndsAt: '2026-10-02T00:00:00.000Z' })).toContain('02.10.2026')
  })
})

describe('resolveSubscriptionBanner', () => {
  it('bant yok: active, no_subscription, legacy (billingExempt), bilinmeyen, boş yanıt', () => {
    expect(resolveSubscriptionBanner(res('active'), NOW)).toBeNull()
    expect(resolveSubscriptionBanner({ status: 'no_subscription', subscription: null }, NOW)).toBeNull()
    expect(resolveSubscriptionBanner(res('suspended', { billingExempt: true }), NOW)).toBeNull()
    expect(resolveSubscriptionBanner(res('something_new'), NOW)).toBeNull()
    expect(resolveSubscriptionBanner(null, NOW)).toBeNull()
  })

  it('trialing: yalnız son 3 gün ve trialEndsAt varsa; info + küçültülebilir', () => {
    expect(resolveSubscriptionBanner(res('trialing', { trialEndsAt: iso(4) }), NOW)).toBeNull()
    expect(resolveSubscriptionBanner(res('trialing'), NOW)).toBeNull()
    const soon = resolveSubscriptionBanner(res('trialing', { trialEndsAt: iso(2.5) }), NOW)!
    expect(soon).toMatchObject({ tone: 'info', messageKey: 'trialEndsSoon', minimizable: true, title: 'Deneme Sürümü' })
    expect(soon.params.days).toBe(3)
    const today = resolveSubscriptionBanner(res('trialing', { trialEndsAt: iso(0) }), NOW)!
    expect(today.messageKey).toBe('trialEndsToday')
    const ended = resolveSubscriptionBanner(res('trialing', { trialEndsAt: iso(-1) }), NOW)!
    expect(ended).toMatchObject({ tone: 'warning', messageKey: 'trialEnded', minimizable: false })
  })

  it('past_due: warning (grace tarihli), motor durmuşsa danger; kapatılamaz', () => {
    const grace = resolveSubscriptionBanner(res('past_due', { graceUntil: iso(5) }), NOW)!
    expect(grace).toMatchObject({ tone: 'warning', messageKey: 'pastDueGrace', minimizable: false })
    expect(grace.params.date).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
    expect(resolveSubscriptionBanner(res('past_due'), NOW)!.messageKey).toBe('pastDue')
    const stopped = resolveSubscriptionBanner(res('past_due', { graceUntil: iso(-1) }, { read: true, write: false, engine: false }), NOW)!
    expect(stopped).toMatchObject({ tone: 'danger', messageKey: 'pastDueStopped' })
  })

  it('suspended: danger + stok senkronu metni', () => {
    const b = resolveSubscriptionBanner(res('suspended', {}, { read: true, write: false, engine: false }), NOW)!
    expect(b).toMatchObject({ tone: 'danger', messageKey: 'suspended', minimizable: false, title: 'Askıya Alındı' })
    expect(tr.subscriptionBanner.suspended).toBe('Stok senkronu durdu — kanallarda aşırı satış riski. Ödemeyi tamamlayın.')
  })

  it('canceled: dönem içinde info (tarihli), dönem bittiyse danger', () => {
    expect(resolveSubscriptionBanner(res('canceled', { currentPeriodEnd: iso(10) }), NOW)).toMatchObject({ tone: 'info', messageKey: 'canceledUntil' })
    expect(resolveSubscriptionBanner(res('canceled'), NOW)).toMatchObject({ tone: 'info', messageKey: 'canceled' })
    expect(resolveSubscriptionBanner(res('canceled', { currentPeriodEnd: iso(-2) }), NOW)).toMatchObject({ tone: 'danger', messageKey: 'canceledEnded' })
    expect(resolveSubscriptionBanner(res('canceled', {}, { read: true, write: false, engine: false }), NOW)).toMatchObject({ tone: 'danger', messageKey: 'canceledStopped' })
  })

  it('expired: danger', () => {
    expect(resolveSubscriptionBanner(res('expired', {}, { read: false, write: false, engine: false }), NOW)).toMatchObject({ tone: 'danger', messageKey: 'expired' })
  })

  it('daysUntil: yukarı yuvarlar, geçersiz tarih null', () => {
    expect(daysUntil(iso(1.1), NOW)).toBe(2)
    expect(daysUntil('not-a-date', NOW)).toBeNull()
    expect(daysUntil(undefined, NOW)).toBeNull()
  })

  it('her messageKey için tr ve en metni (tam + tek satır) var', () => {
    const keys = ['trialEndsSoon', 'trialEndsToday', 'trialEnded', 'pastDueGrace', 'pastDue', 'pastDueStopped', 'suspended', 'canceledUntil', 'canceled', 'canceledEnded', 'canceledStopped', 'expired']
    for (const dict of [tr, en] as any[]) {
      for (const k of keys) {
        expect(typeof dict.subscriptionBanner[k], k).toBe('string')
        expect(typeof dict.subscriptionBanner.compact[k], `compact.${k}`).toBe('string')
      }
    }
  })
})
