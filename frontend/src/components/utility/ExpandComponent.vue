<template>   
    <v-btn-group v-if="visible" class="pa-0 ml-0 pl-0 expand-button text-center justify-center" elevation=0 density="compact"
        :class="{ expanded: isExpanded }">
        <v-tooltip :text="$t('common.expand.minimize')">
            <template v-slot:activator="{ props }">
                <v-btn icon v-bind="props" size="30" elevation=2 class="mr-2" @click="toggle" color="neutral" aria-label="Genişlet / daralt">
                <v-icon size="25">{{ !isExpanded ? 'mdi-window-maximize' :
                        'mdi-window-minimize' }} </v-icon>
                </v-btn>
             </template>
        </v-tooltip>
    </v-btn-group>
</template>
  
<script setup lang="ts">
import { inject, onMounted, ref } from 'vue'
import useCommunication from '@/composables/site/communication';
const eventBus: any = inject('eventBus');
var communication: any = useCommunication(eventBus)

var expandElementClass = '.expand-element'
var visible = ref(true)
var expandElement: any = undefined
const isExpanded = ref(false)

onMounted(() => {
    if (!document.querySelector(expandElementClass)) {
        visible.value = false
    }
    communication.onKeydown(noExpand)
})
var toggle = () => {
    isExpanded.value = !isExpanded.value;
    expandHtml()
}
var noExpand = ()=> {
    if(!isExpanded.value) return false
    isExpanded.value = false
    expandHtml()
    return true
}

var expandHtml = () => {
    expandElement = document.querySelector(expandElementClass)
    expandElement?.classList.remove("no-expand")
    expandElement?.classList.remove("expand")
    if (isExpanded.value)
        expandElement?.classList.add("expand")
    else expandElement?.classList.add("no-expand")
    eventBus.emit('pageResize', isExpanded.value);

}
</script>
       
<style scoped>
.expand-button {
    position: absolut1e;
    right:0px;
   /*  margin-right: -75px; */
/*     top: -40px;
 */    z-index: 3;
/*     right: 56%; */
    transition: top .5s ease-in-out, right .5s ease-in-out
        /*     transition: top .3s ease, right .3s ease */
}

.expand-button.expanded {
/*     top: -86px;
    right: 52%; */
}
</style>
  