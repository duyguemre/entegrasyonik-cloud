<template>
  <div class="pa-4">

    <div class="d-flex">
      <div style="width:20%">
        <v-select clearable prepend-icon="mdi-form-textbox" density="comfortable"
          :label="$t('printouts.printout.searchlabel')" variant="outlined" bg-color="textfieldColor"
          hide-details></v-select>
      </div>
      <div style="width:4%">
      </div>
      <div style="width:20%">
        <div class="d-flex">
          <div v-for="paperSize in paperSizes">
            <v-btn elevation="0" class="pa-2 mr-1 font-weight-bold" @click="selectedPaperSize = paperSize"
              :color="selectedPaperSize.id == paperSize.id ? 'primary' : ''" style="border:1px solid #444; min-width:0;"
              :style="{ width: paperSize.width / 12 + 'px', height: paperSize.height / 12 + 'px' }">
              {{ paperSize.name }}
            </v-btn>
          </div>
        </div>
      </div>
      <div style="width:56%">
        <div class="d-flex">
          <div style="width:22%">
            <v-select clearable density="comfortable" class="mr-2" :label="$t('printouts.printout.fontsize')"
              variant="outlined" bg-color="textfieldColor" hide-details></v-select>
          </div>
          <div style="width:22%">
            <v-select clearable density="comfortable" class="mr-2" :label="$t('printouts.printout.fontfamily')"
              variant="outlined" bg-color="textfieldColor" hide-details></v-select>
          </div>
          <div style="width:22%">
            <v-select clearable density="comfortable" :label="$t('printouts.printout.copy')" variant="outlined"
              bg-color="textfieldColor" hide-details></v-select>
          </div>
          <div style="width:4%">
          </div>
          <div style="width:30%">
            <v-btn-group class="pa-0 ml-2" elevation="2">
              <v-btn prepend-icon="mdi-printer" elevation=1 color="actionButtonColor" min-width="150px"> {{
                $t("printouts.printout.test") }}</v-btn>
              <v-btn prepend-icon="mdi-cancel" elevation=1 color="processButtonColor" min-width="150px"> {{
                $t("printouts.printout.clear") }}</v-btn>
            </v-btn-group>

          </div>
        </div>
      </div>

    </div>

    <div class="d-flex scroll-element" :style="{ top: '100px' }">
      <div class="expand-background-patch"></div>

      <v-card class="scroll-card pa-4" variant="outlined" style="border-color:#ddd;background-color:#f4f4f4">

        <div class="d-flex">
          <div @dragstart="dragStart">
            <div class="d-flex mb-2">
              <v-card class="mr-2" width="200px" elevation="0" style="border-color:#ddd;background-color:#fbfbfb"
                variant="outlined">
                <v-card-title class="text-caption">
                  Müşteri Bilgileri
                </v-card-title>
                <v-card-text>
                  <div draggable="true">Müşteri Adı/Soyadı</div>
                  <div draggable="true">TC Kimlik/Vergi Numarası</div>
                  <div draggable="true">Teslimat Adresi</div>
                  <div draggable="true">Fatura Adresi</div>
                  <div draggable="true">İl</div>
                  <div draggable="true">İlçe</div>
                  <div draggable="true">Vergi Dairesi</div>
                </v-card-text>
              </v-card>
              <v-card class="mr-2" width="200px" elevation="0" style="border-color:#ddd;background-color:#fbfbfb"
                variant="outlined">
                <v-card-title class="text-caption">
                  Ürün Bilgileri
                </v-card-title>
                <v-card-text>
                  <div draggable="true">Ürün Adı</div>
                  <div draggable="true">Ürün Stok Kodu</div>
                  <div draggable="true">Ürün Adedi</div>
                  <div draggable="true">Ürün Barkodu</div>
                  <div draggable="true">Ürün Birim Fiyat</div>
                  <div draggable="true">Ürün KDV Oranı</div>
                  <div draggable="true">Ürün KDV Tutarı</div>
                  <div draggable="true">Ürün Toplam Tutar</div>
                </v-card-text>
              </v-card>
            </div>

            <div class="d-flex">
              <v-card class="mr-2" width="200px" elevation="0" style="border-color:#ddd;background-color:#fbfbfb"
                variant="outlined">
                <v-card-title class="text-caption">
                  Fatura Bilgileri
                </v-card-title>
                <v-card-text>
                  <div draggable="true">Sipariş Numarası</div>
                  <div draggable="true">Tarih</div>
                  <div draggable="true">Saat</div>
                  <div draggable="true">Sevk Tarihi</div>
                  <div draggable="true">Açıklama</div>
                  <div draggable="true">Sabit Açıklama</div>
                  <div draggable="true">KDV %18</div>
                  <div draggable="true">KDV %8</div>
                  <div draggable="true">KDV %1</div>
                </v-card-text>
              </v-card>

              <v-card class="mr-2" width="200px" elevation="0" style="border-color:#ddd;background-color:#fbfbfb"
                variant="outlined">
                <v-card-title class="text-caption">
                  Toplamlar
                </v-card-title>
                <v-card-text>
                  <div draggable="true">KDV Toplamı</div>
                  <div draggable="true">KDV'siz Toplam</div>
                  <div draggable="true">KDV'li Toplam</div>
                </v-card-text>
              </v-card>
            </div>
          </div>

          <v-card id="a4" :height="selectedPaperSize.height" :width="selectedPaperSize.width" @drop="drop" class="mr-2"
            @dragover="allowDrop" @dragend="dragLeave">
          </v-card>

          <div v-if="selectedDragElement" style="widt1h:22%">
            <div style="position:fixed1;min-width:400px;">
              <v-card variant="outlined" class="pa-0 ma-0" style="border-color:#ddd">
                <v-card-title class="text-caption">
                  <div class="mb-2">{{ selectedDragElement.target.innerHTML }}</div>
                </v-card-title>
                <v-card-text>
                  <div class="d-flex">
                    <v-text-field clearable density="comfortable" :label="$t('printouts.printout.width')"
                      variant="outlined" bg-color="textfieldColor" hide-details class="mb-2 mr-2"></v-text-field>
                    <v-text-field clearable density="comfortable" class="mb-2 mr-2"
                      :label="$t('printouts.printout.height')" variant="outlined" bg-color="textfieldColor"
                      hide-details></v-text-field>
                  </div>
                  <v-btn prepend-icon="mdi-delete-outline" @click="selectedDragElement.target.remove()" elevation=1
                    color="deleteButtonColor" class="mt-4" min-width="150px"> {{
                      $t("printouts.printout.delete") }}</v-btn>
                </v-card-text>
              </v-card>
            </div>
          </div>



        </div>
      </v-card>

      <ScrollComponent id=".scroll-element .scroll-card"  :isExpandable="false"/>

    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { ref, reactive, onMounted, watch } from 'vue'


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


var selectDragElement = (event: any) => {
  if (selectedDragElement.value && selectedDragElement.value.target) selectedDragElement.value.target.style.color = "#000"
  if (selectedDragElement.value && selectedDragElement.value.target && selectedDragElement.value.target.innerHTML == event.target.innerHTML) {
    selectedDragElement.value = undefined
  }
  else {
    selectedDragElement.value = event
    selectedDragElement.value.target.style.color = "#00f"
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
    icon: 'mdi-note-edit-outline',
    color: 'saveButtonColor',
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

<style></style>