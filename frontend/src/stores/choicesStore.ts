import { ref } from 'vue'
import { defineStore } from 'pinia'
import useRestApi from '@/composables/restapi'
import { registerStoreReset } from '@/stores/resetRegistry'
export const useChoicesStore = defineStore('choicesStore', () => {
  const choices: any = ref()
  const restApi = useRestApi()

  const retrieve = async () => {
    choices.value = undefined
    await restApi.get("ChoiceService").then((response: any) => {
      if (response) {
        choices.value = response
      }
    })
    return choices.value
  }

  const getChoicesNameFromIds = (ids: string) => {
    console.log(ids, choices.value)
  }

  const getChoiceTitle = (choiceId: number) => {
    for (let choice of choices.value) {
      if (choice._id == choiceId) return choice.title
    }
    return undefined
  }

  const getChoiceValues = (choiceId: number) => {
    for (let choice of choices.value) {
      if (choice._id == choiceId) return choice.values
    }
    return undefined
  }

  const getChoiceValueTitle = (choiceId: string, valueId: string) => {
    if (!choices.value) return undefined
    for (let choice of choices.value) {
      if (choice._id == choiceId) {
        for (let value of choice.values) {
          if (value._id == valueId) return value.title
        }
      }
    }
    return undefined
  }

  const getDirectChoiceValueTitle = (valueId: string) => {
    if (!choices.value) return undefined
    for (let choice of choices.value) {
      for (let value of choice.values) {
        if (value._id == valueId) return value.title
      }
    }
    return undefined
  }

  const getChoiceValueName = (_id: any, id: any) => {
    //console.log("choices:", choices.value,"choiceId:", _id, "choiceValueId:", id)
    for (let choice of choices?.value ?? []) {
      if (choice._id == _id) {
        //  console.log("Title:", choice.title)
        for (let value of choice.values ?? []) {
          //  console.log("ValueId/choiceValueId:", value._id,id)
          if (value._id == id) return value.title
        }
      }
    }
    return undefined
  }

  const countOfChoices = () => {
    const res: any = []
    if (!choices?.value) return res
    for (const choice of choices?.value) {
      res.push({
        title: choice.title,
        valueCount: choice.values?.length
      })
    }
    return res
  }

  const getChoices = (reset = false) => {
    if (reset == true || choices == undefined) retrieve()
    return choices
  }


  const addChoice = (title: any) => {
    restApi.post("ChoiceService/addChoice", { title }).then((response: any) => {
      if (response && response._id) {
        retrieve()
      }
    })
  }


  const addChoiceValue = async (choiceId: any, title: any) => {
    console.log("addChoiceValue called with choiceId:", choiceId, "and title:", title)
    const response = await restApi.post("ChoiceService/addChoiceValue", { _id: choiceId, title })
    console.log("addChoiceValue response:", response)
    if (response == true) {
      retrieve()
    }
  }


  // R9b: çıkış sonrası önceki kiracının seçenek önbelleği kalmasın.
  registerStoreReset('choicesStore', () => { choices.value = undefined })

  return { retrieve, addChoiceValue, getChoices, getChoiceValues, getChoiceValueName, getChoicesNameFromIds, getChoiceTitle, getChoiceValueTitle, countOfChoices, addChoice, choices, getDirectChoiceValueTitle }
})