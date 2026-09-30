<!--
  frontend/src/views/secure/PrintoutListView.vue

  ADR-0015 B5-3 — GÖRSEL KATMAN (bkz. e2e/specs/printouts.spec.ts). Davranış DEĞİŞMEDİ: ekran bir
  liste değil, backend'e HİÇ istek atmayan bir şablon tasarımcısı taslağıdır; sürükle-bırak (dragstart/
  drop/dragend), tuvale `<p type="move">` ekleme, tıklayınca seçme (seçili öğe mavi), ayar paneli,
  "Sil", kâğıt boyutu düğmeleri (tuval `:width/:height` inline style), ölü "Test Çıktısı"/"Temizle"
  düğmeleri ve `#a4` kimliği AYNEN korundu. Görünen metinler/etiketler değişmedi.

  - Başlık `EkPageHeader`'a; token'sız renk/inline style, `bg-color="textfieldColor"`, eski
    `scroll-element`/`expand-background-patch`/`ScrollComponent` (özel kaydırma çubuğu) kaldırıldı;
    kaydırma yerel `overflow:auto`. Palet metinleri `paletteGroups` verisinden render edilir.
  - Yerleşim: araç çubuğu sarılır (mobil/tabletteki üst üste binme giderildi), tuval küçülmez
    (`flex:none`, kap içinde kaydırılır).
  - Karakterizasyon (DÜZELTİLMEDİ): seçim rengi (saf mavi, `blue`) ve sürükleme opaklığı script'te DOM'a
    doğrudan yazılır (spec bunu mavi olarak bekler); Genişlik/Yükseklik/Çıktı Tipi/Yazı Tipi/Yazı
    Büyüklüğü/Kopya Sayısı alanları hiçbir state'e bağlı değil; "Sil" sonrası seçim temizlenmez;
    paletteki alanlar klavyeyle sürüklenemez (yalnızca HTML5 fare DnD).
-->
<template>
  <div class="printoutListView">
    <EkPageHeader
      section="Finans"
      :title="$t('menu.printoutList')"
      description="Sipariş çıktı şablonlarınızı alanları tuvale sürükleyerek tasarlayın."
    />

    <div class="ek-printout__toolbar">
      <v-select clearable prepend-icon="mdi-form-textbox"
        :label="$t('printouts.printout.searchlabel')" variant="outlined" hide-details
        class="ek-printout__select ek-printout__select--type"></v-select>

      <div class="ek-printout__papers" role="group" aria-label="Kâğıt boyutu">
        <v-btn v-for="paperSize in paperSizes" :key="paperSize.id" elevation="0" class="ek-printout__paper"
          :class="{ 'ek-printout__paper--active': selectedPaperSize.id == paperSize.id }"
          :aria-pressed="selectedPaperSize.id == paperSize.id" @click="selectedPaperSize = paperSize"
          :color="selectedPaperSize.id == paperSize.id ? 'primary' : ''"
          :style="{ width: paperSize.width / 12 + 'px', height: paperSize.height / 12 + 'px' }">
          {{ paperSize.name }}
        </v-btn>
      </div>

      <v-select clearable :label="$t('printouts.printout.fontsize')" variant="outlined"
        hide-details class="ek-printout__select"></v-select>
      <v-select clearable :label="$t('printouts.printout.fontfamily')" variant="outlined"
        hide-details class="ek-printout__select"></v-select>
      <v-select clearable :label="$t('printouts.printout.copy')" variant="outlined"
        hide-details class="ek-printout__select"></v-select>

      <div class="ek-printout__actions">
        <v-btn prepend-icon="mdi-printer-outline" color="primary" variant="flat">{{ $t("printouts.printout.test") }}</v-btn>
        <v-btn prepend-icon="mdi-cancel" variant="outlined">{{ $t("printouts.printout.clear") }}</v-btn>
      </div>
    </div>

    <div class="ek-printout__workspace">
      <div class="ek-printout__palette" @dragstart="dragStart">
        <section v-for="group in paletteGroups" :key="group.title" class="ek-printout__group">
          <h2 class="ek-printout__group-title">{{ group.title }}</h2>
          <div v-for="field in group.fields" :key="field" draggable="true" class="ek-printout__field">{{ field }}</div>
        </section>
      </div>

      <div class="ek-printout__stage">
        <div v-if="selectedDragElement" class="ek-printout__panel">
          <div class="ek-printout__panel-title">{{ selectedDragElement.target.innerHTML }}</div>
          <div class="ek-printout__panel-fields">
            <v-text-field clearable :label="$t('printouts.printout.width')"
              variant="outlined" hide-details></v-text-field>
            <v-text-field clearable :label="$t('printouts.printout.height')"
              variant="outlined" hide-details></v-text-field>
          </div>
          <v-btn prepend-icon="mdi-trash-can-outline" @click="selectedDragElement.target.remove()" variant="outlined"
            color="error" class="ek-printout__delete">{{ $t("printouts.printout.delete") }}</v-btn>
        </div>

        <div class="ek-printout__canvas-scroll">
          <v-card id="a4" :height="selectedPaperSize.height" :width="selectedPaperSize.width" @drop="drop"
            class="ek-printout__canvas" elevation="0" @dragover="allowDrop" @dragend="dragLeave">
          </v-card>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, reactive, onMounted, watch } from 'vue'
