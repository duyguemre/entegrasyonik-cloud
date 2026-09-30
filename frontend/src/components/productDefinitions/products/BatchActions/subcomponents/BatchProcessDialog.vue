<template>
    <ActionDialogComponent :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)"
        :title="config.title" :subtitle="'Toplu İşlem Merkezi'" :icon="config.icon" :color="config.color"
        :hint="config.hint" :attach="'.productListView'" :is-confirm-disabled="isConfirmDisabled"
        @confirm="$emit('confirmSelection')" @cancel="$emit('clearForm')" @close="$emit('close')" max-width="1000px">
        <EkFormSection v-if="mode !== 'FETCH_PRODUCT'" title="Kapsam" icon="mdi-target" :columns="1">
          <template #legend-extra><EkHelpHint hint="bulk.confirm" /></template>
            <div class="bpd-segmented" role="radiogroup" aria-label="İşlem kapsamı">
                <button v-for="scope in scopes" :key="scope.value" type="button" class="bpd-segmented__item"
                    :class="{ 'is-active': form.scope === scope.value }" role="radio"
                    :aria-checked="form.scope === scope.value" @click="form.scope = scope.value">
                    <v-icon :icon="getScopeIcon(scope.value)" size="16" aria-hidden="true" />
                    <span>{{ scope.title }}</span>
                </button>
            </div>
            <p v-if="form.scope === 0 && isNoSelection" class="bpd-alert" role="alert">
                <v-icon icon="mdi-alert-circle-outline" size="16" aria-hidden="true" />
                Tablodan ürün seçilmedi. Lütfen seçim yapın veya kapsamı değiştirin.
            </p>
        </EkFormSection>

        <template v-if="mode">
            <EkFormSection v-if="mode === 'FETCH_PRODUCT'" title="Platform Seçimi" icon="mdi-store-cog-outline"
                :columns="1">
                <div class="platform-grid">
                    <template v-if="integrationStore" v-for="integration of integrationStore.getClientPlatforms()"
                        :key="integration.code">
                        <PlatformChoiceChip :code="integration.code" :name="platformName(integration.code)"
                            :active="form.singleIntegrationCode === integration.code"
                            @select="form.singleIntegrationCode = integration.code" />
                    </template>
                </div>
            </EkFormSection>

            <EkFormSection v-else-if="PLATFORM_PROCESS_MODES.includes(mode as PLATFORM_PROCESS)"
                title="İşlem Yapılacak Platformlar" icon="mdi-storefront-outline" :columns="1">
                <div class="platform-grid">
                    <template v-if="integrationStore" v-for="integration of integrationStore.getClientPlatforms()"
                        :key="integration.code">
                        <PlatformChoiceChip :code="integration.code" :name="platformName(integration.code)"
                            :active="form.selectedIntegrations.includes(integration.code)"
                            @select="$emit('togglePlatform', integration.code)" />
                    </template>
                </div>
            </EkFormSection>

            <div class="dynamic-fields">
                <slot name="fields"></slot>
            </div>
        </template>
    </ActionDialogComponent>
</template>

<script setup lang="ts">
import EkHelpHint from '@/components/ds/EkHelpHint.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'; // Yolun doğruluğunu teyit edin
import EkFormSection from '@/components/ds/EkFormSection.vue';
import PlatformChoiceChip from '@/components/platforms/PlatformChoiceChip.vue';
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

const platformName = (code: string) => integrationStore.getIntegrationTitle(code) || (code ? code.charAt(0).toUpperCase() + code.slice(1) : '')

const getScopeIcon = (val: number) => {
    return ['mdi-checkbox-marked-circle-outline', 'mdi-filter-variant', 'mdi-database-outline'][val]
}
</script>

<style scoped>
/* Kapsam: bölütlü seçim (radiogroup) — seçili bölüt yüzey + aksiyon metni. */
.bpd-segmented {
    display: flex;
    gap: var(--ek-space-1);
    padding: var(--ek-space-1);
    border: 1px solid var(--ek-color-border-subtle);
    border-radius: var(--ek-radius-control);
    background: var(--ek-color-surface-sunken);
}

.bpd-segmented__item {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ek-space-2);
    min-height: var(--ek-control-h-md);
    padding: 0 var(--ek-space-3);
    border: 1px solid transparent;
    border-radius: var(--ek-radius-md);
    background: transparent;
    color: var(--ek-color-content-muted);
    font-family: inherit;
    font-size: var(--ek-type-label-size);
    font-weight: var(--ek-type-label-weight);
    cursor: pointer;
    transition: var(--ek-transition-colors);
}

.bpd-segmented__item:hover {
    color: var(--ek-color-content-strong);
}

.bpd-segmented__item:focus-visible {
    outline: none;
    box-shadow: var(--ek-focus-ring);
}

.bpd-segmented__item.is-active {
    border-color: var(--ek-color-action-border);
    background: var(--ek-color-surface);
    color: var(--ek-color-action-emphasis);
    box-shadow: var(--ek-shadow-card);
}

.bpd-alert {
    display: flex;
    align-items: center;
    gap: var(--ek-space-2);
    margin: 0;
    padding: var(--ek-space-2) var(--ek-space-3);
    border: 1px solid var(--ek-color-error-border);
    border-radius: var(--ek-radius-control);
    background: var(--ek-color-error-subtle);
    color: var(--ek-color-error-emphasis);
    font-size: var(--ek-type-caption-size);
}

.platform-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--ek-space-3);
}

.dynamic-fields {
    width: 100%;
    margin-top: var(--ek-space-5);
}

.dynamic-fields:empty {
    display: none;
}

@media (max-width: 599px) {
    .bpd-segmented {
        flex-direction: column;
    }

    .platform-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
