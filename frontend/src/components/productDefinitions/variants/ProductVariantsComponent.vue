<template>
  <div>
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <v-dialog scrim persistent :retain-focus="false" v-model="show" location-strategy="connected" target="cursor"
      no-click-animation :close-on-content-click="false" :attach="dialogAttach"
      style="transition: opacity .1s ease-in!important"
      :style="!searchVariantForm.searchVariantFormMenu && !batchProcessFormMenu && !newVariantMenu && !isVariantPlatformPricesMenu && !isImagesDialog && !isVariantAttributesDialog && !isBatchVariantDialog && !isVariantImagesDialog && !isBatchVariantPlatformPricesMenu ? { 'visibility': 'hidden', 'opacity': '.2!important' } : {}"
      :contained="true" location="left" height="100%" width="100%">

      <keep-alive>
        <ProductImagesComponent v-model="isImagesDialog" style="transition: opacity .2s ease-in!important"
          :style="!isImagesDialog ? { 'opacity': '.2!important' } : {}" key="ProductImagesComponent"
          @close="isImagesDialog = false" v-if="isImagesDialog == true" :productInfoForm="productInfoForm" />

      </keep-alive>

      <keep-alive>
        <ProductVariantImagesComponent v-model="isVariantImagesDialog" :variant="selectedVariantForEdit"
          style="transition: opacity .2s ease-in!important"
          :style="!isVariantImagesDialog ? { 'opacity': '.2!important' } : {}" key="ProductImagesComponent"
          @close="isVariantImagesDialog = false" v-if="isVariantImagesDialog == true"
          :productInfoForm="productInfoForm" />

      </keep-alive>

      <keep-alive>
        <ProductVariantAttributesComponent v-model="isVariantAttributesDialog"
          style="transition: opacity .2s ease-in!important" :editingVariant="editingVariant"
          :style="!isVariantAttributesDialog ? { 'opacity': '.2!important' } : {}" key="ProductImagesComponent"
          @close="isVariantAttributesDialog = false" v-if="isVariantAttributesDialog == true"
          :productInfoForm="productInfoForm" />
      </keep-alive>

      <keep-alive>
        <ProductBatchVariantAttributesComponent v-model="isBatchVariantDialog"
          style="transition: opacity .2s ease-in!important" :batchVariant="batchVariant"
          @batchVariantAttributesUpdate="batchVariantAttributesUpdate"
          :style="!isBatchVariantDialog ? { 'opacity': '.2!important' } : {}"
          key="ProductBatchVariantAttributesComponent" @close="isBatchVariantDialog = false"
          v-if="isBatchVariantDialog == true" :productInfoForm="productInfoForm" />
      </keep-alive>


      <keep-alive>
        <ProductSearchVariantComponent style="transition: opacity .2s ease-in!important"
          v-if="searchVariantForm.searchVariantFormMenu"
          :style="!searchVariantForm.searchVariantFormMenu ? { 'opacity': '.2!important' } : {}"
          key="ProductSearchVariantComponent" v-model="searchVariantForm"
          @close="searchVariantForm.searchVariantFormMenu = false" @searchVariants="search" :isFiltered="isFiltered"
          :productInfoForm="productInfoForm" />
      </keep-alive>

      <keep-alive>
        <ProductBatchProcessVariantComponent style="transition: opacity .2s ease-in!important"
          v-if="batchProcessFormMenu" key="ProductBatchProcessVariantComponent"
          :style="!batchProcessFormMenu ? { 'opacity': '.2!important' } : {}" @close="batchProcessFormMenu = false"
          @batchProcessUpdate="batchProcessUpdate" v-model="batchProcessFormMenu"
          @batchProcessDelete="batchProcessDelete" :productInfoForm="productInfoForm"
          :totalNumberOfVariants="pagination.totalNumberOfRecords" />
      </keep-alive>
      <keep-alive>
        <ProductVariantPlatformPricesComponent v-model="isVariantPlatformPricesMenu" :editingVariant="editingVariant"
          style="transition: opacity .2s ease-in!important"
          :style="!isVariantPlatformPricesMenu ? { 'opacity': '.2!important' } : {}"
          key="ProductVariantPlatformPricesComponent" @close="isVariantPlatformPricesMenu = false"
          v-if="isVariantPlatformPricesMenu == true" :productInfoForm="productInfoForm" />
      </keep-alive>

      <keep-alive>
        <ProductBatchVariantPlatformPricesComponent v-model="isBatchVariantPlatformPricesMenu"
          :batchVariant="batchVariant" @batchVariantPricesUpdate="batchVariantPricesUpdate"
          style="transition: opacity .2s ease-in!important"
          :style="!isBatchVariantPlatformPricesMenu ? { 'opacity': '.2!important' } : {}"
          key="ProductBatchVariantPlatformPricesComponent" @close="isBatchVariantPlatformPricesMenu = false"
          v-if="isBatchVariantPlatformPricesMenu == true" :productInfoForm="productInfoForm" />
      </keep-alive>

    </v-dialog>
    <div class="pt-12" v-if="!productInfoForm.hasVariant">
    </div>
    <v-data-table-server v-model="selectedVariants" :items-length="originalVariants ? originalVariants.length : 0"
      :items="originalVariants" fixed-header item-value="tempId" :headers="headers" class="pa-0 ma-0"
      :show-select="productInfoForm.hasVariant"
      style="position:absolute;top:75px;bottom:0;left:0;right:0; width:auto;height:calc(100vh - 170px);border:1px solid #96a9b7;background-color:white!important;">

      <template v-slot:header.variant="{ column, getSortIcon, isSorted, someSelected }">
        <div class="d-flex fill-height align-center">
          <div style="width:124px;opacity:.6" class="text-center"><v-icon>mdi-image-outline</v-icon></div>
          <div :class="isDisplayMd() ? ['mt-0'] : ['d-flex']" class="align-center" v-if="productInfoForm.hasVariant">
            <div class="font-weight-bold" style="width:120px;height:20px!important;" @click="toggleSort('stockcode')"
              @mouseenter="sortIcon = 'stockcode'" @mouseleave="sortIcon = undefined">
              <v-menu v-model="batchProcesses.stockcode.menu">
                <template v-slot:activator="{ props: menu }">
                  <v-tooltip location="top">
                    <template v-slot:activator="{ props: tooltip }">
                      <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1"
                        color="processButtonColor">mdi-card-multiple</v-icon>
                    </template>
                    <span>Toplu stok kodu oluştur.</span>
                  </v-tooltip>
                </template>
                <v-card min-width="240px">
                  <v-card-text>
                    <v-btn-group elevation="1" class="d-block" density="compact" style="border:1px solid white;">
                      <v-btn density="compact" block class="fill-height" color="processButtonColor"
                        @click.stop="stockcodeBatchProcess">
                        <span class="">
                          <v-icon>mdi-plus-box-multiple-outline</v-icon> Toplu Oluştur
                        </span></v-btn>
                    </v-btn-group>

                  </v-card-text>
                </v-card>
              </v-menu>

              Stok Kodu
              <template v-if="sortBy === 'stockcode'">
                <v-icon>
                  {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
                </v-icon>
              </template>
              <v-icon v-else :style="sortIcon == 'stockcode' ? { opacity: .5 } : { opacity: 0 }">
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>

            </div>
            {{ isDisplayMd() ? '' : '|' }}

            <div class="font-weight-bold " style="height:20px!important" @click="toggleSort('barcode')"
              @mouseenter="sortIcon = 'barcode'" @mouseleave="sortIcon = undefined">


              <v-menu v-model="batchProcesses.barcode.menu">
                <template v-slot:activator="{ props: menu }">
                  <v-tooltip location="top">
                    <template v-slot:activator="{ props: tooltip }">
                      <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1"
                        color="processButtonColor">mdi-card-multiple</v-icon>
                    </template>
                    <span>Toplu barkod oluştur.</span>
                  </v-tooltip>
                </template>
                <v-card min-width="240px">
                  <v-card-text>
                    <v-btn-group elevation="1" class="d-block" density="compact" style="border:1px solid white;">
                      <v-btn density="compact" block class="fill-height" color="processButtonColor"
                        @click.stop="barcodeBatchProcess">
                        <span class="">
                          <v-icon>mdi-plus-box-multiple-outline</v-icon> Toplu Oluştur
                        </span></v-btn>
                    </v-btn-group>

                  </v-card-text>
                </v-card>
              </v-menu>


              Barkod
              <template v-if="sortBy === 'barcode'">
                <v-icon>
                  {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
                </v-icon>
              </template>
              <v-icon v-else :style="sortIcon == 'barcode' ? { opacity: .5 } : { opacity: 0 }">
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </div>
          </div>
        </div>
      </template>



      <template v-slot:header.choices="{ column, getSortIcon, isSorted, someSelected }">
        <div class="d-flex fill-height align-center" style="" v-if="productInfoForm.hasVariant">
          <div class="font-weight-bold text-body-2" style="height:20px!important" @click="toggleSort('choices')"
            @mouseenter="sortIcon = 'choices'" @mouseleave="sortIcon = undefined">

            {{ isDisplayMd() ? 'Seç.ler' : 'Seçenekler' }}

            <template v-if="sortBy === 'choices'">
              <v-icon>
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </template>
            <v-icon v-else :style="sortIcon == 'choices' ? { opacity: .5 } : { opacity: 0 }">
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </div>
        </div>
      </template>


      <template v-slot:header.prices>
        <div :class="isDisplayMd() ? [] : ['d-flex']" class=" fill-height align-center" style=""
          v-if="productInfoForm.hasVariant">
          <div></div>
          <div class="font-weight-bold  ml-1" style="width:115px!important;;height:20px!important"
            @click="toggleSort('prices.salePrice')" @mouseenter="sortIcon = 'prices.salePrice'"
            @mouseleave="sortIcon = undefined">


            <v-menu v-model="batchProcesses.salePrice.menu">
              <template v-slot:activator="{ props: menu }">
                <v-tooltip location="top">
                  <template v-slot:activator="{ props: tooltip }">
                    <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1"
                      color="processButtonColor">mdi-card-multiple</v-icon>
                  </template>
                  <span>Toplu piyasa fiyatı değiştir</span>
                </v-tooltip>
              </template>
              <v-card min-width="240px">
                <v-card-text>
                  <v-checkbox :label="$t('productDefinitions.product.platformPrice')" @update:modelValue=""
                    density="compact" hide-details class="ma-0 mb-2 pa-0" style="min-width:180px"
                    v-model="batchProcesses.salePrice.isPlatformBasedPrice" @click.stop />

                  <VCurrencyComponentVue v-model="batchProcesses.salePrice.value" :rules="formRules.mandatoryRule"
                    v-if="!batchProcesses.salePrice.isPlatformBasedPrice" :compact="true"
                    :label="$t('productDefinitions.product.variants.salePrice')" clearable @click.stop :required="true"
                    class="mt-2 mb-2" style="max-width:300px">
                  </VCurrencyComponentVue>

                  <div v-else v-for="(platform, index) of integrationStore.getClientMarketplaces()" class="pa-2"
                    style="border-bottom:1px solid #ccc">
                    <v-row>
                      <v-col>
                        <div class="d-flex justify-center  align-center row-title">
                          <v-avatar rounded="2"
                            class="mt-0 mr-1 mb-0 ml-2 mr-2 pa-2 text-center d-flex justify-center elevation-4"
                            elevation=2 style="width:70px;height:70px;border:1px solid white"
                            :style="{ 'background-color': platform.color }">
                            <v-img :width="platform.width"
                              :src="integrations.getTypePath(platform.type._id) + platform.logo"></v-img>
                          </v-avatar>
                          <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop
                            v-model="batchProcesses.salePrice.prices[platform.code]" :rules="formRules.mandatoryRule"
                            :compact="true" :label="$t('productDefinitions.product.variants.salePrice')" clearable
                            :required="true" class="ml-4" style="min-width:200px">
                          </VCurrencyComponentVue>
                        </div>
                      </v-col>
                    </v-row>
                  </div>

                  <v-btn-group elevation="1" class="d-block" density="compact" style="border:1px solid white;">
                    <v-btn density="compact" block class="fill-height" color="processButtonColor"
                      @click.stop="salePriceBatchProcess">
                      <span class="">
                        <v-icon>mdi-plus-box-multiple-outline</v-icon> Toplu Güncelle
                      </span></v-btn>
                  </v-btn-group>

                </v-card-text>
              </v-card>
            </v-menu>


            Satış Fiyatı
            <template v-if="sortBy === 'prices.salePrice'">
              <v-icon>
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </template>
            <v-icon v-else :style="sortIcon == 'prices.salePrice' ? { opacity: .5 } : { opacity: 0 }">
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </div>
          {{ isDisplayMd() ? '' : '|' }}
          <div class="font-weight-bold ml-1" style="height:20px!important" @click="toggleSort('prices.marketPrice')"
            @mouseenter="sortIcon = 'prices.marketPrice'" @mouseleave="sortIcon = undefined">

            <v-menu v-model="batchProcesses.marketPrice.menu">
              <template v-slot:activator="{ props: menu }">
                <v-tooltip location="top">
                  <template v-slot:activator="{ props: tooltip }">
                    <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1"
                      color="processButtonColor">mdi-card-multiple</v-icon>
                  </template>
                  <span>Toplu piyasa fiyatı değiştir</span>
                </v-tooltip>
              </template>
              <v-card min-width="240px">
                <v-card-text>
                  <v-checkbox :label="$t('productDefinitions.product.platformPrice')" @update:modelValue=""
                    density="compact" hide-details class="ma-0 mb-2 pa-0" style="min-width:180px"
                    v-model="batchProcesses.marketPrice.isPlatformBasedPrice" @click.stop />

                  <VCurrencyComponentVue v-model="batchProcesses.marketPrice.value" :rules="formRules.mandatoryRule"
                    v-if="!batchProcesses.marketPrice.isPlatformBasedPrice" :compact="true"
                    :label="$t('productDefinitions.product.variants.marketPrice')" clearable @click.stop
                    :required="true" class="mt-2 mb-2" style="max-width:300px">
                  </VCurrencyComponentVue>

                  <div v-else v-for="(platform, index) of integrationStore.getClientMarketplaces()" class="pa-2"
                    style="border-bottom:1px solid #ccc">
                    <v-row>
                      <v-col>
                        <div class="d-flex justify-center  align-center row-title">
                          <v-avatar rounded="2"
                            class="mt-0 mr-1 mb-0 ml-2 mr-2 pa-2 text-center d-flex justify-center elevation-4"
                            elevation=2 style="width:70px;height:70px;border:1px solid white"
                            :style="{ 'background-color': platform.color }">
                            <v-img :width="platform.width"
                              :src="integrations.getTypePath(platform.type._id) + platform.logo"></v-img>
                          </v-avatar>
                          <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop
                            v-model="batchProcesses.marketPrice.prices[platform.code]" :rules="formRules.mandatoryRule"
                            :compact="true" :label="$t('productDefinitions.product.variants.marketPrice')" clearable
                            :required="true" class="ml-4" style="min-width:200px">
                          </VCurrencyComponentVue>
                        </div>
                      </v-col>
                    </v-row>
                  </div>

                  <v-btn-group elevation="1" class="d-block" density="compact" style="border:1px solid white;">
                    <v-btn density="compact" block class="fill-height" color="processButtonColor"
                      @click.stop="marketPriceBatchProcess">
                      <span class="">
                        <v-icon>mdi-plus-box-multiple-outline</v-icon> Toplu Güncelle
                      </span></v-btn>
                  </v-btn-group>

                </v-card-text>
              </v-card>
            </v-menu>

            Piyasa Fiyatı


            <template v-if="sortBy === 'prices.marketPrice'">
              <v-icon>
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </template>
            <v-icon v-else :style="sortIcon == 'prices.marketPrice' ? { opacity: .5 } : { opacity: 0 }">
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </div>

          {{ isDisplayMd() ? '' : '|' }}

          <div class="font-weight-bold ml-1" style="height:20px!important">

            <v-menu v-model="batchProcesses.isPlatformBasedPrice.menu">
              <template v-slot:activator="{ props: menu }">
                <v-tooltip location="top">
                  <template v-slot:activator="{ props: tooltip }">
                    <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1"
                      color="processButtonColor">mdi-card-multiple</v-icon>
                  </template>
                  <span>Toplu platform bazında fiyat değiştir</span>
                </v-tooltip>
              </template>
              <v-card width="240px">
                <v-card-text>
                  <v-checkbox :label="$t('productDefinitions.product.platformPrice')" @update:modelValue=""
                    density="compact" hide-details class="ma-0 mb-2 pa-0" style="min-width:180px"
                    v-model="batchProcesses.isPlatformBasedPrice.value" @click.stop />

                  <v-btn-group elevation="1" class="d-block" density="compact" style="border:1px solid white;">
                    <v-btn density="compact" block class="fill-height" color="processButtonColor"
                      @click.stop="isPlatformBasedPriceBatchProcess">
                      <span class="">
                        <v-icon>mdi-plus-box-multiple-outline</v-icon> Toplu Güncelle
                      </span></v-btn>
                  </v-btn-group>

                </v-card-text>
              </v-card>
            </v-menu>


            Platform Bazında Fiyat
          </div>

        </div>
      </template>



      <template v-slot:header.stock>
        <div :class="isDisplayMd() ? ['mt-0'] : ['d-flex']" class="align-center">
          <div class="d-flex fill-height align-center" v-if="productInfoForm.hasVariant">
            <div class="font-weight-bold" style="height:20px!important" @click="toggleSort('stock')"
              @mouseenter="sortIcon = 'stock'" @mouseleave="sortIcon = undefined">

              <v-menu v-model="batchProcesses.stock.menu">
                <template v-slot:activator="{ props: menu }">
                  <v-tooltip location="top">
                    <template v-slot:activator="{ props: tooltip }">
                      <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1"
                        color="processButtonColor">mdi-card-multiple</v-icon>
                    </template>
                    <span>Toplu stok değiştir</span>
                  </v-tooltip>
                </template>
                <v-card width="240px">
                  <v-card-text>
                    <v-text-field label="Stok Adedi" prepend-icon="mdi-counter" density="compact" variant="outlined"
                      bg-color="textfieldColor" class="" style="max-width:300px" v-model="batchProcesses.stock.value"
                      @click.stop clearable>
                    </v-text-field>
                    <v-btn-group elevation="1" class="d-block" density="compact" style="border:1px solid white;">
                      <v-btn density="compact" block class="fill-height" color="processButtonColor"
                        @click.stop="stockBatchProcess">
                        <span class="">
                          <v-icon>mdi-plus-box-multiple-outline</v-icon> Toplu Güncelle
                        </span></v-btn>
                    </v-btn-group>

                  </v-card-text>
                </v-card>
              </v-menu>


              Stok
              <template v-if="sortBy === 'stock'">
                <v-icon>
                  {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
                </v-icon>
              </template>
              <v-icon v-else :style="sortIcon == 'stock' ? { opacity: .5 } : { opacity: 0 }">
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>

            </div>
          </div>


          <div class="d-flex fill-height align-center" v-if="productInfoForm.hasVariant">
            <div class="font-weight-bold" style="height:20px!important" @click="toggleSort('shelf')"
              @mouseenter="sortIcon = 'shelf'" @mouseleave="sortIcon = undefined">


              <v-menu v-model="batchProcesses.shelf.menu">
                <template v-slot:activator="{ props: menu }">
                  <v-tooltip location="top">
                    <template v-slot:activator="{ props: tooltip }">
                      <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1"
                        color="processButtonColor">mdi-card-multiple</v-icon>
                    </template>
                    <span>Toplu raf değiştir</span>
                  </v-tooltip>
                </template>
                <v-card width="240px">
                  <v-card-text>
                    <v-text-field label="Raf" prepend-icon="mdi-counter" density="compact" variant="outlined"
                      bg-color="textfieldColor" class="" style="max-width:300px" v-model="batchProcesses.shelf.value"
                      @click.stop clearable>
                    </v-text-field>
                    <v-btn-group elevation="1" class="d-block" density="compact" style="border:1px solid white;">
                      <v-btn density="compact" block class="fill-height" color="processButtonColor"
                        @click.stop="shelfBatchProcess">
                        <span class="">
                          <v-icon>mdi-plus-box-multiple-outline</v-icon> Toplu Güncelle
                        </span></v-btn>
                    </v-btn-group>

                  </v-card-text>
                </v-card>
              </v-menu>

              Raf
              <template v-if="sortBy === 'shelf'">
                <v-icon>
                  {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
                </v-icon>
              </template>
              <v-icon v-else :style="sortIcon == 'shelf' ? { opacity: .5 } : { opacity: 0 }">
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </div>
          </div>
        </div>
      </template>





      <template v-slot:header.choiceTitle="{ column }">

        <div class="d-flex fill-height align-center">
          <div class="font-weight-bold text-body-2" style="height:20px!important"
            @click="toggleSort('choiceValueTitle')" @mouseenter="sortIcon = 'choiceValueTitle'"
            @mouseleave="sortIcon = undefined">
            Grup
            <template v-if="sortBy === 'choiceValueTitle'">
              <v-icon>
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </template>
            <v-icon v-else-if="sortIcon == 'choiceValueTitle'" style="opacity:.5">
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
            <v-icon v-else style="opacity:0">
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>

          </div>
        </div>


      </template>

      <template v-slot:header.platforms>
      </template>


      <template v-slot:header.actions>

        <div class="d-flex justify-end mt-2 mb-2" v-if="productInfoForm.hasVariant" id="myfeature-2">

          <v-menu :close-on-content-click="false" v-model="isVariantGeneratorMenu">
            <template v-slot:activator="{ props }">
              <v-btn v-bind="props" size="35" elevation=0 color="success" class="mr-2"
                style="border:1px solid rgb(var(--v-theme-borderColor))">
                <v-icon size="large">mdi-plus</v-icon>
              </v-btn>
            </template>
            <v-list density="compact" class="pa-0 ma-0">

              <v-list-item class="pa-0 ma-0">
                <template #prepend>
                </template>
                <!-- VARIANT GENERATOR-->
                <ProductVariantGeneratorComponent :productInfoForm="productInfoForm" v-if="productInfoForm.hasVariant"
                  @generate-variants="generateVariants" @close="isVariantGeneratorMenu = false" />
                <!-- VARIANT GENERATOR-->

              </v-list-item>

            </v-list>
          </v-menu>

          <v-menu scroll-strategy="close">
            <template v-slot:activator="{ props }">
              <v-btn flat size="35" v-bind="props"
                style="background-color:white!important;border:1px solid rgb(var(--v-theme-borderColor));" elevation=0
                color="transparent">
                <v-icon color="processButtonColor" v-bind="props" size="x-large" class="" style="">mdi-menu</v-icon>
              </v-btn>
            </template>
            <v-card style="border-radius:5px">
              <v-list class="pt-0 pb-0" density="compact" style="background-color:rgb(var(--v-theme-loginForm))">
                <v-divider color="passiveColor" class="ml-5 mr-5" />
                <v-list-subheader
                  class="mt-0 d-flex align-center justify-start bg-primaryLightenMore text-white font-weight-bold">
                  <v-tooltip location="top" :open-delay="700">
                    <template #activator="{ props }">
                      <div v-bind="props">
                        Varyant İşlemleri
                      </div>
                    </template>
                    <span>İşlem, sadece bu ürün için uygulama kataloğunda yapılacaktır.</span>
                  </v-tooltip>
                </v-list-subheader>

                <v-divider color="passiveColor" class="ml-5 mr-5" />
                <v-list-item @click="searchVariantForm.searchVariantFormMenu = !searchVariantForm.searchVariantFormMenu"
                  class="font-weight-medium">
                  <template #prepend>
                    <v-icon color="primary" size="25" class="" style="opacity: 1;">mdi-magnify</v-icon>
                  </template>
                  Ara
                </v-list-item>



                <v-divider color="passiveColor" class="ml-5 mr-5" />
                <v-list-item @click="isBatchVariantDialog = !isBatchVariantDialog" class="font-weight-medium">
                  <template #prepend>
                    <v-icon color="success" size="25" class=""
                      style="opacity: 1;">mdi-checkbox-multiple-marked-outline</v-icon>
                  </template>
                  Toplu Özellik Düzenleme
                </v-list-item>
                <v-divider color="passiveColor" class="ml-5 mr-5" />

                <v-list-item @click="openBatchVariantPlatformPrices" class="font-weight-medium">
                  <template #prepend>
                    <v-icon color="success" size="25" class="" style="opacity: 1;">mdi-currency-try</v-icon>
                  </template>
                  Toplu Fiyat Düzenleme
                </v-list-item>
                <v-divider color="passiveColor" class="ml-5 mr-5" />

                <v-list-item @click="mapAllChoices" class="font-weight-medium">
                  <template #prepend>
                    <v-icon color="success" size="25" class="" style="opacity: 1;">mdi-map</v-icon>
                  </template>
                  Toplu Seçenek Eşleştir
                </v-list-item>
                <v-divider color="passiveColor" class="ml-5 mr-5" />

                <v-list-item @click="deleteAllBatchProcess" class="font-weight-medium">
                  <template #prepend>
                    <v-icon color="deleteButtonColor" size="25" class="" style="opacity: 1;">mdi-delete</v-icon>
                  </template>
                  Toplu Silme
                </v-list-item>


              </v-list>
            </v-card>
          </v-menu>
        </div>
      </template>
      <template v-slot:item="{ item, index }: any">

        <tr v-if="index != 0 && rowspanSet.get(item.tempId)">
          <td colspan="9" style="min-height:10px;line-height:10px;height:30px">
          </td>
        </tr>


        <tr>

          <td class="text-center " v-if="productInfoForm.hasVariant">
            <div>
              <v-checkbox v-model="selectedVariants" style="margin-left:1px" :value="item.tempId" density="compact"
                hide-details></v-checkbox>
            </div>
          </td>
          <td style="border-right:1px solid #ddd;cursor:pointer">
            <div class="d-flex align-center fill-height;" style="border-right:0px solid #ddd;cursor:pointer"
              @click="setEditingField({ value: 'stockcode' }, item.tempId)">
              <div class="text-center mr-4 elevation-1"
                style="width:110px;min-width:110px;border:0px solid #e9e9e9!important;">
                <v-tooltip location="bottom" open-delay="1000" text="Ürünü düzenlemek için basınız">
                  <template v-slot:activator="{ props: tooltipProps }">

                    <ProductVariantImageComponent v-bind="{ ...tooltipProps }" :productInfoForm="productInfoForm"
                      @click.stop="isVariantImagesDialog = true; selectedVariantForEdit = item"
                      :imageId="item.images ? item.images[0] : undefined"
                      style="border-bottom:1px solid #f3f3f3!important;cursor:pointer" />

                  </template>
                </v-tooltip>
              </div>
              <div v-if="editingVariantId == item.tempId && editingHeaderValue == 'stockcode'"
                style="width:100%!important" class="pr-4">
                <v-text-field density="compact" variant="outlined" bg-color="textfieldColor" class="" style=""
                  label="Stok Kodu" v-model="item.stockcode" @click.stop hide-details></v-text-field>
                <v-text-field density="compact" variant="outlined" bg-color="textfieldColor" class="mt-2" style=""
                  label="Barkod" v-model="item.barcode" @click.stop hide-details></v-text-field>
              </div>
              <div v-else style="width:100%!important" class="d-flex align-center fill-height">
                <div class="d-flex">
                  <div>
                    <div class="font-weight-light text-caption mt-1" style="line-height: .7;font-size:10px!important">
                      Stok
                      Kodu
                    </div>
                    <span class="font-weight-bold">{{ item.stockcode }}</span>
                    <div class="font-weight-light text-caption mt-1" style="line-height: .7;font-size:10px!important">
                      Barkod
                    </div>
                    <span class="font-weight-medium">{{ item.barcode }}</span>
                  </div>
                </div>
              </div>
            </div>

          </td>
          <td :rowspan="rowspanSet.get(item.tempId)" v-if="productInfoForm.hasVariant && rowspanSet.get(item.tempId)"
            style="border-left:1px solid rgb(var(--v-theme-tableHeaderColor));;background-color:rgb(var(--v-theme-cardComponentHoverColor))"
            class="text-center">
            <div class="font-weight-bold">{{ choicesStore.getChoiceValueName(item.choices[0]?.choiceId,
              item.choices[0]?.choiceValueId) }} </div>
          </td>

          <td style="border-left:2px solid rgb(var(--v-theme-tableHeaderColor));cursor:pointer"
            v-if="productInfoForm.hasVariant">
            <div class="d-flex fill-height align-center d-block mt-1" style="width:100%!important">
              <div>
                <div v-for="(choice, index) of item.choices">
                  <div class="d-flex" v-if="index > 0">
                    <div :class="index > 0 ? ['pt-1'] : []">
                      <div class="font-weight-light text-caption " style="line-height: .7;font-size:10px!important">
                        {{ choicesStore.getChoiceTitle(choice.choiceId) }} </div>
                      <span class="font-weight-bold">{{ choicesStore.getChoiceValueName(choice.choiceId,
                        choice.choiceValueId) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </td>
          <td style="border-left:1.5px solid rgb(var(--v-theme-tableHeaderColor));">
            <div class="d-flex fill-height align-center" style="width:100%">

              <div :class="isDisplayMd() ? [] : ['d-flex', 'align-center']"
                style="cursor:pointer;width:100%!important;">
                <div
                  v-if="item.prices.isPlatformBasedPrice == false && editingVariantId == item.tempId && editingHeaderValue == 'prices'"
                  style="min-width:200px!important">
                  <div class="d-flex align-center justify-start">
                    <VCurrencyComponentVue v-model="item.prices.salePrice" :rules="formRules.mandatoryRule"
                      :compact="true" :label="$t('productDefinitions.product.variants.salePrice')" clearable
                      :required="true" class="mt-1" style="max-width:300px">
                    </VCurrencyComponentVue>
                  </div>

                  <div class="d-flex align-center justify-start">
                    <VCurrencyComponentVue v-model="item.prices.marketPrice" :rules="formRules.mandatoryRule"
                      :compact="true" :label="$t('productDefinitions.product.variants.marketPrice')" clearable
                      :required="true" class="mt-2" style="max-width:300px">
                    </VCurrencyComponentVue>
                  </div>
                </div>

                <template v-else-if="item.prices.isPlatformBasedPrice == true">
                  <div @click="openVariantPlatformPrices(item)" class="d-flex align-center fill-height"
                    style="cursor:pointer;width:auto!important;min-width:130px">
                    <div>

                      <div class="font-weight-light text-caption mt-1" style="line-height: .7;font-size:10px!important">
                        Satış Fiyatı
                      </div>
                      <span class="font-weight-bold"> {{ formatCurrency(findMinimumSalePrice(item.platforms)) }} - {{
                        formatCurrency(findMaximumSalePrice(item.platforms)) }}</span>
                      <div class="font-weight-light text-caption mt-1" style="line-height: .7;font-size:10px!important">
                        Piyasa Fiyatı
                      </div>
                      <span class="font-weight-medium"> {{ formatCurrency(findMinimumMarketPrice(item.platforms)) }} -
                        {{
                          formatCurrency(findMaximumMarketPrice(item.platforms)) }}</span>
                    </div>
                  </div>
                </template>
                <template v-else>
                  <div @click="setEditingField({ value: 'prices' }, item.tempId)"
                    class="d-flex align-center fill-height" style="cursor:pointer;width:auto!important;min-width:130px">
                    <div>

                      <div class="font-weight-light text-caption mt-1" style="line-height: .7;font-size:10px!important">
                        Satış Fiyatı
                      </div>
                      <span class="font-weight-bold"> {{ formatCurrency(item.prices.salePrice) }}</span>
                      <div class="font-weight-light text-caption mt-1" style="line-height: .7;font-size:10px!important">
                        Piyasa Fiyatı
                      </div>
                      <span class="font-weight-medium"> {{ formatCurrency(item.prices.marketPrice) }}</span>
                    </div>
                  </div>
                </template>

                <div>
                  <v-checkbox :class="isDisplayMd() ? [''] : ['ml-12']"
                    :label="$t('productDefinitions.product.platformPrice')" @update:modelValue="" density="compact"
                    hide-details v-model="item.prices.isPlatformBasedPrice" @click.stop class="ma-0  pa-0 "
                    style="min-width:180px" color="processButtonColor" />
                </div>

              </div>
            </div>

          </td>
          <td style="border:1.5px solid rgb(var(--v-theme-tableHeaderColor));border-top:none;border-bottom:none">



            <div :class="isDisplayMd() ? [''] : ['d-flex']" class="align-center">

              <div class="d-flex font-weight-bold align-center pr-4" style="cursor:pointer"
                @click="setEditingField({ value: 'stock' }, item.tempId)">

                <v-text-field v-if="editingVariantId == item.tempId && editingHeaderValue == 'stock'" label="Stok"
                  type="number" density="compact" variant="outlined" bg-color="textfieldColor" class=""
                  style="width:90px" v-model.number="item.stock" @click.stop hide-details></v-text-field>

                <div v-else :class="isDisplayMd() ? [''] : ['pr-6']">
                  <div class="font-weight-light text-caption mt-1" style="line-height: .7;font-size:10px!important">
                    Stok
                  </div>
                  <div class="d-flex font-weight-bold fill-height align-center" style="cursor:pointer">
                    {{ item.stock }}
                  </div>
                </div>

              </div>

              <div class="d-flex align-center d-block" style="cursor:pointer"
                @click="setEditingField({ value: 'shelf' }, item.tempId)">
                <v-text-field v-if="editingVariantId == item.tempId && editingHeaderValue == 'shelf'" label="Raf"
                  density="compact" variant="outlined" bg-color="textfieldColor" class="" style="min-width:90px"
                  v-model="item.shelf" @click.stop hide-details></v-text-field>

                <div v-else :class="isDisplayMd() ? [''] : ['pl-6']">
                  <div class="font-weight-light text-caption mt-1" style="line-height: .7;font-size:10px!important">
                    Raf
                  </div>
                  <div class="d-flex font-weight-bold fill-height align-center" style="">
                    {{ item.shelf || '-' }}
                  </div>
                </div>
              </div>
            </div>
          </td>
          <td>
            <div class="d-flex justify-end">

              <v-tooltip location="bottom" open-delay="1000" text="Ürün seçeneğini düzenlemek için basınız">
                <template v-slot:activator="{ props: tooltipProps }">

                  <v-btn v-bind="{ ...tooltipProps }" elevation="0" size="35" class="mr-2"
                    style="min-width:0;border:1px solid #bbb"
                    @click.stop="isVariantAttributesDialog = !isVariantAttributesDialog; editingVariant = item"
                    color="processButtonColor"><v-icon size="large">mdi-pencil</v-icon></v-btn>
                </template>
              </v-tooltip>

              <v-btn v-if="productInfoForm.hasVariant" elevation="0" size="35" class=""
                @click.stop="deleteVariant(item)" style="min-width:0;border:1px solid #bbb" color="danger"><v-icon
                  size="large">mdi-delete</v-icon></v-btn>
            </div>
          </td>
        </tr>
      </template>
      <template v-slot:bottom="{ }">
        <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
          v-if="productInfoForm.hasVariant" @set-page="search" v-model="pagination.page"
          style="position:relative;border-top:1px solid rgb(var(--v-theme-cardComponentColor))" />
      </template>

    </v-data-table-server>

  </div>

</template>

<script setup lang="ts">
import { ref, mergeProps, inject, nextTick, watch, computed, onBeforeMount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n';
import PaginationComponent from '@/components/PaginationComponent.vue';
import { useChoicesStore } from '@/stores/choicesStore';
import LoadingComponent from '@/components/LoadingComponent.vue'
import ProductSearchVariantComponent from './ProductSearchVariantComponent.vue'
import ProductVariantImageComponent from './ProductVariantImageComponent.vue'

import ProductBatchProcessVariantComponent from './ProductBatchProcessVariantComponent.vue'
import useIntegrations from '@/composables/integrations';
import useRestApi from '@/composables/restapi'
import useFormRules from '@/composables/formrules';
import VCurrencyComponentVue from '@/components/VCurrencyComponent.vue';
import ProductImagesComponent from '../crud/ProductImagesComponent.vue';
import ProductVariantAttributesComponent from './ProductVariantAttributesComponent.vue';
import ProductBatchVariantAttributesComponent from './ProductBatchVariantAttributesComponent.vue';
import ProductVariantPlatformPricesComponent from './ProductVariantPlatformPricesComponent.vue';
import ProductBatchVariantPlatformPricesComponent from './ProductBatchVariantPlatformPricesComponent.vue';
import ProductVariantGeneratorComponent from './ProductVariantGeneratorComponent.vue';
import ProductVariantImagesComponent from './ProductVariantImagesComponent.vue';
import { useIntegrationStore } from '@/stores/integrationStore';
import { useCategoriesStore } from '@/stores/categoriesStore';
import { useBrandsStore } from '@/stores/brandsStore';
import { useSnackbarStore } from '@/stores/snackbarStore';


import { useOnboarding } from '@/composables/useOnboarding';
import { useDisplay } from 'vuetify'
const display = useDisplay()

const { startTour } = useOnboarding();

const isDisplayMd = () => {
  return display.width.value < 1450
}

const isVariantGeneratorMenu = ref(false)
const categoriesStore = useCategoriesStore()
const brandsStore = useBrandsStore()
const integrationStore = useIntegrationStore()
const snackbarStore = useSnackbarStore()

const show = ref(true)
const emits = defineEmits(['refreshImages', 'refreshVariants', 'refreshTotalVariantsStockCount', 'close'])
const batchVariant: any = ref({})

const formRules = useFormRules()
const batchProcesses: any = ref({
  barcode: {
    menu: false
  },
  stockcode: {
    menu: false
  },
  shelf: {
    menu: false,
    value: undefined
  },
  stock: {
    menu: false,
    value: undefined
  },
  isPlatformBasedPrice: {
    menu: false,
    value: undefined
  },
  marketPrice: {
    menu: false,
    value: undefined,
    isPlatformBasedPrice: false,
    prices: { isPlatformBasedPrice: true }
  },
  salePrice: {
    menu: false,
    value: undefined,
    isPlatformBasedPrice: false,
    prices: { isPlatformBasedPrice: true }
  }

})

const choicesStore = useChoicesStore()
const eventBus: any = inject('eventBus');
var choicesStoreChoices: any = undefined
const integrations: any = useIntegrations()
const restApi = useRestApi()
const loadingComponentRef: any = ref(null)
const isVariants = defineModel({ default: false })
const searchVariantForm: any = ref()
const isFiltered = ref(false)
const headers: any = ref()
const multipleVariantHeaders: any = ref()
const singleVariantHeaders: any = ref()
const candidateSortHeader: any = ref({})
const sortHeader: any = ref({})
const newVariantMenu = ref(false)
const batchProcessFormMenu = ref(false)
const isVariantPlatformPricesMenu = ref(false)
const isBatchVariantPlatformPricesMenu = ref(false)
const isImagesDialog = ref(false)
const isVariantImagesDialog = ref(false)
const isVariantAttributesDialog = ref(false)
const isBatchVariantDialog = ref(false)

const variants: any = ref([])
const { t } = useI18n()
var contentWidth = 300
const editingVariantId: any = ref(-1)
const editingHeaderValue: any = ref('')
const baseImageURL = ref('https://images.entegrasyonik.com/products/')
const baseTempImageURL = ref(baseImageURL.value + 'temp/')
const selectedVariantForEdit: any = ref(0)
const isSkeletonVisible: any = ref(false)
const tableRecordCount: any = ref(0)
const integrationCode: any = ref()
const sortBy: any = ref('choices')
const sortDesc: any = ref('asc')
const sortIcon: any = ref()
const editingComputedVariants: any = ref({})
const editingVariant: any = ref({})
const searchText: any = ref()
const isSearchActive = ref(false)
var originalVariants: any = ref()
const selectedVariants: any = ref([])
const groupBy: any = ref([{ key: 'choiceValueId', order: 'asc' }])

const pagination = ref({
  limit: 10,
  page: 1,
  totalNumberOfPages: 1,
  totalNumberOfRecords: 0
})

const props = defineProps<{
  productInfoForm: any,
  dialogAttach: any
}>()

const formatCurrency = (number: number) => {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(Number(number))
}


onBeforeMount(() => {
  initSearchVariantForm()
})



const mapAllChoices = async () => {

  const platforms = integrationStore.getClientPlatforms()
  const variants = props.productInfoForm.variants || []
  const choices = choicesStore.getChoices().value
  const currentCategory = categoriesStore.getCategory(props.productInfoForm.category)
  if (currentCategory == undefined) {
    console.error('Current category not found')
    return
  }
  for (const platform of platforms) {
    const integrationCategoryId = currentCategory.platforms[platform.code]
    const integrationCategoryAttributes = await integrationStore.retrieveIntegrationCategoryChoices(platform.code, integrationCategoryId)
    if (!Array.isArray(integrationCategoryAttributes)) continue
    for (const variant of variants) {
      variant.platforms = variant.platforms || {}

      const variantAttributes = variant.platforms[platform.code]?.attributes
      if (variantAttributes) {
        for (const variantIntegrationAttributeId in variantAttributes) {
          const integrationCategoryAttribute = integrationCategoryAttributes.find((item: any) => item._id == variantIntegrationAttributeId)
          let deleteFlag = false
          if (integrationCategoryAttribute?.allowCustom == false) {
            const found = integrationCategoryAttribute?.values?.find((item: any) => item.id == variantAttributes[variantIntegrationAttributeId])
            if (!found) deleteFlag = true
          }
          if (deleteFlag || !integrationCategoryAttribute || !variantAttributes[variantIntegrationAttributeId]) {
            delete variant.platforms[platform.code].attributes[variantIntegrationAttributeId]
          }
        }
      }

      /*       const customMap = integrationStore.getIntegrationCustomMap(platform.code) */

      for (const integrationCategoryAttribute of integrationCategoryAttributes) {

        /*         const customMatch = customMap?.find((item: any) => String(item.attributeId) === String(integrationCategoryAttribute._id))
                if (customMatch) {
                  let customValue = customMatch.location == 'product' ? props.productInfoForm[customMatch.value] : variant[customMatch.value]
                  if (customMatch.value.startsWith('images')) {
                    const [field, index] = customMatch.value.split('_')
                    customValue = props.productInfoForm.images?.find((img:any) => img._id === variant[field][index])?.url || null
                  }
                  else if (customMatch.value == "brand") {
                    customValue = brandsStore.getBrandTitle(customValue)
                  }
                  variant.platforms[platform.code].attributes = variant.platforms[platform.code].attributes || {}
                     variant.platforms[platform.code].attributes[integrationCategoryAttribute._id] = customValue
                }
         */


        for (const variantChoice of variant.choices) {
          const currentChoice = choices.find((item: any) => item._id == variantChoice.choiceId)
          if (!currentChoice) continue
          const integrationAttributeValueId = currentChoice.platforms[platform.code]?.[integrationCategoryId + '_' + integrationCategoryAttribute._id]?.[variantChoice.choiceValueId]
          if (integrationAttributeValueId) {
            variant.platforms[platform.code] = variant.platforms[platform.code] || {}
            variant.platforms[platform.code].attributes = variant.platforms[platform.code].attributes || {}
            variant.platforms[platform.code].attributes[integrationCategoryAttribute._id] = integrationAttributeValueId
          }
        }
      }
    }
  }
}


onMounted(() => {

  choicesStoreChoices = choicesStore.getChoices()
  if (props.productInfoForm.variants)
    originalVariants.value = props.productInfoForm.variants
  /*   originalVariants.value = JSON.parse(JSON.stringify(props.productInfoForm.variants)) */

  search()
  multipleVariantHeaders.value = [
    {
      title: 'Stok Kodu',
      icon: 'mdi-checkbox-multiple-outline',
      align: 'left',
      sortable: true,
      value: 'variant',
    },
    {
      title: 'Varyant',
      icon: 'mdi-checkbox-multiple-outline',
      align: 'left',
      sortable: true,
      value: 'choiceTitle',
    },
    {
      title: 'Seçenekler',
      icon: 'mdi-checkbox-multiple-outline',
      align: 'left',
      sortable: true,
      value: 'choices',
    },
    { title: 'Fiyat', icon: 'mdi-currency-try', sortable: true, value: 'prices' },
    { title: 'Stok', icon: 'mdi-numeric', sortable: true, value: 'stock' },
    /*     { title: 'Raf', icon: 'mdi-numeric', sortable: true, value: 'shelf' }, */
    { title: 'actions', icon: 'mdi-numeric', sortable: false, value: 'actions' }
  ]

  singleVariantHeaders.value = [
    {
      title: '',
      icon: 'mdi-checkbox-multiple-outline',
      align: 'left',
      sortable: false,
      value: 'variant',
    },
    { title: '', icon: 'mdi-currency-try', sortable: false, value: 'prices' },
    { title: '', icon: 'mdi-numeric', sortable: false, value: 'stock' },
    { title: '', icon: 'mdi-numeric', sortable: false, value: 'shelf' },
    { title: '', icon: 'mdi-numeric', sortable: false, value: 'actions' }
  ]

  headers.value = singleVariantHeaders.value
  if (props.productInfoForm.hasVariant == true)
    headers.value = multipleVariantHeaders.value
})

const sleep = (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
}


const batchVariantPricesUpdate = () => {
  for (const variant of props.productInfoForm.variants) {
    for (const platform of integrationStore.getPlatforms()) {
      variant.prices = variant.prices || {}
      variant.platforms = variant.platforms || {}
      variant.platforms[platform.code] = variant.platforms[platform.code] || {}
      variant.platforms[platform.code].prices = variant.platforms[platform.code].prices || {}

      variant.prices.isPlatformBasedPrice = batchVariant.value.prices.isPlatformBasedPrice
      if (!batchVariant.value.prices.isPlatformBasedPrice) {
        if (batchVariant.value.prices.salePrice) variant.prices.salePrice = batchVariant.value.prices.salePrice
        if (batchVariant.value.prices.marketPrice) variant.prices.marketPrice = batchVariant.value.prices.marketPrice
      } else {
        if (batchVariant.value.platforms[platform.code].prices.salePrice)
          variant.platforms[platform.code].prices.salePrice = batchVariant.value.platforms[platform.code].prices.salePrice
        if (batchVariant.value.platforms[platform.code].prices.marketPrice)
          variant.platforms[platform.code].prices.marketPrice = batchVariant.value.platforms[platform.code].prices.marketPrice
      }

    }
  }
  search()
  snackbarStore.addSnackbar({
    show: true,
    text: 'Toplu Fiyat Atamam İşlemi Tamamlandı',
    timeout: 2000,
    color: 'success'
  })

}


const batchVariantAttributesUpdate = () => {
  for (const variant of props.productInfoForm.variants) {
    for (const platform of integrationStore.getPlatforms()) {
      const incomingAttrs = batchVariant.value.platforms[platform.code]?.attributes || {};
      const incomingMapping = batchVariant.value.platforms[platform.code]?.mapping || {};
      variant.platforms = variant.platforms || {}
      variant.platforms[platform.code] = variant.platforms[platform.code] || {}
      variant.platforms[platform.code].attributes = variant.platforms[platform.code].attributes || {}
      variant.platforms[platform.code].mapping = variant.platforms[platform.code].mapping || {}

      for (const [id, infoValue] of Object.entries(incomingMapping)) {
        variant.platforms[platform.code].mapping[id] = infoValue
      }

      for (const [id, integrationId] of Object.entries(incomingAttrs)) {
        variant.platforms[platform.code].attributes[id] = integrationId;
      }
    }
  }
  snackbarStore.addSnackbar({
    show: true,
    text: 'Toplu Özellik Atamam İşlemi Tamamlandı',
    timeout: 2000,
    color: 'success'
  })

}

const openBatchVariantPlatformPrices = () => {
  batchVariant.value.prices = batchVariant.value.prices || { salePrice: 0, marketPrice: 0, isPlatformBasedPrice: false }
  if (batchVariant.value.platforms == undefined) batchVariant.value.platforms = {}
  for (const platform of integrationStore.getPlatforms()) {
    batchVariant.value.platforms[platform.code] = batchVariant.value.platforms[platform.code] || {}
    batchVariant.value.platforms[platform.code].prices = batchVariant.value.platforms[platform.code].prices || { salePrice: 0, marketPrice: 0 }
  }
  isBatchVariantPlatformPricesMenu.value = true
}


const openVariantPlatformPrices = (variant: any) => {
  editingVariant.value = variant
  if (editingVariant.value.platforms == undefined) editingVariant.value.platforms = {}
  for (const platform of integrationStore.getClientPlatforms()) {
    editingVariant.value.platforms[platform.code] = editingVariant.value.platforms[platform.code] || {}
    editingVariant.value.platforms[platform.code].prices = editingVariant.value.platforms[platform.code].prices || {
      salePrice: 0,
      marketPrice: 0
    }
  }
  isVariantPlatformPricesMenu.value = true
}

const deleteAllBatchProcess = () => {
  for (const variant of props.productInfoForm.variants) {
    deleteVariant(deleteVariant)
  }
}

const stockcodeBatchProcess = async () => {
  batchProcesses.value.stockcode.menu = false
  let index = 10
  for (const variant of props.productInfoForm.variants) {
    let choiceStr = ""
    for (const choice of variant.choices) {
      const choiceValueTitle = choicesStore.getChoiceValueName(choice.choiceId, choice.choiceValueId)
      if (choiceStr != "") choiceStr += "-"
      choiceStr += choiceValueTitle.substring(0, 2).toUpperCase()
    }
    await sleep(1)
    variant.stockcode = choiceStr + '_' + Date.now()
  }
}

const barcodeBatchProcess = async () => {
  for (const variant of props.productInfoForm.variants) {
    variant.barcode = Date.now()
    await sleep(1)
  }
  batchProcesses.value.barcode.menu = false
}


const shelfBatchProcess = () => {
  for (const variant of props.productInfoForm.variants) {
    variant.shelf = batchProcesses.value.shelf.value
  }
  batchProcesses.value.shelf.menu = false
}

const stockBatchProcess = () => {
  for (const variant of props.productInfoForm.variants) {
    variant.stock = batchProcesses.value.stock.value
  }
  batchProcesses.value.stock.menu = false
}


const isPlatformBasedPriceBatchProcess = () => {
  for (const variant of props.productInfoForm.variants) {
    variant.prices.isPlatformBasedPrice = batchProcesses.value.isPlatformBasedPrice.value
  }
  batchProcesses.value.isPlatformBasedPrice.menu = false
}

const marketPriceBatchProcess = () => {
  for (const variant of props.productInfoForm.variants) {
    if (batchProcesses.value.marketPrice.isPlatformBasedPrice == true) {
      for (const key of Object.keys(batchProcesses.value.marketPrice.prices)) {
        if (key == "isPlatformBasedPrice") continue
        if (variant.prices[key] == undefined) variant.prices[key] = {}
        variant.prices[key].marketPrice = batchProcesses.value.marketPrice.prices[key]
      }
    }
    else variant.prices.marketPrice = batchProcesses.value.marketPrice.value
  }
  batchProcesses.value.marketPrice.menu = false
}

const salePriceBatchProcess = () => {
  for (const variant of props.productInfoForm.variants) {
    if (batchProcesses.value.salePrice.isPlatformBasedPrice == true) {
      for (const key of Object.keys(batchProcesses.value.salePrice.prices)) {
        if (key == "isPlatformBasedPrice") continue
        if (variant.prices[key] == undefined) variant.prices[key] = {}
        variant.prices[key].salePrice = batchProcesses.value.salePrice.prices[key]
      }
    }
    else variant.prices.salePrice = batchProcesses.value.salePrice.value
  }
  batchProcesses.value.salePrice.menu = false
}




const findMinimumSalePrice = (platforms: any) => {
  const res = Object.values(platforms).reduce((min: any, platform: any) =>
    platform.prices?.salePrice && platform.prices?.salePrice < min ? platform.prices?.salePrice : min, Infinity);
  if (res == Infinity) return 0
  return Number(res)
}
const findMinimumMarketPrice = (platforms: any) => {
  const res = Object.values(platforms).reduce((min: any, platform: any) =>
    platform.prices?.marketPrice && platform.prices?.marketPrice < min ? platform.prices?.marketPrice : min, Infinity);
  if (res == Infinity) return 0
  return Number(res)
}
const findMaximumSalePrice = (platforms: any) => {
  return Number(Object.values(platforms).reduce((max: any, platform: any) =>
    platform.prices?.salePrice && platform.prices?.salePrice > max ? platform.prices?.salePrice : max, 0))
}
const findMaximumMarketPrice = (platforms: any) => {
  return Number(Object.values(platforms).reduce((max: any, platform: any) =>
    platform.prices?.marketPrice && platform?.prices.marketPrice > max ? platform.prices?.marketPrice : max, 0))
}


const rowspanCounts: any = computed(() => {
  const rowspanMap = new Map()
  const countMap = new Map()
  const choiceValueIds = []
  for (const variant of props.productInfoForm.variants) {
    choiceValueIds.push(variant.choices[0]?.choiceValueId)
  }
  for (const choiceValueId of choiceValueIds) {
    let count = 0
    for (const variant of props.productInfoForm.variants) {
      for (const choice of variant.choices) {
        if (choice.choiceValueId == choiceValueId)
          count++
      }
    }
  }

  for (const variant of props.productInfoForm.variants) {
    console.log(variant.tempId, rowspanMap.get(variant.tempId))
    if (rowspanMap.get(variant.tempId)) {
      rowspanMap.set(variant.tempId, rowspanMap.get(variant.tempId) + 1)
    } else {
      rowspanMap.set(variant.tempId, 1)
    }
  }
  return rowspanMap
})

watch(() => props.productInfoForm.variants, (newValue) => {
  search()
}
)


watch(isVariants, (newValue, oldValue) => {
  if (newValue == true)
    getVariants()
})


const updateVariants = async () => {
  let guid = loadingComponentRef.value.info(t('loading.info.updateVariants'))
  const response = await restApi.post("VariantService/updateVariants", { productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId, variants: editingComputedVariants.value })
  loadingComponentRef.value.remove(guid)

  if (response && response.modifiedCount > 0) {
    getVariants()
    resetEditingField()
  } else {
    guid = loadingComponentRef.value.warning(t('loading.warning.updateVariants'))
    await sleep(2000)
    loadingComponentRef.value.remove(guid)
  }
}

const addVariant = async (newVariant: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.addVariant'))
  const response = await restApi.post("VariantService/addVariant", { productId: props.productInfoForm._id, variant: newVariant })
  loadingComponentRef.value.remove(guid)
  if (response && response.modifiedCount == 1) {
    getVariants()
  } else {
    guid = loadingComponentRef.value.warning(t('loading.warning.addVariant'))
    await sleep(2000)
    loadingComponentRef.value.remove(guid)
  }
}

const addVariants = async (singleVariant: any, newVariants: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.addVariants'))
  const response = await restApi.post("VariantService/addVariants", { productId: props.productInfoForm._id, variantChoices: generateCombinations(newVariants), singleVariant: singleVariant })
  loadingComponentRef.value.remove(guid)
  if (response && response.modifiedCount == 1) {
    guid = loadingComponentRef.value.success(t('loading.success.addVariants'))
    loadingComponentRef.value.remove(guid)
    getVariants()
  } else {
    guid = loadingComponentRef.value.warning(t('loading.warning.addVariants'))
    await sleep(2000)
    loadingComponentRef.value.remove(guid)
  }
}

const deleteVariant = async (variant: any) => {
  const index = props.productInfoForm.variants.findIndex((item: any) => item.tempId === variant.tempId);
  if (index !== -1) {
    props.productInfoForm.variants.splice(index, 1);
  }
  if (!variant._id) return
  let guid = loadingComponentRef.value.info(t('loading.info.deleteVariant'))
  const response = await restApi.post("VariantService/deleteVariant", { variantId: variant._id })
  loadingComponentRef.value.remove(guid)
  if (response) {
    originalVariants.value = props.productInfoForm.variants
  }


  /*   props.productInfoForm.variants.delete(variant) */
  if (1 == 1) return
  let guid1 = loadingComponentRef.value.info(t('loading.info.deleteVariant'))
  const response1 = await restApi.post("VariantService/deleteVariant", { variantId: variant._id, productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId })
  loadingComponentRef.value.remove(guid)
  if (response && response.modifiedCount == 1) {
    guid = loadingComponentRef.value.success(t('loading.success.deleteVariant'))
    loadingComponentRef.value.remove(guid)
    getVariants()
  } else {
    guid = loadingComponentRef.value.error(t('loading.error.deleteVariant'))
    await sleep(2000)
    loadingComponentRef.value.remove(guid)
  }
}
const batchProcessUpdate = async (batchProcessForm: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.batchProcessUpdate'))
  const variantIds = []
  const request: any = {
    productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId,
    batchProcessForm: batchProcessForm,
    scope: batchProcessForm.scope
  }
  switch (batchProcessForm.scope) {
    case 0:
      request.selectedVariants = selectedVariants.value
      break
    case 1:
      request.selectedVariants = originalVariants.value.map((obj: any) => obj._id)
      break
    case 2:
      break
  }

  const response = await restApi.post("VariantService/batchProcessUpdate", request)
  loadingComponentRef.value.remove(guid)

  if (response && response.modifiedCount > 0) {
    getVariants()
  } else {
    guid = loadingComponentRef.value.error(t('loading.error.batchProcessUpdate'))
    await sleep(2000)
    loadingComponentRef.value.remove(guid)
  }
}

const batchProcessDelete = async (batchProcessForm: any) => {
  let guid = loadingComponentRef.value.info(t('loading.info.batchProcessDelete'))

  const request: any = {
    productId: props.productInfoForm._id ? props.productInfoForm._id : props.productInfoForm.tempId,
    scope: batchProcessForm.scope
  }
  switch (batchProcessForm.scope) {
    case 0:
      request.selectedVariants = selectedVariants.value
      break
    case 1:
      request.selectedVariants = originalVariants.value.map((obj: any) => obj._id)
      break
    case 2:
      break
  }

  const response = await restApi.post("VariantService/batchProcessDelete", request)
  loadingComponentRef.value.remove(guid)
  if (response && response.modifiedCount > 0) {
    getVariants()
  } else {
    guid = loadingComponentRef.value.error(t('loading.error.batchProcessDelete'))
    await sleep(2000)
    loadingComponentRef.value.remove(guid)
  }

}

const generateCombinations = (variantChoices: any) => {
  if (!variantChoices) return undefined
  const choiceCounts = variantChoices.length;
  const combinations: any = [];

  const generate = (currentCombination: Array<any>, index: any) => {
    if (index === choiceCounts) {
      combinations.push(currentCombination);
      return;
    }
    const array = variantChoices[index].choiceValueIds
    for (let item of array) {
      generate([...currentCombination, { choiceId: variantChoices[index].choiceId, choiceValueId: item }], index + 1);
    }
  }
  generate([], 0);
  return combinations;
}



const toggleSort = (key: any) => {
  if (sortBy.value === key) {
    sortDesc.value = sortDesc.value == 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = key
    sortDesc.value = 'asc'
  }
  pagination.value.page = 1
  search()
  //  getVariants()
}


const getVariants = async () => {
  resetEditingField()
  pagination.value.page = 1
  emits('refreshVariants')
}

const resetEditingField = () => {
  editingVariantId.value = -1
  editingHeaderValue.value = undefined
}

const verticalTableRef: any = ref(null)

const sortableFields = ['stock', 'prices'];

const sort = (filteredVariants: Array<any>) => {
  if (!sortBy.value) sortBy.value = 'choices';
  return filteredVariants.sort((a: any, b: any) => {
    if (a.choices[0]?.choiceValueId === b.choices[0]?.choiceValueId) {
      if (sortBy.value == 'choices') {
        const aFilteredChoices = a.choices.filter((c: any) => c.choices?.[0]?.choiceValueId !== a.choices?.[0]?.choiceValueId);
        const bFilteredChoices = b.choices.filter((c: any) => c.choices?.[0]?.choiceValueId !== b.choices?.[0]?.choiceValueId);

        const maxLength = Math.max(aFilteredChoices.length, bFilteredChoices.length);

        for (let i = 0; i < maxLength; i++) {
          const aChoice = aFilteredChoices[i];
          const bChoice = bFilteredChoices[i];

          if (!aChoice) return sortDesc.value === 'asc' ? -1 : 1;
          if (!bChoice) return sortDesc.value === 'asc' ? 1 : -1;

          const aTitle = choicesStore.getDirectChoiceValueTitle(aChoice.choiceValueId) || "";
          const bTitle = choicesStore.getDirectChoiceValueTitle(bChoice.choiceValueId) || "";

          const compare = aTitle.localeCompare(bTitle, 'tr', { sensitivity: 'base' });
          if (compare !== 0) return sortDesc.value === 'asc' ? compare : -1 * compare;
        }

        return 0;




      }
      else if (sortBy.value == 'prices.salePrice') {
        if (sortDesc.value === 'asc')
          return a.prices.salePrice - b.prices.salePrice // Fiyatı küçükten büyüğe sırala
        return b.prices.salePrice - a.prices.salePrice // Fiyatı küçükten büyüğe sırala
      }
      else if (sortBy.value == 'prices.marketPrice') {
        if (sortDesc.value === 'asc')
          return a.prices.marketPrice - b.prices.marketPrice // Fiyatı küçükten büyüğe sırala
        return b.prices.marketPrice - a.prices.marketPrice // Fiyatı küçükten büyüğe sırala
      }
      else if (sortBy.value == 'stockcode' || sortBy.value == 'barcode') {
        const compare = a[sortBy.value].localeCompare(b[sortBy.value], 'tr', { sensitivity: 'base' });
        if (compare !== 0) return sortDesc.value === 'asc' ? compare : -compare;
      }
      else {
        if (sortDesc.value === 'asc')
          return a[sortBy.value] - b[sortBy.value] // Fiyatı küçükten büyüğe sırala
        return b[sortBy.value] - a[sortBy.value] // Fiyatı küçükten büyüğe sırala
      }

    }

    const aTitle = choicesStore.getDirectChoiceValueTitle(a.choices[0]?.choiceValueId) || "";
    const bTitle = choicesStore.getDirectChoiceValueTitle(b.choices[0]?.choiceValueId) || "";

    if (sortBy.value == 'choiceValueTitle' && sortDesc.value === 'asc')
      return bTitle.localeCompare(aTitle)
    return aTitle.localeCompare(bTitle)
  });
}

const sort1 = (retrievedVariants: Array<any>) => {
  if (!retrievedVariants) return
  if (!sortBy.value) sortBy.value = '_id';

  return retrievedVariants.sort((a, b) => {
    const aValue = a[sortBy.value];
    const bValue = b[sortBy.value];

    // Boş değer kontrolü
    if (aValue == null && bValue == null) return 0; // Her ikisi de boşsa, değişiklik yok
    if (aValue == null) return 1; // aValue boşsa, bValue'yi daha önce getir
    if (bValue == null) return -1; // bValue boşsa, aValue'yi daha önce getir

    if (sortDesc.value === 'asc') {
      // Sayısal sıralama
      if (sortableFields.includes(sortBy.value)) {
        return aValue - bValue;
      }
      // String sıralama
      return aValue.localeCompare(bValue, 'tr');
    } else {
      // Sayısal sıralama
      if (sortableFields.includes(sortBy.value)) {
        return bValue - aValue;
      }
      // String sıralama
      return bValue.localeCompare(aValue, 'tr');
    }
  });
}



const getCombinations = (data: any): any[] => {
  // choiceValueIds içeren her öğeyi, { choiceId, choiceValueId } formatına dönüştür
  const entries = data.map((item: any) =>
    item.choiceValueIds.map((valueId: string) => ({
      choiceId: item.choiceId,
      choiceValueId: valueId
    }))
  );

  // Cartesian çarpımı ile tüm kombinasyonları oluştur
  const cartesianProduct = (arr: any[]): any[] =>
    arr.reduce((acc, val) =>
      acc.flatMap((a: any) => val.map((v: any) => [...a, v])), [[]]
    );

  return cartesianProduct(entries);
};

const areArraysEqual = (arr1: any, arr2: any) => {
  // Eğer array'ler farklı uzunluktaysa hemen false döneriz
  if (arr1.length !== arr2.length) {
    return false;
  }

  // Her iki array'deki öğeleri sırasıyla karşılaştırıyoruz
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i].choiceId !== arr2[i].choiceId || arr1[i].choiceValueId !== arr2[i].choiceValueId) {
      return false;
    }
  }

  // Eğer bütün öğeler eşitse, array'ler eşittir
  return true;
};

const generateUUID = () => {
  return Math.floor(Date.now() / 1000).toString(16) + 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function () {
    return (Math.random() * 16 | 0).toString(16);
  }).toLowerCase();
}






const getDefaultAttributes = async (integrationCode: string, variantChoices: any) => {


  const attributes: Record<string, string> = {}
  /*   const customMap = integrationStore.getIntegrationCustomMap(integrationCode) */
  const choices = choicesStore.getChoices().value
  const category = await categoriesStore.getCategory(props.productInfoForm.category)
  const integrationCategoryId = category.platforms?.[integrationCode]
  if (!integrationCategoryId) return attributes

  for (const variantChoice of variantChoices) {
    const choice = choices.find((c: any) => c._id === variantChoice.choiceId)
    if (!choice) continue

    const choicePlatform = choice.platforms?.[integrationCode]
    if (!choicePlatform) continue

    for (const key of Object.keys(choicePlatform)) {
      const valueMap = choicePlatform[key]
      const platformValue = valueMap?.[variantChoice.choiceValueId]
      if (!platformValue) continue

      // Custom map ile eşleşiyorsa özel işleme gir
      /*       const keyAttributeId = key.split('_')?.[1]
            const customMatch = customMap?.find((item: any) => String(item.attributeId) === String(keyAttributeId))
            if (customMatch) {
              const customValue = props.productInfoForm[customMatch.value]
              const brandTitle = brandsStore.getBrandTitle(customValue)
              attributes[keyAttributeId] = brandTitle
            } else {
              //attributes[keyAttributeId] = platformValue
            } */
    }
  }

  return attributes
}



const createVariantPlatforms = async (choices: any) => {
  const platforms: any = {}
  for (const platform of integrationStore.getPlatforms()) {
    platforms[platform.code] = {
      attributes: await getDefaultAttributes(platform.code, choices),
      prices: {
        marketPrice: 0,
        salePrice: 0
      }
    }
  }
  return platforms
}

const createVariant = async (choices: any) => {
  const platforms: any = await createVariantPlatforms(choices)
  const newVariant: any = { tempId: generateUUID(), choices: choices, platforms: platforms, images: [], stockcode: '', barcode: '', stock: 0, prices: { isPlatformBasedPrice: false, marketPrice: 0, salePrice: 0 }, shelf: '' }
  choices.find((choice: any) => {

    /*     if (choice.choiceId == computedMainChoiceId.value) { */
    if (choice.choiceId == choices[0]?.choiceId) {
      newVariant.choiceId = choice.choiceId
      newVariant.choiceValueId = choice.choiceValueId
      newVariant.choiceValueTitle = choicesStore.getDirectChoiceValueTitle(choice.choiceValueId)
      multipleVariantHeaders.value[1].title = choicesStore.getChoiceTitle(choice.choiceId)
    }
  })
  return newVariant
}


const sortByProperty = (arr: any, key: any, order = "asc") => {
  return arr.sort((a: any, b: any) => {
    if (a[key] < b[key]) return order === "asc" ? -1 : 1;
    if (a[key] > b[key]) return order === "asc" ? 1 : -1;
    return 0;
  });
};

const computedVariantListInPage: any = computed(() => {
  return props.productInfoForm.variants.slice(pagination.value.limit * (pagination.value.page - 1))
})


const generateVariants = async (newVariants: any) => {
  console.log("newVariants", newVariants)

  const existingChoice = props.productInfoForm.variants?.[0]?.choices
  if (existingChoice && existingChoice.length > 0) {
    const allExist = existingChoice.every((existing: any) =>
      newVariants.some((newChoice: any) => newChoice.choiceId === existing.choiceId)
    )

    if (!allExist) {
      snackbarStore.addSnackbar({
        show: true,
        text: 'Eklenmek istenen varyant seçenekleri, ekli olan varyantlardan farklıdır.',
        timeout: 10000,
        color: 'error'
      })
      return
    }
  }

  const combinations = getCombinations(newVariants)
  let countOfNewVariants = 0
  for (const combination of combinations) {
    var flag = false
    for (const variant of props.productInfoForm.variants) {
      //console.log(variant.choices, combination, areArraysEqual(variant.choices, combination))
      if (areArraysEqual(variant.choices, combination)) {
        flag = true
        break
      }
    }
    if (flag == false) {
      props.productInfoForm.variants.push(await createVariant(combination))
      countOfNewVariants++
      props.productInfoForm.variants = sortByProperty(props.productInfoForm.variants, "choiceValueTitle")
      /*       originalVariants.value = JSON.parse(JSON.stringify(props.productInfoForm.variants)) */
      originalVariants.value = props.productInfoForm.variants
      preparePagination()
    }
  }

  props.productInfoForm.variants = sortByProperty(props.productInfoForm.variants, "choiceValueTitle")

  snackbarStore.addSnackbar({
    show: true,
    text: countOfNewVariants + ' adet ürün varyantı eklendi',
    timeout: 3000,
    color: 'success'
  })


}

const initSearchVariantForm = async () => {
  searchVariantForm.value = { searchVariantFormMenu: false }
  search()
}


const computedMainChoiceId = computed(() => {
  const category = categoriesStore.getCategory(props.productInfoForm.category)
  return category?.mainChoiceId
})


const rowspanSet = computed(() => {
  const rowspanSet = new Map()
  rowspanSet.clear()
  var tempChoiceValueId = undefined
  for (const variant of originalVariants.value) {
    if (variant.choices[0]?.choiceValueId != tempChoiceValueId) {
      tempChoiceValueId = variant.choices[0]?.choiceValueId
      rowspanSet.set(variant.tempId, originalVariants.value.filter((item: any) => item.choices[0]?.choiceValueId === variant.choices[0]?.choiceValueId).length)
    }
  }

  return rowspanSet
})

const preparePagination = () => {
  pagination.value.totalNumberOfRecords = originalVariants.value.length
  pagination.value.totalNumberOfPages = Math.ceil(pagination.value.totalNumberOfRecords / pagination.value.limit)
  isFiltered.value = originalVariants.value.isFiltered

  console.log("duygu pagination", originalVariants.value)
  const start = (pagination.value.page - 1) * pagination.value.limit;
  const end = start + pagination.value.limit
  originalVariants.value = originalVariants.value.slice(start, end)

  /*   rowspanSet.value.clear()
    var tempChoiceValueId = undefined
    for (const variant of originalVariants.value) {
      if (variant.choices[0].choiceValueId != tempChoiceValueId) {
        tempChoiceValueId = variant.choices[0].choiceValueId
        rowspanSet.value.set(variant.tempId, originalVariants.value.filter((item: any) => item.choices[0].choiceValueId === variant.choices[0].choiceValueId).length)
      }
    } */

  console.log("duygu rowspanSet", rowspanSet.value)

}
const searchAuto = () => {
  originalVariants.value = JSON.parse(JSON.stringify(props.productInfoForm.variants))
  if (!searchText.value || searchText.value.length < 2) {
    preparePagination()
    return
  }
  const filteredVariants: any = []
  for (const variant of originalVariants.value) {
    if ((variant.stockcode && variant.stockcode.toLowerCase().includes(searchText.value.toLowerCase())) || (variant.barcode && variant.barcode.toLowerCase().includes(searchText.value.toLowerCase()))) {
      filteredVariants.push(variant)
    }
  }
  originalVariants.value = filteredVariants
  preparePagination()


}


const checkSearchPrice = (variant: any) => {
  const min = searchVariantForm.value.min
  const max = searchVariantForm.value.max
  if (min == undefined && max == undefined) return true

  const variantSalePrice = variant.prices.salePrice
  const variantMarketPrice = variant.prices.marketPrice

  if (min != undefined && max != undefined) {
    if (variantSalePrice >= min && variantSalePrice <= max) return true
    if (variantMarketPrice >= min && variantMarketPrice <= max) return true
  } else if (min != undefined) {
    if (variantSalePrice >= min) return true
    if (variantMarketPrice >= min) return true
  } else if (max != undefined) {
    if (variantSalePrice <= max) return true
    if (variantMarketPrice <= max) return true
  }
  return false
}
const search = async () => {
  /*   await nextTick(() => { }) */

  if (!props.productInfoForm.variants) return
  /*   originalVariants.value = JSON.parse(JSON.stringify(props.productInfoForm.variants)) */
  const filteredVariants: any = props.productInfoForm.variants
  /*   for (const variant of props.productInfoForm.variants) {
      if (searchVariantForm.value.shelf) {
        if (searchVariantForm.value.shelf != variant.shelf)
          continue
      }
      if (searchVariantForm.value.stock) {
        if (searchVariantForm.value.stock != variant.stock)
          continue
      }
      if (searchVariantForm.value.stockcode) {
        if (!variant.stock || !variant.stockcode.includes(searchVariantForm.value.stockcode))
          continue
      }
      if (searchVariantForm.value.barcode) {
        if (!variant.barcode || !variant.barcode.includes(searchVariantForm.value.barcode))
          continue
      }
  
      if (searchVariantForm.value.isPlatformBasedPrice == undefined || searchVariantForm.value.isPlatformBasedPrice == 0) {
        //
      } else if (searchVariantForm.value.isPlatformBasedPrice == 2 && variant.prices.isPlatformBasedPrice == false) {
        continue
      } else if (variant.prices.isPlatformBasedPrice == true) {
        continue
      }
  
  
      if (searchVariantForm.value.choices) {
        var flag = true
        for (let searchChoice of searchVariantForm.value.choices) {
          if (!searchChoice.choiceValueIds || searchChoice.choiceValueIds.length == 0) continue
          var choiceFlag = false
          for (let variantChoice of variant.choices) {
            if (searchChoice.choiceId === variantChoice.choiceId && searchChoice.choiceValueIds.includes(variantChoice.choiceValueId)) {
              choiceFlag = true
              break
            }
          }
          if (choiceFlag == false) {
            flag = false
            break
          }
        }
        if (flag == false) continue
      }
  
      if (!checkSearchPrice(variant)) continue
  
      filteredVariants.push(variant)
    } */
  selectedVariants.value.length = 0

  originalVariants.value = sort(props.productInfoForm.variants)

  preparePagination()


  if (integrationCode.value) {
    for (const variant of originalVariants.value) {
      if (!variant.prices) variant.prices = {}
      if (!variant.prices[integrationCode.value]) variant.prices[integrationCode.value] = { marketPrice: 0.00, salePrice: 0.00 }
    }
  }

  editingComputedVariants.value = JSON.parse(JSON.stringify(originalVariants.value))

  return
}



const setEditingField = (header: any, variantId: any) => {
/*   if (editingHeaderValue.value == header.value) {
    resetEditingField()
    return
  }
  */ editingVariantId.value = variantId
  editingHeaderValue.value = header.value
}


</script>


<style scoped>
@media (max-width: 3200px) {
  .special-table-width {
    max-width: 72vw !important;
  }
}

@media (max-width: 2800px) {
  .special-table-width {
    max-width: 70vw !important;
  }
}

@media (max-width: 2500px) {
  .special-table-width {
    max-width: 68vw !important;
  }
}

@media (max-width: 2200px) {
  .special-table-width {
    max-width: 65vw !important;
  }
}

@media (max-width: 2000px) {
  .special-table-width {
    max-width: 60vw !important;
  }
}

@media (max-width: 1800px) {
  .special-table-width {
    max-width: 55vw !important;
  }
}

@media (max-width: 1600px) {
  .special-table-width {
    max-width: 50vw !important;
  }
}

@media (max-width: 1400px) {
  .special-table-width {
    max-width: 45vw !important;
  }
}

@media (max-width: 1200px) {
  .special-table-width {
    max-width: 40vw !important;
  }

  @media (max-width: 1100px) {
    .special-table-width {
      max-width: 30vw !important;
    }
  }


  .sticky-container {
    width: 100%;
  }

  .sticky-row {
    position: -webkit-sticky;
    /* For Safari */
    position: sticky;
    top: 0;
    z-index: 1000;
    /* Adjust z-index if needed */
    background-color: white;
    /* Optional: Add background color */
  }
}

.custom-checkbox {
  height: 24px;
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>