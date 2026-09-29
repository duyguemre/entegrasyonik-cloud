<template>
<div>

<div style="width:100%">
  <div class="d-flex">
    <div style="width:48%">
    </div>
    <div style="width:4%">
    </div>
    <div style="width:48%">
      <div class="d-flex">
        <v-text-field clearable prepend-inner-icon="mdi-form-textbox" density="comfortable" class="mr-2"
          :label="$t('user.changePassword.password')" variant="outlined" bg-color="textfieldColor"
          style="width:50%"></v-text-field>
        <v-text-field clearable prepend-inner-icon="mdi-form-textbox" density="comfortable" class=" "
          :label="$t('user.changePassword.repassword')" variant="outlined" bg-color="textfieldColor"
          style="width:50%"></v-text-field>
      </div>

    </div>
  </div>
</div>
</div>
</template>

<script setup lang="ts">
</script>

<style></style>