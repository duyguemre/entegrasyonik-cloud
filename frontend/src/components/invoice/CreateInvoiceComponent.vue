<template>
  <ActionDialogComponent :modelValue="modelValue" @update:modelValue="$emit('update:modelValue', $event)"
    @cancel="close" @close="close" title="Yeni Fatura Ekle" subtitle="Manuel fatura veya dış evrak girişi"
    icon="mdi-receipt-text-plus-outline" color="success" confirmText="Faturayı Kaydet" cancelText="Vazgeç"
    attach=".invoiceListView" maxWidth="700px" @confirm="promptConfirmation" :isConfirmDisabled="!isFormValid || loading">

      <v-form ref="formRef" v-model="isFormValid">

        <p class="cif-note">
          <v-icon icon="mdi-information-outline" size="16" aria-hidden="true" />
          <span>Bu ekrandan eklediğiniz faturalar <strong>MANUAL</strong> statüsünde kaydedilir. Bir pazaryeri sipariş
            numarası girerseniz fatura o siparişle otomatik eşleştirilir.</span>
        </p>
        <EkFormGrid :columns="2">
            <v-text-field v-model="formData.invoiceNumber" label="Fatura Numarası (Seri ve Sıra No)" prepend-inner-icon="mdi-numeric"
              :rules="[v => !!v || 'Zorunlu alan']" />
            <v-text-field v-model="formData.ettn" label="ETTN (İsteğe Bağlı)"
              prepend-inner-icon="mdi-identifier"
              placeholder="Sistem otomatik üretebilir" />
            <v-select v-model="formData.type" :items="invoiceTypes" item-title="title" item-value="value"
              label="Fatura Tipi"
              prepend-inner-icon="mdi-format-list-bulleted-type" />
            <v-select v-model="formData.documentType" :items="documentTypes" item-title="title" item-value="value"
              label="Belge Türü" prepend-inner-icon="mdi-file-document-outline" />
            <v-text-field v-model="formData.externalOrderId" label="Sipariş / Paket Numarası (Opsiyonel)" prepend-inner-icon="mdi-pound" placeholder="Siparişle bağlamak için girin" />
            <v-text-field v-model="formData.totalAmount" label="Toplam Tutar (₺)" prepend-inner-icon="mdi-currency-try"
              type="number" step="0.01"
              :rules="[v => v >= 0 || 'Geçerli bir tutar girin']" />
            <v-text-field class="ek-span-full" v-model="formData.pdfUrl" label="PDF / Arşiv URL"
              prepend-inner-icon="mdi-link-variant"
              placeholder="https://sunucu.com/fatura.pdf" />
        </EkFormGrid>
      </v-form>
    

  </ActionDialogComponent>

  <ConfirmationDialogComponent 
    v-model="confirmationDialog.show" 
    title="İşlemi Onaylayın"
    subtitle="Fatura Kaydedilecek" 
    message="Girdiğiniz bilgilerin doğruluğundan eminseniz, fatura manuel olarak sisteme işlenecektir. Onaylıyor musunuz?"
    icon="mdi-help-circle-outline" 
    color="primary" 
    confirm-text="Evet, Onaylıyorum" 
    confirm-icon="mdi-check-circle-outline"
    @confirm="executeSaveInvoice" 
    @cancel="confirmationDialog.show = false" 
    maxWidth="400px" 
    attach=".invoiceListView" 
  />
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import EkFormGrid from '@/components/ds/EkFormGrid.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue';
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue';
import useRestApi from '@/composables/restapi';
import { useSnackbarStore } from '@/stores/snackbarStore';
import { INVOICE_TYPE_LABELS, InvoiceTypeEnum } from '@/types/InvoiceTypes';

const restApi = useRestApi();
const snackbarStore = useSnackbarStore();

const props = defineProps({
  modelValue: { type: Boolean, required: true }
});

const emit = defineEmits(['update:modelValue', 'saved']);

const isFormValid = ref(false);
const formRef = ref<any>(null);
const loading = ref(false);

const invoiceTypes = Object.keys(INVOICE_TYPE_LABELS).map((k: any) => ({
  title: INVOICE_TYPE_LABELS[k as InvoiceTypeEnum],
  value: k
}));

const documentTypes = [
  { title: 'e-Arşiv Fatura', value: 'E_ARSIV' },
  { title: 'e-Fatura', value: 'E_FATURA' }
];

const defaultForm = () => ({
  invoiceNumber: '',
  ettn: '',
  type: 'SALES',
  documentType: 'E_ARSIV',
  externalOrderId: '',
  totalAmount: 0,
  pdfUrl: '',
});

const formData = ref({ ...defaultForm() });
const confirmationDialog = ref({ show: false });

watch(() => props.modelValue, (val) => {
  if (val) {
    formData.value = { ...defaultForm() };
    if (formRef.value) formRef.value.resetValidation();
  }
});

function close() {
  emit('update:modelValue', false);
}

async function promptConfirmation() {
  const { valid } = await formRef.value.validate();
  if (valid) {
    confirmationDialog.value.show = true;
  }
}

async function executeSaveInvoice() {
  confirmationDialog.value.show = false;
  loading.value = true;
  try {
    const res = await restApi.post('InvoiceService/createManualInvoice', {
      data: formData.value
    });

    if (res.success) {
      snackbarStore.addSnackbar({ text: res.message, color: 'success' });
      emit('saved');
      close();
    } else {
      snackbarStore.addSnackbar({ text: res.message || 'Kayıt başarısız.', color: 'error' });
    }
  } catch (error: any) {
    snackbarStore.addSnackbar({ text: 'Sunucuyla iletişim hatası.', color: 'error' });
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.cif-note {
  display: flex;
  align-items: flex-start;
  gap: var(--ek-space-2);
  margin: 0 0 var(--ek-space-4);
  padding: var(--ek-space-3);
  border: 1px solid var(--ek-color-info-border);
  border-radius: var(--ek-radius-control);
  background: var(--ek-color-info-subtle);
  color: var(--ek-color-info-emphasis);
  font-size: var(--ek-type-caption-size);
  line-height: var(--ek-type-caption-line);
}

.gap-4 {
  gap: 16px;
}

.lowercase {
  text-transform: lowercase;
}

.uppercase {
  text-transform: uppercase;
}
</style>
