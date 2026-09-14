import type { Localized } from './types'

export const newsPageTranslation: Localized<{
  title: string
  subtitle: string
  loading: string
  error: string
  empty: string
  previous: string
  next: string
  placeholder: string
}> = {
  en: {
    title: 'News and posts',
    subtitle: 'Latest news and updates from Mother and Child Health Support Center',
    loading: 'Loading news...',
    error: 'News could not be loaded right now.',
    empty: 'No news has been published yet.',
    previous: 'Previous',
    next: 'Next',
    placeholder: 'MCHC News',
  },
  fa: {
    title: 'اخبار و مطالب',
    subtitle: 'تازه‌ترین اخبار و مطالب مرکز حمایه صحت طفل و مادر',
    loading: 'در حال بارگذاری اخبار...',
    error: 'اخبار فعلاً بارگذاری نمی‌شود.',
    empty: 'هنوز خبری منتشر نشده است.',
    previous: 'قبلی',
    next: 'بعدی',
    placeholder: 'اخبار MCHC',
  },
  ps: {
    title: 'خبرونه او لیکنې',
    subtitle: 'د مور او ماشوم د روغتیا ملاتړ مرکز وروستي خبرونه او لیکنې',
    loading: 'خبرونه پورته کېږي...',
    error: 'اوس مهال خبرونه نه شي پورته کېدای.',
    empty: 'تر اوسه کوم خبر نه دی خپور شوی.',
    previous: 'مخکینی',
    next: 'بل',
    placeholder: 'د MCHC خبرونه',
  },
}
