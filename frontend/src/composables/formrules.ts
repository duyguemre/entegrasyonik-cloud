import { useI18n } from 'vue-i18n';

export default function useFormRules() {
  const { t } = useI18n()

  const mandatoryRule = [
    (v: any) => !!v || (!v && v === 0) || t("rules.mandatory")
  ]
  const length_1_4 = [
    (v: string) => !((v != null && v.length > 0) && (v != null && (v.length < 1 || v.length > 4))) || t("rules.1_4characters"),
  ]
  const length_2_160 = [
    (v: string) => !((v != null && v.length > 0) && (v != null && (v.length < 2 || v.length > 160))) || t("rules.2_160characters"),
  ]
  const length_2_32 = [
    (v: string) => !((v != null && v.length > 0) && (v != null && (v.length < 2 || v.length > 32))) || t("rules.2_32characters"),
  ]
  const length_4_15 = [
    (v: string) => !((v != null && v.length > 0) && (v != null && (v.length < 4 || v.length > 15))) || t("rules.4_15characters"),
  ]
  const length_4_250 = [
    (v: string) => !((v != null && v.length > 0) && (v != null && (v.length < 4 || v.length > 250))) || t("rules.4_250characters"),
  ]
  const length_0_16 = [
    (v: string) => !((v != null && v.length > 0) && (v != null && (v.length < 0 || v.length > 16))) || t("rules.0_16characters"),
  ]

  const length_4_256 = [
    (v: string) => !((v != null && v.length > 0) && (v != null && (v.length < 4 || v.length > 256))) || t("rules.0_16characters"),
  ]


  const specialRule = [
    (v: string) => !v || (v && /^[^]+$/.test(v)) || t("rules.nospecial"),
  ]

  const numberRulesWithoutZero = [
    (v: any) => !(v && !/^[0-9\s]+$/.test(v)) || t("rules.mustnumber")
  ]
  const numberRules = [
    ...numberRulesWithoutZero,
    (v: number) => !(v && (v.toString(10).startsWith("0")) && v.toString(10).length > 0) || t("rules.start_0_not"),
  ]

  const titleRules = [
    ...mandatoryRule,
    ...length_2_160,
    ...specialRule
  ]

  const searchRules = [
    ...length_2_160,
    ...specialRule
  ]

  const subTitleRules = [
    ...length_2_160,
    ...specialRule
  ]

  const stockcodeRules = [
    ...mandatoryRule,
    ...length_2_32,
    ...specialRule
  ]

  const barcodeRules = [
    ...length_2_32,
    ...specialRule
  ]

  const ipRules = [
    ...mandatoryRule,
    ...length_4_15,
    (v: string) => !v || (v && /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/.test(v)) || t("rules.ipformated"),
  ]
  const urlRules = [
    ...mandatoryRule,
    ...length_4_250,
    (v: string) => !v || (v && /(?:^|\s)((https?:\/\/)?(?:localhost|[\w-]+(?:\.[\w-]+)+)(:\d+)?(\/\S*)?)/.test(v)) || t("rules.urlformated"),
  ]

  return {
    mandatoryRule,
    numberRules,
    numberRulesWithoutZero,
    titleRules,
    subTitleRules,
    stockcodeRules,
    barcodeRules,
    ipRules,
    urlRules,
    specialRule,
    searchRules,
    length_1_4,
    length_4_250,
    length_4_15,
    length_2_32,
    length_2_160,
    length_0_16,
    length_4_256
  };
}