import EkPageHeader from '@/components/page/EkPageHeader.vue'


const { t } = useI18n()
var globalDragEvent: any = undefined
var selectedDragElement: any = ref(undefined)

var printoutDatas = [
  {
    title: "Müşteri Bilgileri"
  },
  {
    title: "Fatura Bilgileri"
  },
  {
    title: "Ürün/Hizmet Bilgileri"
  },
  {
    title: "Tutar Bilgileri"
  },
  {
    title: "Notlar"
  },

]
var paperSizeDimensions = {
  width: 630,
  height: 891
}
var paperSizes = [
  {
    id: 1,
    name: 'a4',
    width: paperSizeDimensions.width,
    height: paperSizeDimensions.height,
  },
  {
    id: 2,
    name: 'a4',
    width: paperSizeDimensions.height,
    height: paperSizeDimensions.width,
  },
  {
    id: 3,
    name: 'a5',
    width: paperSizeDimensions.width / 1.414,
    height: paperSizeDimensions.height / 1.414,
  },
  {
    id: 4,
    name: 'a5',
    width: paperSizeDimensions.height / 1.414,
    height: paperSizeDimensions.width / 1.414,
  },
]
var selectedPaperSize: any = ref(paperSizes[0])

// Sürüklenebilir alan paleti (görsel katman — önceki statik şablonla AYNI metinler/sıra/gruplar).
const paletteGroups = [
  { title: 'Müşteri Bilgileri', fields: ['Müşteri Adı/Soyadı', 'TC Kimlik/Vergi Numarası', 'Teslimat Adresi', 'Fatura Adresi', 'İl', 'İlçe', 'Vergi Dairesi'] },
  { title: 'Ürün Bilgileri', fields: ['Ürün Adı', 'Ürün Stok Kodu', 'Ürün Adedi', 'Ürün Barkodu', 'Ürün Birim Fiyat', 'Ürün KDV Oranı', 'Ürün KDV Tutarı', 'Ürün Toplam Tutar'] },
  { title: 'Fatura Bilgileri', fields: ['Sipariş Numarası', 'Tarih', 'Saat', 'Sevk Tarihi', 'Açıklama', 'Sabit Açıklama', 'KDV %18', 'KDV %8', 'KDV %1'] },
  { title: 'Toplamlar', fields: ['KDV Toplamı', "KDV'siz Toplam", "KDV'li Toplam"] },
]


var selectDragElement = (event: any) => {
  if (selectedDragElement.value && selectedDragElement.value.target) selectedDragElement.value.target.style.color = "var(--ek-color-content-default)"
  if (selectedDragElement.value && selectedDragElement.value.target && selectedDragElement.value.target.innerHTML == event.target.innerHTML) {
    selectedDragElement.value = undefined
  }
  else {
    selectedDragElement.value = event
    selectedDragElement.value.target.style.color = "var(--ek-color-action)" // FR2-DARK: seçili alan, iki temada token
  }

}

var dragStart = (event: any) => {
  console.log("drag start")
  globalDragEvent = event
  if (event.target.getAttribute("type") == "move")
    event.target.style.opacity = ".5"
}

