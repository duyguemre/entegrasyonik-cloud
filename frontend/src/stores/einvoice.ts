
import { defineStore } from 'pinia'

const einvoices: any = []
const einvoiceNames: any = []
var init = () => {
    einvoiceNames.push('trendyolefaturam')
    einvoiceNames.push('turkcellesirket')
    einvoiceNames.push('elogo')
    einvoiceNames.push('geliridaresi')

    einvoices.push({
        code: 'trendyolefaturam',
        color: '#69b6ff',
        logo: '/assets/images/integrations/einvoice/trendyolefaturam.svg',
        width: 120
    })
    einvoices.push({
        code: 'turkcellesirket',
        color: '#69b6ff',
        logo: '/assets/images/integrations/einvoice/turkcellesirket.svg',
        width: 200
    }
    )
    einvoices.push({
        code: 'elogo',
        color: '#69b6ff',
        logo: '/assets/images/integrations/einvoice/elogo.svg',
        width: 100
    }
    )
    einvoices.push({
        code: 'geliridaresi',
        color: '#69b6ff',
        logo: '/assets/images/integrations/einvoice/geliridaresi.svg',
        width: 100
    }
    )
}

export default function useEInvoiceStore() {
/*     export const useEInvoiceStore = defineStore('einvoice', () => {
 */    


    var getEInvoice = (marketPlaceName: string) => {
        if (einvoices.length == 0)
            init()
        if (!einvoices) return {}
        let temp = einvoices.filter((element: any) => element.code == marketPlaceName)
        if (temp && temp.length > 0) return temp[0]
    }
    var getEInvoices = () => {
        if (einvoices.length == 0)
            init()
        return einvoices
    }

    var getEInvoiceNames = () => {
        if (einvoiceNames.length == 0)
            init()
        return einvoiceNames
    }

    return { getEInvoice, getEInvoices, getEInvoiceNames }
}