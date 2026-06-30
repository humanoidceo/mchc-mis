import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { apiFetch } from '../../api/client'
import aboutMotherChildImage from '../../assets/afghan-mother-child-about.png'
import homeMotherChildImage from '../../assets/afghan-mother-child-home.png'
import missionMotherChildImage from '../../assets/afghan-mother-child-mission.png'
import servicesMotherChildImage from '../../assets/afghan-mother-child-services.png'
import visionMotherChildImage from '../../assets/afghan-mother-child-vision.png'
import { aboutPageTranslation } from '../../translations/aboutpagetranslation'
import { commonTranslation } from '../../translations/commontranslation'
import { contactPageTranslation } from '../../translations/contactpagetranslation'
import { homePageTranslation } from '../../translations/homepagetranlsation'
import { missionPageTranslation } from '../../translations/missionpagetranslation'
import { servicesPageTranslation } from '../../translations/servicespagetranslation'
import type { LanguageCode } from '../../translations/types'
import { visionPageTranslation } from '../../translations/visionpagetranslation'
import type { WebsitePageContent, WebsitePageKey, WebsiteSettings } from '../../types/domain'

type PublicPageProps = {
  page: WebsitePageKey
}

const languageOptions: Array<{ code: LanguageCode; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'fa', label: 'دری' },
  { code: 'ps', label: 'پښتو' },
]

const navItems = [
  { to: '/', key: 'home' },
  { to: '/about', key: 'about' },
  { to: '/mission', key: 'mission' },
  { to: '/vision', key: 'vision' },
  { to: '/services', key: 'services' },
  { to: '/contact', key: 'contact' },
] as const

const defaultImages: Record<WebsitePageKey, string> = {
  home: homeMotherChildImage,
  about: aboutMotherChildImage,
  mission: missionMotherChildImage,
  vision: visionMotherChildImage,
  services: servicesMotherChildImage,
  contact: '',
}

const defaultContent = {
  home: homePageTranslation,
  about: aboutPageTranslation,
  mission: missionPageTranslation,
  vision: visionPageTranslation,
  services: servicesPageTranslation,
  contact: contactPageTranslation,
} as const

function getInitialLanguage(): LanguageCode {
  const storedLanguage = localStorage.getItem('mchc_public_language')
  return storedLanguage === 'fa' || storedLanguage === 'ps' || storedLanguage === 'en' ? storedLanguage : 'en'
}

export function PublicPage({ page }: PublicPageProps) {
  const [language, setLanguageState] = useState<LanguageCode>(getInitialLanguage)
  const [websiteContent, setWebsiteContent] = useState<Partial<Record<WebsitePageKey, WebsitePageContent>>>({})
  const [websiteSettings, setWebsiteSettings] = useState<WebsiteSettings | null>(null)
  const direction = language === 'en' ? 'ltr' : 'rtl'
  const common = commonTranslation[language]

  useEffect(() => {
    document.documentElement.lang = language === 'fa' ? 'fa-AF' : language === 'ps' ? 'ps-AF' : 'en'
    document.documentElement.dir = direction
    return () => {
      document.documentElement.lang = 'en'
      document.documentElement.dir = 'ltr'
    }
  }, [direction, language])

  useEffect(() => {
    let ignore = false

    async function loadWebsiteContent() {
      try {
        const [contentItems, settings] = await Promise.all([
          apiFetch<WebsitePageContent[]>(`/website-content/?language=${language}`),
          apiFetch<WebsiteSettings>('/website-settings/'),
        ])
        if (!ignore) {
          setWebsiteContent(Object.fromEntries(contentItems.map((item) => [item.page, item])))
          setWebsiteSettings(settings)
        }
      } catch {
        if (!ignore) {
          setWebsiteContent({})
          setWebsiteSettings(null)
        }
      }
    }

    loadWebsiteContent()
    return () => {
      ignore = true
    }
  }, [language])

  function setLanguage(nextLanguage: LanguageCode) {
    localStorage.setItem('mchc_public_language', nextLanguage)
    setLanguageState(nextLanguage)
  }

  return (
    <main className="min-h-screen bg-white text-slate-900" dir={direction}>
      <WebsiteHeader common={common} language={language} logoUrl={websiteSettings?.logo_url ?? ''} onLanguageChange={setLanguage} />
      {page === 'home' ? <HomePage language={language} pageContent={websiteContent.home} /> : null}
      {page === 'about' ? <AboutPage language={language} pageContent={websiteContent.about} /> : null}
      {page === 'mission' ? <MissionPage language={language} pageContent={websiteContent.mission} /> : null}
      {page === 'vision' ? <VisionPage language={language} pageContent={websiteContent.vision} /> : null}
      {page === 'services' ? <ServicesPage language={language} pageContent={websiteContent.services} /> : null}
      {page === 'contact' ? <ContactPage language={language} pageContent={websiteContent.contact} /> : null}
      <WebsiteFooter common={common} />
    </main>
  )
}

