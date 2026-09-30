<template>
    <div v-show="false">
        <div id="thermal-label-content" ref="printContent">

            <div class="label-wrapper" v-for="(item, index) in printList" :key="index">
                <div class="label-header">
                    <div class="brand">ENTEGRASYONIK</div>
                    <div class="carrier-name">{{ item?.carrierName }}</div>
                </div>

                <div class="barcode-section">
                    <svg :id="'barcode-' + index"></svg>
                    <div class="tracking-text">{{ item?.trackingCode }}</div>
                </div>

                <div class="info-section">
                    <div class="section-title">ALICI BİLGİLERİ</div>
                    <div class="customer-name">{{ item?.customerName }}</div>
                    <div class="customer-address">
                        {{ item?.fullAddress }}
                        <div class="customer-city">{{ item?.state }} / {{ item?.city }}</div>
                    </div>
                </div>

                <div class="footer-section">
                    <span>Sipariş No: #{{ item?.externalOrderId }}</span>
                    <span class="date">{{ new Date().toLocaleDateString('tr-TR') }}</span>
                </div>
            </div>

        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import JsBarcode from 'jsbarcode';

// Artık tek bir obje değil, yazdırılacaklar listesi tutuyoruz
const printList = ref<any[]>([]);

// Geriye dönük uyumluluk: Tekil yazdırma metodu
const print = async (data: any) => {
    await printBulk([data]); // Tekil veriyi diziye çevirip bulk metoda gönderiyoruz
};

// YENİ: Toplu yazdırma metodu
const printBulk = async (dataArray: any[]) => {
    printList.value = dataArray;

    // DOM'un v-for ile tüm etiketleri oluşturmasını bekle
    await nextTick();

    // Oluşan her bir etiket için barkod SVG'sini çiz
    dataArray.forEach((item, index) => {
        const svgElement = document.getElementById(`barcode-${index}`);
        if (svgElement && item.trackingCode) {
            JsBarcode(svgElement, item.trackingCode, {
                format: "CODE128",
                width: 2,
                height: 60,
                displayValue: false,
                margin: 0
            });
        }
    });

    const printWindow = window.open('', '_blank', 'width=600,height=600');
    if (printWindow) {
        // Tüm etiketlerin HTML'ini tek seferde alıyoruz
        const htmlContent = document.getElementById('thermal-label-content')?.innerHTML || '';

        printWindow.document.write(`
        <html>
          <head>
            <title>Kargo Etiketleri</title>
            <style>
              /* Ayrı yazdırma penceresi: uygulama token'ları yüklü değil; termal etiket her zaman siyah/beyaz. */
              :root { --label-ink: black; --label-paper: white; }
              /* Termal Yazıcı Sayfa Boyutu */
              @page { size: 100mm 100mm; margin: 0; }
              
              /* DİKKAT: overflow: hidden ve sabit height KALDIRILDI. 
                 Çünkü birden fazla sayfanın aşağıya doğru akması gerekiyor. */
              html, body { margin: 0; padding: 0; background: var(--label-paper); }
              body { font-family: 'Courier New', Courier, monospace; box-sizing: border-box; }
              
              .label-wrapper { 
                  width: 100mm; 
                  height: 100mm; 
                  border: 2px solid var(--label-ink); 
                  padding: 5mm; 
                  display: flex; 
                  flex-direction: column; 
                  box-sizing: border-box; 
                  position: relative;
                  overflow: hidden;
                  
                  /* KRİTİK KOD: Her etiketten sonra yazıcıyı YENİ SAYFAYA geçmeye zorlar */
                  page-break-after: always;
                  break-after: page;
              }

              /* Sonuncu etiketten sonra boş sayfa çıkarmasını engeller */
              .label-wrapper:last-child {
                  page-break-after: auto;
                  break-after: auto;
              }
              
              .label-header { border-bottom: 2px solid var(--label-ink); padding-bottom: 2mm; margin-bottom: 3mm; display: flex; justify-content: space-between; align-items: center; }
              .brand { font-weight: bold; font-size: 14pt; }
              .carrier-name { border: 1px solid var(--label-ink); padding: 1mm 2mm; font-size: 10pt; font-weight: bold; }
              
              .barcode-section { text-align: center; margin-bottom: 2mm; }
              .barcode-section svg { width: 90mm; max-height: 25mm; }
              .tracking-text { font-size: 16pt; font-weight: bold; margin-top: 1mm; letter-spacing: 2px; }
              
              .info-section { flex-grow: 1; border-top: 1px dashed var(--label-ink); padding-top: 2mm; overflow: hidden; }
              .section-title { font-size: 8pt; text-decoration: underline; margin-bottom: 1mm; }
              .customer-name { font-size: 12pt; font-weight: bold; margin-bottom: 1mm; }
              .customer-address { font-size: 10pt; line-height: 1.2; }
              .customer-city { font-size: 11pt; line-height: 1.2; font-weight:bold }
              
              .footer-section { 
                  position: absolute; 
                  bottom: 5mm; 
                  left: 5mm; 
                  right: 5mm; 
                  border-top: 1px solid var(--label-ink); 
                  padding-top: 1mm; 
                  font-size: 8pt; 
                  display: flex; 
                  justify-content: space-between; 
              }
            </style>
          </head>
          <body>
            ${htmlContent}
            <script>
              window.onload = function() { 
                // SVG'lerin render olması için çok kısa bir bekleme süresi koyuyoruz
                setTimeout(function() {
                    window.print(); 
                    setTimeout(function() { window.close(); }, 500); 
                }, 100);
              };
            <\/script>
          </body>
        </html>
      `);
        printWindow.document.close();
    }
};

// Dışarıya hem tekil hem de toplu yazdırma fonksiyonunu açıyoruz
defineExpose({ print, printBulk });
</script>

<style scoped>
/* Buradaki stiller sadece Vue componentinin içinde kalır, yazıcıyı etkilemez. 
   Yazıcı stilleri yukarıdaki template literal (printWindow) içindedir. */
</style>