var dragLeave = (event: any) => {
  console.log("drag leave")
  // globalDragEvent = event
  globalDragEvent.target.style.opacity = "1"
}

var allowDrop = (event: any) => {
  event.preventDefault();
}

var drop = (event: any) => {
  event.preventDefault();
  var a4 = document.getElementById("a4")
  if (a4) {
    var mouseX = event.clientX - a4.getBoundingClientRect().left;
    var mouseY = event.clientY - a4.getBoundingClientRect().top;
    if (globalDragEvent) {
      var clientHeight = globalDragEvent.offsetY;
      var clientWidth = globalDragEvent.offsetX;
      var type = globalDragEvent.target.getAttribute("type")
      if (type == "move") {
        globalDragEvent.target.remove()
      }
      var newParagraph = document.createElement('p');
      newParagraph.style.position = "absolute"
      newParagraph.style.left = (mouseX - clientWidth) + 'px'
      newParagraph.draggable = true
      newParagraph.ondragstart = dragStart
      newParagraph.onclick = selectDragElement
      newParagraph.setAttribute("type", "move")
      newParagraph.style.top = (mouseY - clientHeight) + 'px'
      newParagraph.innerHTML = globalDragEvent.target.innerHTML
      a4.appendChild(newParagraph)

    }
  }

}

var hebele = () => {
  console.log("34343")
}
var reportsMenu = {
  title: t('printouts.printout.reports.title'),
  desc: t('printouts.printout.reports.desc'),
  list: [
    {
      id: 1,
      title: t('printouts.printout.reports.tax'),
      path: '/support/ticket',
      icon: 'mdi-message-question-outline'
    },
    {
      id: 2,
      title: t('printouts.printout.reports.commission'),
      path: '/support/ticket/list',
      icon: 'mdi-list-status'
    },
    {
      id: 3,
      title: t('printouts.printout.reports.category'),
      path: '/support/school',
      icon: 'mdi-school-outline'
    },
    {
      id: 4,
      title: t('printouts.printout.reports.brand'),
      path: '/support/school',
      icon: 'mdi-school-outline'
    },

  ]
}

var a = () => {
}

var buttons = [
  {
    title: t("printouts.printout.save"),
    icon: 'mdi-pencil-outline',
    color: 'primary',
    to: '',
    click: a
  },
]


const headers = [
  {
    id: 1,
    title: t('printouts.printout.headers.platform'),
    value: "platform",
    sortable: true
  },
  {
    id: 1,
    title: t('printouts.printout.headers.customer'),
    value: "customer",
    sortable: true
  },
  {
    id: 1,
    title: t('printouts.printout.headers.product'),
    value: "product",
    sortable: true
  },
  {
    id: 1,
    title: t('printouts.printout.headers.stockcode'),
    value: "stockcode",
    sortable: true
  },
  {
    id: 1,
    title: t('printouts.printout.headers.count'),
    value: "count",
    sortable: true
  },
  {
    id: 1,
    title: t('printouts.printout.headers.commission'),
    value: "commission",
    sortable: true
  },
  {
    id: 1,
    title: t('printouts.printout.headers.price'),
    value: "price",
    sortable: true
  },
  {
    id: 1,
    title: "actions",
    value: "actions"
  },
]

