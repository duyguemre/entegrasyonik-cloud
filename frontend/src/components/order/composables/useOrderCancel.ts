import { OrderInternalStatusEnum } from '@/types/OrderTypes';
import { ref, computed } from 'vue';

/**
 * Sipariş İptal Süreçlerini Yöneten Composable
 * @param executeOrderAction - API isteklerini atan yardımcı fonksiyon
 * @param snackbarStore - Bildirimleri yöneten store
 * @param getOrders - İşlem sonrası tabloyu yenilemek için kullanılan fonksiyon
 */
export function useOrderCancel(executeOrderAction: any, snackbarStore: any, getOrders: Function) {

    // --- STATE ---
    const actionDialog = ref({
        show: false,
        loading: false,
        order: null as any,         // Tekil iptalde sipariş bilgisi
        reasons: [] as any[],       // Tekil iptal için nedenler listesi
        selectedReason: null as any  // Tekil seçilen neden objesi { id, title }
    });

    const isBulk = ref(false);      // İşlem tipi (Tekil/Toplu)
    const selectedOrders = ref<any[]>([]); // İşlem görecek sipariş objeleri
    const bulkCancelData = ref<Record<string, any>>({}); // Platform bazlı nedenler ve seçimler

    // --- VALIDATION ---
    const isCancelFormValid = computed(() => {
        if (!isBulk.value) {
            // Tekli iptalde sadece bir neden seçilmiş mi?
            return !!actionDialog.value.selectedReason;
        } else {
            // Toplu iptalde her platform grubu için neden seçilmiş mi?
            const groups = Object.values(bulkCancelData.value);
            if (groups.length === 0) return false;
            return groups.every((group: any) => !!group.selected);
        }
    });

    // --- ACTIONS ---

    /**
     * İptal diyaloğunu açar ve pazar yeri nedenlerini yükler
     * @param items - Tek bir sipariş objesi veya sipariş dizisi
     */
    const openCancelAction = async (items: any | any[]) => {
        // Durumu belirle
        isBulk.value = Array.isArray(items);

        // --- DÜZELTME: Sadece iptal edilebilir statüde olanları işleme al ---
        const rawItems = isBulk.value ? items : [items];
        const validItems = rawItems.filter((o: any) =>
            ![
                OrderInternalStatusEnum.SHIPPED, 
                OrderInternalStatusEnum.DELIVERED, 
                OrderInternalStatusEnum.CANCELLED, 
                OrderInternalStatusEnum.RETURNED
            ].includes(o.internalStatus)
        );

        // Eğer geçerli sipariş kalmadıysa işlemi durdur
        if (validItems.length === 0) {
            snackbarStore.addSnackbar({ text: 'İptal edilebilir sipariş bulunamadı.', color: 'warning' });
            return;
        }

        selectedOrders.value = validItems;

        console.log("isBulkd", isBulk.value, rawItems, validItems)

        // State'i sıfırla
        actionDialog.value.show = true;
        actionDialog.value.loading = true;
        actionDialog.value.selectedReason = null;
        actionDialog.value.order = !isBulk.value ? items : null;
        bulkCancelData.value = {};

        try {
            if (!isBulk.value) {
                // SENARYO 1: TEKİL İPTAL
                const res = await executeOrderAction('OrderService/getOrderRejectionReasons', {
                    integrationCode: items.integrationCode
                });

                if (res.success) {
                    actionDialog.value.reasons = res.data;
                } else {
                    throw new Error(res.message || "İptal nedenleri alınamadı.");
                }

            } else {
                // SENARYO 2: TOPLU (BULK) İPTAL
                // 1. Siparişleri platforma göre grupla
                const groups = selectedOrders.value.reduce((acc, obj) => {
                    const key = obj.integrationCode;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(obj);
                    return acc;
                }, {});

                // 2. Her platform için nedenleri paralel olarak çek
                const platformPromises = Object.keys(groups).map(async (code) => {
                    const res = await executeOrderAction('OrderService/getOrderRejectionReasons', {
                        integrationCode: code
                    });

                    if (res.success) {
                        bulkCancelData.value[code] = {
                            reasons: res.data,
                            selected: null, // Kullanıcının seçeceği neden
                            count: groups[code].length // O gruptaki sipariş sayısı
                        };
                    }
                });

                await Promise.all(platformPromises);
            }
        } catch (error: any) {
            snackbarStore.addSnackbar({
                text: error.message || 'İptal nedenleri yüklenirken bir sorun oluştu.',
                color: 'error'
            });
            actionDialog.value.show = false;
        } finally {
            actionDialog.value.loading = false;
        }
    };

    /**
     * Kullanıcı seçimini yaptıktan sonra son onay aşamasını (Confirmation) yönetir
     */
    const handleCancelConfirm = (confirmDialog: any, processSingle: Function, processBulk: Function) => {
        if (!isCancelFormValid.value) return;

        confirmDialog.title = isBulk.value ? 'TOPLU İPTAL ONAYI' : 'İPTAL ONAYI';
        confirmDialog.icon = 'mdi-alert-octagon';
        confirmDialog.color = 'error';
        confirmDialog.confirmText = 'EVET, ŞİMDİ İPTAL ET';

        if (!isBulk.value) {
            confirmDialog.message = `${actionDialog.value.order?.orderNumber} nolu sipariş, "${actionDialog.value.selectedReason?.title}" gerekçesiyle iptal edilecektir.`;
        } else {
            const totalCount = selectedOrders.value.length;
            confirmDialog.message = `${totalCount} adet sipariş, seçilen gerekçelerle pazar yerlerinde iptal edilecektir. Bu işlem geri alınamaz!`;
        }

        confirmDialog.onConfirm = async () => {
            confirmDialog.show = false;
            actionDialog.value.show = false;

            if (!isBulk.value) {
                // TEKİL İPTAL: extraData zaten backend'de .cancelData || this.request kontrolüyle karşılanıyor.
                const extraData = {
                    reasonId: actionDialog.value.selectedReason.id,
                    reason: actionDialog.value.selectedReason.title
                };
                await processSingle(actionDialog.value.order._id, 'CANCEL', extraData);
            } else {
                // TOPLU İPTAL: Payload yapısını cancelData içine alıyoruz
                for (const code in bulkCancelData.value) {
                    const group = bulkCancelData.value[code];
                    const orderIds = selectedOrders.value
                        .filter(o => o.integrationCode === code)
                        .map(o => o._id);

                    // --- DÜZENLENEN KISIM BURASI ---
                    await processBulk({
                        orderIds,
                        cancelData: { // Backend artık bu objeyi bekliyor
                            reasonId: group.selected.id,
                            reason: group.selected.title
                        }
                    });
                }
                getOrders();
            }
        };

        confirmDialog.show = true;
    };


    return {
        actionDialog,
        isBulk,
        bulkCancelData,
        isCancelFormValid,
        openCancelAction,
        handleCancelConfirm
    };
}