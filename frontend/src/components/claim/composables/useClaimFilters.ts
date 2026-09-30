import { ref, reactive, computed } from 'vue';
import { ClaimInternalStatusEnum, CLAIM_INTERNAL_STATUS_LABELS, CLAIM_INTERNAL_STATUS_COLORS } from '@/types/ClaimTypes';

export function useClaimFilters(getClaims: Function) {
    // --- 1. SEARCH FORM STATE ---
    const searchClaimForm = ref({
        data: {
            globalSearch: '',
            startDate: undefined as any,
            endDate: undefined as any,
            integrationCodes: [] as string[],
            internalStatuses: [] as string[],
            types: [] as string[]
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

    const sortBy = ref<any[]>([{ key: 'claimedAt', order: 'desc' }]);

    // --- 3. OPTIONS & CONSTANTS ---
    const statusOptions = ref(
        Object.values(ClaimInternalStatusEnum).map((status) => ({
            id: status,
            title: CLAIM_INTERNAL_STATUS_LABELS[status],
            color: CLAIM_INTERNAL_STATUS_COLORS[status]
        }))
    );

    // --- 4. COMPUTED FORMATTERS ---
    const formattedStartDate = computed(() => {
        if (!searchClaimForm.value.data.startDate) return '';
        return new Date(searchClaimForm.value.data.startDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    });

    const formattedEndDate = computed(() => {
        if (!searchClaimForm.value.data.endDate) return '';
        return new Date(searchClaimForm.value.data.endDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
    });

    // --- 5. ACTIONS ---
    const resetFilters = () => {
        searchClaimForm.value.data = {
            globalSearch: '',
            startDate: undefined,
            endDate: undefined,
            integrationCodes: [],
            internalStatuses: [],
            types: []
        };
        getClaims(true);
    };

    const onSortUpdate = (newSortBy: any) => {
        sortBy.value = newSortBy;
        getClaims(true);
    };

    const handlePageChange = () => {
        getClaims();
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
            filter: { ...searchClaimForm.value.data }
        };
    };

    return {
        searchClaimForm,
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
