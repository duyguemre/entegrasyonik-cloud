<template>
  <div>
  

<div style="width:100%">
  <div class="d-flex">
    <div style="width:48%">
      <div class="d-flex">
          <v-radio-group inline >
          <v-radio value=1 :label="$t('customers.customer.new.real')">
          </v-radio>
          <v-radio value=1 :label="$t('customers.customer.new.corporate')">
          </v-radio>
        </v-radio-group>
        </div>


      <div class="d-flex">
        <v-text-field clearable prepend-inner-icon="mdi-form-textbox" density="comfortable" class="mr-2"
          :label="$t('user.invoiceInfo.name')" variant="outlined" bg-color="textfieldColor"
          style="width:50%"></v-text-field>
        <v-text-field clearable prepend-inner-icon="mdi-form-textbox" density="comfortable" class=" "
          :label="$t('user.invoiceInfo.surname')" variant="outlined" bg-color="textfieldColor"
          style="width:50%"></v-text-field>
      </div>
      <div class="d-flex">
        <v-text-field clearable prepend-inner-icon="mdi-form-textbox" density="comfortable" class="mr-2"
          :label="$t('user.invoiceInfo.tc')" variant="outlined" bg-color="textfieldColor"
          style="width:50%"></v-text-field>
      </div>
      <div class="d-flex">
        <v-text-field clearable prepend-inner-icon="mdi-form-textbox" density="comfortable" class="mr-2"
          :label="$t('user.invoiceInfo.company')" variant="outlined" bg-color="textfieldColor"
          style="width:50%"></v-text-field>
      </div>
      <div class="d-flex">
        <v-text-field clearable prepend-inner-icon="mdi-form-textbox" density="comfortable" class="mr-2"
          :label="$t('user.invoiceInfo.taxissuer')" variant="outlined" bg-color="textfieldColor"
          style="width:50%"></v-text-field>
        <v-text-field clearable prepend-inner-icon="mdi-form-textbox" density="comfortable" class=" "
          :label="$t('user.invoiceInfo.taxid')" variant="outlined" bg-color="textfieldColor"
          style="width:50%"></v-text-field>
      </div>
    </div>
    <div style="width:4%">
    </div>
    <div style="width:48%">

      <div class="d-flex">
        <v-textarea rows=3 clearable prepend-inner-icon="mdi-form-textbox" density="comfortable" class="mr-2"
          :label="$t('user.invoiceInfo.address')" variant="outlined" bg-color="textfieldColor"
          style="width:50%"></v-textarea>
      </div>
      <div class="d-flex">
        <v-select clearable prepend-inner-icon="mdi-form-textbox" density="comfortable" class="mr-2"
          :label="$t('user.invoiceInfo.state')" variant="outlined" bg-color="textfieldColor"
          style="width:50%"></v-select>
        <v-select clearable prepend-inner-icon="mdi-form-textbox" density="comfortable" class=" "
          :label="$t('user.invoiceInfo.district')" variant="outlined" bg-color="textfieldColor"
          style="width:50%"></v-select>
      </div>



    </div>
  </div>
</div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';


const { t } = useI18n()

var buttons = [
{
  title: t("user.invoiceInfo.save"),
  icon: 'mdi-note-edit-outline',
  color: 'saveButtonColor',
  to: '',
},
]

</script>

<style></style>