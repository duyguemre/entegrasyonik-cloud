<template>
    <div class="d-flex1 elevation-0 custom-pagination pagination-root" :style="{ position: static == true ? 'unset' : 'absolute' }">           
        <v-row no-gutters class="pagination-row">
            <v-col cols="2" class="text-center">
                <div class="mt-1 pagination-summary" v-if="pagination">
                    <span class="text-caption">Toplam:</span> <span class="mr-2 font-weight-bold">{{
                        pagination.totalNumberOfRecords }}</span>
                    | <span class="ml-2 text-caption font-weight-medium"> {{ range.start }} - {{ range.end }}</span>
                </div>
            </v-col>
            <v-col cols="8">
                <v-pagination v-model="page" elevation="0" color="neutral" :length="totalNumberOfPages"
                    :total-visible="totalVisible" class="mt-0">
                    <template v-slot:item="item">
                        <v-btn v-if="item.isActive" color="neutral" elevation="0" class="pagination-btn pagination-btn--active" density="compact">
                            {{ item.page }}
                        </v-btn>
                        <v-btn v-else-if="!item.props.disabled" elevation="0" class="pagination-btn" @click="setPage(Number(item.page))" density="compact">
                            <span class="text-content-muted">{{ item.page }}</span>
                        </v-btn>
                        <div v-else @click.stop>
                                {{ item.page }}
                        </div>

                    </template>
                    <template v-slot:prev="item">
                        <v-btn :disabled="item.disabled" elevation="0" class="pagination-btn" aria-label="Önceki sayfa" @click="setPage(Number(page - 1))"
                            density="compact">
                            <v-icon>{{ item.icon }}</v-icon>
                        </v-btn>
                    </template>
                    <template v-slot:next="item">
                        <v-btn :disabled="item.disabled" elevation="0" class="pagination-btn" aria-label="Sonraki sayfa" @click="setPage(Number(page + 1))"
                            density="compact">
                            <v-icon>{{ item.icon }}</v-icon>
                        </v-btn>
                    </template>
                </v-pagination>
            </v-col>
            <v-col cols="2">
            </v-col>
        </v-row>
    </div>
</template>

<script lang="ts" setup>
import { ref, watch, reactive, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n';
var emits = defineEmits(['setPage'])

var page = defineModel({ default: 1 })

const { t } = useI18n()

var props = defineProps<{
    totalVisible?: number
    totalNumberOfPages?: number
    static?: boolean,
    pagination?: any
}>()



watch(page, (newValue, oldValue) => {
    emits('setPage', page)
})

const range = computed(() => {
    if (!props.pagination) return {start:0,end:0}
    var start = ((props.pagination.page - 1) * props.pagination.limit)
    var end = start + props.pagination.limit
    if (end > props.pagination.totalNumberOfRecords) end = props.pagination.totalNumberOfRecords
    return { start: start + 1, end }
})

const setPage = (pageNumber: number) => {
    page.value = pageNumber
}

onMounted(() => {
})

</script>

<style scoped>
.pagination-root {
    width: 100%;
}

.pagination-row,
.pagination-summary {
    white-space: nowrap;
}

.pagination-btn {
    border: 1px solid var(--ek-color-border-default);
}

.pagination-btn--active {
    border-color: var(--ek-color-content-muted);
}
</style>