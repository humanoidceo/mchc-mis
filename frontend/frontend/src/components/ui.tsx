export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-950">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-zinc-600">{subtitle}</p> : null}
    </div>
  )
}

export function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-md border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/70">{children}</section>
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-zinc-700">{label}</span>
      {children}
    </label>
  )
}

export function PaginationControls({
  page,
  totalCount,
  onPageChange,
}: {
  page: number
  totalCount: number
  onPageChange: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / 10))
  if (totalCount <= 10) {
    return null
  }
  return (
    <div className="mt-4 flex items-center justify-between rounded border border-zinc-200 bg-white px-4 py-3 text-sm text-slate-700">
      <p>Page {page} of {totalPages}</p>
      <div className="flex gap-2">
        <button className={ghostButtonClassName} disabled={page === 1} onClick={() => onPageChange(Math.max(1, page - 1))}>Previous</button>
        <button className={ghostButtonClassName} disabled={page === totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>Next</button>
      </div>
    </div>
  )
}

export const inputClassName = 'w-full rounded border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-pink-400 focus:ring-2 focus:ring-pink-100'
export const buttonClassName = 'rounded bg-sky-500 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-sky-200 hover:bg-sky-600'
export const ghostButtonClassName = 'rounded border border-pink-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-pink-50'
