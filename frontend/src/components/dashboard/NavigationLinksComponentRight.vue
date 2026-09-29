<template>
  <div class="nav-links-section">
    <LoadingComponent attach=".AppView" ref="loadingComponentRef"></LoadingComponent>
    <div class="nav-links-section__title">{{ $t('shell.section.orders') }}</div>
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
  const codes = [
    'orderList',
    'claimList',
    'customerList',
    'invoiceList',
    'messageList',
    'ticketList'
  ]

  codes.forEach(code => {
    const link = menuStore.getMenuLinkWithCode(code)
    if (link) {
      navigationMenu.value.push(link)
    }
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
  if (element.code === 'ExitView') {
    logout()
    return
  }
  openTab(element)
}
</script>

<style scoped>
.nav-links-section__title {
  padding: 0 var(--ek-space-3) var(--ek-space-1);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  letter-spacing: 0.04em;
  color: var(--ek-color-content-muted);
  text-transform: uppercase;
}
</style>
