<template>
    <div class="">
        <div v-for="menuLink in list" :key="menuLink.code" class="h-100">
            <component v-if="menuLink.isRendered" :ref="setRef(menuLink)" :is="menuLink.component"
                @clear="emits('clear')" :isRendered="menuLink.isRendered" :parameters="tab?.link?.parameters"
                :class="[tab?.link.code != menuLink.code ? 'hide-tab-component' : 'wrapper-active-component h-100']" />
        </div>
    </div>
</template>

<script lang="ts" setup>
import { watch, nextTick, ref } from 'vue'
const emits = defineEmits(['clear'])
const props = defineProps<{
    tab: any,
    parameters: any,
    list: any
}>()


const setRef = (menuLink: any) => (el: any) => {
    componentRefs.value[menuLink.code] = el;
    nextTick().then(() => {
        if (props.tab?.link.code != menuLink.code) return
        if (props.tab.link.isInitialized == true) {
            if (el?.activate != undefined) {
                el.activate(props.tab.link.parameters)
            }
        } else {
            if (el?.initialize != undefined) {
                el.initialize(props.parameters)
            }
            if (props.tab && props.tab.link) props.tab.link.isInitialized = true
        }
    })
};

const componentRefs: any = ref({})
const destroyTab = (menuLink: any) => {
    if (componentRefs.value[menuLink.code] && componentRefs.value[menuLink.code].destroy)
        componentRefs.value[menuLink.code].destroy()
}
defineExpose({
    destroyTab
});
</script>

<style scoped>
.hide-tab-component {
    display: none !important
}

.h-100 {
    height: 100% !important;
}

.flex-grow-1 {
    flex-grow: 1 !important;
}

.overflow-hidden {
    overflow: hidden !important;
}

.wrapper-container {
    display: flex;
    flex-direction: column;
}
</style>