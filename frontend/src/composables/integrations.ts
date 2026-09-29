import { ref, reactive } from 'vue'
import useRestApi from '@/composables/restapi'

var initialized = false
const list: any = ref([])
const types: any = ref([])
const folderPaths: any = ref(new Map())

export default function useIntegrations() {

  var init = () => {
    if (initialized) return
    initialized = true
    const restApi = useRestApi()
    restApi.post("IntegrationService/integrationTypes", {}).then((response) => {
      types.value = response
      createFolderPaths()
    })

    restApi.get("IntegrationService").then((response) => {
      list.value = response
    })
  }

  const createFolderPaths = () => {
    for (const type of types.value) {
      folderPaths.value.set(type._id, '/assets/images/integrations/' + type.code + '/')
    }
  }

  const getTypePath = (id: any) => {
    return folderPaths.value.get(id)
  }

  const getPlatforms = () => {
    return list.value.filter((item: any) => item.type.code == 'marketplace' || item.type.code == 'ecommerce')
  }

  const getPlatform = (code: string) => {
    return list.value.find((item: any) => item.code === code);
  }



  init()

  return {
    getPlatforms,
    getPlatform,
    list,
    types,
    folderPaths,
    getTypePath
  }
}