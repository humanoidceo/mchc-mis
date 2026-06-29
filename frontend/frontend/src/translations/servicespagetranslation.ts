import type { Localized, ServicesPageTranslation } from './types'

export const servicesPageTranslation: Localized<ServicesPageTranslation> = {
  en: {
    eyebrow: 'Our services',
    title: 'Integrated care for mothers, children, and families',
    groups: [
      { title: 'Maternal Health', items: ['Antenatal care', 'Postnatal care', 'Reproductive health counseling', 'Family planning', 'Common women health conditions'] },
      { title: 'Child Health', items: ['Pediatric consultation', 'Growth and development monitoring', 'Common childhood illness care', 'Nutrition counseling', 'Vaccination according to national programs'] },
      { title: 'General Health', items: ['General consultation', 'Laboratory services', 'Ultrasound services', 'Injections and dressing', 'Health counseling'] },
      { title: 'Health Promotion', items: ['Health awareness', 'Family education', 'Health campaigns', 'Preventive and promotional programs'] },
    ],
  },
  fa: {
    eyebrow: 'خدمات ما',
    title: 'مراقبت یکپارچه برای مادران، اطفال و خانواده‌ها',
    groups: [
      { title: 'خدمات صحت مادران', items: ['معاینات قبل از ولادت', 'مراقبت‌های بعد از ولادت', 'مشاوره صحت باروری', 'تنظیم خانواده', 'تشخیص و درمان مشکلات شایع زنان'] },
      { title: 'خدمات صحت طفل', items: ['معاینات اطفال', 'مراقبت از رشد و انکشاف طفل', 'تشخیص و درمان بیماری‌های شایع کودکان', 'مشاوره تغذیه و ترویج تغذیه با شیر مادر', 'واکسیناسیون مطابق برنامه ملی'] },
      { title: 'خدمات عمومی', items: ['معاینات عمومی', 'خدمات لابراتواری', 'خدمات التراسوند', 'تزریقات و پانسمان', 'مشاوره‌های صحی'] },
      { title: 'خدمات ارتقای صحت', items: ['آگاهی‌دهی صحی', 'آموزش خانواده‌ها', 'کمپاین‌های صحی', 'برنامه‌های وقایوی و ترویجی'] },
    ],
  },
  ps: {
    eyebrow: 'زموږ خدمات',
    title: 'د میندو، ماشومانو او کورنیو لپاره یوځای روغتیايي پاملرنه',
    groups: [
      { title: 'د میندو روغتیا', items: ['د ولادت مخکې معاینات', 'د ولادت وروسته پاملرنه', 'د تولیدي روغتیا مشوره', 'د کورنۍ تنظیم', 'د ښځو د عامو روغتیايي ستونزو تشخیص او درملنه'] },
      { title: 'د ماشومانو روغتیا', items: ['د ماشومانو معاینات', 'د ماشوم د ودې او پرمختګ څارنه', 'د ماشومانو د عامو ناروغیو تشخیص او درملنه', 'د تغذیې مشوره او د مور د شیدو هڅونه', 'د ملي پروګرام له مخې واکسین'] },
      { title: 'عمومي خدمات', items: ['عمومي معاینات', 'لابراتواري خدمات', 'الټراساونډ خدمات', 'پیچکاري او پانسمان', 'روغتیايي مشورې'] },
      { title: 'د روغتیا لوړولو خدمات', items: ['روغتیايي پوهاوی', 'د کورنیو زده‌کړه', 'روغتیايي کمپاینونه', 'وقایوي او ترویجي پروګرامونه'] },
    ],
  },
}
