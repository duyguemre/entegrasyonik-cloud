<template>
    <ActionDialogComponent :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)"
        :title="config.title" :subtitle="'Toplu İşlem Merkezi'" :icon="config.icon" :color="config.color"
        :hint="config.hint" :attach="'.productListView'" :is-confirm-disabled="isConfirmDisabled"
        @confirm="$emit('confirmSelection')" @cancel="$emit('clearForm')" @close="$emit('close')" max-width="1000px">
        <div class="pa-0">
            <v-col cols="12" class="pa-0 mb-6" v-if="mode !== 'FETCH_PRODUCT'">
                <div class="scope-toggle-container">
                    <div v-for="scope in scopes" :key="scope.value" class="scope-item"
                        :class="{ 'active': form.scope === scope.value }" @click="form.scope = scope.value">
                        <v-icon :icon="getScopeIcon(scope.value)" size="small" class="mr-2"></v-icon>
                        <span>{{ scope.title }}</span>
                    </div>
                </div>
                <div v-if="form.scope === 0 && isNoSelection" class="selection-alert mt-3">
                    <v-icon icon="mdi-alert-circle" size="14" class="mr-1"></v-icon>
                    Tablodan ürün seçilmedi. Lütfen seçim yapın veya kapsamı değiştirin.
                </div>
            </v-col>

            <v-col cols="12" class="pa-0">
                <div v-if="mode">
                    <template v-if="mode === 'FETCH_PRODUCT'">
                        <CardComponent title="Platform Seçimi" icon="mdi-store-cog">
                            <div class="platform-grid">
                                <template v-if="integrationStore"
                                    v-for="integration of integrationStore.getClientPlatforms()"
                                    :key="integration.code">
                                    <PlatformImageComponent :integrationCode="integration.code" height="50" width="100"
                                        :is-active="form.singleIntegrationCode === integration.code" isSelectable
                                        @select="form.singleIntegrationCode = integration.code" />
                                </template>
                            </div>
                        </CardComponent>
                    </template>

                    <template v-else-if="PLATFORM_PROCESS_MODES.includes(mode as PLATFORM_PROCESS)">
                        <CardComponent icon="mdi-shopping" title="İşlem Yapılacak Platformlar">
                            <div class="platform-grid">
                                <template v-if="integrationStore"
                                    v-for="integration of integrationStore.getClientPlatforms()"
                                    :key="integration.code">
                                    <PlatformImageComponent :integrationCode="integration.code" height="50" width="100"
                                        :is-active="form.selectedIntegrations.includes(integration.code)" isSelectable
                                        @select="$emit('togglePlatform', integration.code)" />
                                </template>
                            </div>
                        </CardComponent>
                    </template>

                    <div class="mt-6 dynamic-fields">
                        <slot name="fields"></slot>
                    </div>
                </div>
            </v-col>
        </div>
    </ActionDialogComponent>
</template>

<script setup lang="ts">
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'; // Yolun doğruluğunu teyit edin
import CardComponent from '@/components/CardComponent.vue';
import PlatformImageComponent from '@/components/platforms/PlatformImageComponent.vue';
import { useIntegrationStore } from '@/stores/integrationStore'
import { useI18n } from 'vue-i18n'
import { PLATFORM_PROCESS, PLATFORM_PROCESS_MODES } from '@/types/PlatformProcess';
const integrationStore = useIntegrationStore()
const { t } = useI18n()

defineProps<{
    modelValue: boolean,
    config: any,
    mode: string,
    form: any,
    isConfirmDisabled: boolean,
    isNoSelection: boolean
}>()

defineEmits(['update:modelValue', 'confirmSelection', 'clearForm', 'close', 'togglePlatform'])

const scopes = [
    { value: 0, title: 'Seçilenler' },
    { value: 1, title: 'Filtrelenmiş' },
    { value: 2, title: 'Tüm Katalog' }
]

const getScopeIcon = (val: number) => {
    return ['mdi-checkbox-marked-circle-outline', 'mdi-filter-outline', 'mdi-database-outline'][val]
}
</script>

<style scoped>
/* Mevcut CSS mantığınız aynen korunmuştur */

/* KAPSAM SEÇİCİ (SCOPE TOGGLE) */
.scope-toggle-container {
    display: flex;
    background: #e2e8f0;
    padding: 4px;
    border-radius: 12px;
    gap: 4px;
}

.scope-item {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px 4px;
    border-radius: 10px;
    font-size: 0.85rem;
    font-weight: 600;
    color: #64748b;
    cursor: pointer;
    transition: all 0.2s ease;
}

.scope-item.active {
    background: white;
    color: #0f172a;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
}

.selection-alert {
    background: #fee2e2;
    color: #b91c1c;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.75rem;
    border-left: 4px solid #ef4444;
}

/* PLATFORM GRID */
.platform-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 12px;
}

.dynamic-fields {
    width: 100%;
}

@media (max-width: 600px) {
    .platform-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}
</style>