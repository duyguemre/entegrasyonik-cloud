// FRONTEND_CLEANUP_PLAN V-03 — `integrationStore.getClient*()` önbellekli (computed) hale geldi; çıktı sözleşmesi aynı kalmalı:
// türe göre süzme, kiracı sırasına göre sıralama, katalog yokken tür getirileri `undefined`, platform birleşimi pazaryeri → e-ticaret → ERP.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const api = vi.hoisted(() => ({ list: undefined as any, client: undefined as any }))
vi.mock('@/composables/restapi', () => ({
  default: () => ({
    get: vi.fn(async () => api.list),
    post: vi.fn(async (op: string) => (op === 'IntegrationService/getClientIntegrations' ? api.client : [])),
  }),
}))

import { useIntegrationStore } from '../src/stores/integrationStore'

const item = (code: string, type: string) => ({ code, type: { code: type }, title: code })
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('integrationStore — kiracı entegrasyon getirileri (V-03)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    api.list = [item('hb', 'marketplace'), item('ty', 'marketplace'), item('n11', 'marketplace'), item('ideasoft', 'ecommerce'), item('bizimhesap', 'erp'), item('aras', 'shipment')]
    api.client = { marketplace: [{ code: 'ty', order: 2 }, { code: 'hb', order: 1 }], ecommerce: [{ code: 'ideasoft', order: 0 }], erp: [{ code: 'bizimhesap', order: 0 }] }
  })

  it('katalog yüklenmeden: tür getirileri undefined, platformlar boş dizi (eskiden TypeError)', () => {
    const store = useIntegrationStore()
    expect(store.getClientMarketplaces()).toBeUndefined()
    expect(store.getClientShipments()).toBeUndefined()
    expect(store.getClientPlatforms()).toEqual([])
  })

  it('türe göre süzer, kiracı sırasıyla sıralar, sırayı katalog öğesine yazar', async () => {
    const store = useIntegrationStore()
    await store.clientInit()
    await flush()
    expect(store.getClientMarketplaces()!.map((i: any) => i.code)).toEqual(['hb', 'ty'])
    expect(store.getClientMarketplaces()![0].order).toBe(1)
    expect(store.getClientECommerces()!.map((i: any) => i.code)).toEqual(['ideasoft'])
    expect(store.getClientErps()!.map((i: any) => i.code)).toEqual(['bizimhesap'])
    expect(store.getClientShipments()).toEqual([])
    expect(store.getClientPlatforms().map((i: any) => i.code)).toEqual(['hb', 'ty', 'ideasoft', 'bizimhesap'])
  })

  it('aynı sonuç her çağrıda yeniden hesaplanmaz (aynı dizi örneği)', async () => {
    const store = useIntegrationStore()
    await store.clientInit()
    await flush()
    expect(store.getClientMarketplaces()).toBe(store.getClientMarketplaces())
    expect(store.getClientPlatforms()).toBe(store.getClientPlatforms())
  })
})
