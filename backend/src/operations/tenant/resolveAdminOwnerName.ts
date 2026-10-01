/**
 * Yönetici panelinde mağaza oluşturma: FE (AdminClientCreateComponent) ad/soyad yerine `fullName` gönderebilir —
 * son sözcük soyad, kalanı ad. Açıkça verilen `name`/`surname` her zaman önceliklidir.
 */
export function resolveAdminOwnerName(userData: { name?: any; surname?: any; fullName?: any }): { name: any; surname: any } {
    let name = userData.name
    let surname = userData.surname
    if ((name === undefined || surname === undefined) && typeof userData.fullName === 'string') {
        const parts = userData.fullName.trim().split(/\s+/).filter(Boolean)
        if (parts.length >= 2) {
            surname = surname ?? parts[parts.length - 1]
            name = name ?? parts.slice(0, -1).join(' ')
        } else if (parts.length === 1) {
            name = name ?? parts[0]
        }
    }
    return { name, surname }
}
