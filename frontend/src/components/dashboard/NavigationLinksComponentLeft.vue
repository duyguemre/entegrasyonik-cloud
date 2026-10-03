<template>
  <div class="nav-links-section">
    <LoadingComponent attach=".AppView" ref="loadingComponentRef"></LoadingComponent>
    <DashboardQuickLinkList :items="visibleMenu" @select="handleSelect" />
  </div>
</template>

<script lang="ts" setup>
import { inject, onBeforeMount, computed, ref } from 'vue'
import useUser from '@/composables/user';
import LoadingComponent from '../LoadingComponent.vue';
import DashboardQuickLinkList from './DashboardQuickLinkList.vue';

const navigationMenu: any = ref([])
const userApi = useUser()
const menuStore: any = inject('useMenuStore')
const loadingComponentRef: any = ref(null)
const eventBus: any = inject('eventBus')

const visibleMenu = computed(() => navigationMenu.value.filter((element: any) => element.status !== false))

onBeforeMount(() => {
  const codes = ['settingList', 'authorizationList', 'educationCenter', 'exit']
  codes.forEach(code => {
    const link = menuStore.getMenuLinkWithCode(code)
    if (link) navigationMenu.value.push(link)
  })
})

const logout = async () => {
  const guid = loadingComponentRef.value.info("")
  await userApi.logout()
  loadingComponentRef.value.remove(guid)
}

const openTab = (element: any) => {
  element.parameters = undefined
  eventBus.emit('openTab', element)
}

const handleSelect = (element: any) => {
  if (element.code === 'exit') {
    logout()
    return
  }
  openTab(element)
}
</script>
