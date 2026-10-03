
const tourConfigs = {
    homepage: [
        {
            element: '#tour-homepage-menu',
            popover: {
                title: 'Menü',
                description: 'Buradan menüyü açabilirsiniz.',
            },
        },
        {
            element: '#tour-homepage-smartsearch',
            popover: {
                title: 'Akıllı Arama',
                description: 'Ürünleri, siparişleri vs aramam için kullanabilirsiniz.',
            },
        },
        {
            element: '#tour-homepage-topmenu',
            popover: {
                title: 'Üst Menü',
                description: 'Sık kullanılan menü bağlantıları.',
            },
        },
        {
            element: '#tour-homepage-tabs',
            popover: {
                title: 'Sayfa Sekmeleri',
                description: 'Açılan sayfalar arasında dolaşabilirsiniz.',
            },
        },
        {
            element: '#tour-homepage-workarea',
            popover: {
                title: 'Çalışma Alanı',
                description: 'İşlemlerinizi yapacağınız alan.',
            },
        },
    ],
    variants: [
        {
            element: '#myfeature-1',
            popover: {
                title: 'Gösterge Paneli',
                description: 'Burası tüm verilerinizin özeti.',
            },
        },
        {
            element: '#myfeature-2',
            popover: {
                title: 'Grafikler',
                description: 'Trendleri buradan takip edin.',
            },
        },
        {
            element: '#myfeature-3',
            popover: {
                title: 'Grafikler',
                description: 'Trendleri buradan takip edin.',
            },
        },
    ],
};


import * as Driver from 'driver.js';
import 'driver.js/dist/driver.css';

export function useOnboarding() {
    let tour: any;
    let autoStepTimer: ReturnType<typeof setTimeout> | null = null;
    const autoAdvanceDelay = 2000; // 2 saniye

    const startTour = (tourName: keyof typeof tourConfigs, isAuto: boolean = false) => {
        const steps = tourConfigs[tourName];
        if (!steps) {
            console.warn(`"${tourName}" turu bulunamadı.`);
            return;
        }

        if (!isAuto) {
            // Manuel Tur
            tour = Driver.driver({
                smoothScroll: true,
                stagePadding: 0,
                stageRadius: 5,
                disableActiveInteraction: true,
                popoverOffset: 10,
                showProgress: true,
                doneBtnText: 'Bitti',
                nextBtnText: 'İleri',
                prevBtnText: 'Geri',
                steps,
            });
            tour.drive();
        } else {
            // Otomatik Tur
            let currentIndex = 0;

            const showStep = (index: number) => {
                if (tour) {
                    tour.destroy(); // önceki adımı kaldır
                }

                tour = Driver.driver({
                    smoothScroll: true,
                    stagePadding: 0,
                    stageRadius: 5,
                    disableActiveInteraction: true,
                    popoverOffset: 10,
                    showProgress: true,
                    doneBtnText: 'Bitti',
                    nextBtnText: 'İleri',
                    prevBtnText: 'Geri',
                    steps: [steps[index]],
                });

                tour.drive();

                if (index < steps.length - 1) {
                    autoStepTimer = setTimeout(() => showStep(index + 1), autoAdvanceDelay);
                } else {
                    // Son adımda bir süre sonra turu kapat
                    autoStepTimer = setTimeout(() => tour.destroy(), autoAdvanceDelay);
                }
            };

            showStep(currentIndex);
        }
    };

    return { startTour };
}