function mergeContent<T>(fallback: T, override: unknown): T {
  if (!override || typeof override !== 'object' || Array.isArray(override)) {
    return fallback
  }
  return { ...(fallback as Record<string, unknown>), ...(override as Record<string, unknown>) } as T
}

function pageText<T>(page: WebsitePageKey, language: LanguageCode, pageContent?: WebsitePageContent): T {
  return mergeContent(defaultContent[page][language] as T, pageContent?.content)
}

function pageImage(page: WebsitePageKey, pageContent?: WebsitePageContent): string {
  return pageContent?.image_url || defaultImages[page]
}

function WebsiteHeader({
  common,
  language,
  logoUrl,
  onLanguageChange,
}: {
  common: (typeof commonTranslation)[LanguageCode]
  language: LanguageCode
  logoUrl: string
  onLanguageChange: (language: LanguageCode) => void
}) {
  return (
    <header className="sticky top-0 z-20 overflow-hidden border-b border-sky-100 bg-white/92 text-slate-900 shadow-sm shadow-sky-100/70 backdrop-blur-xl">
      <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#0ea5e9,#ec4899,#0ea5e9)]" />
      <div className="absolute inset-0 opacity-[0.06] [background-image:linear-gradient(135deg,transparent_46%,#0ea5e9_47%,#0ea5e9_53%,transparent_54%)] [background-size:26px_26px]" />
      <div className="relative mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="group flex items-center gap-3">
          <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0ea5e9,#ec4899)] text-sm font-black text-white shadow-lg shadow-sky-200">
            {logoUrl ? (
              <img src={logoUrl} alt="MCHC logo" className="relative h-10 w-10 rounded-xl object-cover" />
            ) : (
              <>
                <span className="absolute inset-1 rounded-xl border border-white/45" />
                M
              </>
            )}
          </span>
          <span>
            <span className="block text-sm font-black tracking-[0.24em] text-slate-950">MCHC</span>
            <span className="block text-xs font-semibold text-slate-500">{common.brandSubtitle}</span>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-full px-3 py-2 text-sm font-bold transition ${isActive ? 'bg-pink-50 text-pink-700 shadow-sm shadow-pink-100' : 'text-slate-700 hover:bg-sky-50 hover:text-sky-700'}`
              }
            >
              {common.nav[item.key]}
            </NavLink>
          ))}
          <label className="flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-2 text-sm font-bold text-slate-700">
            <span>{common.languageLabel}</span>
            <select
              value={language}
              onChange={(event) => onLanguageChange(event.target.value as LanguageCode)}
              className="bg-transparent text-sm outline-none"
            >
              {languageOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </nav>
      </div>
    </header>
  )
}

function HomePage({ language, pageContent }: { language: LanguageCode; pageContent?: WebsitePageContent }) {
  const text = pageText<(typeof homePageTranslation)[LanguageCode]>('home', language, pageContent)
  const imageUrl = pageImage('home', pageContent)

  return (
    <>
      <section className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-slate-950">
        <img
          src={imageUrl}
          alt="Afghan mother sitting with her young child in a community health clinic"
          className="absolute inset-0 h-full w-full object-cover object-[64%_center]"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.95)_0%,rgba(12,74,110,0.72)_42%,rgba(2,6,23,0.12)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(0deg,#ffffff_0%,rgba(255,255,255,0)_100%)]" />

        <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-7xl flex-col justify-between px-4 py-12 lg:py-16">
          <div className="max-w-3xl pt-8">
            <p className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-wide text-sky-100 backdrop-blur">
              {text.heroEyebrow}
            </p>
            <h1 className="mt-6 max-w-3xl text-5xl font-black leading-[0.95] text-white md:text-7xl lg:text-8xl">
              {text.heroTitle}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-sky-50 md:text-xl">{text.heroDescription}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link to="/services" className="rounded-full bg-pink-500 px-6 py-4 text-sm font-bold text-white shadow-2xl shadow-pink-950/30 hover:bg-pink-400">{text.primaryCta}</Link>
              <Link to="/contact" className="rounded-full border border-white/30 bg-white/15 px-6 py-4 text-sm font-bold text-white backdrop-blur hover:bg-white/25">{text.secondaryCta}</Link>
            </div>
          </div>

          <div className="mb-8 grid gap-3 rounded-3xl border border-white/20 bg-white/12 p-3 backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4">
            {text.featureCards.map((label, index) => (
              <div key={label} className="rounded-2xl border border-white/15 bg-white/90 p-4 shadow-xl shadow-slate-950/10">
                <p className="text-xs font-bold uppercase tracking-wide text-pink-600">0{index + 1}</p>
                <p className="mt-2 text-lg font-black text-slate-950">{label}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{text.featureDescription}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-white px-4 py-16">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="relative">
            <div className="absolute -left-4 top-8 h-[78%] w-2 rounded-full bg-[linear-gradient(180deg,#0ea5e9,#ec4899)]" />
            <div className="rounded-3xl border border-sky-100 bg-sky-50 p-5 shadow-2xl shadow-sky-100">
              <div className="rounded-[1.35rem] bg-white p-6">
                <p className="text-sm font-bold uppercase tracking-wide text-pink-600">{text.sloganLabel}</p>
                <p className="mt-4 text-3xl font-black leading-tight text-slate-950 md:text-4xl">{text.slogan}</p>
                <div className="mt-7 grid grid-cols-2 gap-3">
                  {text.featureCards.slice(0, 2).map((label, index) => (
                    <div key={label} className="rounded-2xl bg-[linear-gradient(135deg,#fdf2f8,#f0f9ff)] p-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl font-black text-sky-600 shadow-sm">
                        {index + 1}
                      </div>
                      <p className="mt-4 font-black text-slate-950">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <SectionIntro eyebrow={text.audienceEyebrow} title={text.audienceTitle} />
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {text.audienceItems.map((item, index) => (
                <div key={item} className="group rounded-3xl border border-sky-100 bg-white p-6 shadow-sm shadow-sky-50 transition hover:-translate-y-1 hover:border-pink-200 hover:shadow-xl hover:shadow-pink-100/70">
                  <p className="text-4xl font-black text-sky-100 transition group-hover:text-pink-100">0{index + 1}</p>
                  <p className="mt-5 font-black leading-7 text-slate-950">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

function AboutPage({ language, pageContent }: { language: LanguageCode; pageContent?: WebsitePageContent }) {
  const text = pageText<(typeof aboutPageTranslation)[LanguageCode]>('about', language, pageContent)

  return (
    <ContentShell eyebrow={text.eyebrow} title={text.title}>
      <PagePhoto
        src={pageImage('about', pageContent)}
        alt="Afghan mother and child speaking with a healthcare worker"
        className="mb-8 aspect-[16/7]"
      />
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        {text.cards.map((card) => (
          <InfoCard key={card.title} title={card.title}>
            {card.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-4 first:mt-0">{paragraph}</p>
            ))}
          </InfoCard>
        ))}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {text.values.map((value) => <Pill key={value}>{value}</Pill>)}
      </div>
    </ContentShell>
  )
}

function MissionPage({ language, pageContent }: { language: LanguageCode; pageContent?: WebsitePageContent }) {
  const text = pageText<(typeof missionPageTranslation)[LanguageCode]>('mission', language, pageContent)

  return (
    <ContentShell eyebrow={text.eyebrow} title={text.title}>
      <PagePhoto
        src={pageImage('mission', pageContent)}
        alt="Afghan mother and children receiving care guidance from a healthcare worker"
        className="mb-8 aspect-[16/7]"
      />
      <InfoCard title={text.cardTitle}>
        <p className="text-lg leading-8">{text.statement}</p>
      </InfoCard>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {text.goals.map((goal) => <Pill key={goal}>{goal}</Pill>)}
      </div>
    </ContentShell>
  )
}

function VisionPage({ language, pageContent }: { language: LanguageCode; pageContent?: WebsitePageContent }) {
  const text = pageText<(typeof visionPageTranslation)[LanguageCode]>('vision', language, pageContent)

  return (
    <ContentShell eyebrow={text.eyebrow} title={text.title}>
      <PagePhoto
        src={pageImage('vision', pageContent)}
        alt="Afghan mother and child in a bright community health clinic"
        className="mb-8 aspect-[16/7]"
      />
      <InfoCard title={text.cardTitle}>
        <p className="text-lg leading-8">{text.statement}</p>
      </InfoCard>
      <div className="mt-6 rounded-3xl bg-[linear-gradient(135deg,#e0f2fe,#fff,#fce7f3)] p-8">
        <p className="max-w-3xl text-2xl font-semibold leading-10 text-slate-950">{text.highlight}</p>
      </div>
    </ContentShell>
  )
}

function ServicesPage({ language, pageContent }: { language: LanguageCode; pageContent?: WebsitePageContent }) {
  const text = pageText<(typeof servicesPageTranslation)[LanguageCode]>('services', language, pageContent)

  return (
    <ContentShell eyebrow={text.eyebrow} title={text.title}>
      <PagePhoto
        src={pageImage('services', pageContent)}
        alt="Afghan mother and child receiving guidance from a healthcare worker"
        className="mb-8 aspect-[16/7]"
      />
      <div className="grid gap-5 md:grid-cols-2">
        {text.groups.map((service) => (
          <InfoCard key={service.title} title={service.title}>
            <ul className="space-y-2">
              {service.items.map((item) => (
                <li key={item} className="flex gap-2 text-slate-600">
                  <span className="mt-2 h-2 w-2 rounded-full bg-pink-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </InfoCard>
        ))}
      </div>
    </ContentShell>
  )
}

function ContactPage({ language, pageContent }: { language: LanguageCode; pageContent?: WebsitePageContent }) {
  const text = pageText<(typeof contactPageTranslation)[LanguageCode]>('contact', language, pageContent)
  const imageUrl = pageImage('contact', pageContent)

  return (
    <ContentShell eyebrow={text.eyebrow} title={text.title}>
      {imageUrl ? (
        <PagePhoto
          src={imageUrl}
          alt="MCHC clinic contact"
          className="mb-8 aspect-[16/7]"
        />
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <InfoCard title={text.clinicCardTitle}>
          <dl className="space-y-4 text-slate-600">
            {text.fields.map((field) => (
              <div key={field.label}>
                <dt className="font-semibold text-slate-900">{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        </InfoCard>

        <InfoCard title={text.messageCardTitle}>
          <form className="grid gap-3">
            <input className="rounded border border-sky-200 px-3 py-3 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100" placeholder={text.placeholders.name} />
            <input className="rounded border border-sky-200 px-3 py-3 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100" placeholder={text.placeholders.contact} />
            <textarea className="min-h-32 rounded border border-sky-200 px-3 py-3 outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100" placeholder={text.placeholders.message} />
            <button type="button" className="rounded bg-sky-500 px-5 py-3 font-semibold text-white shadow-sm shadow-sky-200 hover:bg-sky-600">{text.placeholders.submit}</button>
          </form>
        </InfoCard>
      </div>
    </ContentShell>
  )
}

function ContentShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-[linear-gradient(180deg,#f0f9ff_0%,#fff_20%,#fff_100%)]">
      <div className="mx-auto max-w-7xl px-4 py-14">
        <SectionIntro eyebrow={eyebrow} title={title} />
        <div className="mt-8">{children}</div>
      </div>
    </section>
  )
}

function SectionIntro({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-wide text-pink-600">{eyebrow}</p>
      <h1 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-slate-950 md:text-5xl">{title}</h1>
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm shadow-sky-50">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <div className="mt-4 leading-7 text-slate-600">{children}</div>
    </article>
  )
}

function PagePhoto({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className={`w-full rounded-2xl object-cover shadow-sm shadow-sky-100 ${className}`}
      loading="lazy"
    />
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-pink-100 bg-pink-50/70 px-4 py-3 text-sm font-medium text-slate-700">
      {children}
    </div>
  )
}

function WebsiteFooter({ common }: { common: (typeof commonTranslation)[LanguageCode] }) {
  return (
    <footer className="border-t border-sky-100 bg-sky-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-600">
        <p>© {common.footer}</p>
        <p className="font-semibold text-pink-700">{common.slogan}</p>
      </div>
    </footer>
  )
}
