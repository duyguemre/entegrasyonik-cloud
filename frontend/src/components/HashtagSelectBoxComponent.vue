<template>
    <v-autocomplete class="customTextField" multiple chips closable-chips clearable
        :rules="mandatory ? formRules.mandatoryRule : []" density="compact" v-model="hashtagValueIds"
        :items="computedHashtagsList" variant="outlined" item-value="_id" item-title="title">
        <template #label>
            <div>
                Etiketler (Tag)<v-icon v-if="mandatory == true" size="12" class="mb-2 ml-1">mdi-asterisk</v-icon>
            </div>
        </template>
        <template #no-data>
            <div class="pa-4 text-center">
                <div class="mb-2">Etiket bulunamadı</div>
                <v-btn v-if="hashtagSearchText" size="small" color="processButtonColor" @click="addNewHashtag(hashtagSearchText)">
                    "{{ hashtagSearchText }}" Ekle
                </v-btn>
            </div>
        </template>
        <template v-slot:selection="{ item, index }">
            <v-chip size="small" :color="(item.raw as any)?.color || 'primary'" :text-color="getTextColor((item.raw as any)?.color)">
                {{ item.title }}
            </v-chip>
        </template>
        <template v-slot:item="{ props, item }">
            <v-list-item v-bind="props" :title="item.title" :subtitle="(item.raw as any).groupTitle">
                <template #prepend>
                    <v-icon :color="(item.raw as any).color || 'grey'" size="small">mdi-tag</v-icon>
                </template>
            </v-list-item>
        </template>
        <template v-slot:append-item>
            <v-divider></v-divider>
            <v-list-item>
                <v-form v-model="quickAddForm" @submit.prevent="addNewHashtag(quickAddName)">
                    <v-text-field v-model="quickAddName" density="compact" variant="outlined" hide-details
                        placeholder="Hızlı Ekle..." class="mt-2 customTextField">
                        <template #append-inner>
                            <v-btn icon="mdi-plus" size="x-small" color="processButtonColor" 
                                :disabled="!quickAddName" @click="addNewHashtag(quickAddName)"></v-btn>
                        </template>
                    </v-text-field>
                </v-form>
            </v-list-item>
        </template>
    </v-autocomplete>
</template>

<script lang="ts" setup>
import { computed, ref, onBeforeMount } from 'vue'
import { useHashtagsStore } from '@/stores/hashtagsStore';
import { useI18n } from 'vue-i18n';
import useFormRules from '@/composables/formrules';

const hashtagsStore = useHashtagsStore()

const hashtagValueIds = defineModel({ default: [] })
const props = defineProps<{
    mandatory?: boolean
}>()

const { t } = useI18n()
const formRules: any = useFormRules()
const hashtagSearchText = ref('')
const quickAddName = ref('')
const quickAddForm = ref(false)

const computedHashtagsList = computed(() => {
    const list: any[] = []
    if (!hashtagsStore.hashtags) return []
    
    for (const group of hashtagsStore.hashtags) {
        if (group.values) {
            for (const val of group.values) {
                list.push({
                    _id: val._id,
                    title: val.title,
                    color: val.color,
                    groupTitle: group.title,
                    groupId: group._id
                })
            }
        }
    }
    return list
})

const addNewHashtag = async (name: string) => {
    if (!name) return
    
    // Find or create a "Genel" group
    let generalGroup = hashtagsStore.hashtags?.find(g => g.title === 'Genel')
    let groupId = generalGroup?._id
    
    if (!groupId) {
        const newGroup = await hashtagsStore.addHashtag({ title: 'Genel', color: '#607D8B' })
        groupId = newGroup?._id
    }
    
    if (groupId) {
        const success = await hashtagsStore.addHashtagValue({ _id: groupId, title: name })
        if (success) {
            quickAddName.value = ''
            hashtagSearchText.value = ''
            // Note: The new value will be retrieved by the store's internal retrieve call in addHashtagValue
        }
    }
}

const getTextColor = (bgColor: string) => {
    if (!bgColor) return 'white'
    const color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor
    const r = parseInt(color.substring(0, 2), 16)
    const g = parseInt(color.substring(2, 4), 16)
    const b = parseInt(color.substring(4, 6), 16)
    const uicolors = [r / 255, g / 255, b / 255]
    const c = uicolors.map((col) => {
        if (col <= 0.03928) {
            return col / 12.92
        }
        return Math.pow((col + 0.055) / 1.055, 2.4)
    })
    const L = (0.2126 * c[0]) + (0.7152 * c[1]) + (0.0722 * c[2])
    return (L > 0.179) ? 'black' : 'white'
}

onBeforeMount(async () => {
    if (!hashtagsStore.hashtags) {
        await hashtagsStore.retrieve()
    }
})

</script>

<style scoped></style>
