import { reactive, ref } from 'vue';

export const useCustomerFilters = (fetchCallback: Function) => {

    // 1. FİLTRE VE FORM STATE (Reactive)
    const searchCustomerForm = reactive({
        form: {
            menu: false, // Filtre ActionDialog kontrolü
        },
        data: {
            globalSearch: '',
            cities: [] as string[],
            tags: [] as string[],
            riskLevel: null as string | null,
            status: null as string | null // Hata veren eksik alan buradaydı
        }
    });

    // 2. SAYFALAMA STATE
    const pagination = reactive({
        page: 1,
        limit: 25,
        totalNumberOfRecords: 0,
        totalNumberOfPages: 1
    });

    // 3. SIRALAMA STATE (Vuetify 3 Formatı)
    const sortBy = ref<any[]>([{ key: 'createdAt', order: 'desc' }]);

    // 4. UI SEÇENEKLERİ (Metadata)
    const riskLevelOptions = [
        { id: 'VIP', title: 'VIP Müşteriler' },
        { id: 'HIGH_RETURN_RISK', title: 'Yüksek İade Riski' },
        { id: 'PASSIVE', title: 'Pasif Müşteriler' },
        { id: 'B2B', title: 'Kurumsal (B2B)' }
    ];

    const statusOptions = [
        { id: 'ACTIVE', title: 'Aktif' },
        { id: 'INACTIVE', title: 'Pasif' },
        { id: 'BLOCKED', title: 'Engellenmiş' }
    ];

    /**
     * Backend'in beklediği formatta veri hazırlar.
     * CustomerService.getCustomers bu yapıyı bekler.
     */
    const prepareFilterPayload = () => {
        return {
            searchCustomerForm: {
                data: {
                    globalSearch: searchCustomerForm.data.globalSearch,
                    cities: searchCustomerForm.data.cities,
                    tags: searchCustomerForm.data.tags,
                    status: searchCustomerForm.data.status, // Backend filtrelemesi için kritik
                    riskLevel: searchCustomerForm.data.riskLevel
                }
            },
            pagination: {
                page: pagination.page,
                limit: pagination.limit
            },
            sortBy: sortBy.value[0] || { key: 'createdAt', order: 'desc' }
        };
    };

    /**
     * Filtreleri Sıfırlama
     */
    const resetFilters = () => {
        searchCustomerForm.data.globalSearch = '';
        searchCustomerForm.data.cities = [];
        searchCustomerForm.data.tags = [];
        searchCustomerForm.data.riskLevel = null;
        searchCustomerForm.data.status = null;
        pagination.page = 1;
        fetchCallback(true);
    };

    /**
     * Sayfa Değişimi
     */
    const handlePageChange = (page: number) => {
        pagination.page = page;
        fetchCallback();
    };

    /**
     * Sıralama Güncelleme
     */
    const onSortUpdate = (newSortBy: any) => {
        sortBy.value = newSortBy;
        fetchCallback(true);
    };

    return {
        searchCustomerForm,
        pagination,
        sortBy,
        riskLevelOptions,
        statusOptions,
        resetFilters,
        onSortUpdate,
        handlePageChange,
        prepareFilterPayload
    };
};