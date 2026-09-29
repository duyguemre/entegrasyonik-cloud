
export default (productId: number) => {
    const turkiyeKod = 294
    const manufacturerCode = 2000 //TODO MAĞAZA KODU OLACAK
    const productCode: any = generateProductCode(productId)
    var barcode: string = "" + turkiyeKod + manufacturerCode + productCode
    return barcode + calculateEAN13CheckDigit(barcode)
}
 

const generateProductCode = (number: number) => {
    if (number < 1 || number > 99999) {
        throw new Error("Ürün kodu 1 ile 99999 arasında bir değer olmalıdır.");
    }

    // Number'ı stringe çeviriyoruz
    let productCode = number.toString();

    // 3 haneye tamamlamak için başına sıfır ekliyoruz
    while (productCode.length < 5) {
        productCode = '0' + productCode;
    }

    return productCode;
}

const calculateEAN13CheckDigit = (code: any) => {
    if (code.length !== 12) {
        throw new Error("EAN-13 barkodunun kontrol hanesi hesaplanmadan önce 12 haneden oluşması gerekir.");
    }

    let sum = 0;

    // Haneleri tek ve çift pozisyonlarına göre topluyoruz.
    for (let i = 0; i < 12; i++) {
        let digit = parseInt(code[i]);

        // Çift pozisyonlardaki haneleri 3 ile çarp
        if (i % 2 === 1) {
            sum += digit * 3;
        } else {
            // Tek pozisyonlardaki haneleri doğrudan ekle
            sum += digit;
        }
    }

    // Toplamı en yakın 10'un katına yuvarla ve farkı hesapla
    let checkDigit = (10 - (sum % 10)) % 10;

    return checkDigit;
}