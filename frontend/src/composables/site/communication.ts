import { ref, inject, onActivated,onMounted,onBeforeUnmount, onDeactivated, onUnmounted } from 'vue';


export default function useCommunication(eventBus:any) {
  var isActivated = true
  var keydownAction: any = undefined
  var initialized = false



  var openLink = (link: any) => {
    eventBus.emit('openTab', link)
  }


  var broadcastPageResize = () => {
    eventBus.emit('pageResize', true);
  }


  var onKeydown = (action: any) => {
    keydownAction = action
    document.addEventListener("keydown", handleKeyPress);
  }
  var handleKeyPress = (event: any) => {
    if (isActivated && event.key === "Escape") {
      if (keydownAction())
        event.stopImmediatePropagation()
    }
  }

  onActivated(() => {
    isActivated = true
  })
  onDeactivated(() => {
    isActivated = false
  })


  onUnmounted(() => {
    keydownAction = undefined
    document.removeEventListener("keydown", handleKeyPress);
    //tek bir sefer init edildiği için commente alındı
/*     window.removeEventListener('resize', broadcastPageResize);
 */  })


  

  if(initialized==false) {
    initialized = true
    window.addEventListener('resize', broadcastPageResize);
  }

  return {
    openLink,
    broadcastPageResize,
    onKeydown
  };
}