const items = [
  {
    id: 1,
    orderId: 232323,
    customer: "Emre Yalçınkaya",
    date: '09 Ocak 2024',
    cost: '2.099,90',
    totals: {
      count: 1,
      price: "2.099,90",
      commission: "345,00"
    },
    products: [
      {
        name: "Hobby 226028 Hakiki Deri Kadın Günlük Bot Siyah 37",
        stockcode: "hb226028s-37",
        count: 1,
        price: "2.099,90",
        commission: "345,00",
      }
    ],

    platform: 'n11',
    status: 1,
  },
  {

    id: 1,
    orderId: 232323,
    customer: "Emre Yalçınkaya",
    date: '09 Ocak 2024',
    cost: '2.099,90',
    totals: {
      count: 2,
      price: "4.099,90",
      commission: "745,00"
    },
    products: [
      {
        name: "Hobby 226028 Hakiki Deri Kadın Günlük Bot Siyah 37",
        stockcode: "hb226028s-37",
        count: 1,
        price: "2.099,90",
        commission: "345,00",
      },
      {
        name: "Hobby 226028 Hakiki Deri Kadın Günlük Bot Siyah 37",
        stockcode: "hb226028s-37",
        count: 1,
        price: "2.099,90",
        commission: "345,00",
      }

    ],

    platform: 'amazon',
    status: 1,

  },
  {
    id: 1,
    orderId: 232323,
    customer: "Emre Yalçınkaya",
    date: '09 Ocak 2024',
    cost: '2.099,90',
    totals: {
      count: 1,
      price: "2.099,90",
      commission: "345,00"
    },
    products: [
      {
        name: "Hobby 226028 Hakiki Deri Kadın Günlük Bot Siyah 37",
        stockcode: "hb226028s-37",
        count: 1,
        price: "2.099,90",
        commission: "345,00",
      }
    ],

    platform: 'hepsiburada',
    status: 1,

  },
  {
    id: 1,
    orderId: 232323,
    customer: "Emre Yalçınkaya",
    date: '09 Ocak 2024',
    cost: '2.099,90',
    totals: {
      count: 1,
      price: "2.099,90",
      commission: "345,00"
    },
    products: [
      {
        name: "Hobby 226028 Hakiki Deri Kadın Günlük Bot Siyah 37",
        stockcode: "hb226028s-37",
        count: 1,
        price: "2.099,90",
        commission: "345,00",
      }
    ],

    platform: 'trendyol',
    status: 1,

  },
  {
    id: 1,
    orderId: 232323,
    customer: "Emre Yalçınkaya",
    date: '09 Ocak 2024',
    cost: '2.099,90',
    totals: {
      count: 1,
      price: "2.099,90",
      commission: "345,00"
    },
    products: [
      {
        name: "Hobby 226028 Hakiki Deri Kadın Günlük Bot Siyah 37",
        stockcode: "hb226028s-37",
        count: 1,
        price: "2.099,90",
        commission: "345,00",
      }
    ],

    platform: 'pazarama',
    status: 1,
  },
  {
    id: 1,
    orderId: 232323,
    customer: "Emre Yalçınkaya",
    date: '09 Ocak 2024',
    cost: '2.099,90',
    totals: {
      count: 1,
      price: "2.099,90",
      commission: "345,00"
    },
    products: [
      {
        name: "Hobby 226028 Hakiki Deri Kadın Günlük Bot Siyah 37",
        stockcode: "hb226028s-37",
        count: 1,
        price: "2.099,90",
        commission: "345,00",
      }
    ],

    platform: 'pttavm',
    status: 1,

  },
  {
    id: 1,
    orderId: 232323,
    customer: "Emre Yalçınkaya",
    date: '09 Ocak 2024',
    cost: '2.099,90',
    totals: {
      count: 1,
      price: "2.099,90",
      commission: "345,00"
    },
    products: [
      {
        name: "Hobby 226028 Hakiki Deri Kadın Günlük Bot Siyah 37",
        stockcode: "hb226028s-37",
        count: 1,
        price: "2.099,90",
        commission: "345,00",
      }
    ],

    platform: 'hepsiburada',
    status: 1,
  },
  {
    id: 1,
    orderId: 232323,
    customer: "Emre Yalçınkaya",
    date: '09 Ocak 2024',
    cost: '2.099,90',
    totals: {
      count: 1,
      price: "2.099,90",
      commission: "345,00"
    },
    products: [
      {
        name: "Hobby 226028 Hakiki Deri Kadın Günlük Bot Siyah 37",
        stockcode: "hb226028s-37",
        count: 1,
        price: "2.099,90",
        commission: "345,00",
      }
    ],

    platform: 'hepsiburada',
    status: 1,
  },
  {
    id: 1,
    orderId: 232323,
    customer: "Emre Yalçınkaya",
    date: '09 Ocak 2024',
    cost: '2.099,90',
    totals: {
      count: 1,
      price: "2.099,90",
      commission: "345,00"
    },
    products: [
      {
        name: "Hobby 226028 Hakiki Deri Kadın Günlük Bot Siyah 37",
        stockcode: "hb226028s-37",
        count: 1,
        price: "2.099,90",
        commission: "345,00",
      }
    ],

    platform: 'hepsiburada',
    status: 1,
  },
  {
    id: 1,
    orderId: 232323,
    customer: "Emre Yalçınkaya",
    date: '09 Ocak 2024',
    cost: '2.099,90',
    totals: {
      count: 1,
      price: "2.099,90",
      commission: "345,00"
    },
    products: [
      {
        name: "Hobby 226028 Hakiki Deri Kadın Günlük Bot Siyah 37",
        stockcode: "hb226028s-37",
        count: 1,
        price: "2.099,90",
        commission: "345,00",
      }
    ],
    platform: 'hepsiburada',
    status: 1,
  },

]

