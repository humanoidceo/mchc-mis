import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'

import { aboutPageTranslation } from '../../translations/aboutpagetranslation'
import { commonTranslation } from '../../translations/commontranslation'
import { contactPageTranslation } from '../../translations/contactpagetranslation'
import { homePageTranslation } from '../../translations/homepagetranlsation'
import { missionPageTranslation } from '../../translations/missionpagetranslation'
import { servicesPageTranslation } from '../../translations/servicespagetranslation'
import type { LanguageCode } from '../../translations/types'
import { visionPageTranslation } from '../../translations/visionpagetranslation'

type PublicPageKey = 'home' | 'about' | 'mission' | 'vision' | 'services' | 'contact'

type PublicPageProps = {
  page: PublicPageKey
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

function getInitialLanguage(): LanguageCode {
  const storedLanguage = localStorage.getItem('mchc_public_language')
  return storedLanguage === 'fa' || storedLanguage === 'ps' || storedLanguage === 'en' ? storedLanguage : 'en'
}

export function PublicPage({ page }: PublicPageProps) {
  const [language, setLanguageState] = useState<LanguageCode>(getInitialLanguage)
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

  function setLanguage(nextLanguage: LanguageCode) {
    localStorage.setItem('mchc_public_language', nextLanguage)
    setLanguageState(nextLanguage)
  }

  return (
    <main className="min-h-screen bg-white text-slate-900" dir={direction}>
      <WebsiteHeader common={common} language={language} onLanguageChange={setLanguage} />
      {page === 'home' ? <HomePage language={language} /> : null}
      {page === 'about' ? <AboutPage language={language} /> : null}
      {page === 'mission' ? <MissionPage language={language} /> : null}
      {page === 'vision' ? <VisionPage language={language} /> : null}
      {page === 'services' ? <ServicesPage language={language} /> : null}
      {page === 'contact' ? <ContactPage language={language} /> : null}
      <WebsiteFooter common={common} />
    </main>
  )
}

function WebsiteHeader({
  common,
  language,
  onLanguageChange,
}: {
  common: (typeof commonTranslation)[LanguageCode]
  language: LanguageCode
  onLanguageChange: (language: LanguageCode) => void
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-sky-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-600 ring-4 ring-pink-50">M</span>
          <span>
            <span className="block text-sm font-bold text-slate-950">MCHC</span>
            <span className="block text-xs text-slate-500">{common.brandSubtitle}</span>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-full px-3 py-2 text-sm font-medium ${isActive ? 'bg-pink-50 text-pink-700' : 'text-slate-700 hover:bg-sky-50 hover:text-sky-700'}`
              }
            >
              {common.nav[item.key]}
            </NavLink>
          ))}
          <label className="flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-2 text-sm font-medium text-slate-700">
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
          <Link to="/auth/login" className="rounded-full bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-sky-200 hover:bg-sky-600">
            {common.staffLogin}
          </Link>
        </nav>
      </div>
    </header>
  )
}

function HomePage({ language }: { language: LanguageCode }) {
  const text = homePageTranslation[language]

  return (
    <>
      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#e0f2fe_0%,#fff_48%,#fce7f3_100%)]">
        <div className="absolute right-[-6rem] top-16 h-72 w-72 rounded-full bg-pink-100 blur-3xl" />
        <div className="absolute bottom-[-7rem] left-[-5rem] h-80 w-80 rounded-full bg-sky-100 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-24">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-pink-600">{text.heroEyebrow}</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-slate-950 md:text-6xl">{text.heroTitle}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">{text.heroDescription}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/services" className="rounded-full bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-200 hover:bg-sky-600">{text.primaryCta}</Link>
              <Link to="/contact" className="rounded-full border border-pink-200 bg-white px-5 py-3 text-sm font-semibold text-pink-700 hover:bg-pink-50">{text.secondaryCta}</Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-sky-100 bg-white/80 p-5 shadow-2xl shadow-sky-100">
            <div className="rounded-[1.5rem] bg-sky-50 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                {text.featureCards.map((label, index) => (
                  <div key={label} className={`rounded-2xl bg-white p-5 shadow-sm ${index % 2 ? 'ring-1 ring-pink-100' : 'ring-1 ring-sky-100'}`}>
                    <p className="text-3xl font-bold text-sky-500">0{index + 1}</p>
                    <p className="mt-3 font-semibold text-slate-900">{label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{text.featureDescription}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl bg-pink-50 p-5">
                <p className="text-sm font-semibold text-pink-700">{text.sloganLabel}</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">{text.slogan}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14">
        <SectionIntro eyebrow={text.audienceEyebrow} title={text.audienceTitle} />
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {text.audienceItems.map((item) => (
            <div key={item} className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-sky-50">
              <p className="font-semibold text-slate-900">{item}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function AboutPage({ language }: { language: LanguageCode }) {
  const text = aboutPageTranslation[language]

  return (
    <ContentShell eyebrow={text.eyebrow} title={text.title}>
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

function MissionPage({ language }: { language: LanguageCode }) {
  const text = missionPageTranslation[language]

  return (
    <ContentShell eyebrow={text.eyebrow} title={text.title}>
      <InfoCard title={text.cardTitle}>
        <p className="text-lg leading-8">{text.statement}</p>
      </InfoCard>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {text.goals.map((goal) => <Pill key={goal}>{goal}</Pill>)}
      </div>
    </ContentShell>
  )
}

function VisionPage({ language }: { language: LanguageCode }) {
  const text = visionPageTranslation[language]

  return (
    <ContentShell eyebrow={text.eyebrow} title={text.title}>
      <InfoCard title={text.cardTitle}>
        <p className="text-lg leading-8">{text.statement}</p>
      </InfoCard>
      <div className="mt-6 rounded-3xl bg-[linear-gradient(135deg,#e0f2fe,#fff,#fce7f3)] p-8">
        <p className="max-w-3xl text-2xl font-semibold leading-10 text-slate-950">{text.highlight}</p>
      </div>
    </ContentShell>
  )
}

function ServicesPage({ language }: { language: LanguageCode }) {
  const text = servicesPageTranslation[language]

  return (
    <ContentShell eyebrow={text.eyebrow} title={text.title}>
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

function ContactPage({ language }: { language: LanguageCode }) {
  const text = contactPageTranslation[language]

  return (
    <ContentShell eyebrow={text.eyebrow} title={text.title}>
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
