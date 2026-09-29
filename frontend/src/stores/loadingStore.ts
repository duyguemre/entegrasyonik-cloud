import { ref } from 'vue'
import { defineStore } from 'pinia'
export const useLoadingStore = defineStore('loadingStore', () => {
  const messages = ref(new Map())
  const isOverlayActive = ref(false)
  const generateGUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0,
        v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  const push = (message: string | undefined) => {
    let guid = generateGUID()
    messages.value.set(guid, message)
    isOverlayActive.value = true
    console.log(messages)
    return guid
  }

  const pull = (guid: string) => {
    messages.value.delete(guid)
    if(messages.value.size<=0) isOverlayActive.value = false
    console.log("delete", messages)
  }

  return { pull, push, isOverlayActive, messages }
})