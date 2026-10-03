import axios from 'axios'
import { ref } from 'vue'
import { useLoadingStore } from '@/stores/loadingStore'
import logger from '@/composables/logger'
import { apiBaseUrl, imageBaseUrl } from '@/config/env'
axios.defaults.withCredentials = true

// ADR-0017 Karar 1.6/1.8 — hata yakalayıcılarda ham axios hata nesnesini (istek
// yapılandırması dahil) LOGLAMAK yerine yalnızca teşhis için gerekli, güvenli alanları
// çıkarır; backend'in yanıt başlığındaki `X-Request-Id`'yi (varsa) bağlar. Mevcut
// `resolve(error)` sözleşmesi DEĞİŞMEZ (bkz. çağıranlar) — bu yalnızca loglama kanalıdır.
function logApiError(action: 'get' | 'post', service: string, error: any) {
  const status = error?.response?.status
  const requestId = error?.response?.headers?.['x-request-id'] ?? error?.response?.headers?.['X-Request-Id']
  logger.error(`API isteği başarısız (${action})`, {
    module: 'restapi',
    op: action,
    service,
    status,
    requestId,
    message: error?.message,
  })
}

// ADR-0001 adım 8: oturum süresi dolduğunda / iptal edildiğinde (401) kullanıcıyı giriş sayfasına yönlendir.
// Giriş/kayıt/captcha/çıkış/kimlik-kontrol uçları 401'i normal akışın parçası olarak döndürür; bunlar hariç tutulur.
const AUTH_FLOW_PATHS = ['SecurityService/login', 'SecurityService/register', 'SecurityService/getCaptcha', 'SecurityService/logout', 'checkAuthentication']
let redirectingToLogin = false
axios.interceptors.response.use(
  response => response,
  async error => {
    const url: string = error?.config?.url ?? ''
    if (error?.response?.status === 401 && !AUTH_FLOW_PATHS.some(p => url.includes(p)) && !redirectingToLogin) {
      redirectingToLogin = true
      try {
        // Dinamik import: router -> view -> restapi döngüsel bağımlılığını önler
        const { default: router } = await import('@/router')
        // ADR-0014 S4b: ilk gezinme bitmeden (App.vue `userContext` isteği kimliksiz 401 dönerken router hâlâ başlangıç
        // konumunda) bu blok `/login?reason=session-expired`'a yarışan İKİNCİ bir `push` üretip site devri
        // (`/login?mode=register&plan=…`) ve `redirect` sorgusunu EZİYORDU (bkz. e2e navigation.spec.ts notu).
        // İlk gezinmenin (guard yönlendirmesi dahil) bitmesi beklenir. `/login` (mevcut) ve `requiresAuth:false`
        // işaretli DİĞER kimliksiz ekranlar (ADR-0015 Karar 4 — `/reset-password` vb.) buradan asla uzaklaştırılmaz:
        // App.vue HER rotada `fetchUserContext()` çağırır; kimliksiz kullanıcı için bu her zaman 401'dir, aksi halde
        // e-postadaki sıfırlama bağlantısını açan (oturumu OLMAYAN, bu yüzden bu 401'i normal karşılayan) kullanıcı
        // formu hiç görmeden `/login`'e geri fırlatılırdı.
        await router.isReady()
        const current = router.currentRoute.value
        if (current.path !== '/login' && current.meta?.requiresAuth !== false) {
          await router.push({ path: '/login', query: { reason: 'session-expired' } })
        }
      } finally {
        setTimeout(() => { redirectingToLogin = false }, 1000)
      }
    }
    return Promise.reject(error) // mevcut çağıranlar hatayı yakalayıp resolve(error) yapmaya devam eder
  }
)

// R4 (docs/FRONTEND_CODE_AUDIT.md H-02): taban adresler artık config/env.ts'ten (env yoksa AYNI
// varsayılan değere düşer — davranış değişmez). `baseImageUrl` artık `baseUrl`'den AYRI bir env
// değişkenine (`VITE_IMAGE_BASE_URL`) bağlanabilir (yapılandırılmazsa AYNI şekilde `baseUrl`'e düşer).
// Eskiden burada 6 farklı ortam (app.entegrasyonik.com/railway/heroku/render/192.168.1.111) için
// yorum-içi ölü adres bloğu vardı (H-02c) — kaldırıldı; bkz. .env.example / .env (git-ignored).
const baseUrl = apiBaseUrl
const baseImageUrl = imageBaseUrl

