import { describe, expect, it } from 'vitest'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { DETAIL_ROUTES, SCREENS, contextActionsFor } from '@bo/navigation/screens'

const at = (name: string, params: Record<string, string> = {}, query: Record<string, string> = {}) => ({ name, params, query }) as unknown as RouteLocationNormalizedLoaded

describe('NT-01 komut paleti bağlam eylemleri', () => {
  it('müşteri detayında "Destek oturumu aç" ilk eylem ve müşteri kapsamlı', () => {
    const a = contextActionsFor(at('tenant', { tid: '102' }))
    expect(a[0]).toMatchObject({ label: 'Destek oturumu aç', to: { path: '/musteriler/102', query: { eylem: 'destek' } } })
    expect(a.find((x) => x.id === 'logs')?.to).toEqual({ path: '/loglar', query: { tid: '102' } })
  })

  it('motorda ölü mektuplara geçiş; en çok 3 eylem; eylemsiz ekranda boş', () => {
    const a = contextActionsFor(at('engine'))
    expect(a[0].to).toEqual({ path: '/motor', query: { sekme: 'basarisiz', kaynak: 'dlq' } })
    for (const s of [...SCREENS, ...DETAIL_ROUTES]) expect(contextActionsFor(at('name' in s ? s.name : s.key, { tid: '1' })).length).toBeLessThanOrEqual(3)
    expect(contextActionsFor(at('overview'))).toEqual([])
  })

  it('log merkezinde mevcut süzgeç korunur', () => {
    const a = contextActionsFor(at('logs', {}, { tid: '7' }))
    expect(a[0].to).toEqual({ path: '/loglar', query: { tid: '7', level: 'fatal,error' } })
  })
})
