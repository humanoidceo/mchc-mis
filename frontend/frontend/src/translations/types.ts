export type LanguageCode = 'en' | 'fa' | 'ps'

export type Localized<T> = Record<LanguageCode, T>

export type NavItemTranslation = {
  home: string
  about: string
  mission: string
  vision: string
  services: string
  contact: string
}

export type CommonTranslation = {
  brandSubtitle: string
  staffLogin: string
  languageLabel: string
  nav: NavItemTranslation
  footer: string
  slogan: string
}

export type HomePageTranslation = {
  heroEyebrow: string
  heroTitle: string
  heroDescription: string
  primaryCta: string
  secondaryCta: string
  featureDescription: string
  featureCards: string[]
  sloganLabel: string
  slogan: string
  audienceEyebrow: string
  audienceTitle: string
  audienceItems: string[]
}

export type AboutPageTranslation = {
  eyebrow: string
  title: string
  cards: Array<{
    title: string
    paragraphs: string[]
  }>
  values: string[]
}

export type MissionPageTranslation = {
  eyebrow: string
  title: string
  cardTitle: string
  statement: string
  goals: string[]
}

export type VisionPageTranslation = {
  eyebrow: string
  title: string
  cardTitle: string
  statement: string
  highlight: string
}

export type ServicesPageTranslation = {
  eyebrow: string
  title: string
  groups: Array<{
    title: string
    items: string[]
  }>
}

export type ContactPageTranslation = {
  eyebrow: string
  title: string
  clinicCardTitle: string
  messageCardTitle: string
  fields: Array<{
    label: string
    value: string
  }>
  placeholders: {
    name: string
    contact: string
    message: string
    submit: string
  }
}
