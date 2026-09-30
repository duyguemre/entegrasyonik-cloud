
import { defineStore } from 'pinia'

/** E-fatura sağlayıcılarının ölçülmüş marka rengi yok → nötr rol (C1; önceden uydurma `info` mavisiydi). */
const NEUTRAL_MARK = 'var(--ek-color-neutral)'

const einvoices: any = []
const einvoiceNames: any = []
var init = () => {
    einvoiceNames.push('trendyolefaturam')
    einvoiceNames.push('turkcellesirket')
    einvoiceNames.push('elogo')
    einvoiceNames.push('geliridaresi')

    einvoices.push({
        code: 'trendyolefaturam',
        color: NEUTRAL_MARK,
        logo: '/assets/images/integrations/einvoice/trendyolefaturam.svg',
        width: 120
    })
    einvoices.push({
        code: 'turkcellesirket',
        color: NEUTRAL_MARK,
        logo: '/assets/images/integrations/einvoice/turkcellesirket.svg',
        width: 200
    }
    )
    einvoices.push({
        code: 'elogo',
        color: NEUTRAL_MARK,
        logo: '/assets/images/integrations/einvoice/elogo.svg',
        width: 100
    }
    )
    einvoices.push({
        code: 'geliridaresi',
        color: NEUTRAL_MARK,
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