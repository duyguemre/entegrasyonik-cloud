import { ref } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import { registerStoreReset } from '@/stores/resetRegistry'
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
  const addBrand = (newBrand: any) => {
    restApi.post("BrandService/addBrand", { title: newBrand.title }).then((response: any) => {
      if (response && response._id) {
        retrieve()
      }
    })
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