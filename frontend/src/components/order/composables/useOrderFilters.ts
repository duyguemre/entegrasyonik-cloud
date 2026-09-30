import { ref, reactive, computed } from 'vue';
import { OrderInternalStatusEnum, ORDER_INTERNAL_STATUS_LABELS, ORDER_INTERNAL_STATUS_COLORS } from '@/types/OrderTypes';

export function useOrderFilters(getOrders: Function) {
    // --- 1. SEARCH FORM STATE ---
    const searchOrderForm = ref({
        data: {
            globalSearch: '',
            startDate: undefined as any,
            endDate: undefined as any,
            integrationCodes: [] as string[],
            internalStatuses: [] as string[],
            // C1.1: kalem stok tahsis durumu (OrderService/getOrders `filter.allocationStates`, API_TENANT_SURFACE §2.2)
            allocationStates: [] as string[]
        },
        form: { menu: false }
    });

    // --- 2. PAGINATION & SORT STATE ---
    const pagination = reactive({
        limit: 25,
        page: 1,
        totalNumberOfPages: 1,
        totalNumberOfRecords: 0
    });

    const sortBy = ref<any[]>([{ key: 'dates.orderDate', order: 'desc' }]);

    // --- 3. OPTIONS & CONSTANTS ---
    const statusOptions = ref(
        Object.values(OrderInternalStatusEnum).map((status) => ({
            id: status,
            title: ORDER_INTERNAL_STATUS_LABELS[status],
            color: ORDER_INTERNAL_STATUS_COLORS[status]
        }))
    );

    // --- 4. COMPUTED FORMATTERS ---
    const formattedStartDate = computed(() => {
        if (!searchOrderForm.value.data.startDate) return '';
        return new Date(searchOrderForm.value.data.startDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    });

    const formattedEndDate = computed(() => {
        if (!searchOrderForm.value.data.endDate) return '';
        return new Date(searchOrderForm.value.data.endDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    });

    // --- 5. ACTIONS ---
    const resetFilters = () => {
        searchOrderForm.value.data = {
            globalSearch: '',
            startDate: undefined,
            endDate: undefined,
            integrationCodes: [],
            internalStatuses: [],
            allocationStates: []
        };
        // Filtreler sıfırlanınca ilk sayfaya dön ve veriyi çek
        getOrders(true);
    };

    const onSortUpdate = (newSortBy: any) => {
        sortBy.value = newSortBy;
        getOrders(true);
    };

    const handlePageChange = () => {
        getOrders();
    };

    /**
     * API'ye gönderilecek temiz payload'u hazırlar
     */
    const prepareFilterPayload = () => {
        return {
            pagination: {
                page: pagination.page,
                limit: pagination.limit
            },
            sort: {
                field: sortBy.value[0]?.key,
                direction: sortBy.value[0]?.order
            },
            filter: { ...searchOrderForm.value.data }
        };
    };

    return {
        searchOrderForm,
        pagination,
        sortBy,
        statusOptions,
        formattedStartDate,
        formattedEndDate,
        resetFilters,
        onSortUpdate,
        handlePageChange,
        prepareFilterPayload
    };
}