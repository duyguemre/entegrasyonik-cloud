<template>
    <v-tooltip open-delay="1000" text="Ürünlerde gelişmiş arama yapmak için burayı kullanabilirsiniz">
        <template v-slot:activator="{ props: tooltipProps }">
            <v-btn v-bind="tooltipProps" size="40" color="surface" class="premium-cube-btn ml-2" elevation="0"
                @click="dialog = true">
                <v-icon size="x-large" :color="isDirty ? 'success' : 'content-muted'">
                    mdi-filter-variant
                </v-icon>
            </v-btn>
        </template>
    </v-tooltip>

    <ActionDialogComponent v-model="dialog" title="Detaylı Ürün Arama" subtitle="Kriterlerinize göre filtreleme yapın"
        icon="mdi-magnify-expand" :color="isDirty ? 'success' : 'primary'" attach=".productListView"
        hint="Arama yapmak istediğiniz alanları doldurunuz. Boş bırakılan alanlar filtrelemeye dahil edilmez."
        max-width="700px" confirm-text="Ara" cancel-text="Temizle" @confirm="handleSearch" @cancel="handleClear"
        @close="dialog = false">

        <v-form @submit.prevent="handleSearch">
            <EkFormSection title="Ürün bilgileri" icon="mdi-text-box-search-outline">
                <v-text-field class="ek-span-full" v-model="modelValue.title" clearable maxlength="160" counter
                    placeholder="Ürün başlığını giriniz" :label="$t('productDefinitions.product.define.productTitle')" />
                <v-text-field v-model="modelValue.barcode" clearable label="Barkod" />
                <v-text-field v-model="modelValue.stockcode" clearable label="Stok Kodu" />
                <CategorySelectBoxComponent v-model="modelValue.category" :withAll="false" noInit @change.stop />
                <BrandSelectBoxComponent v-model="modelValue.brand" :withAll="false" noInit @change.stop />
            </EkFormSection>

            <EkFormSection title="Fiyat ve satış" icon="mdi-currency-try" :columns="3">
                <VCurrencyComponentVue v-model="modelValue.prices.minSalePrice" :isIconExist="false" :compact="true"
                    :label="$t('common.min')" clearable :required="false" />
                <VCurrencyComponentVue v-model="modelValue.prices.maxSalePrice" :isIconExist="false" :compact="true"
                    :label="$t('common.max')" clearable :required="false" />
                <v-select v-model="modelValue.onSale" clearable item-value="id"
                    :items="[{ id: -1, title: 'Hepsi' }, { id: 1, title: 'Satışta Olanlar' }, { id: 0, title: 'Satışta Olmayanlar' }]"
                    label="Satış Durumu" @change.stop />
            </EkFormSection>

            <EkFormSection title="Platform yüklenme durumu" icon="mdi-cloud-sync-outline" :columns="1">
                <v-treeview v-model:selected="modelValue.transferStatuses" density="compact"
                    :items="transferStatusItems" select-strategy="classic" item-value="id" item-key="id" selectable
                    @change.stop>
                    <template v-slot:title="{ item }">
                        <v-icon :color="item.color" v-if="item.icon" size="small" class="mr-1">
                            {{ item.icon }}
                        </v-icon>
                        <span class="text-caption">{{ item.title }}</span>
                    </template>
                </v-treeview>
            </EkFormSection>
        </v-form>
    </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import EkFormSection from '@/components/ds/EkFormSection.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'; // Bileşen yolu
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';
import CategorySelectBoxComponent from '@/components/common/CategorySelectBoxComponent.vue';
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue';

interface Props {
    modelValue: any;
    isDirty: boolean;
    transferStatusItems: any[];
}

const props = defineProps<Props>();
const emit = defineEmits(['update:modelValue', 'search', 'clear', 'change']);

const dialog = ref(false);

const handleSearch = () => {
    emit('search');
    dialog.value = false;
};

const handleClear = () => {
    emit('clear');
};
</script>