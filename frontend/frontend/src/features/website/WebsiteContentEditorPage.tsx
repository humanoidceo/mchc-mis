import { useEffect, useMemo, useState } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, Panel, SectionHeader } from '../../components/ui'
import { aboutPageTranslation } from '../../translations/aboutpagetranslation'
import { contactPageTranslation } from '../../translations/contactpagetranslation'
import { homePageTranslation } from '../../translations/homepagetranlsation'
import { missionPageTranslation } from '../../translations/missionpagetranslation'
import { servicesPageTranslation } from '../../translations/servicespagetranslation'
import type { LanguageCode } from '../../translations/types'
import { visionPageTranslation } from '../../translations/visionpagetranslation'
import type { WebsitePageContent, WebsitePageKey, WebsiteSettings } from '../../types/domain'

const pageOptions: Array<{ key: WebsitePageKey; label: string }> = [
  { key: 'home', label: 'Home' },
  { key: 'about', label: 'About' },
  { key: 'mission', label: 'Our mission' },
  { key: 'vision', label: 'Our vision' },
  { key: 'services', label: 'Services' },
  { key: 'contact', label: 'Contact' },
]

const languageOptions: Array<{ key: LanguageCode; label: string }> = [
  { key: 'en', label: 'English' },
  { key: 'fa', label: 'Dari' },
  { key: 'ps', label: 'Pashto' },
]

const defaultContent = {
  home: homePageTranslation,
  about: aboutPageTranslation,
  mission: missionPageTranslation,
  vision: visionPageTranslation,
  services: servicesPageTranslation,
  contact: contactPageTranslation,
} as const

const common = {
  saving: 'Saving...',
}

const t = {
  title: 'Website content',
  loadingSubtitle: 'Loading editable website content.',
  subtitle: 'Edit public website pages, logo, and pictures.',
  uploadWebsiteLogo: 'Upload website logo',
  page: 'Page',
  language: 'Language',
  currentLogoPath: 'Current logo path or external URL',
  currentLogo: 'Current logo',
  uploadPagePicture: 'Upload page picture',
  currentPagePicturePath: 'Current page picture path or external URL',
  resetText: 'Reset text to default',
  currentPagePicture: 'Current page picture',
  saveWebsiteContent: 'Save website content',
  saved: 'Website content saved.',
  unableToLoad: 'Unable to load website content.',
  unableToSave: 'Unable to save website content.',
  selectedFile: 'Selected',
  lastSettingsUpdate: 'Last settings update',
}

type EditableContent = Record<string, unknown>

function cloneDefault(page: WebsitePageKey, language: LanguageCode): EditableContent {
  return JSON.parse(JSON.stringify(defaultContent[page][language])) as EditableContent
}

function fieldLabel(key: string) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase())
}

function updateAtPath(value: unknown, path: Array<string | number>, nextValue: unknown): unknown {
  if (path.length === 0) {
    return nextValue
  }
  const [current, ...rest] = path
  if (Array.isArray(value)) {
    return value.map((item, index) => (index === current ? updateAtPath(item, rest, nextValue) : item))
  }
  if (value && typeof value === 'object') {
    return {
      ...(value as Record<string, unknown>),
      [current]: updateAtPath((value as Record<string, unknown>)[current as string], rest, nextValue),
    }
  }
  return value
}

function makeEmptyLike(value: unknown): unknown {
  if (typeof value === 'string') {
    return ''
  }
  if (Array.isArray(value)) {
    return []
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, makeEmptyLike(child)]))
  }
  return ''
}

function errorMessage(caught: unknown) {
  if (caught instanceof ApiError) {
    if (caught.details && typeof caught.details === 'object') {
      return Object.entries(caught.details as Record<string, unknown>)
        .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
        .join(' ')
    }
    return caught.message
  }
  return ''
}

