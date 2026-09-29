<template>
    <div>
        <LoadingComponent attach=".productListView" ref="loadingComponentRef"></LoadingComponent>

        <BatchDeleteDialog v-model="dialogDeleteModel" :hint="getConfig(selectionMode).hint"
            @deleteProducts="deleteProducts" />

        <BatchProcessDialog v-model="dialogModel" :config="getConfig(selectionMode)" :mode="selectionMode"
            :form="batchProcessForm" :is-confirm-disabled="isConfirmDisabled" :is-no-selection="isNoSelection"
            @confirmSelection="confirmSelection" @clearForm="clearForm" @close="close" @togglePlatform="togglePlatform">
            <template #fields>
                <template v-if="selectionMode === 'SET_CATEGORY'">
                    <CategorySelectBoxComponent v-model="selectedCategory" :mandatory="true" :withAll="false"
                        :noInit="true" />
                </template>
                <template v-else-if="selectionMode === 'SET_BRAND'">
                    <BrandSelectBoxComponent v-model="selectedBrand" :mandatory="true" />
                </template>
                <template v-else-if="selectionMode === 'SET_TAGS'">
                    <HashtagSelectBoxComponent v-model="selectedHashtags" />
                </template>
                <template v-else-if="selectionMode === 'CHANGE_STATUS'">
                    <div class="d-flex align-center py-2">
                        <span class="mr-4">Satış Durumu:</span>
                        <v-switch v-model="selectedOnSale" :label="selectedOnSale ? 'Açık' : 'Kapalı'" color="primary"
                            hide-details></v-switch>
                    </div>
                </template>
            </template>
        </BatchProcessDialog>

        <BatchActionMenu :actionMenu="actionMenu" @executeBatch="executeBatch" />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onActivated } from 'vue'

// Alt Parçalar
import { useBatchActions } from './useBatchActions'
import BatchActionMenu from './subcomponents/BatchActionMenu.vue'
import BatchProcessDialog from './subcomponents/BatchProcessDialog.vue'
import BatchDeleteDialog from './subcomponents/BatchDeleteDialog.vue'

// Dış Bağımlılıklar (Orijinal)
import CategorySelectBoxComponent from '@/components/common/CategorySelectBoxComponent.vue'
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue'
import HashtagSelectBoxComponent from '@/components/HashtagSelectBoxComponent.vue'
import LoadingComponent from '@/components/LoadingComponent.vue'

// Props & Models
const props = defineProps<{ selectedProducts: any, searchProductForm: any, mode: string }>()
const headerMenu = defineModel('headerMenu', { default: false })
const batchPlatformProcessMenu = defineModel({ default: false })
const selectedVariants = defineModel("selectedVariants", { default: {} })
const emits = defineEmits(['refreshProducts', 'close', 'refresh'])

const loadingComponentRef = ref(null)

// Composable Başlatma
const {
    dialogModel, dialogDeleteModel, selectionMode, actionMenu, batchProcessForm,
    selectedCategory, selectedBrand, selectedHashtags, selectedOnSale,
    isNoSelection, isConfirmDisabled, getConfig,
    close, clearForm, confirmSelection, deleteProducts
} = useBatchActions(props, emits, loadingComponentRef, selectedVariants, headerMenu, batchPlatformProcessMenu)

// Orijinal Lifecycle Kancaları
onMounted(() => { actionMenu.value = true })
onActivated(() => { actionMenu.value = true })

const executeBatch = (mode: string) => {
    selectionMode.value = mode
    dialogModel.value = true
    actionMenu.value = false
}

const togglePlatform = (integrationCode: string) => {
    const integrations = batchProcessForm.value.selectedIntegrations
    const index = integrations.indexOf(integrationCode)
    if (index > -1) integrations.splice(index, 1)
    else integrations.push(integrationCode)
}
</script>