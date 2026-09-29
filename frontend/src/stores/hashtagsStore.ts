import { ref } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import { registerStoreReset } from '@/stores/resetRegistry'
export const useHashtagsStore = defineStore('hashtagsStore', () => {
    const hashtags = ref<any[]>()
    const restApi = useRestApi()

    const retrieve = async () => {
        hashtags.value = undefined
        const response = await restApi.get("HashtagService")
        if (response) {
            hashtags.value = response
        }
        return hashtags.value
    }

    const getHashtags = (reset = false) => {
        if (reset == true || hashtags.value == undefined) retrieve()
        return hashtags
    }

    const getHashtagTitle = (hashtagId: string) => {
        if (!hashtags.value) return undefined
        for (let hashtag of hashtags.value) {
            if (hashtag._id == hashtagId) return hashtag.title
        }
        return undefined
    }

    const getHashtagValueTitle = (hashtagId: string, valueId: string) => {
        if (!hashtags.value) return undefined
        for (let hashtag of hashtags.value) {
            if (hashtag._id == hashtagId) {
                for (let value of (hashtag.values || [])) {
                    if (value._id == valueId) return value.title
                }
            }
        }
        return undefined
    }

    const getDirectHashtagValueTitle = (valueId: string) => {
        if (!hashtags.value) return undefined
        for (let hashtag of hashtags.value) {
            for (let value of (hashtag.values || [])) {
                if (value._id == valueId) return value.title
            }
        }
        return undefined
    }

    const countOfHashtags = () => {
        return hashtags.value?.length || 0
    }

    // CRUD Actions
    const addHashtag = async (data: { title: string, color?: string }) => {
        const response = await restApi.post("HashtagService/addHashtag", data)
        if (response?.result) {
            await retrieve()
            return response.result
        }
        return null
    }

    const updateHashtag = async (data: { _id: string, title: string, color?: string }) => {
        const response = await restApi.post("HashtagService/updateHashtag", data)
        if (response?.result?.acknowledged) {
            await retrieve()
            return true
        }
        return false
    }

    const removeHashtag = async (id: string) => {
        const response = await restApi.post("HashtagService/removeHashtag", { _id: id })
        if (response?.result?.acknowledged) {
            await retrieve()
            return true
        }
        return false
    }

    const addHashtagValue = async (data: { _id: string, title: string, color?: string }) => {
        const response = await restApi.post("HashtagService/addHashtagValue", data)
        if (response === true) {
            await retrieve()
            return true
        }
        return false
    }

    const updateHashtagValue = async (data: { _id: string, id: string, title: string, color?: string }) => {
        const response = await restApi.post("HashtagService/updateHashtagValue", data)
        if (response?.result?.acknowledged) {
            await retrieve()
            return true
        }
        return false
    }

    const removeHashtagValue = async (hashtagId: string, valueId: string) => {
        const response = await restApi.post("HashtagService/removeHashtagValue", { _id: hashtagId, id: valueId })
        if (response?.result?.acknowledged) {
            await retrieve()
            return true
        }
        return false
    }

    // R9b: çıkış sonrası önceki kiracının etiket önbelleği kalmasın.
    registerStoreReset('hashtagsStore', () => { hashtags.value = undefined })

    return {
        hashtags,
        retrieve,
        getHashtags,
        getHashtagTitle,
        getHashtagValueTitle,
        getDirectHashtagValueTitle,
        countOfHashtags,
        addHashtag,
        updateHashtag,
        removeHashtag,
        addHashtagValue,
        updateHashtagValue,
        removeHashtagValue
    }
})