const endpoints: any = {
  MenuService: {
    url: 'MenuService',
    type: 'GET'
  },
  IntegrationService: {
    url: 'IntegrationService',
    type: 'POST'
  },
  RegisterService: {
    url: 'RegisterService',
    type: 'POST'
  },

}
const getService = async (service: string) => {
  if (!service) {
    logger.warn('restApi.get: boş servis adıyla çağrıldı', { module: 'restapi', op: 'get' })
    return undefined
  }
  return new Promise((resolve: any, reject: any) => {
    axios.get(baseUrl + service)
      .then(response => {
        if (response)
          resolve(response.data)
        else reject()
      })
      .catch(error => {
        logApiError('get', service, error)
        resolve(error)
      })
  });
}


const getExternalService = async (externalUrl: string) => {
  if (!externalUrl) {
    logger.warn('restApi.getExternal: boş URL ile çağrıldı', { module: 'restapi', op: 'getExternal' })
    return undefined
  }
  return new Promise((resolve: any, reject: any) => {
    axios.get(externalUrl)
      .then(response => {
        if (response)
          resolve(response.data)
        else reject()
      })
      .catch(error => {
        logApiError('get', externalUrl, error)
        resolve(error)
      })
  });
}


const postService = async (service: string, data: any) => {
  if (!service) {
    logger.warn('restApi.post: boş servis adıyla çağrıldı', { module: 'restapi', op: 'post' })
    return undefined
  }
  return new Promise((resolve: any) => {
    axios.post(baseUrl + service, data)
      .then(response => {
        resolve(response.data)
      })
      .catch(error => {
        logApiError('post', service, error)
        resolve(error)
      })
  });
}



const postImageServiceIdentityUpload = async (data: any) => {
  return new Promise((resolve: any) => {
    axios.post(baseImageUrl + 'uploadIdentity', data, {
      headers: {
        "Content-Type": "multipart/form-data"
      },
      withCredentials: true
    })
      .then(response => {
        resolve(response.data)
      })
      .catch(error => {
        logApiError('post', 'uploadIdentity', error)
        resolve(error)
      })
  });
}

const postImageServiceUpload = async (data: any) => {
  return new Promise((resolve: any) => {
    axios.post(baseImageUrl + 'upload', data, {
      headers: {
        "Content-Type": "multipart/form-data"
      },
      withCredentials: true // Include cookies and other credentials
    })
      .then(response => {
        resolve(response.data)
      })
      .catch(error => {
        logApiError('post', 'upload', error)
        resolve(error)
      })
  });
}

const postImageService = async (service: string, data: any) => {
  if (!service) {
    logger.warn('restApi.postImage: boş servis adıyla çağrıldı', { module: 'restapi', op: 'postImage' })
    return undefined
  }
  return new Promise((resolve: any) => {
    axios.post(baseImageUrl + service, data)
      .then(response => {
        resolve(response.data)
      })
      .catch(error => {
        logApiError('post', service, error)
        resolve(error)
      })
  });
}


export default function useRestApi() {
  const loadingStore = useLoadingStore()

  const processResponse = (resp: any, mode: boolean) => {
  }
  const get = async (service: string, mode: boolean = true, message?: string) => {
    const resp: any = await getService(service)
    processResponse(resp, mode)
    return resp
  }

  const getExternal = async (service: string, mode: boolean = true) => {
    const resp: any = await getExternalService(service)
    processResponse(resp, mode)
    return resp
  }

  const post = async (service: string, data: any, mode: boolean = true, message?: string) => {
    const resp: any = await postService(service, data)
    processResponse(resp, mode)
    return resp
  }

  const getImage = (imageId: any) => {
    return baseImageUrl + 'getImage/' + imageId
  }

  const downloadImage = (imageId: any) => {
    return baseImageUrl + 'downloadImage/' + imageId
  }

  const postImage = async (service: string, data: any, mode: boolean = true, message?: string) => {
    const resp: any = await postImageService(service, data)
    processResponse(resp, mode)
    return resp
  }

  const postIdentityUpload = async (data: any, mode: boolean = true) => {
    const resp: any = await postImageServiceIdentityUpload(data)
    processResponse(resp, mode)
    return resp
  }

  return {
    get,
    getExternal,
    post,
    postImageServiceIdentityUpload,
    postIdentityUpload,
    getImage,
    downloadImage,
    postImage,
    // R4/T-01 (docs/FRONTEND_CODE_AUDIT.md): `postImageServiceUpload` tanımlıydı ama buradan hiç
    // dışa verilmiyordu -> 5 çağıran (`restApi.postImageUpload(formData)`, ürün/varyant görseli
    // yükleme) `TypeError: restApi.postImageUpload is not a function` alıyordu. Çağıran ad
    // (`postImageUpload`) DEĞİŞMEDİ — backend `operation-policy.test.ts` bu literal adı
    // `ImageApi/upload` olarak tarıyor (bkz. IMAGE_API_TARGETS: upload -> ImageService.addImages).
    postImageUpload: postImageServiceUpload
  };
}