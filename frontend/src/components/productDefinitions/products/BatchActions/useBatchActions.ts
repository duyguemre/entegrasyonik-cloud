import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import useRestApi from '@/composables/restapi'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { PLATFORM_PROCESS } from '@/types/PlatformProcess'

export function useBatchActions(props: any, emits: any, loadingComponentRef: any, selectedVariants: any, headerMenu: any, batchPlatformProcessMenu: any) {
    const restApi = useRestApi()
    const snackbarStore = useSnackbarStore()
    const { t } = useI18n()

    // State
    const dialogModel = ref(false)
    const dialogDeleteModel = ref(false)
    const selectionMode = ref('')
    const actionMenu = ref(false)

    const batchProcessForm: any = ref({ scope: 0, selectedIntegrations: [], singleIntegrationCode: null })
    const selectedCategory = ref()
    const selectedBrand = ref()
    const selectedHashtags = ref([])
    const selectedOnSale = ref(true)

    const close = () => {
        dialogDeleteModel.value = false
        dialogModel.value = false
        headerMenu.value = false
    }

    const resetBatchProcessForm = () => {
        batchProcessForm.value.scope = 0
        batchProcessForm.value.selectedIntegrations = []
        batchProcessForm.value.singleIntegrationCode = null
        selectedCategory.value = undefined
        selectedBrand.value = undefined
        selectedHashtags.value = []
        selectedOnSale.value = true
    }

    const clearForm = () => resetBatchProcessForm()

    const isNoSelection = computed(() => {
        const hasProducts = props.selectedProducts && props.selectedProducts.length > 0
        let hasVariants = false
        if (selectedVariants.value) {
            for (const key in selectedVariants.value) {
                if (selectedVariants.value[key]?.length > 0) {
                    hasVariants = true
                    break
                }
            }
        }
        return !hasProducts && !hasVariants
    })

    const isConfirmDisabled = computed(() => {
        const mode = selectionMode.value
        if (mode === 'FETCH_PRODUCT') return !batchProcessForm.value.singleIntegrationCode
        if (batchProcessForm.value.scope === 0 && isNoSelection.value) return true
        if (isUpdateMode(mode)) {
            return batchProcessForm.value.selectedIntegrations.length === 0
        }
        if (mode === 'SET_CATEGORY') return !selectedCategory.value
        if (mode === 'SET_BRAND') return !selectedBrand.value
        if (mode === 'SET_TAGS') return selectedHashtags.value.length === 0
        return false
    })

    const isUpdateMode = (mode: string) => {
        return [PLATFORM_PROCESS.TRANSFER, PLATFORM_PROCESS.UPDATE, PLATFORM_PROCESS.UPDATE_PRICE, PLATFORM_PROCESS.UPDATE_STOCK, PLATFORM_PROCESS.UPDATE_VARIANT, PLATFORM_PROCESS.UPDATE_DELIVERY].includes(mode as PLATFORM_PROCESS)
    }
    const prepareRequest = () => {
        const mode = selectionMode.value
        const request: any = {
            scope: batchProcessForm.value.scope,
            mode: mode,
            batchProcessForm: {
                category: selectedCategory.value,
                brand: selectedBrand.value,
                hashtags: selectedHashtags.value,
                onsale: selectedOnSale.value,
                saleStatus: mode === 'CHANGE_STATUS'
            }
        }

        if (batchProcessForm.value.scope === 0) {
            request.selectedProducts = props.selectedProducts
            request.selectedVariants = selectedVariants.value
            request.barcodeList = Object.values(selectedVariants.value).flat();
        } else if (batchProcessForm.value.scope === 1) {
            request.searchProductForm = props.searchProductForm
        }

        if (isUpdateMode(mode)) {
            request.selectedIntegrations = batchProcessForm.value.selectedIntegrations
        }
        return request
    }

    const downloadExcel = (response: any) => {
        try {
            const byteCharacters = atob(response.excelData);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', response.fileName || 'urunler.xlsx');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error("Excel parse error", e);
        }
    }

    const handleResponse = (response: any, mode: string) => {
        if (response && (response.result || response.excelData)) {
            if (mode === 'EXPORT_EXCEL' && response.excelData) downloadExcel(response)
            batchPlatformProcessMenu.value = false
        }
    }

    const confirmSelection = async () => {
        const mode = selectionMode.value;

        if (mode === 'FETCH_PRODUCT') {
            const iCode = batchProcessForm.value.singleIntegrationCode;
            let guid = loadingComponentRef.value.info('Ürün çekme isteği gönderiliyor...')
            try {
                let response = await restApi.post("IntegrationService/requestFetchFromPlatform", {
                    integrationCode: iCode,
                    query: { init: false }
                })
                loadingComponentRef.value.remove(guid)
                if (response?.success === true) {
                    snackbarStore.addSnackbar({ show: true, text: 'Ürün çekme isteği kuyruğa alındı, ürünler hazırlanıyor...', timeout: 10000, color: 'success' })
                    emits('refresh', iCode)
                    close()
                } else {
                    snackbarStore.addSnackbar({ show: true, text: response?.message || 'İşlem başlatılamadı.', timeout: 4000, color: 'error' })
                }
            } catch (error) {
                loadingComponentRef.value.remove(guid)
                snackbarStore.addSnackbar({ show: true, text: 'Sunucu hatası: İstek iletilemedi.', timeout: 4000, color: 'error' })
            }
            resetBatchProcessForm();
            return;
        }

        const request: any = prepareRequest();
        const endpoint = mode === 'EXPORT_EXCEL' ? "ProductService/exportExcel" : (['SET_CATEGORY', 'SET_BRAND', 'SET_TAGS', 'DELETE', 'CHANGE_STATUS'].includes(mode) ? "ProductService/batchProcessUpdate" : "IntegrationService/batchCreator");

        if (mode === 'DELETE') {
            dialogDeleteModel.value = true;
            return;
        }

        const guid = loadingComponentRef.value.info("");
        try {
            const response = await restApi.post(endpoint, request);
            loadingComponentRef.value.remove(guid);

            if (response && (response.success || response.result || response.excelData)) {
                let message = '';
                let color = 'success';
                if (mode === 'EXPORT_EXCEL') {
                    message = 'Excel dosyası hazırlandı, indiriliyor...';
                } else if (isUpdateMode(mode)) {
                    message = response.message || 'İşlem başarıyla başlatıldı ve kuyruğa alındı.';
                } else {
                    message = response.message || `İşlem başarıyla tamamlandı.`;
                }
                snackbarStore.addSnackbar({ show: true, text: message, color: color, timeout: 10000 });
                handleResponse(response, mode);
            } else {
                snackbarStore.addSnackbar({ show: true, text: response?.message || 'İşlem sırasında bir hata oluştu.', color: 'error', timeout: 5000 });
            }
        } catch (err: any) {
            loadingComponentRef.value.remove(guid);
            snackbarStore.addSnackbar({ text: 'Sistem hatası: İşlem tamamlanamadı.', color: 'error', timeout: 5000 });
        }
        resetBatchProcessForm();
        close();
    }

    const deleteProducts = async () => {
        const request: any = prepareRequest()
        const guid = loadingComponentRef.value.info("Siliniyor...")
        try {
            const response = await restApi.post("ProductService/batchProcessDelete", request);
            loadingComponentRef.value.remove(guid)

            if (response && response.result) {
                snackbarStore.addSnackbar({ text: 'Seçili ürünler başarıyla silindi.', color: 'success', timeout: 3000 })
                close()
                emits('refreshProducts')
            } else {
                snackbarStore.addSnackbar({ text: response?.message || 'Silme işlemi başarısız oldu.', color: 'error', timeout: 5000 })
            }
        } catch (err) {
            loadingComponentRef.value.remove(guid)
            snackbarStore.addSnackbar({ text: 'Silme işlemi sırasında teknik bir hata oluştu.', color: 'error' })
        }
    }

    // Orijinal Helper'lar
    const getConfig = (mode: string) => {
        const config: any = {
            TRANSFER: { title: 'Platformlara Ürün Yükleme', icon: 'mdi-cloud-upload', color: 'primary', hint: 'Seçili ürünleri belirlediğiniz platformlara yeni ürün olarak gönderir.' },
            UPDATE: { title: 'Platformlarda Ürünleri Güncelleme', icon: 'mdi-sync', color: 'success', hint: 'Ürün bilgilerini (başlık, açıklama vb.) platformlarda senkronize eder.' },
            UPDATE_PRICE: { title: 'Platform Fiyatlarını Güncelleme', icon: 'mdi-currency-try', color: 'success', hint: 'Sadece fiyat bilgilerini seçili platformlarda günceller.' },
            UPDATE_STOCK: { title: 'Platform Stoklarını Güncelleme', icon: 'mdi-counter', color: 'success', hint: 'Stok adetlerini seçili platformlarda günceller.' },
            FETCH_PRODUCT: { title: 'Platformdan Ürün Yükleme', icon: 'mdi-cloud-download', color: 'primary', hint: 'Platformda mevcut olan ürünleri çekerek sisteminize kaydeder.' },
            SET_CATEGORY: { title: 'Kategori Ata / Değiştir', icon: 'mdi-shape', color: 'info', hint: 'Seçili ürünlerin sistem kategorisini toplu olarak değiştirir.' },
            SET_BRAND: { title: 'Marka Ata / Değiştir', icon: 'mdi-watermark', color: 'info', hint: 'Seçili ürünlere toplu marka ataması yapar.' },
            SET_TAGS: { title: 'Etiket Ata / Değiştir', icon: 'mdi-tag-multiple', color: 'info', hint: 'Ürünlere arama etiketleri ekler veya mevcutları değiştirir.' },
            CHANGE_STATUS: { title: 'Satış Durumunu Değiştir', icon: 'mdi-toggle-switch', color: 'warning', hint: 'Ürünlerin genel satışa açık/kapalı durumunu değiştirir.' },
            DELETE: { title: 'Toplu Ürün Silme', icon: 'mdi-delete', color: 'error', hint: 'Ürünleri sistemden kalıcı olarak siler.' },
            EXPORT_EXCEL: { title: 'Excel formatında Dışa Aktar', icon: 'mdi-microsoft-excel', color: 'success', hint: 'Filtrelere uygun ürünleri Excel dosyası olarak indirmenizi sağlar.' },
            IMPORT_EXCEL: { title: 'Excel den Toplu Güncelleme', icon: 'mdi-file-excel-box', color: 'primary', hint: 'Dosya yükleyerek ürün bilgilerini toplu güncelleyebilirsiniz.' }
        }
        return config[mode] || { title: '', icon: '', color: 'primary', hint: 'Lütfen kriterleri belirleyerek işlemi başlatın.' }
    }

    return {
        dialogModel, dialogDeleteModel, selectionMode, actionMenu, batchProcessForm,
        selectedCategory, selectedBrand, selectedHashtags, selectedOnSale,
        isNoSelection, isConfirmDisabled, getConfig,
        close, clearForm, confirmSelection, deleteProducts
    }
}