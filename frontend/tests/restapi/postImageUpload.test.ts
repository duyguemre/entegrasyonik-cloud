// R4 / T-01 (docs/FRONTEND_CODE_AUDIT.md): `restApi.postImageUpload` eskiden `useRestApi()`
// dönüşünde YOKTU -> 5 çağıran (`ProductImagesComponent`/varyant görseli yükleme akışları)
// `TypeError: restApi.postImageUpload is not a function` alıyordu. Bu test doğrudan axios
// çağrısını (gerçek istek atılmadan) doğrular; regresyon olursa (export tekrar kaybolursa/adı
// değişirse) burada kırmızı olur.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import axios from 'axios'
import useRestApi from '../../src/composables/restapi'

describe('restApi.postImageUpload (T-01)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dışa verilen bir fonksiyondur (regresyon: önceki hâlde undefined idi)', () => {
    const restApi = useRestApi() as any
    expect(typeof restApi.postImageUpload).toBe('function')
  })

  it('görsel sunucusunun /upload uç noktasına multipart POST atar ve yanıtı döner', async () => {
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({ data: { result: [{ _id: 'img-1' }] } } as any)
    const restApi = useRestApi() as any
    const formData = new FormData()
    formData.append('files', new Blob(['x']), 'a.png')

    const resp = await restApi.postImageUpload(formData)

    expect(postSpy).toHaveBeenCalledTimes(1)
    const [url, data, config] = postSpy.mock.calls[0]
    expect(url).toMatch(/\/upload$/)
    expect(data).toBe(formData)
    expect((config as any)?.headers?.['Content-Type']).toBe('multipart/form-data')
    expect(resp).toEqual({ result: [{ _id: 'img-1' }] })
  })

  it('istek başarısız olursa hatayı fırlatmaz, değer olarak çözer (restapi.ts hata-değer sözleşmesi BR-20 KORUNUR)', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('network down'))
    const restApi = useRestApi() as any

    const resp = await restApi.postImageUpload(new FormData())
    expect(resp).toBeInstanceOf(Error)
  })
})
