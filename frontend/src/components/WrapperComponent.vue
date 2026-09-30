<template>
    <div class="h-100">
        <WorkspaceTabHost v-for="menuLink in renderList" :key="menuLink.code" :code="menuLink.code"
            :active="tab?.link?.code == menuLink.code">
            <component v-if="menuLink.isRendered" :ref="setRef(menuLink)" :is="menuLink.component"
                @clear="emits('clear')" :isRendered="menuLink.isRendered" :parameters="tab?.link?.parameters"
                :class="[tab?.link.code != menuLink.code ? 'hide-tab-component' : 'wrapper-active-component h-100']" />
        </WorkspaceTabHost>
    </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref } from 'vue'
import WorkspaceTabHost from '@/components/layout/WorkspaceTabHost.vue'
const emits = defineEmits(['clear'])
const props = defineProps<{
    tab: any,
    parameters: any,
    list: any
}>()


// Aşama 3 (birleştirme bulgusu): menü ağacındaki `singleton:false` düğüm (ör. Motor ayarları) ile aynı kodlu
// klon bağlantı (useOpenIntegrationConfigTab) listede İKİ kez bulunabiliyor; ikisi de çizilince aynı ekran iki
// örnek olarak "etkin" görünüyordu (ve `:key` çakışıyordu). Kod başına TEK örnek çizilir: açık sekmenin kendi
// bağlantısı öncelikli, yoksa çizilmiş (`isRendered`) olan.
const renderList = computed(() => {
    const byCode = new Map<string, any>()
    for (const link of props.list ?? []) {
        const current = byCode.get(link.code)
        if (!current || (!current.isRendered && link.isRendered)) byCode.set(link.code, link)
    }
    const active = props.tab?.link
    if (active && byCode.has(active.code) && (props.list ?? []).includes(active)) byCode.set(active.code, active)
    return [...byCode.values()]
})

// Aşama 6b: işlev ref'i her yeniden çizimde tetiklenir (sekme kabı eklendi → daha sık). `initialize`/`activate`
// yalnız sekme ETKİNLEŞTİĞİ anda bir kez çağrılır (aynı etkin sekmede tekrar çizim yeniden yükleme yapmaz).
const shown: Record<string, unknown> = {}
const setRef = (menuLink: any) => (el: any) => {
    // Değişen kapanış nedeniyle Vue eski ref'i `null` ile çağırır — yok sayılır (örnek değişimi aşağıda ayırt edilir).
    if (!el) return
    componentRefs.value[menuLink.code] = el;
    nextTick().then(() => {
        if (props.tab?.link.code != menuLink.code) {
            shown[menuLink.code] = undefined
            return
        }
        // Aynı etkin sekmede aynı bileşen örneği + aynı parametreler → zaten etkinleştirildi (yeni parametre, ör. akıllı
        // aramadan aynı ekrana gelen kayıt, yeniden etkinleştirir).
        const prev = shown[menuLink.code] as { el: any; params: any } | undefined
        const params = props.tab?.link?.parameters
        if (prev && prev.el === el && prev.params === params) return
        shown[menuLink.code] = { el, params }
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