import { ref, reactive, computed } from 'vue'

export default function usePriceCalculator() {
  //TODO COMMISSION VE PROFITRATE AYALANABİLIR OLMALI
  const calculatePrices = (price: any, commission: any=10, discountRate: any=5,shipping:any=50, taxPercentage: any=15 ) => {
    const taxAmount = price * (taxPercentage / 100)
    const commissionAmount = price * (commission / 100)
    const discountAmount = price * (discountRate / 100)

    let salePrice = price + taxAmount + commissionAmount - discountAmount
    return { salePrice }
  }
  return {
    calculatePrices
  }
}