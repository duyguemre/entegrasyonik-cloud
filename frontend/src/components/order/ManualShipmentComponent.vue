<template>
    <ActionDialogComponent v-model="show" title="Manuel Kargo Girişi"
        subtitle="Kargo entegrasyonu dışındaki gönderiler için bilgi kaydı" icon="mdi-truck-delivery-outline"
        color="passiveColor" confirm-text="Kargoya Ver" cancel-text="Vazgeç" confirm-buttom-color="passiveColor"
        :is-confirm-disabled="isFormInvalid" @confirm="handleSubmit" @cancel="handleClose" attach="orderListView"
        max-width="600px">
        <v-form ref="formRef" @submit.prevent="handleSubmit">
            <v-row dense>
                <v-col cols="12">
                    <v-select v-model="form.carrierName"
                        :items="['Aras Kargo', 'Yurtiçi Kargo', 'MNG Kargo', 'Sürat Kargo', 'Trendyol Express', 'PTT Kargo', 'Diğer']"
                        label="Kargo Firması" variant="outlined" density="comfortable" class="customTextField"
                        :rules="[v => !!v || 'Kargo firması seçilmelidir']"></v-select>
                </v-col>
                <v-col cols="12">
                    <v-text-field v-model="form.trackingCode" label="Takip Numarası" variant="outlined"
                        density="comfortable" class="customTextField" placeholder="Kargo takip numarasını giriniz"
                        :rules="[v => !!v || 'Takip numarası zorunludur']" autofocus></v-text-field>
                </v-col>
                <v-col cols="12">
                    <v-text-field v-model="form.trackingUrl" label="Takip Linki (Opsiyonel)" variant="outlined"
                        density="comfortable" class="customTextField" placeholder="https://..."
                        prepend-inner-icon="mdi-link-variant"></v-text-field>
                </v-col>
            </v-row>
        </v-form>
    </ActionDialogComponent>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from 'vue';
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