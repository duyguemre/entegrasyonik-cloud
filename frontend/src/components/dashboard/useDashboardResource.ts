// Dashboard kartlarının ortak veri yükleyicisi (DS-v2 Aşama 2 / dashboard).
//
// Her kart YALNIZCA backend'in gerçekten döndürdüğü veriyi gösterir; dört durum ayrıdır:
//   loading   → iskelet (düzen sıçramaz)
//   ready     → veri (boşsa kart kendi dürüst boş durumunu gösterir)
//   error     → insan-okunur mesaj + "Tekrar dene" (ham hata/HTTP kodu GÖSTERİLMEZ)
//   forbidden → 403: kullanıcının kademesi yetmiyor → kart HİÇ gösterilmez
//
// `restApi.post` ağ/HTTP hatasında REDDETMEZ, ham axios hata nesnesini değer olarak döndürür
// (bkz. `composables/restapi.ts` `postService`); bu yüzden hata, dönen gövdenin beklenen
// şekli taşıyıp taşımadığına (`isValid`) ve `response.status`'a bakılarak ayırt edilir.
import { ref, shallowRef, type Ref } from 'vue'
import useRestApi from '@/composables/restapi'

export type ResourceState = 'loading' | 'ready' | 'error' | 'forbidden'

export interface DashboardResource<T> {
  state: Ref<ResourceState>
  data: Ref<T | null>
  loadedAt: Ref<Date | null>
  load: () => Promise<void>
}

const errorStatus = (res: any): number | undefined => {
  if (res?.isAxiosError || res?.response) return Number(res?.response?.status) || 0
  return undefined
}

export function useDashboardResource<T>(
  rpc: string,
  body: () => Record<string, unknown>,
  isValid: (res: any) => boolean,
): DashboardResource<T> {
  const restApi = useRestApi()
  const state = ref<ResourceState>('loading')
  const data = shallowRef<T | null>(null)
  const loadedAt = ref<Date | null>(null)
  let seq = 0

  const load = async () => {
    const mine = ++seq
    if (state.value !== 'forbidden') state.value = 'loading'
    let res: any
    try {
      res = await restApi.post(rpc, body())
    } catch {
      res = undefined
    }
    if (mine !== seq) return
    const status = errorStatus(res)
    if (status === 403) {
      data.value = null
      state.value = 'forbidden'
      return
    }
    if (status === undefined && isValid(res)) {
      data.value = res as T
      loadedAt.value = new Date()
      state.value = 'ready'
      return
    }
    state.value = 'error'
  }

  return { state, data, loadedAt, load }
}
