<script setup lang="ts">
import { CurrencyDisplay, useCurrencyInput } from 'vue-currency-input'
import { watch } from 'vue'

const props = defineProps({
  modelValue: {
    type: Number,
    required: false // default kaldırıldı
  },
  required: {
    type: Boolean,
    default: false
  },
  compact: {
    type: Boolean,
    default: false
  },
  isIconExist: {
    type: Boolean,
    default: true
  },
  nullToEmpty: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'change'])

const { inputRef, formattedValue, setValue, numberValue } = useCurrencyInput({
  locale: 'tr',
  currency: 'TRY',
  hideCurrencySymbolOnFocus: false,
  hideGroupingSeparatorOnFocus: false,
  precision: 2,
  valueRange: { min: 0 },
  currencyDisplay: CurrencyDisplay.hidden
})

watch(
  () => props.modelValue,
  (value: any) => {
    if (props.nullToEmpty && (value === null || value === undefined)) {
      setValue(null) // input boş göster
    } else {
      setValue(value)
    }
  },
  { immediate: true }
)

// input değişince parent’a yansıt
watch(numberValue, (val) => {
  if (props.nullToEmpty && val === null) {
    emit('update:modelValue', null)
  } else {
    emit('update:modelValue', val)
  }
})
</script>


<template>
  <template v-if="compact === false">
    <v-text-field
      clearable
      :prepend-icon="isIconExist ? 'mdi-currency-try' : ''"
      density="compact"
      class="customTextField"
      v-model="formattedValue"
      type="tel"
      maxlength="16"
      ref="inputRef"
      variant="outlined"
      bg-color="textfieldColor"
      counter
      @change.stop
    >
      <template #label="{ label }">
        {{ label }}
        <v-icon size="12" class="ml-1 mb-2" v-if="required">mdi-asterisk</v-icon>
        <slot name="label"></slot>
      </template>

      <template #append-inner>
        <slot name="append-inner"></slot>
      </template>

      <template #prepend-inner>
        <slot name="prepend-inner"></slot>
      </template>
    </v-text-field>
  </template>

  <template v-else>
    <v-text-field
      clearable
      density="compact"
      class="customTextField"
      v-model="formattedValue"
      type="tel"
      maxlength="16"
      ref="inputRef"
      variant="outlined"
      bg-color="textfieldColor"
      hide-details
      @change.stop
    >
      <template #label="{ label }">
        {{ label }}
        <slot name="label"></slot>
      </template>

      <template #append-inner>
        <slot name="append-inner"></slot>
      </template>
    </v-text-field>
  </template>
</template>



<!-- <script setup lang="ts">
import { CurrencyDisplay, useCurrencyInput } from 'vue-currency-input';
import { watch } from 'vue';


const props = defineProps({
    modelValue: {
        type: Number,
        required: true,
        default: 0
    },
    required: {
        type: Boolean,
        default: false
    },
    compact: {
        type: Boolean,
        default: false
    },
    isIconExist: {
        type: Boolean,
        default: true  // Varsayılan değer burada tanımlanır
    }
});


const { inputRef, formattedValue, numberValue, setValue } = useCurrencyInput({
    locale: 'tr',
    currency: 'TRY',
    hideCurrencySymbolOnFocus: false,
    hideGroupingSeparatorOnFocus: false,
    precision: 2,
    valueRange: { min: 0 },
    currencyDisplay: CurrencyDisplay.hidden
});

watch(
    () => props.modelValue,
    (value: any) => {
        setValue(value);
    }
);
</script>

<template>
    <template v-if="compact === false">
        <v-text-field clearable :prepend-icon="isIconExist == true ? 'mdi-currency-try' : ''" density="compact"
            class="customTextField" v-model="formattedValue" type="tel" maxlength="16" ref="inputRef" variant="outlined"
            bg-color="textfieldColor" counter>
            <template #label="{ label }">
                {{ label }}<v-icon size="12" class="ml-1 mb-2" v-if="required">mdi-asterisk</v-icon>
                <slot name="label">
                </slot>

            </template>
            <template #append-inner>
                <slot name="append-inner">
                </slot>
            </template>
            <template #prepend-inner>
                <slot name="prepend-inner">
                </slot>
            </template>
        </v-text-field>
    </template>
    <template v-else>
        <v-text-field clearable density="compact" class="customTextField" v-model="formattedValue" type="tel"
            maxlength="16" ref="inputRef" variant="outlined" bg-color="textfieldColor" hide-details>
            <template #label="{ label }">
                {{ label }}
                <slot name="label">
                </slot>
            </template>
            <template #append-inner>
                <slot name="append-inner">
                </slot>
            </template>
        </v-text-field>
    </template>
</template>
 -->