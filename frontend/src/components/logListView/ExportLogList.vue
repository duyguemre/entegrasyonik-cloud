<template>
  <div class="exportLogList d-flex flex-column" style="margin-top:55px">
    <ActionDialogComponent v-model="reportInfo.isOpen" title="Pazaryeri Gönderim Detaylı Raporu"
      subtitle="İşlem Günlüğü ve Akış Analizi" icon="mdi-rocket-launch" color="primary" maxWidth="1200"
      :showFooter="false" attach=".exportLogList">
      <keep-alive>
        <DetailedExportLogReport :jobId="reportInfo.jobId || ''" @close="reportInfo.isOpen = false"
          style="transition: opacity var(--ek-duration-base) var(--ek-easing-standard)!important" />
      </keep-alive>
    </ActionDialogComponent>

    <ConfirmationDialogComponent v-model="confirmationDelete.isDialogOpen"
      :title="confirmationDelete.mode === 'single' ? 'KAYIT SİLİNECEK' : 'SEÇİLENLER SİLİNECEK'"
      :message="confirmationDelete.mode === 'single' ? 'Bu işlem kaydını silmek istediğinizden emin misiniz?' : `${validSelectedJobsCount} adet kayıt silinecek. Emin misiniz?`"
      icon="mdi-delete-alert-outline" color="error" confirmText="SİL" cancelText="İPTAL" attach=".exportLogList"
      @confirm="confirmDelete()" @cancel="cancelDelete()" />

    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <div class="d-flex pa-2 pt-2 pb-0 mt-1 mb-1 align-start flex-wrap search-section"
      style="max-width:1000px; gap: var(--ek-space-2);">
      <v-text-field clearable density="compact" label="Ürün Adı, Barkod, Stok Kodu veya Platform Ara" variant="outlined"
        v-model="searchJobId" bg-color="textfieldColor" class="customTextField flex-grow-1" hide-details
        @keyup.enter.stop="getJobs(true)" @click:clear="searchJobId = ''; getJobs(true)">
        <template #append-inner>
          <v-tooltip open-delay="1000" :text="$t('products.product.search')">
            <template v-slot:activator="{ props: tooltipProps }">
              <v-btn flat size="40" v-bind="{ ...tooltipProps }" class="pa-2" elevation="0"
                style="border:1px solid white" color="white" @click.stop="getJobs(true)"
                aria-label="Gönderim kayıtlarında ara"><v-icon size="x-large"
                  color="processButtonColor">mdi-magnify</v-icon></v-btn>
            </template>
          </v-tooltip>
        </template>
      </v-text-field>

      <div class="d-flex align-start flex-wrap" style="gap: var(--ek-space-2);">
        <v-menu v-model="startDateMenuInline" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedStartDate" label="Başlangıç" variant="outlined" density="compact"
              bg-color="white" prepend-inner-icon="mdi-calendar-start" hide-details readonly clearable
              @click:clear="searchExportLogForm.data.startDate = undefined" v-bind="props" class="customTextField"
              style="min-width: 160px;align-self:start"></v-text-field>
          </template>
          <v-card class="rounded-lg">
            <!-- GİZLİ DAVRANIŞ (BACKLOG.md, ADR-0011 Karar 5): `loginColor` hiçbir
                 temada tanımlı bir Vuetify anahtarı DEĞİL; tarih seçici zemini
                 bugün de "unset" kalıyor. Davranış BİLİNÇLİ OLARAK korunuyor —
                 `--ek-color-login-color` de kasıtlı olarak tanımsız bırakıldı
                 (legacy.ts'e eklenmedi, OrderListView/ClaimListView/... ile AYNI karar). -->
            <v-date-picker v-model="searchExportLogForm.data.startDate" :max="searchExportLogForm.data.endDate"
              hide-header locale="tr" color="passiveColor" @update:model-value="startDateMenuInline = false"
              style="background-color: var(--ek-color-login-color)!important;" show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <v-menu v-model="endDateMenuInline" :close-on-content-click="false">
          <template v-slot:activator="{ props }">
            <v-text-field :model-value="formattedEndDate" label="Bitiş" variant="outlined" density="compact"
              bg-color="white" prepend-inner-icon="mdi-calendar-end" hide-details readonly clearable
              @click:clear="searchExportLogForm.data.endDate = undefined" v-bind="props" class="customTextField"
              style="min-width: 160px;align-self:start"></v-text-field>
          </template>
          <v-card class="rounded-lg">
            <v-date-picker v-model="searchExportLogForm.data.endDate" :min="searchExportLogForm.data.startDate"
              hide-header locale="tr" color="passiveColor"
              style="background-color: var(--ek-color-login-color)!important;"
              @update:model-value="endDateMenuInline = false" show-adjacent-months></v-date-picker>
          </v-card>
        </v-menu>

        <v-tooltip open-delay="4000" text="Gelişmiş arama ve filtreleme seçenekleri">
          <template v-slot:activator="{ props: tooltipProps }">
            <v-btn v-bind="tooltipProps" size="40" color="white" flat class="premium-cube-btn"
              style="border:1px solid var(--ek-color-border-color);" @click="searchExportLogForm.form.menu = true"
              aria-label="Gelişmiş arama ve filtreleme seçenekleri">
              <v-icon size="x-large" color="passiveColor">mdi-filter-variant</v-icon>
            </v-btn>
          </template>
        </v-tooltip>

        <ActionDialogComponent v-model="searchExportLogForm.form.menu" title="Gelişmiş Sorgulama Paneli"
          subtitle="Filtreleme ve Arama Seçenekleri" icon="mdi-layers-search" color="passiveColor"
          confirmText="SONUÇLARI GÖSTER" cancelText="TEMİZLE" maxWidth="750px" :attach="dialogAttach"
          @confirm="advancedSearchJobs(true)" @cancel="resetSearchExportLogForm()">
          <v-form v-model="searchExportLogForm.form.valid" @submit.prevent="advancedSearchJobs(true)">
            <v-row dense>
              <v-col cols="12" class="mb-4">
                <div class="section-title">Tarih & Zaman Bilgileri</div>
                <v-row dense>
                  <v-col cols="12" sm="6">
                    <v-menu v-model="startDateMenuAdvanced" :close-on-content-click="false">
                      <template v-slot:activator="{ props }">
                        <v-text-field :model-value="formattedStartDate" label="Başlangıç Tarihi" variant="outlined"
                          density="compact" bg-color="white" prepend-inner-icon="mdi-calendar-start" hide-details
                          readonly clearable @click:clear="searchExportLogForm.data.startDate = undefined"
                          v-bind="props" class="customTextField"></v-text-field>
                      </template>
                      <v-card class="rounded-lg">
                        <v-date-picker v-model="searchExportLogForm.data.startDate"
                          :max="searchExportLogForm.data.endDate" hide-header locale="tr" color="passiveColor"
                          @update:model-value="startDateMenuAdvanced = false" show-adjacent-months></v-date-picker>
                      </v-card>
                    </v-menu>
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-menu v-model="endDateMenuAdvanced" :close-on-content-click="false">
                      <template v-slot:activator="{ props }">
                        <v-text-field :model-value="formattedEndDate" label="Bitiş Tarihi" variant="outlined"
                          density="compact" bg-color="white" prepend-inner-icon="mdi-calendar-end" hide-details readonly
                          clearable @click:clear="searchExportLogForm.data.endDate = undefined" v-bind="props"
                          class="customTextField"></v-text-field>
                      </template>
                      <v-card class="rounded-lg">
                        <v-date-picker v-model="searchExportLogForm.data.endDate"
                          :min="searchExportLogForm.data.startDate" hide-header locale="tr" color="passiveColor"
                          @update:model-value="endDateMenuAdvanced = false" show-adjacent-months></v-date-picker>
                      </v-card>
                    </v-menu>
                  </v-col>
                </v-row>
              </v-col>

              <v-col cols="12" class="mb-4">
                <div class="section-title">Ürün & Kimlik Bilgileri</div>
                <v-row dense>
                  <v-col cols="12">
                    <v-text-field v-model="searchExportLogForm.data.title" label="Ürün Adı" variant="outlined"
                      density="compact" bg-color="white" prepend-inner-icon="mdi-format-title" hide-details
                      class="mb-2 customTextField"></v-text-field>
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-text-field v-model="searchExportLogForm.data.barcode" label="Barkod" variant="outlined"
                      density="compact" bg-color="white" prepend-inner-icon="mdi-barcode-scan" hide-details
                      class="customTextField"></v-text-field>
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-text-field v-model="searchExportLogForm.data.stockcode" label="Stok Kodu" variant="outlined"
                      density="compact" bg-color="white" prepend-inner-icon="mdi-identifier" hide-details
                      class="customTextField"></v-text-field>
                  </v-col>

                  <v-col cols="12" sm="6" v-for="(choice, index) in choicesStore.choices" :key="index">
                    <v-select v-model="searchExportLogForm.data.selectedChoices[choice._id || index]"
                      :items="choice.values || choice.options" item-title="title" item-value="_id" :label="choice.title"
                      variant="outlined" density="compact" bg-color="grey-lighten-5"
                      prepend-inner-icon="mdi-vector-selection" hide-details clearable
                      class="mt-2 customTextField"></v-select>
                  </v-col>
                </v-row>
              </v-col>

              <v-col cols="12" class="mb-4">
                <div class="section-title">Sınıflandırma & Kategori</div>
                <v-row dense>
                  <v-col cols="12" sm="6">
                    <CategorySelectBoxComponent v-model="searchExportLogForm.data.category" :withAll="false" noInit />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <BrandSelectBoxComponent v-model="searchExportLogForm.data.brand" :withAll="false" noInit />
                  </v-col>
                </v-row>
              </v-col>

              <v-col cols="12">
                <div class="section-title">Platform & İşlem Bilgileri</div>
                <v-row dense>
                  <v-col cols="12" sm="6">
                    <v-select v-model="searchExportLogForm.data.integrationCode"
                      :items="integrationStore.getClientPlatforms()" item-title="title" item-value="code"
                      label="Platform Seçiniz" variant="outlined" density="compact" prepend-inner-icon="mdi-storefront"
                      hide-details clearable multiple chips class="customTextField"></v-select>
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-select v-model="searchExportLogForm.data.mode" :items="processMenuItems" label="İşlem Tipi"
                      item-value="id" variant="outlined" density="compact" prepend-inner-icon="mdi-swap-horizontal"
                      hide-details clearable class="customTextField"></v-select>
                  </v-col>

                  <v-col cols="12" class="mt-3">
                    <div class="text-caption font-weight-black mb-2 text-grey-darken-1">İşlem Durumları</div>
                    <v-select v-model="searchExportLogForm.data.statuses" :items="statusOptions" item-title="title"
                      item-value="id" label="Durum Seçiniz" variant="outlined" density="compact"
                      prepend-inner-icon="mdi-list-status" hide-details clearable multiple chips
                      bg-color="grey-lighten-5" class="customTextField"></v-select>
                  </v-col>
                </v-row>
              </v-col>
            </v-row>
          </v-form>
        </ActionDialogComponent>

        <v-tooltip open-delay="1000" text="Yenile">
          <template v-slot:activator="{ props: tooltipProps }">
            <v-btn-group v-bind="{ ...tooltipProps }" elevation="0">
              <v-btn @click="handlePageChange()" size="40" color="white" class="premium-cube-btn"
                style="border:1px solid var(--ek-color-border-color);" aria-label="Listeyi yenile">
                <v-icon size="x-large" color="processButtonColor">mdi-refresh</v-icon>
              </v-btn>
            </v-btn-group>
          </template>
        </v-tooltip>


        <v-tooltip v-if="validSelectedJobsCount > 0" open-delay="1000" text="Seçili Ürünleri Silmek İçin Tıklayınız">
          <template v-slot:activator="{ props: tooltipProps }">
            <v-badge :content="validSelectedJobsCount" color="error" overlap>
              <v-btn @click="openDeleteConfirm($event, 'batch')" size="40" class="premium-cube-btn" flat color="danger"
                style="align-self: start;" aria-label="Seçili kayıtları sil">
                <v-icon size="x-large" color="white">mdi-delete</v-icon>
              </v-btn>
            </v-badge>
          </template>
        </v-tooltip>



        <div v-if="$vuetify.display.smAndDown" class="w-100 mt-2">
          <v-select v-model="sortBy[0]" :items="[
            { title: 'Zaman: En Yeni', value: { key: 'createdAt', order: 'desc' } },
            { title: 'Zaman: En Eski', value: { key: 'createdAt', order: 'asc' } },
            { title: 'Fiyat: Artan', value: { key: 'price', order: 'asc' } },
            { title: 'Fiyat: Azalan', value: { key: 'price', order: 'desc' } },
            { title: 'Ürün Adı: A-Z', value: { key: 'title', order: 'asc' } },
            { title: 'Ürün Adı: Z-A', value: { key: 'title', order: 'desc' } }
          ]" item-title="title" item-value="value" label="İşlem Sıralama" variant="outlined" density="compact"
            hide-details class="customTextField" prepend-inner-icon="mdi-sort-variant"
            @update:model-value="handlePageChange()">
          </v-select>
        </div>
      </div>
    </div>

    <div class="table-wrapper">
      <v-data-table-server v-if="$vuetify.display.mdAndUp" v-model="selectedJobs" v-model:sort-by="sortBy"
        item-value="_id" :loading="loading" :itemsLength="pagination.totalNumberOfRecords" :items="jobs" fixed-header
        :headers="headers" class="pa-0 ma-0 custom-table desktop-table" show-select @update:sortBy="onSortUpdate"
        aria-label="Gönderim işlemleri tablosu">

        <!-- ADR-0011 Karar 2 KAPSAM ("eksik boş/hata/yükleniyor durumlarını tamamla") —
             bu slot YOKTU, Vuetify'ın "tr" locale varsayılanı ("Bu görünümde veri yok.")
             görünüyordu (mobil dalın kendi eksik durumuyla tutarsız). ClaimListView/
             CustomerListView/InvoiceListView/MessageListView (T4f) ile AYNI EmptyState
             deseniyle TAMAMLANDI — iş mantığı (veri çekme/filtreleme) DEĞİŞMEDİ, yalnızca
             eksik görsel durum eklendi (bkz. BACKLOG.md, e2e/specs/logs.spec.ts). -->
        <template v-slot:no-data>
          <EmptyState title="Gönderim Kaydı Bulunamadı" message="Arama kriterlerinize uygun herhangi bir gönderim kaydı bulunamadı." />
        </template>

        <template v-slot:item="{ item }: any">
          <tr>
            <td><v-checkbox-btn :model-value="isJobSelected(item)" color="passiveColor" class=""
                @update:model-value="val => onJobSelectionUpdate(item, !!val)" density="compact"
                aria-label="Gönderim kaydını seç"></v-checkbox-btn></td>

            <td class="text-left py-2">
              <div class="d-flex align-center">
                <v-avatar rounded size="75" color="grey-lighten-4" class="mr-3 border">
                  <v-img :src="item.image" cover>
                    <template v-slot:placeholder><v-icon color="grey-lighten-2"
                        size="75">mdi-image-outline</v-icon></template>
                  </v-img>
                </v-avatar>
                <div class="d-flex flex-column" style="max-width: 300px;">
                  <span class="font-weight-bold text-truncate text-body-2 text-grey-darken-3">{{ item.title }}</span>
                  <div class="d-flex align-center mt-1 text-caption text-grey-darken-1 flex-wrap" style="gap: var(--ek-space-2);">
                    <span class="d-flex align-center"><v-icon size="12" class="mr-1">mdi-barcode</v-icon>{{ item.barcode
                    }}</span>
                    <span class="d-flex align-center" v-if="item.stockcode != undefined">
                      <v-icon size="12" class="mr-1">mdi-identifier</v-icon>{{ item.stockcode }}
                    </span>
                    <div class="d-flex flex-wrap" style="gap:var(--ek-space-1)" v-if="item.choices && item.choices.length > 0">
                      <v-chip v-for="choice in item.choices" :key="choice._id" size="small" variant="flat"
                        density="compact" color="grey-lighten-4" class="px-2 py-2 border border-grey-lighten-2">
                        <span class="text-grey-darken-1 mr-1" style="font-size: 9px">{{ choice.choiceTitle }}</span>
                        <span class="font-weight-black text-grey-darken-4" style="font-size: 11px">{{
                          choice.choiceValueTitle
                        }}</span>
                      </v-chip>
                    </div>
                  </div>
                </div>
              </div>
            </td>

            <td class="text-right py-2" style="min-width: 140px;">
              <div class="d-flex flex-column align-end" style="gap: 6px;">
                <div v-if="item.price" class="d-flex align-center">
                  <span class="price-amount-mobile" style="font-size: var(--ek-font-size-sm);">{{ item.price }} TL</span>
                </div>
                <div v-if="item.stock != undefined" class="d-flex align-center">
                  <v-chip size="x-small" color="success" variant="tonal" class="font-weight-bold px-2"
                    style="height: 20px; font-size: 10px !important; letter-spacing: 0.5px;">
                    {{ item.stock }} STOK
                  </v-chip>
                </div>
              </div>
            </td>

            <td class="text-center">
              <div class="d-flex align-center justify-center">

                <PlatformImageComponent :integrationCode="item.integrationCode" :width="80" :height="35" class="mr-4">
                </PlatformImageComponent>

                <div class="premium-status-capsule d-flex align-center pa-1 pr-3 rounded-pill shadow-sm">


                  <!--                   <v-chip size="x-small" :color="getPlatformColor(item.integrationCode)" variant="flat"
                    class="platform-badge text-white font-weight-black px-3 rounded-pill elevation-1 mr-2">
                    {{ item.integrationCode?.toUpperCase() }}
                  </v-chip>
 -->
                  <div class="d-flex align-center" style="gap: 10px;">
                    <div class="mode-badge-minimal d-flex align-center"
                      :style="{ '--mode-color': getModeColor(item.mode) }">
                      <span class="status-dot-static mr-1" :style="{ backgroundColor: getModeColor(item.mode) }"></span>
                      <span class="mode-text-premium">{{ PLATFORM_PROCESS_LABELS[item.mode as PLATFORM_PROCESS]
                        }}</span>
                    </div>

                    <v-divider vertical class="mx-1" length="12" style="opacity: 0.2;"></v-divider>

                    <div class="d-flex align-center" style="gap: 6px;">
                      <v-icon v-if="!isDeletable(item)" size="12" :color="getStatusColor(item.status)" class="mdi-spin">
                        mdi-loading
                      </v-icon>

                      <span class="status-text-premium font-weight-black text-uppercase"
                        :class="[!isDeletable(item) ? 'premium-pulse-text' : '']"
                        :style="{ color: getStatusColor(item.status) }">
                        {{ translateStatus(item.status) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </td>

            <td class="text-left py-3" style="min-width: 170px;">
              <div class="d-flex flex-column" style="gap: 10px;">
                <div class="d-flex align-center">
                  <div class="d-flex flex-column">
                    <span class="text-grey-darken-1 font-weight-black"
                      style="font-size: 8px; text-transform: uppercase; line-height: 1; margin-bottom: 2px;">Başlangıç</span>
                    <span style="font-size: 11px; line-height: 1;" class="text-grey-darken-4"
                      v-html="formatDate(item.createdAt)"></span>
                  </div>
                </div>
                <div class="d-flex align-center">
                  <div class="d-flex flex-column">
                    <span class="text-grey-darken-1 font-weight-black"
                      style="font-size: 8px; text-transform: uppercase; line-height: 1; margin-bottom: 2px;">Bitiş</span>
                    <span style="font-size: 11px; line-height: 1;" class="text-grey-darken-4"
                      v-html="item.completedAt ? formatDate(item.completedAt) : '<span class=\'text-grey-lighten-1 font-weight-medium\'>Devam Ediyor...</span>'"></span>
                  </div>
                </div>
              </div>
            </td>

            <td>
              <div class="d-flex justify-end pr-1">
                <v-btn flat size="35" color="white" variant="flat" @click="openDetailedReport(item)"
                  class="mr-2 premium-cube-btn" aria-label="Gönderim detaylarını görüntüle"><v-icon size="x-large"
                    color="passiveColor">mdi-eye-outline</v-icon></v-btn>
                <v-btn flat size="35" color="danger" variant="flat" :disabled="!isDeletable(item)"
                  class="premium-cube-btn" @click="openDeleteConfirm($event, 'single', item)"
                  aria-label="Gönderim kaydını sil"><v-icon
                    size="x-large">mdi-delete</v-icon></v-btn>
              </div>
            </td>
          </tr>
        </template>

        <template v-slot:bottom>
          <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
            @setPage="handlePageChange" v-model="pagination.page" style="position:relative;border-top:1px solid #ddd" />
        </template>
      </v-data-table-server>

      <div v-else class="mobile-container pa-2 overflow-y-auto">
        <EmptyState v-if="!jobs.length" title="Gönderim Kaydı Bulunamadı" message="Arama kriterlerinize uygun herhangi bir gönderim kaydı bulunamadı." />
        <v-card v-for="item in jobs" :key="item._id" class="mb-4 rounded-lg border shadow-sm" elevation="0">
          <div class="pa-3 border-bottom d-flex align-center justify-space-between bg-white">
            <div class="d-flex align-center flex-wrap" style="gap: 6px;">
              <v-checkbox-btn :model-value="isJobSelected(item)"
                @update:model-value="val => onJobSelectionUpdate(item, !!val)" density="compact"
                class="mr-n2" aria-label="Gönderim kaydını seç"></v-checkbox-btn>
            </div>

            <div class="d-flex align-center justify-center">
              <PlatformImageComponent :integrationCode="item.integrationCode" :width="80" :height="35" class="mr-4">
              </PlatformImageComponent>
              <div class="premium-status-capsule d-flex align-center pa-1 pr-3 rounded-pill shadow-sm">

                <!--                 <v-chip size="x-small" :color="getPlatformColor(item.integrationCode)" variant="flat"
                  class="platform-badge text-white font-weight-black px-3 rounded-pill elevation-1 mr-2">
                  {{ item.integrationCode?.toUpperCase() }}
                </v-chip> -->
                <div class="d-flex align-center" style="gap: 10px;">
                  <div class="mode-badge-minimal d-flex align-center"
                    :style="{ '--mode-color': getModeColor(item.mode) }">
                    <span class="status-dot-static mr-1" :style="{ backgroundColor: getModeColor(item.mode) }"></span>
                    <span class="mode-text-premium">{{ PLATFORM_PROCESS_LABELS[item.mode as PLATFORM_PROCESS] }}</span>
                  </div>
                  <v-divider vertical class="mx-1" length="12" style="opacity: 0.2;"></v-divider>
                  <div class="d-flex align-center" style="gap: 6px;">
                    <v-icon v-if="!isDeletable(item)" size="12" :color="getStatusColor(item.status)" class="mdi-spin">
                      mdi-loading
                    </v-icon>
                    <span class="status-text-premium font-weight-black text-uppercase"
                      :class="[!isDeletable(item) ? 'premium-pulse-text' : '']"
                      :style="{ color: getStatusColor(item.status) }">
                      {{ translateStatus(item.status) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <v-card-text class="pa-3 bg-workspaceColor">
            <div class="d-flex align-start mb-4">
              <v-avatar rounded size="120" color="grey-lighten-4" class="mr-3 border flex-shrink-0">
                <v-img :src="item.image" cover />
              </v-avatar>

              <div class="d-flex flex-column overflow-hidden">
                <div class="font-weight-bold text-body-2 mb-1 text-grey-darken-3 text-truncate">{{ item.title }}</div>

                <div class="d-flex flex-column" style="gap: 2px;">
                  <div class="text-caption text-grey-darken-2 d-flex align-center">
                    <v-icon size="12" class="mr-1">mdi-barcode</v-icon> {{ item.barcode }}
                  </div>
                  <div v-if="item.stockcode != undefined" class="text-caption text-grey-darken-2 d-flex align-center">
                    <v-icon size="12" class="mr-1">mdi-identifier</v-icon> {{ item.stockcode }}
                  </div>
                </div>

                <div class="d-flex flex-wrap mt-2" style="gap:var(--ek-space-1)" v-if="item.choices && item.choices.length > 0">
                  <v-chip v-for="choice in item.choices" :key="choice._id" size="x-small" variant="flat"
                    density="compact" color="white" class="px-2 py-1 border border-grey-lighten-2">
                    <span class="text-grey-darken-1 mr-1" style="font-size: 8px">{{ choice.choiceTitle }}</span>
                    <span class="font-weight-black text-grey-darken-4" style="font-size: 10px">{{
                      choice.choiceValueTitle
                    }}</span>
                  </v-chip>
                </div>

                <div class="d-flex flex-wrap align-center mt-3" style="gap: 6px;">
                  <div v-if="item.price" class="price-wrapper-mobile">
                    <v-icon size="10" color="indigo-darken-2" class="mr-1">mdi-tag-outline</v-icon>
                    <span class="price-amount-mobile">{{ item.price }}
                      TL</span>
                  </div>
                  <v-chip v-if="item.stock != undefined" size="x-small" color="success" variant="tonal"
                    class="font-weight-black" style="height: 18px;">
                    {{ item.stock }} Adet
                  </v-chip>
                </div>
              </div>
            </div>

            <div class="d-flex justify-space-between mb-3 px-3 py-3 bg-white rounded-lg border shadow-sm">
              <div class="d-flex align-center">
                <v-avatar size="28" color="blue-lighten-5" class="mr-2 border border-blue-lighten-3">
                  <v-icon size="16" color="blue-darken-2">mdi-clock-start</v-icon>
                </v-avatar>
                <div class="d-flex flex-column">
                  <span class="text-grey-darken-1 font-weight-black"
                    style="font-size: 9px; text-transform: uppercase;">Başlangıç</span>
                  <span style="font-size: 11px;" class="font-weight-medium text-grey-darken-4"
                    v-html="formatDate(item.createdAt)"></span>
                </div>
              </div>
              <v-divider vertical class="mx-2"></v-divider>
              <div class="d-flex align-center">
                <div class="d-flex flex-column text-right mr-2">
                  <span class="text-grey-darken-1 font-weight-black"
                    style="font-size: 9px; text-transform: uppercase;">Bitiş</span>
                  <span style="font-size: 11px;" class="font-weight-medium text-grey-darken-4"
                    v-html="item.completedAt ? formatDate(item.completedAt) : 'Devam...'"></span>
                </div>
                <v-avatar size="28" color="teal-lighten-5" class="border border-teal-lighten-3">
                  <v-icon size="16" color="teal-darken-2">mdi-flag-checkered</v-icon>
                </v-avatar>
              </div>
            </div>

            <div class="d-flex justify-end align-center mt-2 pt-2 border-top">
              <div class="d-flex" style="gap: var(--ek-space-2);">
                <v-btn flat size="35" color="passiveColor" variant="outlined" @click="openDetailedReport(item)"
                  aria-label="Gönderim detaylarını görüntüle"><v-icon
                    size="x-large">mdi-eye-outline</v-icon></v-btn>
                <v-btn flat size="35" color="danger" variant="flat" :disabled="!isDeletable(item)"
                  @click="openDeleteConfirm($event, 'single', item)" aria-label="Gönderim kaydını sil"><v-icon size="x-large">mdi-delete</v-icon></v-btn>
              </div>
            </div>
          </v-card-text>
        </v-card>
        <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
          @setPage="handlePageChange" v-model="pagination.page" :static="true" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive, computed } from 'vue'
import useRestApi from '@/composables/restapi'
import LoadingComponent from '@/components/LoadingComponent.vue'
import PaginationComponent from '@/components/PaginationComponent.vue'
import DetailedExportLogReport from '@/components/logListView/DetailedExportLogReport.vue'
import { useSnackbarStore } from '@/stores/snackbarStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useChoicesStore } from '@/stores/choicesStore'
import CategorySelectBoxComponent from '@/components/common/CategorySelectBoxComponent.vue'
import BrandSelectBoxComponent from '@/components/common/BrandSelectBoxComponent.vue'
import PlatformImageComponent from '../platforms/PlatformImageComponent.vue'
import ActionDialogComponent from '@/components/layout/ActionDialogComponent.vue'
import ConfirmationDialogComponent from '@/components/layout/ConfirmationDialogComponent.vue'
import EmptyState from '@/components/layout/EmptyState.vue'
import { PLATFORM_PROCESS, PLATFORM_PROCESS_LABELS, PLATFORM_PROCESS_COLORS } from '@/types/PlatformProcess';
const restApi = useRestApi()
const snackbarStore = useSnackbarStore()
const integrationStore = useIntegrationStore()
const choicesStore = useChoicesStore()

const loadingComponentRef: any = ref(null)
const dialogAttach = ref(".exportLogList")
const loading = ref(false)
const jobs = ref<any[]>([])
const selectedJobs = ref<any[]>([])
const searchJobId = ref("")
const sortBy = ref<any[]>([{ key: 'createdAt', order: 'desc' }])

const isAdvancedSearchActive = ref(false);
const startDateMenuInline = ref(false);
const endDateMenuInline = ref(false);
const startDateMenuAdvanced = ref(false);
const endDateMenuAdvanced = ref(false);

const searchExportLogForm = ref({
  data: {
    startDate: undefined as any,
    endDate: undefined as any,
    title: undefined,
    barcode: undefined,
    stockcode: undefined,
    selectedChoices: {} as Record<string, any>,
    category: undefined,
    brand: undefined,
    integrationCode: [] as string[],
    mode: undefined,
    statuses: []
  },
  form: { menu: false, valid: false }
});


const processMenuItems = computed(() => {
  return Object.values(PLATFORM_PROCESS).map(mode => ({
    id: mode,
    title: PLATFORM_PROCESS_LABELS[mode]
  }));
});

const formattedStartDate = computed(() => {
  if (!searchExportLogForm.value.data.startDate) return '';
  return new Date(searchExportLogForm.value.data.startDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
});

const formattedEndDate = computed(() => {
  if (!searchExportLogForm.value.data.endDate) return '';
  return new Date(searchExportLogForm.value.data.endDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
});

const statusOptions = ref([
  { id: 'QUEUED', title: 'Kuyrukta' },
  { id: 'PREPARING', title: 'Hazırlanıyor' },
  { id: 'PENDING', title: 'Gönderiliyor' },
  { id: 'SENT', title: 'Gönderim Sorgulanıyor' },
  { id: 'WAITING', title: 'Onay Bekleniyor' },
  { id: 'COMPLETED', title: 'Tamamlandı' },
  { id: 'FAILED', title: 'Hata Oluştu' }
]);

const headers: any = [
  { title: 'Ürün Bilgisi', key: 'title', sortable: true, align: 'start', width: '320px' },
  { title: 'Fiyat/Stok', key: 'price', sortable: true, align: 'end', width: '120px' },
  { title: 'İşlem Detayı', key: 'operation', sortable: false, align: 'center', width: '350px' },
  { title: 'Zaman', key: 'createdAt', sortable: true, align: 'start', width: '180px' },
  { title: '', key: 'actions', sortable: false, align: 'end', width: '110px' },
];

const resetSearchExportLogForm = () => {
  searchExportLogForm.value.data = {
    startDate: undefined, endDate: undefined, title: undefined, barcode: undefined,
    stockcode: undefined, selectedChoices: {}, category: undefined, brand: undefined,
    integrationCode: [], mode: undefined, statuses: []
  };
  isAdvancedSearchActive.value = false; searchJobId.value = ""; getJobs(true);
};

const getJobs = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  let guid = loadingComponentRef.value.info("");
  try {
    const payload: any = {
      page: pagination.page, limit: pagination.limit,
      sortBy: sortBy.value[0]?.key, sortOrder: sortBy.value[0]?.order,
      globalSearch: searchJobId.value.trim() || undefined,
      startDate: searchExportLogForm.value.data.startDate,
      endDate: searchExportLogForm.value.data.endDate,
    };
    const res = await restApi.post('IntegrationService/getExportJobs', payload);
    if (res.success) {
      jobs.value = res.data;
      pagination.totalNumberOfPages = res.pagination?.totalNumberOfPages || 1;
      pagination.totalNumberOfRecords = res.pagination?.totalNumberOfRecords || 0;
    }
  } finally { loadingComponentRef.value.remove(guid); loading.value = false; }
};

const advancedSearchJobs = async (resetPage: boolean = false) => {
  if (resetPage) pagination.page = 1;
  loading.value = true;
  isAdvancedSearchActive.value = true;
  searchExportLogForm.value.form.menu = false;
  let guid = loadingComponentRef.value.info("Filtreleniyor...");
  try {
    const payload: any = {
      page: pagination.page, limit: pagination.limit,
      sortBy: sortBy.value[0]?.key, sortOrder: sortBy.value[0]?.order,
      ...searchExportLogForm.value.data
    };
    const res = await restApi.post('IntegrationService/advancedSearchExportJobs', payload);
    if (res.success) {
      jobs.value = res.data;
      pagination.totalNumberOfPages = res.pagination?.totalNumberOfPages || 1;
      pagination.totalNumberOfRecords = res.pagination?.totalNumberOfRecords || 0;
    }
  } finally { loadingComponentRef.value.remove(guid); loading.value = false; }
};

const onSortUpdate = (newSortBy: any) => {
  sortBy.value = newSortBy;
  handlePageChange();
}

const handlePageChange = () => {
  if (isAdvancedSearchActive.value) {
    advancedSearchJobs();
  } else {
    getJobs();
  }
};

const isJobSelected = (item: any) => selectedJobs.value.includes(item._id)
const onJobSelectionUpdate = (item: any, val: boolean) => {
  if (val) selectedJobs.value.push(item._id);
  else selectedJobs.value = selectedJobs.value.filter(id => id !== item._id);
}

const pagination = reactive({ limit: 13, page: 1, totalNumberOfPages: 1, totalNumberOfRecords: 0 });
const reportInfo = reactive({ isOpen: false, jobId: null })
const openDetailedReport = (item: any) => { reportInfo.jobId = item._id; reportInfo.isOpen = true; }

// ADR-0011 Karar 1/Açık Soru 4 kapsamı DIŞI (bilinçli, göç edilmedi): bu "canlı
// iş-durumu" paleti (COMPLETED/FAILED/PENDING/SENT/WAITING) 13 çekirdek + 12 yeni
// semantik token'ın HİÇBİRİYLE tam eşleşmiyor (ör. `error`=B00020, `warning`=FB8C00
// — buradaki daha canlı tonlardan belirgin şekilde farklı); en yakın token'a
// zorlamak GÖZLE GÖRÜLÜR bir renk değişikliği (davranış/görsel fark) üretirdi,
// bu da Aşama 2'nin "sıfır-fark ekran göçü" ilkesini ihlal eder. Aynı palet
// DetailedExportLogReport.vue'da (getLogStatusColor) BİREBİR tekrarlanıyor —
// token'a bağlama, ADR'nin "Legacy semantik değer iyileştirmesi" (Açık Soru 4,
// P1 göçü sonrası ayrı bilinçli commit) kapsamında ele alınacak; BACKLOG.md'ye not düşüldü.
const getStatusColor = (status: string) => {
  const colors: any = { COMPLETED: '#10b981', FAILED: '#f43f5e', CANCELLED: '#757575', PENDING: '#6366f1', SENT: '#0ea5e9', WAITING: '#f59e0b' };
  return colors[status?.toUpperCase()] || 'grey';
};

const translateStatus = (status: string) => {
  return statusOptions.value.find(x => x.id === status)?.title || status;

  /*   const translations: any = { PREPARING: 'Hazırlanıyor', PENDING: 'Kuyrukta', SENT: 'İletildi', WAITING: 'Sorgulanıyor', COMPLETED: 'Başarılı', FAILED: 'Hata' };
    return translations[status?.toUpperCase()] || status; */
};


const getModeColor = (mode: string) => {
  const m = mode?.toUpperCase();
  return PLATFORM_PROCESS_COLORS[m] || '#455a64';
};


const formatDate = (date: any) => {
  if (!date) return '-';
  const d = new Date(date);
  const datePart = d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timePart = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `<span>${datePart}</span> <span class="text-grey-darken-4 font-weight-black" style="padding-top: 1px;">${timePart}</span>`;
};


const openDeleteConfirm = (event: any, mode: 'single' | 'batch', item: any = null) => {
  confirmationDelete.mode = mode;
  if (mode === 'single') {
    confirmationDelete.job = item;
  } else {
    confirmationDelete.job = null;
  }

  // Menünün açılacağı konumu belirlemek için activator'ı set ediyoruz
  confirmationDelete.activator = event.currentTarget;
  confirmationDelete.isDialogOpen = true;
};

const isDeletable = (item: any) => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(item?.status?.toUpperCase());
const validSelectedJobsCount = computed(() => jobs.value.filter(j => selectedJobs.value.includes(j._id) && isDeletable(j)).length);
const confirmationDelete = reactive<any>({ isDialogOpen: false, activator: undefined, mode: 'single', job: null })
const cancelDelete = () => { confirmationDelete.isDialogOpen = false; }
const confirmDelete = async () => { /* Arşivleme kodu buraya */ }

onMounted(() => getJobs(true));
</script>

<style scoped>
.exportLogList {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #f5f7f9;
}

.search-section {
  flex-shrink: 0;
  z-index: 10;
  background: transparent;
}

/* A11y (WCAG 1.4.3 — bilinçli görsel değişiklik): Vuetify'ın varsayılan alan etiketi
   beyaz zeminde AA (4,5:1) eşiğinin altında kalıyor; ADR-0011 `content-muted`
   (beyazda 4,76:1) ile yükseltildi. Odak durumunda Vuetify'ın kendi vurgu rengi korunur. */
.search-section :deep(.v-field:not(.v-field--focused) .v-field-label) {
  color: var(--ek-color-content-muted);
  opacity: 1;
}

.table-wrapper {
  flex-grow: 1;
  position: relative;
  min-height: 0;
}

.desktop-table {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex !important;
  flex-direction: column;
  background-color: white !important;
}

:deep(.v-table__wrapper) {
  flex-grow: 1 !important;
  overflow-y: auto !important;
}

.mobile-container {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: #f5f7f9;
  overflow-y: auto;
}

.price-wrapper-mobile {
  background: #f0f2ff;
  border: 1px solid #c7d2fe;
  padding: 2px 8px;
  border-radius: var(--ek-radius-md);
  display: inline-flex;
  align-items: center;
  transition: all var(--ek-duration-base) var(--ek-easing-standard);
}

.price-amount-mobile {
  font-size: 11px;
  font-weight: 900;
  color: #3730a3;
  letter-spacing: -0.2px;
}

.mode-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 12px;
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 20px;
  backdrop-filter: blur(4px);
  transition: all var(--ek-duration-base) var(--ek-easing-standard);
}

.status-dot-static {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  background-color: var(--mode-color);
  box-shadow: 0 0 4px var(--mode-color);
}

.mode-text {
  font-size: 10px;
  font-weight: 900;
  color: var(--ek-color-content-default);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.section-title {
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
  color: var(--ek-color-content-subtle);
  letter-spacing: 1px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}

.section-title::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--ek-color-surface-sunken);
  margin-left: 10px;
}


@media (max-width: 600px) {
  .desktop-table {
    display: none !important;
  }
}



.premium-status-capsule {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(226, 232, 240, 0.8) !important;
  display: inline-flex;
  transition: all var(--ek-duration-base) var(--ek-easing-standard);
  height: 28px;
  /* Sabit yükseklik premium duruşu destekler */
}

.platform-badge {
  height: 20px !important;
  font-size: 9px !important;
  letter-spacing: 0.5px;
}

/* Mod Metni Stili */
.mode-text-premium {
  font-size: 9px;
  font-weight: 800;
  color: #455A64;
  /* PassiveColor tonu */
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

/* Durum Metni Stili */
.status-text-premium {
  font-size: 9px;
  letter-spacing: 0.5px;
}

/* Statik Nokta (Glow Efekti Eklendi) */
.status-dot-static {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
  box-shadow: 0 0 5px var(--mode-color);
  /* Mod rengine göre parlama */
}

/* Animasyonlar — ADR-0011 Bağlam "pulse" ihlali (ClaimDetailComponent'teki T4f
   göçüyle AYNI gerekçe): `infinite` tekrar (devam eden işlemi işaret eden durum
   göstergesi) KORUNDU, yalnızca tek döngü süresi token'a çekildi. `.mdi-spin`
   (yükleniyor ikonu) bilinçli olarak DEĞİŞTİRİLMEDİ: sürekli dönen bir ilerleme
   göstergesi işlevsel geri bildirimdir ve `linear` eğri gerektirir. */
.premium-pulse-text {
  animation: soft-pulse-text var(--ek-duration-slow) var(--ek-easing-standard) infinite;
}

@keyframes soft-pulse-text {

  0%,
  100% {
    opacity: 1;
    filter: brightness(1);
  }

  50% {
    opacity: 0.7;
    filter: brightness(1.2);
  }
}

.mdi-spin {
  animation: spin 1.5s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/* Kapsül Hover Efekti */
.premium-status-capsule:hover {
  border-color: rgba(var(--v-theme-primary), 0.3) !important;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05) !important;
}
</style>