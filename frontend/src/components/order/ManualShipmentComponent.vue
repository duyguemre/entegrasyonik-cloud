<template>
    <ActionDialogComponent v-model="show" title="Manuel Kargo Girişi"
        subtitle="Kargo entegrasyonu dışındaki gönderiler için bilgi kaydı" icon="mdi-truck-delivery-outline"
        color="primary" confirm-text="Kargoya Ver" cancel-text="Vazgeç" confirm-buttom-color="primary"
        :is-confirm-disabled="isFormInvalid" @confirm="handleSubmit" @cancel="handleClose" attach="orderListView"
        max-width="600px">
        <v-form ref="formRef" @submit.prevent="handleSubmit">
            <EkFormGrid :columns="1">
                    <!-- FR2 madde 13 (K13): kargo firmaları kanal rozetiyle aynı biçim; liste tek kayıttan (`carrierOptions`),
                         değer = firma adı (backend `carrierName` serbest metin — eski değerler aynen). -->
                    <EkSelect v-model="form.carrierName" kind="carrier" :items="CARRIER_ITEMS"
                        label="Kargo Firması"
                        :rules="[(v: string) => !!v || 'Kargo firması seçilmelidir']" />
                    <v-text-field v-model="form.trackingCode" label="Takip Numarası" placeholder="Kargo takip numarasını giriniz"
                        :rules="[v => !!v || 'Takip numarası zorunludur']" autofocus></v-text-field>
                    <v-text-field v-model="form.trackingUrl" label="Takip Linki (Opsiyonel)" placeholder="https://..."
                        prepend-inner-icon="mdi-link-variant"></v-text-field>
            </EkFormGrid>
        </v-form>
    </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
import { EkFormGrid, EkSelect } from '@entegrasyonik/ui/components'
import { carrierOptions } from '@entegrasyonik/ui/tokens'

const CARRIER_ITEMS = carrierOptions()
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';

// State yönetimi
const show = ref(false);
const formRef = ref();
let resolvePromise: (value: any) => void;

const form = reactive({
    carrierName: '',
    trackingCode: '',
    trackingUrl: '',
    shipmentMethod: 'MANUAL'
});

// Fatura modalındaki sağlam validasyon mantığı
const isFormInvalid = computed(() => {
    return !form.carrierName || !form.trackingCode || form.trackingCode.trim().length === 0;
});

/**
 * Üst component'ten çağrılan ana metod
 */
const open = () => {
    show.value = true;

    // Formu tamamen sıfırla
    form.carrierName = '';
    form.trackingCode = '';
    form.trackingUrl = '';

    return new Promise((resolve) => {
        resolvePromise = resolve;
    });
};

const handleSubmit = async () => {
    // Vuetify form validasyonu
    if (formRef.value) {
        const { valid } = await formRef.value.validate();
        if (!valid) return;
    }

    show.value = false;
    if (resolvePromise) resolvePromise({ ...form });
};

const handleClose = () => {
    show.value = false;
    if (resolvePromise) resolvePromise(null);
};

// Fonksiyonu dışarı açıyoruz
defineExpose({ open });
</script>