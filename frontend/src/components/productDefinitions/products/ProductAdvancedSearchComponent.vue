<template>
    <v-tooltip open-delay="1000" text="Ürünlerde gelişmiş arama yapmak için burayı kullanabilirsiniz">
        <template v-slot:activator="{ props: tooltipProps }">
            <v-btn v-bind="tooltipProps" size="40" color="white" class="premium-cube-btn ml-2" elevation="0"
                @click="dialog = true">
                <v-icon size="x-large" :color="isDirty ? 'success' : 'processButtonColor'">
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
            <v-row dense>
                <v-col cols="12">
                    <v-text-field v-model="modelValue.title" clearable maxlength="160" density="compact"
                        variant="outlined" bg-color="textfieldColor" placeholder="Ürün başlığını giriniz" counter
                        class="customTextField">
                        <template #label>{{ $t('productDefinitions.product.define.productTitle') }}</template>
                    </v-text-field>
                </v-col>

                <v-col cols="12" sm="6">
                    <v-text-field v-model="modelValue.barcode" clearable density="compact" variant="outlined"
                        bg-color="textfieldColor" label="Barkod" class="customTextField" />
                </v-col>

                <v-col cols="12" sm="6">
                    <v-text-field v-model="modelValue.stockcode" clearable density="compact" variant="outlined"
                        bg-color="textfieldColor" label="Stok Kodu" class="customTextField" />
                </v-col>

                <v-col cols="12" sm="6">
                    <CategorySelectBoxComponent v-model="modelValue.category" :withAll="false" noInit
                        @change.stop />
                </v-col>

                <v-col cols="12" sm="6">
                    <BrandSelectBoxComponent v-model="modelValue.brand" :withAll="false" noInit @change.stop />
                </v-col>

                <v-col cols="12" sm="6">
                    <div class="d-flex">
                        <VCurrencyComponentVue v-model="modelValue.prices.minSalePrice" :isIconExist="false"
                            :label="$t('common.min')" clearable :required="false" />
                        <VCurrencyComponentVue v-model="modelValue.prices.maxSalePrice" :isIconExist="false"
                            :label="$t('common.max')" clearable :required="false" class="ml-2" />
                    </div>
                </v-col>

                <v-col cols="12" sm="6">
                    <v-select v-model="modelValue.onSale" density="compact" clearable item-value="id"
                        :items="[{ id: -1, title: 'Hepsi' }, { id: 1, title: 'Satışta Olanlar' }, { id: 0, title: 'Satışta Olmayanlar' }]"
                        variant="outlined" bg-color="textfieldColor" label="Satış Durumu" @change.stop />
                </v-col>

                <v-col cols="12">
                    <div class="mt-2 text-caption font-weight-bold">Platform Yüklenme Durumu</div>
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
                </v-col>
            </v-row>
        </v-form>
    </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref } from 'vue';
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