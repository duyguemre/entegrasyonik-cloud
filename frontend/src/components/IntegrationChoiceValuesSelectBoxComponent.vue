<template>
  <template v-if="integrationValues">

      <v-select @click.stop="1" v-ripple.stop variant="outlined" prepend-icon="mdi-checkbox-outline"
        density="compact" type="tel" maxlength="160" width="200" @update:modelValue=""
        item-value="id" :items="computedIntegrationValues" :hint="$t('productDefinitions.category.platformChoiceDesc')"
        persistent-hint v-model="selectedIntegrationChoice" hide-details>
        <template v-slot:label>
          <span class="font-weight-normal"> <span class="choice-select__brand">Entegrasyonik</span> {{ integrationChoiceValue.title }}
            </span>
        </template>

        <template v-slot:prepend-item>
      <v-list-item class="choice-select__item">
        <v-text-field append-inner-icon="mdi-magnify" @click.stop="1" v-ripple.stop variant="outlined"
          @mousedown.stop="1" density="compact" type="tel" maxlength="160" class="mt-2" clearable counter
          :rules="formRules.searchRules" v-model="choiceValueSearchText"
          :hint="$t('productDefinitions.category.searchDesc')">
          <template v-slot:label>
            <span class="font-weight-light">Filtrele</span>
          </template>
        </v-text-field>
      </v-list-item>
    </template>
    <template v-slot:item="{item,index,props}:any">
      <v-list-item v-bind="props" class="choice-select__item">
        <template #title>
        </template>
        <div class="d-flex justify-start align-center ml-6">
          <div v-if="item.raw.level && item.raw.level > 0"
            v-for="n in item.raw.level" class="choice-select__indent">
          </div>
          <div class="mr-2 font-weight-thin">{{ index + 1 }}</div> {{ item.title }}
        </div>
      </v-list-item>
    </template>

      </v-select>
  </template>
</template>

<script lang="ts" setup>
import { computed, watch, inject, ref, onBeforeMount, onMounted, onBeforeUnmount } from 'vue'
import { useIntegrationStore } from '@/stores/integrationStore';
import { useI18n } from 'vue-i18n';
import useFormRules from '@/composables/formrules';
const formRules: any = useFormRules()
const choiceValueSearchText:any = ref()

const integrationStore = useIntegrationStore()
const emits = defineEmits(['change'])

const selectedIntegrationChoice:any = defineModel({ default: undefined })

const props = defineProps<{
  mandatory?: boolean,
  integrationChoiceValue:any,
  integrationValues: any
}>()

const { t } = useI18n()


const computedIntegrationValues = computed(() => {
  if(!props.integrationValues) return []
  let choices: any = undefined
  
  if (!props.integrationValues || !choiceValueSearchText.value || choiceValueSearchText.value.length < 2) choices = props.integrationValues
  else {
    choices = props.integrationValues.filter((item: any) => {
      if (item.isMain == true) return true
      if (searchCategory(item)) return true
      return false
    })
  }

  return choices
})

const searchCategory = (choice: any) => {
  if (!choiceValueSearchText.value || choiceValueSearchText.value.length < 2) return true
  if(choice.id==selectedIntegrationChoice.value?.id) return true
  if (choice.title.toLocaleUpperCase().includes(choiceValueSearchText.value.toLocaleUpperCase())) return true
  return false
}



onMounted(async () => {

})

onBeforeMount(() => {

})

onBeforeUnmount(async () => {
})

</script>

<style scoped>
.choice-select__brand {
  opacity: 0.6;
}

.choice-select__item {
  border: 1px solid var(--ek-color-border-default);
  border-top: none;
}

.choice-select__indent {
  width: 25px;
}
</style>