export function WebsiteContentEditorPage() {
  const [selectedPage, setSelectedPage] = useState<WebsitePageKey>('home')
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>('en')
  const [items, setItems] = useState<WebsitePageContent[]>([])
  const [settings, setSettings] = useState<WebsiteSettings | null>(null)
  const [logoUrl, setLogoUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [content, setContent] = useState<EditableContent>(() => cloneDefault('home', 'en'))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const existingItem = useMemo(
    () => items.find((item) => item.page === selectedPage && item.language === selectedLanguage),
    [items, selectedLanguage, selectedPage],
  )

  useEffect(() => {
    async function load() {
      try {
        const [contentItems, websiteSettings] = await Promise.all([
          apiFetch<WebsitePageContent[]>('/website-content/'),
          apiFetch<WebsiteSettings>('/website-settings/'),
        ])
        setItems(contentItems)
        setSettings(websiteSettings)
        setLogoUrl(websiteSettings.logo_url ?? '')
      } catch {
        setError(t.unableToLoad)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  useEffect(() => {
    setContent(existingItem?.content ?? cloneDefault(selectedPage, selectedLanguage))
    setImageUrl(existingItem?.image_url ?? '')
    setImageFile(null)
    setMessage(null)
  }, [existingItem, selectedLanguage, selectedPage])

  function updateContent(path: Array<string | number>, nextValue: unknown) {
    setContent((current) => updateAtPath(current, path, nextValue) as EditableContent)
  }

  function addArrayItem(path: Array<string | number>, arrayValue: unknown[]) {
    const template = arrayValue[0]
    updateContent(path, [...arrayValue, makeEmptyLike(template ?? '')])
  }

  function removeArrayItem(path: Array<string | number>, arrayValue: unknown[], index: number) {
    updateContent(path, arrayValue.filter((_item, itemIndex) => itemIndex !== index))
  }

  async function saveContent() {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const pagePayload = new FormData()
      pagePayload.append('page', selectedPage)
      pagePayload.append('language', selectedLanguage)
      pagePayload.append('content', JSON.stringify(content))
      if (imageUrl) {
        pagePayload.append('image_url', imageUrl)
      }
      if (imageFile) {
        pagePayload.append('image_file', imageFile)
      }
      const savedItem = existingItem
        ? await apiFetch<WebsitePageContent>(`/website-content/${existingItem.id}/`, {
            method: 'PATCH',
            body: pagePayload,
          })
        : await apiFetch<WebsitePageContent>('/website-content/', {
            method: 'POST',
            body: pagePayload,
          })

      const settingsPayload = new FormData()
      if (logoUrl) {
        settingsPayload.append('logo_url', logoUrl)
      }
      if (logoFile) {
        settingsPayload.append('logo_file', logoFile)
      }
      const savedSettings = await apiFetch<WebsiteSettings>('/website-settings/current/', {
        method: 'PATCH',
        body: settingsPayload,
      })

      setSettings(savedSettings)
      setLogoUrl(savedSettings.logo_url ?? '')
      setLogoFile(null)
      setImageUrl(savedItem.image_url ?? '')
      setImageFile(null)
      setItems((current) => {
        const others = current.filter((item) => item.id !== savedItem.id)
        return [...others, savedItem]
      })
      setMessage(t.saved)
    } catch (caught) {
      setError(errorMessage(caught) || t.unableToSave)
    } finally {
      setSaving(false)
    }
  }

  function renderValue(value: unknown, path: Array<string | number>, label: string): React.ReactNode {
    if (typeof value === 'string') {
      const control =
        value.length > 90 ? (
          <textarea className={`${inputClassName} min-h-28`} value={value} onChange={(event) => updateContent(path, event.target.value)} />
        ) : (
          <input className={inputClassName} value={value} onChange={(event) => updateContent(path, event.target.value)} />
        )
      return <Field key={path.join('.')} label={fieldLabel(label)}>{control}</Field>
    }

    if (Array.isArray(value)) {
      return (
        <div key={path.join('.')} className="rounded border border-sky-100 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900">{fieldLabel(label)}</p>
            <button type="button" className={ghostButtonClassName} onClick={() => addArrayItem(path, value)}>Add item</button>
          </div>
          <div className="space-y-3">
            {value.map((item, index) => (
              <div key={index} className="rounded border border-zinc-200 p-3">
                <div className="mb-2 flex justify-end">
                  <button type="button" className={ghostButtonClassName} onClick={() => removeArrayItem(path, value, index)}>Remove</button>
                </div>
                {typeof item === 'string' ? (
                  <textarea className={`${inputClassName} min-h-20`} value={item} onChange={(event) => updateContent([...path, index], event.target.value)} />
                ) : (
                  renderValue(item, [...path, index], `${label} ${index + 1}`)
                )}
              </div>
            ))}
          </div>
        </div>
      )
    }

    if (value && typeof value === 'object') {
      return (
        <div key={path.join('.')} className="space-y-4">
          {path.length ? <p className="text-sm font-semibold text-slate-900">{fieldLabel(label)}</p> : null}
          {Object.entries(value as Record<string, unknown>).map(([key, child]) => renderValue(child, [...path, key], key))}
        </div>
      )
    }

    return null
  }

  if (loading) {
    return <SectionHeader title={t.title} subtitle={t.loadingSubtitle} />
  }

  return (
    <div className="space-y-5">
      <SectionHeader title={t.title} subtitle={t.subtitle} />
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <Panel>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label={t.uploadWebsiteLogo}>
            <input
              className={inputClassName}
              type="file"
              accept="image/*"
              onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
            />
            {logoFile ? <p className="mt-1 text-xs text-zinc-500">{t.selectedFile}: {logoFile.name}</p> : null}
          </Field>
          <Field label={t.page}>
            <select className={inputClassName} value={selectedPage} onChange={(event) => setSelectedPage(event.target.value as WebsitePageKey)}>
              {pageOptions.map((page) => <option key={page.key} value={page.key}>{page.label}</option>)}
            </select>
          </Field>
          <Field label={t.language}>
            <select className={inputClassName} value={selectedLanguage} onChange={(event) => setSelectedLanguage(event.target.value as LanguageCode)}>
              {languageOptions.map((language) => <option key={language.key} value={language.key}>{language.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label={t.currentLogoPath}>
            <input className={inputClassName} value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="/media/website/logo/logo.png" />
          </Field>
          {logoUrl ? (
            <div>
              <p className="mb-1 text-sm font-medium text-zinc-700">{t.currentLogo}</p>
              <img src={logoUrl} alt="Current website logo" className="h-20 w-20 rounded border border-sky-100 object-contain" />
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t.uploadPagePicture}>
              <input
                className={inputClassName}
                type="file"
                accept="image/*"
                onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
              />
              {imageFile ? <p className="mt-1 text-xs text-zinc-500">{t.selectedFile}: {imageFile.name}</p> : null}
            </Field>
            <Field label={t.currentPagePicturePath}>
              <input className={inputClassName} value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="/media/website/pages/home/en/photo.jpg" />
            </Field>
          </div>
          <button type="button" className={ghostButtonClassName} onClick={() => setContent(cloneDefault(selectedPage, selectedLanguage))}>
            {t.resetText}
          </button>
        </div>
        {imageUrl ? (
          <div className="mt-4">
            <p className="mb-1 text-sm font-medium text-zinc-700">{t.currentPagePicture}</p>
            <img src={imageUrl} alt="Current page" className="h-36 w-full rounded border border-sky-100 object-cover md:w-80" />
          </div>
        ) : null}
      </Panel>

      <Panel>
        <div className="space-y-4">{renderValue(content, [], selectedPage)}</div>
        <div className="mt-5 flex justify-end">
          <button type="button" className={buttonClassName} disabled={saving} onClick={saveContent}>
            {saving ? common.saving : t.saveWebsiteContent}
          </button>
        </div>
        {settings?.updated_at ? <p className="mt-3 text-xs text-zinc-500">{t.lastSettingsUpdate}: {new Date(settings.updated_at).toLocaleString()}</p> : null}
      </Panel>
    </div>
  )
}
