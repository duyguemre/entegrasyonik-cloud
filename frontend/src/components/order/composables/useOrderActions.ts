import { ref } from 'vue';

/**
 * Genel Sipariş İşlemlerini (Fatura, Kargo, Barkod) Yöneten Composable
 */
export function useOrderActions(restApi: any, snackbarStore: any, loadingComponentRef: any, getOrders: Function, askForBarcode: Function, barcodePrintComponentRef: any) {

    /**
     * API İsteklerini atan yardımcı metot
     */
    const executeOrderAction = async (endpoint: string, payload: any) => {
        try {
            return await restApi.post(endpoint, payload);
        } catch (error: any) {
            throw new Error(error.message || 'Sunucu hatası oluştu');
        }
    };

    /**
     * Manuel form açma stratejileri
     * Backend 'OPEN_MANUAL_FORM' döndüğünde tetiklenir
     */
    const manualForms: Record<string, (refs: any) => Promise<any>> = {
        OPEN_MANUAL_INVOICE_FORM: async (refs) => await refs.manualInvoiceComponentRef.value.open(),
        OPEN_MANUAL_SHIPMENT_FORM: async (refs) => await refs.manualShipmentComponentRef.value.open(),
    };

    /**
     * TEKİL PLATFORM AKSİYONU (Fatura, Kargo, Onay)
     */
    const processPlatformAction = async (orderId: string, actionType: 'INVOICE' | 'SHIP' | 'CANCEL' | 'APPROVE', extraData: any = null, componentRefs: any): Promise<void> => {
        const config: Record<string, { endpoint: string, dataKey: string }> = {
            INVOICE: { endpoint: 'InvoiceService/createInvoice', dataKey: 'invoiceData' },
            SHIP: { endpoint: 'ShipmentService/createShipment', dataKey: 'fulfillmentData' },
            CANCEL: { endpoint: 'OrderService/cancelOrder', dataKey: 'cancelData' },
            APPROVE: { endpoint: 'OrderService/approveOrder', dataKey: 'approveData' }
        };

        const { endpoint, dataKey } = config[actionType];
        const guid = loadingComponentRef.value.info("İşlem yapılıyor...");

        try {
            const res = await executeOrderAction(endpoint, {
                orderId,
                ...(extraData ? { [dataKey]: extraData } : {})
            });

            // 1. Manuel Form Gereksinimi Kontrolü
            if (!res.success && res.action && manualForms[res.action]) {
                loadingComponentRef.value.remove(guid);
                const manualData = await manualForms[res.action](componentRefs);

                if (manualData) {
                    // Form doldurulduysa tekrar dene
                    return processPlatformAction(orderId, actionType, manualData, componentRefs);
                }
                return;
            }

            // 2. Başarı Durumu
            if (res.success) {
                snackbarStore.addSnackbar({ text: res.message || 'İşlem başarılı.', color: 'success' });

                // Eğer kargo işlemiyse barkod yazdırılsın mı diye sor
                if (actionType === 'SHIP') {
                    const shouldPrint = await askForBarcode();
                    if (shouldPrint && res.data) {
                        const order = res.data;
                        const lastFulfillment = order.fulfillment[order.fulfillment.length - 1];

                        const printData = {
                            carrierName: lastFulfillment.carrierName,
                            trackingCode: lastFulfillment.trackingCode,
                            customerName: order.customerName || `${order.shippingAddress?.firstName} ${order.shippingAddress?.lastName}`,
                            fullAddress: `${order.shippingAddress?.addressLine1} ${order.shippingAddress?.addressLine2 || ''}`,
                            state: order.shippingAddress?.state,
                            city: order.shippingAddress?.city,
                            externalOrderId: order.externalOrderId
                        };
                        await barcodePrintComponentRef.value.print(printData);
                    }
                }
                getOrders();
            } else {
                snackbarStore.addSnackbar({ text: res.message || 'Hata oluştu.', color: 'error' });
            }

        } catch (error: any) {
            snackbarStore.addSnackbar({ text: error.message, color: 'error' });
        } finally {
            loadingComponentRef.value.remove(guid);
        }
    };

    /**
     * TOPLU İŞLEM (Fatura, Kargo, Onay)
     * @param actionType - İşlem tipi
     * @param targetIds - İşlem görecek ID'ler
     */
    const processBulkAction = async (actionType: 'INVOICE' | 'SHIP' | 'APPROVE', targetIds: string[]) => {
        if (targetIds.length === 0) return;

        const guid = loadingComponentRef.value.info(`${targetIds.length} Sipariş İşleniyor...`);

        try {
            let endpoint = '';
            if (actionType === 'INVOICE') endpoint = 'InvoiceService/bulkCreateInvoice';
            else if (actionType === 'SHIP') endpoint = 'ShipmentService/bulkCreateShipment';
            else if (actionType === 'APPROVE') endpoint = 'OrderService/bulkApproveOrder';

            // 1. İstek Gönder (Artık manuel form için extraData veya componentRefs yollamıyoruz)
            const res = await executeOrderAction(endpoint, { orderIds: targetIds });

            // 2. Eğer backend "Manuel İşlem Gerekiyor" diyorsa işlemi durdur ve uyar
            if (!res.success && res.action) {
                snackbarStore.addSnackbar({
                    text: 'Bazı siparişler eksik bilgi içeriyor. Lütfen bu siparişler için tekli işlem yapın.',
                    color: 'warning'
                });
                return;
            }

            // 3. Başarı/Kısmi Başarı Durumu ve Detaylı Hata Bildirimi
            if (res.success && res.data) {
                const { successful = [], failed = [] } = res.data;

                // A. EĞER BAŞARISIZ OLANLAR VARSA DETAYLI UYARI VER
                if (failed.length > 0) {
                    const errorDetails = failed.map((f: any) => `Sipariş No: ${f.orderNumber}: ${f.reason}`).join(' | ');
                    snackbarStore.addSnackbar({
                        text: `${successful.length} başarılı, ${failed.length} başarısız. Hatalar: ${errorDetails}`,
                        color: 'warning',
                        timeout: 8000 // Kullanıcının hataları okuyabilmesi için ekranda 8 saniye kalır
                    });
                } else {
                    // B. HEPSİ BAŞARILIYSA STANDART YEŞİL BİLDİRİM
                    snackbarStore.addSnackbar({
                        text: res.message || `Tüm ${targetIds.length} işlem başarıyla tamamlandı.`,
                        color: 'success'
                    });
                }

                // C. BARKOD YAZDIRMA MANTIĞI (Sadece kargo işlemiyse ve en az 1 başarılı varsa çalışır)
                if (actionType === 'SHIP' && successful.length > 0) {
                    const shouldPrint = await askForBarcode(true, successful.length);

                    if (shouldPrint) {
                        const bulkPrintData = successful.map((item: any) => {
                            const order = item.data;
                            const lastFulfillment = order.fulfillment[order.fulfillment.length - 1];
                            return {
                                carrierName: lastFulfillment?.carrierName,
                                trackingCode: lastFulfillment?.trackingCode,
                                customerName: order.customerName || `${order.shippingAddress?.firstName} ${order.shippingAddress?.lastName}`,
                                fullAddress: `${order.shippingAddress?.addressLine1} ${order.shippingAddress?.addressLine2 || ''}`,
                                state: order.shippingAddress?.state,
                                city: order.shippingAddress?.city,
                                externalOrderId: order.externalOrderId
                            };
                        });
                        await barcodePrintComponentRef.value.printBulk(bulkPrintData);
                    }
                }

                getOrders(); // Tabloyu yenile

            } else if (!res.success) {
                // Backend'den genel bir başarısızlık (500 vb.) döndüyse
                snackbarStore.addSnackbar({ text: res.message || 'İşlem tamamlanamadı.', color: 'error' });
            }

        } catch (error: any) {
            snackbarStore.addSnackbar({ text: error.message || 'Toplu işlem başarısız.', color: 'error' });
        } finally {
            loadingComponentRef.value.remove(guid);
        }
    };



    // useOrderActions.ts içinde

    const handleResolveDiscrepancy = async (orderId: string, confirmDialogObj: any) => {
        // confirmDialog yerine artık confirmDialogObj kullanıyoruz
        confirmDialogObj.title = 'FARKLI EŞİTLE VE YENİDEN FATURALANDIR';
        confirmDialogObj.message = 'Eski faturayı yasal olarak iptal ettiğinizi onaylıyor musunuz? Bu işlem siparişi pazaryeri verileriyle eşitleyip anında YENİ fatura kesecektir.';
        confirmDialogObj.confirmText = 'Evet, İptal Ettim ve Yenile';
        confirmDialogObj.color = 'warning';

        confirmDialogObj.onConfirm = async () => {
            confirmDialogObj.show = false; // Diyaloğu kapat

            const guid = loadingComponentRef.value.info("Fatura yenileniyor...");
            try {
                const res = await restApi.post(`InvoiceService/resolveAndReissueInvoice`, { orderId });
                if (res.success) {
                    snackbarStore.addSnackbar({ text: res.message || 'Fatura yenilendi.', color: 'success' });
                    getOrders();
                }
            } catch (error: any) {
                snackbarStore.addSnackbar({ text: error.message, color: 'error' });
            } finally {
                loadingComponentRef.value.remove(guid);
            }
        };

        confirmDialogObj.show = true; // Diyaloğu aç
    };

    /**
     * BARKOD YAZDIRMA (Direct)
     */
    const printShippingLabel = async (payload: any) => {
        let order = payload;
        let targetFulfillment = null;

        // payload { order, fulfillment } şeklinde geldiyse (Detay sayfasından spesifik kargo)
        if (payload.order && payload.fulfillment) {
            order = payload.order;
            targetFulfillment = payload.fulfillment;
        } else {
            // Sadece order objesi geldiyse (Tablodan genel kargo)
            if (!order.fulfillment || order.fulfillment.length === 0) {
                snackbarStore.addSnackbar({ text: 'Kargo bilgisi bulunamadı!', color: 'warning' });
                return;
            }
            targetFulfillment = order.fulfillment[order.fulfillment.length - 1];
        }

        if (!targetFulfillment || !targetFulfillment.trackingCode) {
            snackbarStore.addSnackbar({ text: 'Geçerli bir takip kodu bulunamadı!', color: 'warning' });
            return;
        }

        const printData = {
            carrierName: targetFulfillment.carrierName,
            trackingCode: targetFulfillment.trackingCode,
            customerName: order.customerName || `${order.shippingAddress?.firstName} ${order.shippingAddress?.lastName}`,
            fullAddress: `${order.shippingAddress?.addressLine1} ${order.shippingAddress?.addressLine2 || ''}`,
            state: order.shippingAddress?.state,
            city: order.shippingAddress?.city,
            externalOrderId: order.externalOrderId
        };

        try {
            await barcodePrintComponentRef.value.print(printData);
        } catch (err) {
            snackbarStore.addSnackbar({ text: 'Yazdırma hatası!', color: 'error' });
        }
    };

    return {
        processPlatformAction,
        processBulkAction,
        handleResolveDiscrepancy,
        printShippingLabel
    };
}