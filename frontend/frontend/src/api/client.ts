import type { User } from '../types/domain'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

type LoginResponse = {
  user: User
}

type DownloadResponse = {
  blob: Blob
  filename: string | null
}

export class ApiError extends Error {
  status: number
  details: unknown

  constructor(status: number, message: string, details: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

let refreshRequest: Promise<void> | null = null

function shouldSkipRefresh(path: string): boolean {
  return path.startsWith('/auth/login/') || path.startsWith('/auth/logout/') || path.startsWith('/auth/refresh/') || path.startsWith('/auth/token/refresh/')
}

async function performFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })
  const contentType = response.headers.get('content-type') ?? ''
  const data = contentType.includes('application/json') ? await response.json() : null
  return { response, data }
}

async function performDownloadFetch(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers)
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })
  return response
}

function parseFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1])
  const plainMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i)
  return plainMatch?.[1] ?? null
}

async function refreshAccessToken(): Promise<void> {
  if (!refreshRequest) {
    refreshRequest = (async () => {
      const { response, data } = await performFetch('/auth/refresh/', { method: 'POST' })
      if (!response.ok) {
        throw new ApiError(response.status, data?.detail ?? 'Unable to refresh access token.', data)
      }
    })().finally(() => {
      refreshRequest = null
    })
  }
  await refreshRequest
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, retryOnUnauthorized = true): Promise<T> {
  const { response, data } = await performFetch(path, options)

  if (response.status === 401 && retryOnUnauthorized && !shouldSkipRefresh(path)) {
    await refreshAccessToken()
    return apiFetch<T>(path, options, false)
  }

  if (!response.ok) {
    throw new ApiError(response.status, data?.detail ?? 'Request failed', data)
  }

  return data as T
}

export async function apiDownload(path: string, options: RequestInit = {}, retryOnUnauthorized = true): Promise<DownloadResponse> {
  const response = await performDownloadFetch(path, options)

  if (response.status === 401 && retryOnUnauthorized && !shouldSkipRefresh(path)) {
    await refreshAccessToken()
    return apiDownload(path, options, false)
  }

  if (!response.ok) {
    const contentType = response.headers.get('content-type') ?? ''
    const data = contentType.includes('application/json') ? await response.json() : null
    throw new ApiError(response.status, data?.detail ?? 'Request failed', data)
  }

  return {
    blob: await response.blob(),
    filename: parseFilename(response.headers.get('content-disposition')),
  }
}

export async function login(email: string, password: string): Promise<User> {
  const data = await apiFetch<LoginResponse>('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  return data.user
}

export async function logout(): Promise<void> {
  try {
    await apiFetch<{ detail: string }>('/auth/logout/', { method: 'POST' }, false)
  } catch (caught) {
    if (caught instanceof ApiError && caught.status === 401) {
      return
    }
    throw caught
  }
}
