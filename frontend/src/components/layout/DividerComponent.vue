<template>
    <div class="premium-divider">
        <div class="divider-line"></div>
        <div class="divider-dot"></div>
        <div class="divider-line"></div>
    </div>
</template>

<style scoped>
.premium-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--ek-space-6) 0;
    /* Bölümler arası boşluk */
    gap: var(--ek-space-4);
    width: 100%;
}

.divider-line {
    height: 1px;
    flex: 1;
    background: linear-gradient(90deg, transparent, var(--ek-color-border-subtle) 50%, transparent);
}

.divider-dot {
    width: 6px;
    height: 6px;
    background: var(--ek-color-content-muted);
    /* Dashboard ana rengin */
    border-radius: 50%;
    opacity: 0.4;
}
</style>