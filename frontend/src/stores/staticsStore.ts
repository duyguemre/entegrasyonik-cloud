import { ref } from 'vue'
import { defineStore } from 'pinia'
export const useStaticsStore = defineStore('staticsStore', () => {

  enum PRODUCT_INTEGRATION_STATUS {
    PENDING = 'PENDING',
    SENT = 'SENT',
    WAITING = 'WAITING',
    FAILED = 'FAILED',
    COMPLETED = 'COMPLETED',
  }


  const ideasoft = {
    defaults: {
      stockTypeLabel: 'Piece',
      hasGift: 0,
      customShippingCost: 50
    },
    stockTypeLabelOptions: [
      { title: 'Adet', value: 'Piece' },
      { title: 'Çift', value: 'pair' },
      { title: 'Düzine', value: 'Dozen' },
      { title: 'Gram', value: 'gram' },
      { title: 'Kişi', value: 'Person' },
      { title: 'Kilogram', value: 'kg' },
      { title: 'Metre', value: 'metre' },
      { title: 'Metrekare', value: 'm2' },
      { title: 'Paket', value: 'Package' },
      { title: 'Santimetre', value: 'cm' }
    ]

  }

  const STATUS_META: Record<PRODUCT_INTEGRATION_STATUS, { icon: string; order: number; message: string }> = {
    [PRODUCT_INTEGRATION_STATUS.PENDING]: {
      icon: 'mdi-pencil-outline',
      order: 1,
      message: "Hazırlanıyor"
    },
    [PRODUCT_INTEGRATION_STATUS.SENT]: {
      icon: 'mdi-play-outline',
      order: 2,
      message: "Gönderildi"
    },
    [PRODUCT_INTEGRATION_STATUS.WAITING]: {
      icon: 'mdi-clock-outline',
      order: 3,
      message: "Bekliyor"
    },
    [PRODUCT_INTEGRATION_STATUS.FAILED]: {
      icon: 'mdi-close-box-outline',
      order: 4,
      message: "Reddedildi"
    },
    [PRODUCT_INTEGRATION_STATUS.COMPLETED]: {
      icon: 'mdi-checkbox-marked',
      order: 7,
      message: "Onaylandı"
    },
  };


  const fastDeliveryTypes = [
    {
      id: "-1",
      name: "Özel Teslimat Yok"
    },
    {
      id: "SAME_DAY_SHIPPING",
      name: "Aynı Gün Teslimat"
    },
    {
      id: "FAST_DELIVERY",
      name: "Hızlı Teslimat"
    }
  ]

  const maxPurchaseQuantity = 99
  const shippingDuration = 3
  const desi = 1
  const warranty = 12
  const taxPercentage = 18



  enum TICKET_TYPE {
    GENERAL = "GENERAL",
    TECHNICAL = "TECHNICAL",
    INVOICE = "INVOICE",
    OTHER = "OTHER",
  }


  const TICKET_TYPE_DESCRIPTIONS: any = {
    [TICKET_TYPE.GENERAL]: "Genel Soru",
    [TICKET_TYPE.TECHNICAL]: "Teknik Destek",
    [TICKET_TYPE.INVOICE]: "Fatura Sorunu",
    [TICKET_TYPE.OTHER]: "Diğer"
  };


  enum TICKET_STATUS {
    CREATED = "CREATED",
    PROCESSING = "PROCESSING",
    CLOSED = "CLOSED",
    WAITING = "WAITING",
  }


  const TICKET_STATUS_DESCRIPTIONS: any = {
    [TICKET_STATUS.CREATED]: { text: "İNCELENİYOR", color: "orange" },
    [TICKET_STATUS.PROCESSING]: { text: "ÇALIŞILIYOR", color: "blue" },
    [TICKET_STATUS.CLOSED]: { text: "KAPANDI", color: "green" },
    [TICKET_STATUS.WAITING]: { text: "İŞLEM BEKLENİYOR", color: "red" }
  }



  const cities = [
    { title: "Adana", value: 1 },
    { title: "Adıyaman", value: 2 },
    { title: "Afyonkarahisar", value: 3 },
    { title: "Ağrı", value: 4 },
    { title: "Aksaray", value: 68 },
    { title: "Amasya", value: 5 },
    { title: "Ankara", value: 6 },
    { title: "Antalya", value: 7 },
    { title: "Ardahan", value: 75 },
    { title: "Artvin", value: 8 },
    { title: "Aydın", value: 9 },
    { title: "Balıkesir", value: 10 },
    { title: "Bartın", value: 74 },
    { title: "Batman", value: 72 },
    { title: "Bayburt", value: 69 },
    { title: "Bilecik", value: 11 },
    { title: "Bingöl", value: 12 },
    { title: "Bitlis", value: 13 },
    { title: "Bolu", value: 14 },
    { title: "Burdur", value: 15 },
    { title: "Bursa", value: 16 },
    { title: "Çanakkale", value: 17 },
    { title: "Çankırı", value: 18 },
    { title: "Çorum", value: 19 },
    { title: "Denizli", value: 20 },
    { title: "Diyarbakır", value: 21 },
    { title: "Düzce", value: 81 },
    { title: "Edirne", value: 22 },
    { title: "Elazığ", value: 23 },
    { title: "Erzincan", value: 24 },
    { title: "Erzurum", value: 25 },
    { title: "Eskişehir", value: 26 },
    { title: "Gaziantep", value: 27 },
    { title: "Giresun", value: 28 },
    { title: "Gümüşhane", value: 29 },
    { title: "Hakkâri", value: 30 },
    { title: "Hatay", value: 31 },
    { title: "Iğdır", value: 76 },
    { title: "Isparta", value: 32 },
    { title: "İstanbul", value: 34 },
    { title: "İzmir", value: 35 },
    { title: "Kahramanmaraş", value: 46 },
    { title: "Karabük", value: 78 },
    { title: "Karaman", value: 70 },
    { title: "Kars", value: 36 },
    { title: "Kastamonu", value: 37 },
    { title: "Kayseri", value: 38 },
    { title: "Kırıkkale", value: 71 },
    { title: "Kırklareli", value: 39 },
    { title: "Kırşehir", value: 40 },
    { title: "Kilis", value: 79 },
    { title: "Kocaeli", value: 41 },
    { title: "Konya", value: 42 },
    { title: "Kütahya", value: 43 },
    { title: "Malatya", value: 44 },
    { title: "Manisa", value: 45 },
    { title: "Mardin", value: 47 },
    { title: "Mersin", value: 33 },
    { title: "Muğla", value: 48 },
    { title: "Muş", value: 49 },
    { title: "Nevşehir", value: 50 },
    { title: "Niğde", value: 51 },
    { title: "Ordu", value: 52 },
    { title: "Osmaniye", value: 80 },
    { title: "Rize", value: 53 },
    { title: "Sakarya", value: 54 },
    { title: "Samsun", value: 55 },
    { title: "Siirt", value: 56 },
    { title: "Sinop", value: 57 },
    { title: "Sivas", value: 58 },
    { title: "Şanlıurfa", value: 63 },
    { title: "Şırnak", value: 73 },
    { title: "Tekirdağ", value: 59 },
    { title: "Tokat", value: 60 },
    { title: "Trabzon", value: 61 },
    { title: "Tunceli", value: 62 },
    { title: "Uşak", value: 64 },
    { title: "Van", value: 65 },
    { title: "Yalova", value: 77 },
    { title: "Yozgat", value: 66 },
    { title: "Zonguldak", value: 67 }
  ];


  return { ideasoft, STATUS_META, PRODUCT_INTEGRATION_STATUS, fastDeliveryTypes, cities, maxPurchaseQuantity, taxPercentage, shippingDuration, desi, warranty, TICKET_TYPE, TICKET_TYPE_DESCRIPTIONS, TICKET_STATUS, TICKET_STATUS_DESCRIPTIONS }
})