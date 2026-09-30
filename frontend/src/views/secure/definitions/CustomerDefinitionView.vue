<template>
  <div class="legacy-definition-root">
    <EkPageHeader
      section="Siparişler"
      :title="$t('definitions.customer.title')"
    />
  

  <!-- B5-1 duzeltme: asagidaki `.expand-element`/`.scroll-element` (site.css) ve PaginationComponent
       position:absolute ve sabit `top` degerleriyle konumlanir; konumlu bir ata olmadan sekme kabina
       gore yerlesip ustteki EkPageHeader'i hesaba katmiyor, arama satirinin USTUNU ortuyorlardi.
       Bu govde, baslik sonrasinda kalan alani kaplayan konumlu ata olur - icerik/davranis AYNI. -->
  <div class="legacy-definition-body">
  <div class="search-section" >
    <div class="d-flex">
      <div class="legacy-definition-search">
        <div class="d-flex">
          <v-text-field clearable prepend-icon="mdi-form-textbox" density="comfortable"
            :label="$t('customers.customer.searchlabel')" variant="outlined"></v-text-field>
          <v-bottom-sheet>
            <template v-slot:activator="{ props }">
              <v-btn-group class="pa-0 ml-2">
                <v-btn prepend-icon="mdi-magnify" to="/orderList" color="primary"
                  min-width="200px">
                  {{ $t("customers.customer.search") }}</v-btn>
                <v-btn v-bind="props" class="ml-0" color="primary" variant="tonal">
                  <v-icon class="advanced-search-button-background1" size="x-large">mdi-text-search
                    text-center</v-icon>
                </v-btn>
              </v-btn-group>
            </template>
          </v-bottom-sheet>

        </div>
      </div>
    </div>
    <v-divider class="mb-2 mr-8 ml-8" />
  </div>

  
  <div class="d-flex scroll-element expand-element no-expand">
    <v-data-table :items="items" fixed-header :headers="headers"
      class="pa-0 ma-0" show-select>
      <template #bottom></template>
      <template v-slot:header.actions>
      </template>
      <template v-slot:item.customer="{ item, index }">
        <div class="mt-2 mb-2">
          <div class="font-weight-medium">{{ item.customer.name.toLocaleUpperCase() }}</div>
          <v-text-field class="mt-3" readonly :label="$t('customers.customer.email')" variant="plain" density="compact"
            hide-details v-model="item.customer.email">
          </v-text-field>
          <v-text-field class="mt-3" readonly :label="$t('customers.customer.phone')" variant="plain" density="compact"
            hide-details v-model="item.customer.phone">
          </v-text-field>
        </div>
      </template>
      <template v-slot:item.address="{ item, index }">
        <v-text-field class="mt-3" readonly variant="plain" density="compact" hide-details v-model="item.address.desc">
        </v-text-field>
        {{ item.address.county }} / {{ item.address.state }} / {{ item.address.country }}
        <div class="d-flex">
        </div>
      </template>
      <template v-slot:item.customerType="{ item, index }">
        <div v-if="item.customerType.isCompany">
          <v-text-field class="mt-3" readonly :label="$t('customers.customer.customerType.taxId')" variant="plain"
            density="compact" hide-details v-model="item.customerType.taxId">
          </v-text-field>
          <v-text-field class="mt-3" readonly :label="$t('customers.customer.customerType.taxIssuer')" variant="plain"
            density="compact" hide-details v-model="item.customerType.taxIssuer">
          </v-text-field>
        </div>
        <v-text-field v-else class="mt-3" readonly :label="$t('customers.customer.customerType.tc')" variant="plain"
          density="compact" hide-details v-model="item.customerType.tc">
        </v-text-field>

      </template>

      <template v-slot:item.actions="{ item, index }">
        <div class="text-center justify-center align-center">
          <v-btn-group class="pa-0" density="comfortable">
            <v-btn class="" min-width=0 variant="text" aria-label="Düzenle">
              <v-icon>mdi-pencil-outline</v-icon>
            </v-btn>
            <v-btn class="" min-width=0 variant="text" color="error" aria-label="Sil">
              <v-icon>mdi-trash-can-outline</v-icon>
            </v-btn>
          </v-btn-group>
        </div>
      </template>
    </v-data-table>
    <ScrollComponent id=".scroll-element .v-table__wrapper" :is-expandable="false"/>
  </div>
  <PaginationComponent />
  </div>
  </div>
</template>

