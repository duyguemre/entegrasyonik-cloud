
import { defineStore } from 'pinia'
import { ref, readonly, reactive } from 'vue';
import { integrationAccent } from '@entegrasyonik/ui/tokens';

/** Ölçülmüş marka rengi olmayan platformlar (CHANNEL_BRAND_COLORS.md dışı) → nötr rol (EkChannelDot kuralı). */
const NEUTRAL_MARK = 'var(--ek-color-neutral)'


var version = ref(0)
var favorites: any = reactive([])
const ecommerces:any = reactive([ 
])

ecommerces.push({
    id:1,
    code: 'ideasoft',
    color: integrationAccent.ideasoft,
    logo: '/assets/images/integrations/ecommerce/ideasoft.png',
    width: 100
})
ecommerces.push({
    id:2,
    code: 'ticimax',
    color: NEUTRAL_MARK,
    logo: '/assets/images/integrations/ecommerce/ticimax.svg',
    width: 90
}
)
ecommerces.push({
    id:3,
    code: 'shopify',
    color: integrationAccent.shopify,
    logo: '/assets/images/integrations/ecommerce/shopify.svg',
    width: 100
}
)
ecommerces.push({
    id:4,
    code: 'opencart',
    color: NEUTRAL_MARK,
    logo: '/assets/images/integrations/ecommerce/opencart.svg',
    width: 100
}
)
ecommerces.push({
    id:5,
    code: 'woocommerce',
    color: integrationAccent.woocommerce,
    logo: '/assets/images/integrations/ecommerce/woocommerce.svg',
    width: 100
}
)
ecommerces.push({
    id:6,
    code: 'wix',
    color: NEUTRAL_MARK,
    logo: '/assets/images/integrations/ecommerce/wix.svg',
    width: 100
}
)
ecommerces.push({
    id:7,
    code: 'ankaeticaret',
    color: NEUTRAL_MARK,
    logo: '/assets/images/integrations/ecommerce/ankaeticaret.svg',
    width: 100
}
)
ecommerces.push({
    id:8,
    code: 'eticaretsoft',
    color: NEUTRAL_MARK,
    logo: '/assets/images/integrations/ecommerce/eticaretsoft.svg',
    width: 100
}
)

  
favorites.push(ecommerces[0])
favorites.push(ecommerces[1])
favorites.push(ecommerces[2])
favorites.push(ecommerces[3])
favorites.push(ecommerces[4])
favorites.push(ecommerces[5])
favorites.push(ecommerces[6])
favorites.push(ecommerces[7])

export default function useECommerceStore() {
/*   export const useECommerceStore = defineStore('ecommerce', () => { */
    var getECommerceFavorites = () => {
        return favorites;
      }
    
    var isECommerceFavoriteLink = (link: any) => {
        if (getECommerceFavorites().includes(link)) return true
        return false
      }
    
    
    function getECommerces() {
  /*     setInterval(() => {
        ecommerces.push({
          id: 3,
          name: 'PttAVM',
          logo: 'pttavm.svg',
          code: 'pttavm',
          width: '100',
          products: '130',
          returns: '5',
          orders: '20',
        }
        )
      }, 3000)
   */    return ecommerces
    }
  
    var deleteECommerceFavorite = (favorite: any) => {
        console.log(favorite.id, favorites.length)
        favorites = favorites.filter((link:any)=>link.id!=favorite.id)
        console.log(favorites.length)
        updateNewECommerceVersion()
    }
  
    var addMarketPlaceFavorite = (favorite: any) => {
      favorites.push(favorite);
      updateNewECommerceVersion()
    }
  
  
    var updateECommerceFavorites = (linkIdArray: any) => {
      if (linkIdArray == undefined) return
      let tempFavoritesArray: any = []
      for (let linkId of linkIdArray) {
        let tempLink = getECommerceLink(Number(linkId))
        if (tempLink)
          tempFavoritesArray.push(tempLink)
      }
      favorites = tempFavoritesArray
      updateNewECommerceVersion()
    }
  
    var updateNewECommerceVersion = () => {
      version.value++
    }
  
    var getECommerceLink = (id: number) => {
      for (let ecommerce of ecommerces) {
        if (id == ecommerce.id)
          return ecommerce
      }
      return undefined
    }


    var getECommerce = (ecommerceName: string) => {
      if (!ecommerces) return {}
      let temp = ecommerces.filter((element: any) => element.code == ecommerceName)
      if (temp && temp.length > 0) return temp[0]
  }

    return {
        version,
      getECommerces, 
      getECommerceFavorites, 
      deleteECommerceFavorite, 
      addMarketPlaceFavorite,
      updateECommerceFavorites,
      isECommerceFavoriteLink,
      getECommerce
    };    
}
