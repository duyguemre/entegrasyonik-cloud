import { ref } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import { registerStoreReset } from '@/stores/resetRegistry'
import type { CreateResult } from '@/components/common/quickCreate'
export const useBrandsStore = defineStore('brandsStore', () => {
  const brands = ref()
  const restApi = useRestApi()

  const getBrand = (_id:any)=> {
    if(brands.value==undefined || brands.value.length==0) {
      return {title:'-'}
    }
    for(var brand of brands.value ?? []) {
      if(brand._id==_id)
        return brand
    }
  }

  const getBrandTitle = (_id:any)=> {
    const brand = getBrand(_id)
    return brand?.title
  }

  const retrieve = async () => {
    await restApi.get("BrandService").then((response: any) => {
      if (response) {
        brands.value = response
      }
    })
    return brands.value
  }
  /** FR2-PFORM 23: istek beklenir; başarıda liste yenilenir ve yeni kimlik döner (çağıran seçebilsin), hata yutulmaz. */
  const addBrand = async (newBrand: any): Promise<CreateResult> => {
    const response: any = await restApi.post("BrandService/addBrand", { title: newBrand.title })
    if (response && response._id) {
      await retrieve()
      return { id: String(response._id) }
    }
    return { error: response }
  }
  
  const countOfBrands = ()=> {
    return brands.value?.length - 1
  }

  const getBrands = (reset=false)=> {
    if(reset==true) retrieve()
    return brands
  }

  // R9b: çıkış sonrası önceki kiracının marka önbelleği kalmasın.
  registerStoreReset('brandsStore', () => { brands.value = undefined })

  return { retrieve, getBrandTitle,addBrand, getBrands,getBrand,countOfBrands }
})