<script setup lang="ts">
import EkPageHeader from '@/components/ds/EkPageHeader.vue'
import { useI18n } from 'vue-i18n';
import { ref,inject, onMounted, watch } from 'vue'
import PaginationComponent from '@/components/PaginationComponent.vue';





const { t } = useI18n()
var sliderValue = ref(0)
var sliderMax = ref(0)
var contentWidth = 170

var isShowNewCustomerPopup = ref(false)

var a = () => {

}
var showNewCustomerPopup = () => {
  isShowNewCustomerPopup.value = !isShowNewCustomerPopup.value
}

var buttons: any = [
  {
    title: t("customers.customer.new.title"),
    icon: 'mdi-plus',
    color: 'primary',
    to: '',
    click: showNewCustomerPopup,
  },
]
const headers = [
  {
    id: 1,
    title: t('customers.customer.headers.customer'),
    value: "customer",
    sortable: true
  },
  {
    id: 1,
    title: t('customers.customer.headers.address'),
    value: "address",
    sortable: true
  },
  {
    id: 1,
    title: t('customers.customer.headers.customerType'),
    value: "customerType",
    sortable: true
  },
  {
    id: 1,
    title: t('customers.customer.headers.actions'),
    value: "actions",
    sortable: false
  },

]

const items = [
  {
    id: 1,
    customer: {
      name: "Emre Yalçınkaya",
      email: "emre@emre.com",
      phone: "05053303322"
    },
    address: {
      desc: "Özgür Mah. Kelebek Sok. Tan Apt. Daire 3",
      county: "Merkez",
      state: "Karabük",
      country: "Türkiye"
    },
    customerType: {
      isCompany: true,
      tc: 12345678901,
      taxId: 444532345,
      taxIssuer: "Ankara"
    }
  },
  {
    id: 1,
    customer: {
      name: "Emre Yalçınkaya",
      email: "emre@emre.com",
      phone: "05053303322"
    },
    address: {
      desc: "Özgür Mah. Kelebek Sok. Tan Apt. Daire 3",
      county: "Merkez",
      state: "Karabük",
      country: "Türkiye"
    },
    customerType: {
      isCompany: true,
      tc: 12345678901,
      taxId: 444532345,
      taxIssuer: "Ankara"
    }
  },
  {
    id: 1,
    customer: {
      name: "Emre Yalçınkaya",
      email: "emre@emre.com",
      phone: "05053303322"
    },
    address: {
      desc: "Özgür Mah. Kelebek Sok. Tan Apt. Daire 3",
      county: "Merkez",
      state: "Karabük",
      country: "Türkiye"
    },
    customerType: {
      isCompany: true,
      tc: 12345678901,
      taxId: 444532345,
      taxIssuer: "Ankara"
    }
  },
  {
    id: 1,
    customer: {
      name: "Emre Yalçınkaya",
      email: "emre@emre.com",
      phone: "05053303322"
    },
    address: {
      desc: "Özgür Mah. Kelebek Sok. Tan Apt. Daire 3",
      county: "Merkez",
      state: "Karabük",
      country: "Türkiye"
    },
    customerType: {
      isCompany: true,
      tc: 12345678901,
      taxId: 444532345,
      taxIssuer: "Ankara"
    }
  },
  {
    id: 1,
    customer: {
      name: "Emre Yalçınkaya",
      email: "emre@emre.com",
      phone: "05053303322"
    },
    address: {
      desc: "Özgür Mah. Kelebek Sok. Tan Apt. Daire 3",
      county: "Merkez",
      state: "Karabük",
      country: "Türkiye"
    },
    customerType: {
      isCompany: true,
      tc: 12345678901,
      taxId: 444532345,
      taxIssuer: "Ankara"
    }
  },
  {
    id: 1,
    customer: {
      name: "Emre Yalçınkaya",
      email: "emre@emre.com",
      phone: "05053303322"
    },
    address: {
      desc: "Özgür Mah. Kelebek Sok. Tan Apt. Daire 3",
      county: "Merkez",
      state: "Karabük",
      country: "Türkiye"
    },
    customerType: {
      isCompany: true,
      tc: 12345678901,
      taxId: 444532345,
      taxIssuer: "Ankara"
    }
  },

]

onMounted(() => {

  

});



var selectedUpdateId = ref(-1)
var openUpdate = (id: number) => {

}
</script>

<style scoped>
.legacy-definition-root {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
}

.legacy-definition-search {
  width: 48%;
}

.legacy-definition-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}
</style>