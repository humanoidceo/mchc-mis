import type { ContactPageTranslation, Localized } from './types'

export const contactPageTranslation: Localized<ContactPageTranslation> = {
  en: {
    eyebrow: 'Contact us',
    title: 'Visit or contact MCHC',
    clinicCardTitle: 'Clinic information',
    messageCardTitle: 'Send a message',
    fields: [
      { label: 'Name', value: 'Mother and Child Health Care Center (MCHC)' },
      { label: 'Operating organization', value: 'AFZENDA' },
      { label: 'Location', value: 'District 17, Kabul City, Afghanistan' },
      { label: 'Activity type', value: 'Non-profit, community-based health and humanitarian services' },
    ],
    placeholders: {
      name: 'Your name',
      contact: 'Phone or email',
      message: 'Message',
      submit: 'Submit message',
    },
  },
  fa: {
    eyebrow: 'تماس با ما',
    title: 'با مرکز صحی حمایت طفل و مادر در تماس شوید',
    clinicCardTitle: 'معلومات مرکز',
    messageCardTitle: 'ارسال پیام',
    fields: [
      { label: 'نام', value: 'مرکز صحی حمایت طفل و مادر (MCHC)' },
      { label: 'نهاد مسئول', value: 'AFZENDA' },
      { label: 'موقعیت', value: 'ناحیه ۱۷، شهر کابل، افغانستان' },
      { label: 'نوعیت فعالیت', value: 'خدمات صحی و بشردوستانه غیرانتفاعی و جامعه‌محور' },
    ],
    placeholders: {
      name: 'نام شما',
      contact: 'شماره تماس یا ایمیل',
      message: 'پیام',
      submit: 'ارسال پیام',
    },
  },
  ps: {
    eyebrow: 'اړیکه ونیسئ',
    title: 'له MCHC سره اړیکه ونیسئ',
    clinicCardTitle: 'د مرکز معلومات',
    messageCardTitle: 'پیغام واستوئ',
    fields: [
      { label: 'نوم', value: 'د مور او ماشوم د روغتیا ملاتړ مرکز (MCHC)' },
      { label: 'مسئوله اداره', value: 'AFZENDA' },
      { label: 'ځای', value: '۱۷مه ناحیه، کابل ښار، افغانستان' },
      { label: 'د فعالیت ډول', value: 'غیرانتفاعي، ټولنې محوره روغتیايي او بشردوستانه خدمات' },
    ],
    placeholders: {
      name: 'ستاسو نوم',
      contact: 'تلیفون یا ایمیل',
      message: 'پیغام',
      submit: 'پیغام ولېږئ',
    },
  },
}