onMounted(() => {
});



var selectedUpdateId = ref(-1)
var openUpdate = (id: number) => {

}
</script>

<style scoped>
.printoutListView {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-4);
  padding: var(--ek-space-6);
  min-width: 0;
}

.ek-printout__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ek-space-3);
}

.ek-printout__select {
  flex: 1 1 160px;
  min-width: 160px;
  max-width: 240px;
}

.ek-printout__select--type {
  flex-basis: 200px;
}

.ek-printout__papers {
  display: flex;
  align-items: flex-end;
  gap: var(--ek-space-2);
}

.ek-printout__paper {
  min-width: 0;
  padding: 0;
  font-weight: var(--ek-font-weight-semibold);
  text-transform: lowercase;
  border: 1px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-sm);
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard),
    border-color var(--ek-duration-fast) var(--ek-easing-standard);
}

.ek-printout__paper--active {
  border-color: var(--ek-color-primary);
}

.ek-printout__actions {
  display: flex;
  gap: var(--ek-space-2);
  margin-left: auto;
}

.ek-printout__workspace {
  display: grid;
  grid-template-columns: minmax(0, 424px) minmax(0, 1fr);
  gap: var(--ek-space-4);
  align-items: start;
  padding: var(--ek-space-4);
  background: var(--ek-color-surface-muted);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-lg);
}

.ek-printout__palette {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ek-space-3);
  align-items: start;
}

.ek-printout__group {
  padding: var(--ek-space-3);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}

.ek-printout__group-title {
  margin: 0 0 var(--ek-space-2);
  font-size: var(--ek-font-size-xs);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-muted);
}

.ek-printout__field {
  padding: var(--ek-space-1) var(--ek-space-2);
  font-size: var(--ek-font-size-sm);
  color: var(--ek-color-content-default);
  border-radius: var(--ek-radius-sm);
  cursor: grab;
  transition: background-color var(--ek-duration-fast) var(--ek-easing-standard);
}

.ek-printout__field:hover {
  background: var(--ek-color-surface-sunken);
}

.ek-printout__stage {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  min-width: 0;
}

.ek-printout__panel {
  display: flex;
  flex-direction: column;
  gap: var(--ek-space-3);
  max-width: 420px;
  padding: var(--ek-space-4);
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-default);
  border-radius: var(--ek-radius-md);
}

.ek-printout__panel-title {
  font-size: var(--ek-font-size-sm);
  font-weight: var(--ek-font-weight-semibold);
  color: var(--ek-color-content-strong);
}

.ek-printout__panel-fields {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ek-space-2);
}

.ek-printout__panel-fields > * {
  flex: 1 1 140px;
}

.ek-printout__delete {
  align-self: flex-start;
}

.ek-printout__canvas-scroll {
  overflow: auto;
  max-width: 100%;
}

.ek-printout__canvas {
  flex: none;
  background: var(--ek-color-surface);
  border: 1px solid var(--ek-color-border-strong);
  border-radius: var(--ek-radius-sm);
  box-shadow: var(--ek-shadow-sm);
}

.ek-printout__canvas :deep(p) {
  margin: 0;
  padding: 0 var(--ek-space-1);
  font-size: var(--ek-font-size-sm);
  cursor: grab;
}

@media (max-width: 959px) {
  .printoutListView {
    padding: var(--ek-space-4);
  }

  .ek-printout__workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .ek-printout__actions {
    margin-left: 0;
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ek-printout__paper,
  .ek-printout__field {
    transition: none;
  }
}
</style>
