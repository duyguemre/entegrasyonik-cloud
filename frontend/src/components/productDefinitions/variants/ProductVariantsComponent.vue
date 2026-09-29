<template>
  <div>
    <LoadingComponent :attach="dialogAttach" ref="loadingComponentRef"></LoadingComponent>

    <v-dialog scrim persistent :retain-focus="false" v-model="show" location-strategy="connected" target="cursor"
      no-click-animation :close-on-content-click="false" :attach="dialogAttach"
      :contained="true" location="left" height="100%" width="100%" class="pv-fade-fast" :class="{ 'pv-dialog-idle': !searchVariantForm.searchVariantFormMenu && !batchProcessFormMenu && !newVariantMenu && !isVariantPlatformPricesMenu && !isImagesDialog && !isVariantAttributesDialog && !isBatchVariantDialog && !isVariantImagesDialog && !isBatchVariantPlatformPricesMenu }">

      <keep-alive>
        <ProductImagesComponent v-model="isImagesDialog" key="ProductImagesComponent"
          @close="isImagesDialog = false" v-if="isImagesDialog == true" :productInfoForm="productInfoForm" class="pv-fade" :class="{ 'pv-dim': !isImagesDialog }" />

      </keep-alive>

      <keep-alive>
        <ProductVariantImagesComponent v-model="isVariantImagesDialog" :variant="selectedVariantForEdit" key="ProductImagesComponent"
          @close="isVariantImagesDialog = false" v-if="isVariantImagesDialog == true"
          :productInfoForm="productInfoForm" class="pv-fade" :class="{ 'pv-dim': !isVariantImagesDialog }" />

      </keep-alive>

      <keep-alive>
        <ProductVariantAttributesComponent v-model="isVariantAttributesDialog" :editingVariant="editingVariant" key="ProductImagesComponent"
          @close="isVariantAttributesDialog = false" v-if="isVariantAttributesDialog == true"
          :productInfoForm="productInfoForm" class="pv-fade" :class="{ 'pv-dim': !isVariantAttributesDialog }" />
      </keep-alive>

      <keep-alive>
        <ProductBatchVariantAttributesComponent v-model="isBatchVariantDialog" :batchVariant="batchVariant"
          @batchVariantAttributesUpdate="batchVariantAttributesUpdate"
          key="ProductBatchVariantAttributesComponent" @close="isBatchVariantDialog = false"
          v-if="isBatchVariantDialog == true" :productInfoForm="productInfoForm" class="pv-fade" :class="{ 'pv-dim': !isBatchVariantDialog }" />
      </keep-alive>


      <keep-alive>
        <ProductSearchVariantComponent
          v-if="searchVariantForm.searchVariantFormMenu"
          key="ProductSearchVariantComponent" v-model="searchVariantForm"
          @close="searchVariantForm.searchVariantFormMenu = false" @searchVariants="search" :isFiltered="isFiltered"
          :productInfoForm="productInfoForm" class="pv-fade" :class="{ 'pv-dim': !searchVariantForm.searchVariantFormMenu }" />
      </keep-alive>

      <keep-alive>
        <ProductBatchProcessVariantComponent
          v-if="batchProcessFormMenu" key="ProductBatchProcessVariantComponent" @close="batchProcessFormMenu = false"
          @batchProcessUpdate="batchProcessUpdate" v-model="batchProcessFormMenu"
          @batchProcessDelete="batchProcessDelete" :productInfoForm="productInfoForm"
          :totalNumberOfVariants="pagination.totalNumberOfRecords" class="pv-fade" :class="{ 'pv-dim': !batchProcessFormMenu }" />
      </keep-alive>
      <keep-alive>
        <ProductVariantPlatformPricesComponent v-model="isVariantPlatformPricesMenu" :editingVariant="editingVariant"
          key="ProductVariantPlatformPricesComponent" @close="isVariantPlatformPricesMenu = false"
          v-if="isVariantPlatformPricesMenu == true" :productInfoForm="productInfoForm" class="pv-fade" :class="{ 'pv-dim': !isVariantPlatformPricesMenu }" />
      </keep-alive>

      <keep-alive>
        <ProductBatchVariantPlatformPricesComponent v-model="isBatchVariantPlatformPricesMenu"
          :batchVariant="batchVariant" @batchVariantPricesUpdate="batchVariantPricesUpdate"
          key="ProductBatchVariantPlatformPricesComponent" @close="isBatchVariantPlatformPricesMenu = false"
          v-if="isBatchVariantPlatformPricesMenu == true" :productInfoForm="productInfoForm" class="pv-fade" :class="{ 'pv-dim': !isBatchVariantPlatformPricesMenu }" />
      </keep-alive>

    </v-dialog>
    <div class="pt-12" v-if="!productInfoForm.hasVariant">
    </div>
    <v-data-table-server v-model="selectedVariants" :items-length="originalVariants ? originalVariants.length : 0"
      :items="originalVariants" fixed-header item-value="tempId" :headers="headers" class="pa-0 ma-0 pv-table"
      :show-select="productInfoForm.hasVariant">

      <template v-slot:header.variant="{ column, getSortIcon, isSorted, someSelected }">
        <div class="d-flex fill-height align-center">
          <div class="text-center pv-image-head"><v-icon>mdi-image-outline</v-icon></div>
          <div :class="isDisplayMd() ? ['mt-0'] : ['d-flex']" class="align-center" v-if="productInfoForm.hasVariant">
            <div class="font-weight-bold pv-sort-head pv-w-120" @click="toggleSort('stockcode')"
              @mouseenter="sortIcon = 'stockcode'" @mouseleave="sortIcon = undefined">
              <v-menu v-model="batchProcesses.stockcode.menu">
                <template v-slot:activator="{ props: menu }">
                  <v-tooltip location="top">
                    <template v-slot:activator="{ props: tooltip }">
                      <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1" aria-label="Toplu stok kodu oluştur"
                        color="processButtonColor">mdi-card-multiple</v-icon>
                    </template>
                    <span>Toplu stok kodu oluştur.</span>
                  </v-tooltip>
                </template>
                <v-card min-width="240px">
                  <v-card-text>
                    <v-btn-group elevation="1" class="d-block pv-btn-group" density="compact">
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
              <v-icon v-else :class="sortIcon == 'stockcode' ? 'pv-sort-icon--hint' : 'pv-sort-icon--hidden'">
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>

            </div>
            {{ isDisplayMd() ? '' : '|' }}

            <div class="font-weight-bold pv-sort-head" @click="toggleSort('barcode')"
              @mouseenter="sortIcon = 'barcode'" @mouseleave="sortIcon = undefined">


              <v-menu v-model="batchProcesses.barcode.menu">
                <template v-slot:activator="{ props: menu }">
                  <v-tooltip location="top">
                    <template v-slot:activator="{ props: tooltip }">
                      <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1" aria-label="Toplu barkod oluştur"
                        color="processButtonColor">mdi-card-multiple</v-icon>
                    </template>
                    <span>Toplu barkod oluştur.</span>
                  </v-tooltip>
                </template>
                <v-card min-width="240px">
                  <v-card-text>
                    <v-btn-group elevation="1" class="d-block pv-btn-group" density="compact">
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
              <v-icon v-else :class="sortIcon == 'barcode' ? 'pv-sort-icon--hint' : 'pv-sort-icon--hidden'">
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </div>
          </div>
        </div>
      </template>



      <template v-slot:header.choices="{ column, getSortIcon, isSorted, someSelected }">
        <div class="d-flex fill-height align-center" v-if="productInfoForm.hasVariant">
          <div class="font-weight-bold text-body-2 pv-sort-head" @click="toggleSort('choices')"
            @mouseenter="sortIcon = 'choices'" @mouseleave="sortIcon = undefined">

            {{ isDisplayMd() ? 'Seç.ler' : 'Seçenekler' }}

            <template v-if="sortBy === 'choices'">
              <v-icon>
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </template>
            <v-icon v-else :class="sortIcon == 'choices' ? 'pv-sort-icon--hint' : 'pv-sort-icon--hidden'">
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </div>
        </div>
      </template>


      <template v-slot:header.prices>
        <div :class="isDisplayMd() ? [] : ['d-flex']" class=" fill-height align-center"
          v-if="productInfoForm.hasVariant">
          <div></div>
          <div class="font-weight-bold  ml-1 pv-sort-head pv-w-115"
            @click="toggleSort('prices.salePrice')" @mouseenter="sortIcon = 'prices.salePrice'"
            @mouseleave="sortIcon = undefined">


            <v-menu v-model="batchProcesses.salePrice.menu">
              <template v-slot:activator="{ props: menu }">
                <v-tooltip location="top">
                  <template v-slot:activator="{ props: tooltip }">
                    <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1" aria-label="Toplu satış fiyatı değiştir"
                      color="processButtonColor">mdi-card-multiple</v-icon>
                  </template>
                  <span>Toplu piyasa fiyatı değiştir</span>
                </v-tooltip>
              </template>
              <v-card min-width="240px">
                <v-card-text>
                  <v-checkbox :label="$t('productDefinitions.product.platformPrice')" @update:modelValue=""
                    density="compact" hide-details class="ma-0 mb-2 pa-0 pv-minw-180"
                    v-model="batchProcesses.salePrice.isPlatformBasedPrice" @click.stop />

                  <VCurrencyComponentVue v-model="batchProcesses.salePrice.value" :rules="formRules.mandatoryRule"
                    v-if="!batchProcesses.salePrice.isPlatformBasedPrice" :compact="true"
                    :label="$t('productDefinitions.product.variants.salePrice')" clearable @click.stop :required="true"
                    class="mt-2 mb-2 pv-mw-300">
                  </VCurrencyComponentVue>

                  <div v-else v-for="(platform, index) of integrationStore.getClientMarketplaces()" class="pa-2 pv-platform-row">
                    <v-row>
                      <v-col>
                        <div class="d-flex justify-center  align-center row-title">
                          <v-avatar rounded="2"
                            class="mt-0 mr-1 mb-0 ml-2 mr-2 pa-2 text-center d-flex justify-center elevation-4 pv-platform-avatar"
                            elevation=2
                            :style="{ 'background-color': platform.color }">
                            <v-img :width="platform.width"
                              :src="integrations.getTypePath(platform.type._id) + platform.logo"></v-img>
                          </v-avatar>
                          <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop
                            v-model="batchProcesses.salePrice.prices[platform.code]" :rules="formRules.mandatoryRule"
                            :compact="true" :label="$t('productDefinitions.product.variants.salePrice')" clearable
                            :required="true" class="ml-4 pv-minw-200">
                          </VCurrencyComponentVue>
                        </div>
                      </v-col>
                    </v-row>
                  </div>

                  <v-btn-group elevation="1" class="d-block pv-btn-group" density="compact">
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
            <v-icon v-else :class="sortIcon == 'prices.salePrice' ? 'pv-sort-icon--hint' : 'pv-sort-icon--hidden'">
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </div>
          {{ isDisplayMd() ? '' : '|' }}
          <div class="font-weight-bold ml-1 pv-sort-head" @click="toggleSort('prices.marketPrice')"
            @mouseenter="sortIcon = 'prices.marketPrice'" @mouseleave="sortIcon = undefined">

            <v-menu v-model="batchProcesses.marketPrice.menu">
              <template v-slot:activator="{ props: menu }">
                <v-tooltip location="top">
                  <template v-slot:activator="{ props: tooltip }">
                    <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1" aria-label="Toplu piyasa fiyatı değiştir"
                      color="processButtonColor">mdi-card-multiple</v-icon>
                  </template>
                  <span>Toplu piyasa fiyatı değiştir</span>
                </v-tooltip>
              </template>
              <v-card min-width="240px">
                <v-card-text>
                  <v-checkbox :label="$t('productDefinitions.product.platformPrice')" @update:modelValue=""
                    density="compact" hide-details class="ma-0 mb-2 pa-0 pv-minw-180"
                    v-model="batchProcesses.marketPrice.isPlatformBasedPrice" @click.stop />

                  <VCurrencyComponentVue v-model="batchProcesses.marketPrice.value" :rules="formRules.mandatoryRule"
                    v-if="!batchProcesses.marketPrice.isPlatformBasedPrice" :compact="true"
                    :label="$t('productDefinitions.product.variants.marketPrice')" clearable @click.stop
                    :required="true" class="mt-2 mb-2 pv-mw-300">
                  </VCurrencyComponentVue>

                  <div v-else v-for="(platform, index) of integrationStore.getClientMarketplaces()" class="pa-2 pv-platform-row">
                    <v-row>
                      <v-col>
                        <div class="d-flex justify-center  align-center row-title">
                          <v-avatar rounded="2"
                            class="mt-0 mr-1 mb-0 ml-2 mr-2 pa-2 text-center d-flex justify-center elevation-4 pv-platform-avatar"
                            elevation=2
                            :style="{ 'background-color': platform.color }">
                            <v-img :width="platform.width"
                              :src="integrations.getTypePath(platform.type._id) + platform.logo"></v-img>
                          </v-avatar>
                          <VCurrencyComponentVue prepend-icon="mdi-currency-try" @click.stop
                            v-model="batchProcesses.marketPrice.prices[platform.code]" :rules="formRules.mandatoryRule"
                            :compact="true" :label="$t('productDefinitions.product.variants.marketPrice')" clearable
                            :required="true" class="ml-4 pv-minw-200">
                          </VCurrencyComponentVue>
                        </div>
                      </v-col>
                    </v-row>
                  </div>

                  <v-btn-group elevation="1" class="d-block pv-btn-group" density="compact">
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
            <v-icon v-else :class="sortIcon == 'prices.marketPrice' ? 'pv-sort-icon--hint' : 'pv-sort-icon--hidden'">
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
          </div>

          {{ isDisplayMd() ? '' : '|' }}

          <div class="font-weight-bold ml-1 pv-sort-head">

            <v-menu v-model="batchProcesses.isPlatformBasedPrice.menu">
              <template v-slot:activator="{ props: menu }">
                <v-tooltip location="top">
                  <template v-slot:activator="{ props: tooltip }">
                    <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1" aria-label="Toplu platform bazında fiyat değiştir"
                      color="processButtonColor">mdi-card-multiple</v-icon>
                  </template>
                  <span>Toplu platform bazında fiyat değiştir</span>
                </v-tooltip>
              </template>
              <v-card width="240px">
                <v-card-text>
                  <v-checkbox :label="$t('productDefinitions.product.platformPrice')" @update:modelValue=""
                    density="compact" hide-details class="ma-0 mb-2 pa-0 pv-minw-180"
                    v-model="batchProcesses.isPlatformBasedPrice.value" @click.stop />

                  <v-btn-group elevation="1" class="d-block pv-btn-group" density="compact">
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
            <div class="font-weight-bold pv-sort-head" @click="toggleSort('stock')"
              @mouseenter="sortIcon = 'stock'" @mouseleave="sortIcon = undefined">

              <v-menu v-model="batchProcesses.stock.menu">
                <template v-slot:activator="{ props: menu }">
                  <v-tooltip location="top">
                    <template v-slot:activator="{ props: tooltip }">
                      <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1" aria-label="Toplu stok değiştir"
                        color="processButtonColor">mdi-card-multiple</v-icon>
                    </template>
                    <span>Toplu stok değiştir</span>
                  </v-tooltip>
                </template>
                <v-card width="240px">
                  <v-card-text>
                    <v-text-field label="Stok Adedi" prepend-icon="mdi-counter" density="compact" variant="outlined"
                      bg-color="textfieldColor" class="pv-mw-300" v-model="batchProcesses.stock.value"
                      @click.stop clearable>
                    </v-text-field>
                    <v-btn-group elevation="1" class="d-block pv-btn-group" density="compact">
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
              <v-icon v-else :class="sortIcon == 'stock' ? 'pv-sort-icon--hint' : 'pv-sort-icon--hidden'">
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>

            </div>
          </div>


          <div class="d-flex fill-height align-center" v-if="productInfoForm.hasVariant">
            <div class="font-weight-bold pv-sort-head" @click="toggleSort('shelf')"
              @mouseenter="sortIcon = 'shelf'" @mouseleave="sortIcon = undefined">


              <v-menu v-model="batchProcesses.shelf.menu">
                <template v-slot:activator="{ props: menu }">
                  <v-tooltip location="top">
                    <template v-slot:activator="{ props: tooltip }">
                      <v-icon v-bind="mergeProps(menu, tooltip)" class="mr-1" aria-label="Toplu raf değiştir"
                        color="processButtonColor">mdi-card-multiple</v-icon>
                    </template>
                    <span>Toplu raf değiştir</span>
                  </v-tooltip>
                </template>
                <v-card width="240px">
                  <v-card-text>
                    <v-text-field label="Raf" prepend-icon="mdi-counter" density="compact" variant="outlined"
                      bg-color="textfieldColor" class="pv-mw-300" v-model="batchProcesses.shelf.value"
                      @click.stop clearable>
                    </v-text-field>
                    <v-btn-group elevation="1" class="d-block pv-btn-group" density="compact">
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
              <v-icon v-else :class="sortIcon == 'shelf' ? 'pv-sort-icon--hint' : 'pv-sort-icon--hidden'">
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </div>
          </div>
        </div>
      </template>





      <template v-slot:header.choiceTitle="{ column }">

        <div class="d-flex fill-height align-center">
          <div class="font-weight-bold text-body-2 pv-sort-head"
            @click="toggleSort('choiceValueTitle')" @mouseenter="sortIcon = 'choiceValueTitle'"
            @mouseleave="sortIcon = undefined">
            Grup
            <template v-if="sortBy === 'choiceValueTitle'">
              <v-icon>
                {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
              </v-icon>
            </template>
            <v-icon v-else-if="sortIcon == 'choiceValueTitle'" class="pv-sort-icon--hint">
              {{ sortDesc === 'asc' ? 'mdi-arrow-down' : 'mdi-arrow-up' }}
            </v-icon>
            <v-icon v-else class="pv-sort-icon--hidden">
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
              <v-btn v-bind="props" size="35" elevation=0 color="success" class="mr-2 pv-head-btn" aria-label="Varyant oluştur">
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

          <EkContextMenu :groups="variantOpsMenu" label="Varyant işlemleri" title="Varyant İşlemleri"
            description="İşlem yalnızca bu ürün için uygulama kataloğunda yapılır." @select="onVariantOp">
            <template #activator="{ props }">
              <v-btn flat size="35" v-bind="props" elevation=0
                color="transparent" class="pv-head-btn pv-head-btn--surface" aria-label="Varyant işlemleri">
                <v-icon color="processButtonColor" size="x-large" class="">mdi-menu</v-icon>
              </v-btn>
            </template>
          </EkContextMenu>
        </div>
      </template>
      <template v-slot:item="{ item, index }: any">

        <tr v-if="index != 0 && rowspanSet.get(item.tempId)">
          <td colspan="9" class="pv-group-spacer">
          </td>
        </tr>


        <tr>

          <td class="text-center " v-if="productInfoForm.hasVariant">
            <div>
              <v-checkbox v-model="selectedVariants" :value="item.tempId" density="compact" aria-label="Varyantı seç"
                hide-details class="pv-select-cb"></v-checkbox>
            </div>
          </td>
          <td class="pv-td-variant">
            <div class="d-flex align-center fill-height; pv-clickable"
              @click="setEditingField({ value: 'stockcode' }, item.tempId)">
              <div class="text-center mr-4 elevation-1 pv-thumb">
                <v-tooltip location="bottom" open-delay="1000" text="Ürünü düzenlemek için basınız">
                  <template v-slot:activator="{ props: tooltipProps }">

                    <ProductVariantImageComponent v-bind="{ ...tooltipProps }" :productInfoForm="productInfoForm"
                      @click.stop="isVariantImagesDialog = true; selectedVariantForEdit = item"
                      :imageId="item.images ? item.images[0] : undefined" class="pv-thumb-img" />

                  </template>
                </v-tooltip>
              </div>
              <div v-if="editingVariantId == item.tempId && editingHeaderValue == 'stockcode'" class="pr-4 pv-w-full">
                <v-text-field density="compact" variant="outlined" bg-color="textfieldColor" class=""
                  label="Stok Kodu" v-model="item.stockcode" @click.stop hide-details></v-text-field>
                <v-text-field density="compact" variant="outlined" bg-color="textfieldColor" class="mt-2"
                  label="Barkod" v-model="item.barcode" @click.stop hide-details></v-text-field>
              </div>
              <div v-else class="d-flex align-center fill-height pv-w-full">
                <div class="d-flex">
                  <div>
                    <div class="font-weight-light text-caption mt-1 pv-field-caption">
                      Stok
                      Kodu
                    </div>
                    <span class="font-weight-bold">{{ item.stockcode }}</span>
                    <div class="font-weight-light text-caption mt-1 pv-field-caption">
                      Barkod
                    </div>
                    <span class="font-weight-medium">{{ item.barcode }}</span>
                  </div>
                </div>
              </div>
            </div>

          </td>
          <td :rowspan="rowspanSet.get(item.tempId)" v-if="productInfoForm.hasVariant && rowspanSet.get(item.tempId)"
            class="text-center pv-td-group">
            <div class="font-weight-bold">{{ choicesStore.getChoiceValueName(item.choices[0]?.choiceId,
              item.choices[0]?.choiceValueId) }} </div>
          </td>

          <td
            v-if="productInfoForm.hasVariant" class="pv-td-choices">
            <div class="d-flex fill-height align-center d-block mt-1 pv-w-full">
              <div>
                <div v-for="(choice, index) of item.choices">
                  <div class="d-flex" v-if="index > 0">
                    <div :class="index > 0 ? ['pt-1'] : []">
                      <div class="font-weight-light text-caption pv-field-caption">
                        {{ choicesStore.getChoiceTitle(choice.choiceId) }} </div>
                      <span class="font-weight-bold">{{ choicesStore.getChoiceValueName(choice.choiceId,
                        choice.choiceValueId) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </td>
          <td class="pv-td-price">
            <div class="d-flex fill-height align-center pv-w-full-soft">

              <div :class="isDisplayMd() ? [] : ['d-flex', 'align-center']" class="pv-clickable pv-w-full">
                <div
                  v-if="item.prices.isPlatformBasedPrice == false && editingVariantId == item.tempId && editingHeaderValue == 'prices'" class="pv-minw-200i">
                  <div class="d-flex align-center justify-start">
                    <VCurrencyComponentVue v-model="item.prices.salePrice" :rules="formRules.mandatoryRule"
                      :compact="true" :label="$t('productDefinitions.product.variants.salePrice')" clearable
                      :required="true" class="mt-1 pv-mw-300">
                    </VCurrencyComponentVue>
                  </div>

                  <div class="d-flex align-center justify-start">
                    <VCurrencyComponentVue v-model="item.prices.marketPrice" :rules="formRules.mandatoryRule"
                      :compact="true" :label="$t('productDefinitions.product.variants.marketPrice')" clearable
                      :required="true" class="mt-2 pv-mw-300">
                    </VCurrencyComponentVue>
                  </div>
                </div>

                <template v-else-if="item.prices.isPlatformBasedPrice == true">
                  <div @click="openVariantPlatformPrices(item)" class="d-flex align-center fill-height pv-price-cell">
                    <div>

                      <div class="font-weight-light text-caption mt-1 pv-field-caption">
                        Satış Fiyatı
                      </div>
                      <span class="font-weight-bold"> {{ formatCurrency(findMinimumSalePrice(item.platforms)) }} - {{
                        formatCurrency(findMaximumSalePrice(item.platforms)) }}</span>
                      <div class="font-weight-light text-caption mt-1 pv-field-caption">
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
                    class="d-flex align-center fill-height pv-price-cell">
                    <div>

                      <div class="font-weight-light text-caption mt-1 pv-field-caption">
                        Satış Fiyatı
                      </div>
                      <span class="font-weight-bold"> {{ formatCurrency(item.prices.salePrice) }}</span>
                      <div class="font-weight-light text-caption mt-1 pv-field-caption">
                        Piyasa Fiyatı
                      </div>
                      <span class="font-weight-medium"> {{ formatCurrency(item.prices.marketPrice) }}</span>
                    </div>
                  </div>
                </template>

                <div>
                  <v-checkbox :class="isDisplayMd() ? [''] : ['ml-12']"
                    :label="$t('productDefinitions.product.platformPrice')" @update:modelValue="" density="compact"
                    hide-details v-model="item.prices.isPlatformBasedPrice" @click.stop class="ma-0  pa-0 pv-minw-180" color="processButtonColor" />
                </div>

              </div>
            </div>

          </td>
          <td class="pv-td-stock">



            <div :class="isDisplayMd() ? [''] : ['d-flex']" class="align-center">

              <div class="d-flex font-weight-bold align-center pr-4 pv-clickable"
                @click="setEditingField({ value: 'stock' }, item.tempId)">

                <v-text-field v-if="editingVariantId == item.tempId && editingHeaderValue == 'stock'" label="Stok"
                  type="number" density="compact" variant="outlined" bg-color="textfieldColor" class="pv-w-90" v-model.number="item.stock" @click.stop hide-details></v-text-field>

                <div v-else :class="isDisplayMd() ? [''] : ['pr-6']">
                  <div class="font-weight-light text-caption mt-1 pv-field-caption">
                    Stok
                  </div>
                  <div class="d-flex font-weight-bold fill-height align-center pv-clickable">
                    {{ item.stock }}
                  </div>
                </div>

              </div>

              <div class="d-flex align-center d-block pv-clickable"
                @click="setEditingField({ value: 'shelf' }, item.tempId)">
                <v-text-field v-if="editingVariantId == item.tempId && editingHeaderValue == 'shelf'" label="Raf"
                  density="compact" variant="outlined" bg-color="textfieldColor" class="pv-minw-90"
                  v-model="item.shelf" @click.stop hide-details></v-text-field>

                <div v-else :class="isDisplayMd() ? [''] : ['pl-6']">
                  <div class="font-weight-light text-caption mt-1 pv-field-caption">
                    Raf
                  </div>
                  <div class="d-flex font-weight-bold fill-height align-center">
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

                  <v-btn v-bind="{ ...tooltipProps }" elevation="0" size="35" class="mr-2 pv-row-btn"
                    @click.stop="isVariantAttributesDialog = !isVariantAttributesDialog; editingVariant = item"
                    color="processButtonColor" aria-label="Varyantı düzenle"><v-icon size="large">mdi-pencil</v-icon></v-btn>
                </template>
              </v-tooltip>

              <v-btn v-if="productInfoForm.hasVariant" elevation="0" size="35" class="pv-row-btn"
                @click.stop="deleteVariant(item)" color="danger" aria-label="Varyantı sil"><v-icon
                  size="large">mdi-delete</v-icon></v-btn>
            </div>
          </td>
        </tr>
      </template>
      <template v-slot:bottom="{ }">
        <PaginationComponent :totalNumberOfPages="pagination.totalNumberOfPages" :pagination="pagination"
          v-if="productInfoForm.hasVariant" @set-page="search" v-model="pagination.page" class="pv-pagination" />
      </template>

    </v-data-table-server>

  </div>

</template>

<script setup lang="ts">
import { ref, mergeProps, inject, nextTick, watch, computed, onBeforeMount, onMounted } from 'vue'
import EkContextMenu from '@/components/ds/EkContextMenu.vue'
import type { EkMenuGroup, EkMenuItem } from '@/components/ds/EkMenuPanel.vue'
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



// DS-v2 A2 — "Varyant işlemleri" menüsü (EkContextMenu). Eylemler önceki v-list öğeleriyle AYNI.
const variantOpsMenu: EkMenuGroup[] = [
  {
    items: [
      { key: 'search', label: 'Ara', icon: 'mdi-magnify' },
      { key: 'batchAttributes', label: 'Toplu Özellik Düzenleme', icon: 'mdi-checkbox-multiple-marked-outline' },
      { key: 'batchPrices', label: 'Toplu Fiyat Düzenleme', icon: 'mdi-currency-try' },
      { key: 'mapChoices', label: 'Toplu Seçenek Eşleştir', icon: 'mdi-map-outline' },
    ],
  },
  { items: [{ key: 'deleteAll', label: 'Toplu Silme', icon: 'mdi-trash-can-outline', danger: true }] },
]

function onVariantOp(item: EkMenuItem) {
  if (item.key === 'search') searchVariantForm.value.searchVariantFormMenu = !searchVariantForm.value.searchVariantFormMenu
  else if (item.key === 'batchAttributes') isBatchVariantDialog.value = !isBatchVariantDialog.value
  else if (item.key === 'batchPrices') openBatchVariantPlatformPrices()
  else if (item.key === 'mapChoices') mapAllChoices()
  else if (item.key === 'deleteAll') deleteAllBatchProcess()
}
</script>


<style scoped>
/*
  ADR-0015 B5-2 — önceki satır içi stillerin (131 literal) token'lı karşılıkları. Satır içi stil
  her zaman en yüksek önceliğe sahipti; Vuetify'ın yüksek özgüllüklü kurallarıyla (td yüksekliği,
  tablo kenarlıkları, v-btn/v-avatar ölçüleri) çakışan yerlerde aynı sonucu korumak için
  `!important` kullanılır.
*/

/* Kök fragment/teleport (v-dialog) veya kendi satır içi stili olan alt bileşenler (CardComponent,
   PaginationComponent, ProductVariantImageComponent) scoped özniteliği almayabilir → :global. */
:global(.pv-fade) {
  transition: opacity var(--ek-duration-base) var(--ek-easing-standard) !important;
}

:global(.pv-fade-fast) {
  transition: opacity var(--ek-duration-fast) var(--ek-easing-standard) !important;
}

:global(.pv-dim) {
  opacity: .2 !important;
}

:global(.pv-dialog-idle) {
  visibility: hidden !important;
  opacity: .2 !important;
}

:global(.pv-thumb-img) {
  border-bottom: 1px solid var(--ek-color-surface-sunken) !important;
  cursor: pointer;
}

:global(.pv-pagination) {
  position: relative !important;
  border-top: 1px solid var(--ek-color-card-component-color);
}

.pv-table {
  position: absolute !important;
  top: 75px;
  bottom: 0;
  left: 0;
  right: 0;
  width: auto !important;
  height: calc(100vh - 170px);
  border: 1px solid var(--ek-color-border-strong);
  background-color: var(--ek-color-surface) !important;
}

.pv-image-head {
  width: 124px;
  opacity: .6;
}

.pv-sort-head {
  height: 20px !important;
  cursor: pointer;
}

.pv-w-120 {
  width: 120px;
}

.pv-w-115 {
  width: 115px !important;
}

.pv-sort-icon--hint {
  opacity: .5 !important;
}

.pv-sort-icon--hidden {
  opacity: 0 !important;
}

.pv-field-caption {
  font-size: var(--ek-font-size-xs) !important;
  line-height: .7;
}

.pv-btn-group {
  border: 1px solid var(--ek-color-surface);
}

.pv-platform-row {
  border-bottom: 1px solid var(--ek-color-border-default);
}

.pv-platform-avatar {
  width: 70px !important;
  height: 70px !important;
  border: 1px solid var(--ek-color-surface);
}

.pv-head-btn {
  border: 1px solid var(--ek-color-border-color) !important;
}

.pv-head-btn--surface {
  background-color: var(--ek-color-surface) !important;
}

.pv-menu-card {
  border-radius: var(--ek-radius-md) !important;
}

.pv-ops-list {
  background-color: var(--ek-color-login-form) !important;
}

.pv-icon-opaque {
  opacity: 1 !important;
}

.pv-group-spacer {
  min-height: 10px !important;
  line-height: 10px !important;
  height: 30px !important;
}

.pv-select-cb {
  margin-left: 1px;
}

.pv-td-variant {
  border-right: 1px solid var(--ek-color-border-default) !important;
  cursor: pointer;
}

.pv-thumb {
  width: 110px;
  min-width: 110px;
}

.pv-td-group {
  border-left: 1px solid var(--ek-color-table-header-color) !important;
  background-color: var(--ek-color-card-component-hover-color) !important;
}

.pv-td-choices {
  border-left: 2px solid var(--ek-color-table-header-color) !important;
  cursor: pointer;
}

.pv-td-price {
  border-left: 1.5px solid var(--ek-color-table-header-color) !important;
}

.pv-td-stock {
  border: 1.5px solid var(--ek-color-table-header-color) !important;
  border-top: none !important;
  border-bottom: none !important;
}

.pv-price-cell {
  cursor: pointer;
  width: auto !important;
  min-width: 130px;
}

.pv-row-btn {
  min-width: 0 !important;
  border: 1px solid var(--ek-color-border-strong) !important;
}

.pv-clickable {
  cursor: pointer;
}

.pv-w-full {
  width: 100% !important;
}

.pv-w-full-soft {
  width: 100%;
}

.pv-w-90 {
  width: 90px;
}

.pv-mw-300 {
  max-width: 300px;
}

.pv-minw-90 {
  min-width: 90px;
}

.pv-minw-180 {
  min-width: 180px;
}

.pv-minw-200 {
  min-width: 200px;
}

.pv-minw-200i {
  min-width: 200px !important;
}
</style>
