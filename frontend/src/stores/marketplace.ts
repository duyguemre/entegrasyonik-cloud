
import { defineStore } from 'pinia'
import { ref, readonly, reactive } from 'vue';



var version = ref(0)
var favorites: any = reactive([])
const marketplaces = reactive([ 
  {
    id: 1,
    name: 'Hepsiburada',
    logo: '/assets/images/integrations/marketplace/hepsiburada.png',
    code: 'hepsiburada',
    width: '120',
    products: '200',
    returns: '20',
    orders: '30',
    color: '#ff963f'
  },
  {
    id: 2,
    name: 'Trendyol',
    code: 'trendyol',
    logo: '/assets/images/integrations/marketplace/trendyol.png',
    width: '100',
    products: '530',
    returns: '10',
    orders: '50',
    color: '#f26725'
  },
  {
    id: 3,
    name: 'Akakçe',
    logo: '/assets/images/integrations/marketplace/akakce.png',
    code: 'akakce',
    width: '80',
    products: '130',
    returns: '5',
    orders: '20',
    color: '#17629e'
  },

  {
    id: 4,
    name: 'ÇicekSepeti',
    logo: '/assets/images/integrations/marketplace/ciceksepeti.svg',
    code: 'ciceksepeti',
    width: '120',
    products: '130',
    returns: '5',
    orders: '20',
    color: '#51B449',
},

  {
    id: 5,
    name: 'Amazon',
    logo: '/assets/images/integrations/marketplace/amazon.png',
    code: 'amazon',
    width: '90',
    products: '130',
    returns: '5',
    orders: '20',
    color: '#ff9900',
},

  {
    id: 6,
    name: 'N11',
    logo: '/assets/images/integrations/marketplace/n11.png',
    code: 'n11',
    width: '50',
    products: '130',
    returns: '5',
    orders: '20',
    color: '#6849c5',
},

  {
    id: 7,
    name: 'Pazarama',
    logo: '/assets/images/integrations/marketplace/pazarama.svg',
    code: 'pazarama',
    width: '100',
    products: '130',
    returns: '5',
    orders: '20',
    color: '#0136F4',
},

  {
    id: 8,
    name: 'PttAVM',
    logo: '/assets/images/integrations/marketplace/pttavm.svg',
    code: 'pttavm',
    width: '100',
    products: '130',
    returns: '5',
    orders: '20',
    color: '#00A7CF',
}
])

favorites.push(marketplaces[0])
favorites.push(marketplaces[1])
favorites.push(marketplaces[2])
favorites.push(marketplaces[3])
favorites.push(marketplaces[4])
favorites.push(marketplaces[5])
favorites.push(marketplaces[6])
favorites.push(marketplaces[7])


export default function useMarketplaceStore() {
/*   export const useMarketplaceStore = defineStore('marketplace', () => {
 */  
    var getMarketplaceFavorites = () => {
        return favorites;
      }
    
    var isMarketplaceFavoriteLink = (link: any) => {
        if (getMarketplaceFavorites().includes(link)) return true
        return false
      }
    
    
    function getMarketplaces() {
  /*     setInterval(() => {
        marketplaces.push({
          id: 3,
          name: 'PttAVM',
          logo: '/assets/images/integrations/marketplace/pttavm.svg',
          code: 'pttavm',
          width: '100',
          products: '130',
          returns: '5',
          orders: '20',
        }
        )
      }, 3000)
   */    return marketplaces
    }
  
    var deleteMarketplaceFavorite = (favorite: any) => {
        console.log(favorite.id, favorites.length)
        favorites = favorites.filter((link:any)=>link.id!=favorite.id)
        console.log(favorites.length)
        updateNewMarketplaceVersion()
    }
  
    var addMarketPlaceFavorite = (favorite: any) => {
      favorites.push(favorite);
      updateNewMarketplaceVersion()
    }
  
  
    var updateMarketplaceFavorites = (linkIdArray: any) => {
      if (linkIdArray == undefined) return
      let tempFavoritesArray: any = []
      for (let linkId of linkIdArray) {
        let tempLink = getMarketplaceLink(Number(linkId))
        if (tempLink)
          tempFavoritesArray.push(tempLink)
      }
      favorites = tempFavoritesArray
      updateNewMarketplaceVersion()
    }
  
    var updateNewMarketplaceVersion = () => {
      version.value++
    }
  
    var getMarketplaceLink = (id: number) => {
      for (let marketplace of marketplaces) {
        if (id == marketplace.id)
          return marketplace
      }
      return undefined
    }
  
    var getMarketplace = (marketPlaceName: string) => {
        if (!marketplaces) return {}
        let temp = marketplaces.filter((element: any) => element.code == marketPlaceName)
        if (temp && temp.length > 0) return temp[0]
    }


    return {
        version,
      getMarketplaces, 
      getMarketplaceFavorites, 
      deleteMarketplaceFavorite, 
      addMarketPlaceFavorite,
      updateMarketplaceFavorites,
      isMarketplaceFavoriteLink,
      getMarketplace
    };    
}