import { useCallback, useEffect, useMemo, useState } from 'react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, ghostButtonClassName, inputClassName, PaginationControls, SectionHeader } from '../../components/ui'

type Language = 'dari' | 'pashto' | 'english'
type Titles = Record<Language, string>
type ExpenseEntry = {
  id: number
  voucher_number: string
  created_at: string
  name: string
  amount: string
  description: string
  payment_method: string
  funding_source: string
  department: string
  is_salary: boolean
  salary_type: 'advance' | 'settlement' | ''
}
type ReportSubcategory = { code: string; titles: Titles; entries: ExpenseEntry[]; total: string }
type ReportCategory = { id: number | null; titles: Titles; subcategories: ReportSubcategory[]; total: string }
type Withdrawal = { id: number; created_at: string; amount: string; reason: string; withdrawer_name: string }
type ReportPagination = { page: number; page_size: number; total_count: number; total_pages: number }
type ExpensesReport = {
  from: string
  to: string
  generated_at: string
  categories: ReportCategory[]
  total_expenses_afn: string
  salary_entries: ExpenseEntry[]
  salary_total_afn: string
  pagination: ReportPagination
  withdrawal_pagination: ReportPagination
  withdrawals: Array<{ currency: 'AFN' | 'USD'; entries: Withdrawal[]; total: string }>
}

const labels: Record<Language, Record<string, string>> = {
  english: { title: 'Expenses Report', subtitle: 'Detailed expense, salary, and bank withdrawal report', from: 'From', to: 'To', generate: 'Generate report', print: 'Print A4 report', generated: 'Generated', page: 'Page', categorySummary: 'Expense category summary', categoryDetails: 'Expense details', salaryDetails: 'Salary detail', salaryNote: 'Already included in E-05 (Staff salaries and benefits); shown separately for audit detail only.', bankWithdrawals: 'Cash & bank withdrawals', withdrawalNote: 'AFN withdrawals are included in Total expenses and are also shown here for cash-control detail. USD remains separate.', totalExpenses: 'Total expenses', salaryTotal: 'Salary total (included in E-05)', totalWithdrawal: 'Total withdrawals', date: 'Date', voucher: 'Voucher', description: 'Description', department: 'Department', funding: 'Funding source', amount: 'Amount (AFN)', reason: 'Reason', withdrawer: 'Withdrawer', noEntries: 'No entries in this period', summaryContinued: 'Category summary continued' },
  dari: { title: 'گزارش مصارف', subtitle: 'گزارش تفصیلی مصارف، معاشات و برداشت‌های بانکی', from: 'از', to: 'تا', generate: 'تهیه گزارش', print: 'چاپ گزارش A4', generated: 'تهیه شده', page: 'صفحه', categorySummary: 'خلاصه کتگوری‌های مصارف', categoryDetails: 'جزئیات مصارف', salaryDetails: 'جزئیات معاشات', salaryNote: 'در E-05 (معاشات و امتیازات کارکنان) شامل است؛ فقط برای جزئیات تفتیش جداگانه نشان داده می‌شود.', bankWithdrawals: 'برداشت‌های نقدی و بانکی', withdrawalNote: 'برداشت‌های افغانی در مجموع مصارف شامل است و برای جزئیات کنترول نقدی نیز در اینجا نشان داده می‌شود. دالر جداگانه باقی می‌ماند.', totalExpenses: 'مجموع مصارف', salaryTotal: 'مجموع معاشات (شامل E-05)', totalWithdrawal: 'مجموع برداشت‌ها', date: 'تاریخ', voucher: 'ووچر', description: 'شرح', department: 'دیپارتمنت', funding: 'منبع تمویل', amount: 'مبلغ (افغانی)', reason: 'دلیل', withdrawer: 'برداشت کننده', noEntries: 'در این دوره موردی ثبت نشده است', summaryContinued: 'ادامه خلاصه کتگوری‌ها' },
  pashto: { title: 'د لګښتونو راپور', subtitle: 'د لګښتونو، معاشونو او بانکي ایستنو تفصیلي راپور', from: 'له', to: 'تر', generate: 'راپور جوړ کړئ', print: 'د A4 راپور چاپ', generated: 'جوړ شوی', page: 'پاڼه', categorySummary: 'د لګښتونو د کتګوریو لنډیز', categoryDetails: 'د لګښتونو تفصیل', salaryDetails: 'د معاشونو تفصیل', salaryNote: 'په E-05 (د کارکوونکو معاشونه او امتیازات) کې شامل دي؛ یوازې د پلټنې د تفصیل لپاره جلا ښودل کېږي.', bankWithdrawals: 'د نغدو او بانک ایستنې', withdrawalNote: 'په افغانیو ایستنې په ټول لګښتونو کې شاملې دي او دلته هم د نغدو کنټرول د تفصیل لپاره ښودل کېږي. ډالر جلا پاتې کېږي.', totalExpenses: 'ټول لګښتونه', salaryTotal: 'د معاشونو مجموعه (په E-05 کې شامل)', totalWithdrawal: 'ټولې ایستنې', date: 'نېټه', voucher: 'واوچر', description: 'تشریح', department: 'څانګه', funding: 'د تمویل سرچینه', amount: 'مبلغ (افغانۍ)', reason: 'لامل', withdrawer: 'ایستونکی', noEntries: 'په دې موده کې کومه ثبت شوې پېښه نشته', summaryContinued: 'د کتګوریو د لنډیز دوام' },
}

function titleFor(titles: Titles, language: Language): string {
  return titles[language] || titles.english || titles.dari || titles.pashto || '—'
}

function chunks<T>(rows: T[], size: number): T[][] {
  if (!rows.length) return [[]]
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size))
}

function formatAfn(value: string): string {
  return `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AFN`
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

function describeError(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : 'Unable to generate the expenses report.'
}

type PrintPage =
  | { kind: 'summary'; rows: Array<{ category: string; subcategory: string; code: string; total: string }>; continuation: boolean }
  | { kind: 'expense'; category: string; subcategory: string; code: string; entries: ExpenseEntry[] }
  | { kind: 'salary'; entries: ExpenseEntry[] }
  | { kind: 'withdrawal'; currency: 'AFN' | 'USD'; entries: Withdrawal[] }

export function ExpensesReportPage() {
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [language, setLanguage] = useState<Language>('english')
  const [report, setReport] = useState<ExpensesReport | null>(null)
  const [expensePage, setExpensePage] = useState(1)
  const [withdrawalPage, setWithdrawalPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const text = labels[language]
  const isRtl = language !== 'english'

  const loadReport = useCallback(async (currentFrom = fromDate, currentTo = toDate, currentExpensePage = expensePage, currentWithdrawalPage = withdrawalPage) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (currentFrom) params.set('from', currentFrom)
      if (currentTo) params.set('to', currentTo)
      params.set('page', String(currentExpensePage))
      params.set('withdrawal_page', String(currentWithdrawalPage))
      setReport(await apiFetch<ExpensesReport>(`/expenses/report/?${params.toString()}`))
    } catch (caught) {
      setError(describeError(caught))
    } finally {
      setLoading(false)
    }
  }, [expensePage, fromDate, toDate, withdrawalPage])

  useEffect(() => {
    void loadReport()
  }, [])

  const pages = useMemo<PrintPage[]>(() => {
    if (!report) return []
    const summaryRows = report.categories.flatMap((category) => category.subcategories.map((subcategory) => ({ category: titleFor(category.titles, language), subcategory: titleFor(subcategory.titles, language), code: subcategory.code, total: subcategory.total })))
    const result: PrintPage[] = chunks(summaryRows, 20).map((rows, index) => ({ kind: 'summary', rows, continuation: index > 0 }))
    for (const category of report.categories) {
      for (const subcategory of category.subcategories) {
        if (!subcategory.entries.length) continue
        for (const entryChunk of chunks(subcategory.entries, 16)) result.push({ kind: 'expense', category: titleFor(category.titles, language), subcategory: titleFor(subcategory.titles, language), code: subcategory.code, entries: entryChunk })
      }
    }
    if (report.salary_entries.length) for (const entryChunk of chunks(report.salary_entries, 16)) result.push({ kind: 'salary', entries: entryChunk })
    for (const withdrawalGroup of report.withdrawals) {
      if (!withdrawalGroup.entries.length) continue
      for (const entryChunk of chunks(withdrawalGroup.entries, 16)) result.push({ kind: 'withdrawal', currency: withdrawalGroup.currency, entries: entryChunk })
    }
    return result
  }, [language, report])

  return <div className="space-y-5">
    <section className="no-print flex flex-wrap items-end justify-between gap-4">
      <SectionHeader title="Expenses report" subtitle="Choose a date range, language, and print a detailed A4 portrait report." />
      <form className="flex w-full max-w-4xl flex-wrap items-end justify-end gap-3 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-sm shadow-sky-100/70" onSubmit={(event) => { event.preventDefault(); setExpensePage(1); setWithdrawalPage(1); void loadReport(fromDate, toDate, 1, 1) }}>
        <label className="block w-full sm:w-44"><span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">From</span><input className={inputClassName} type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="block w-full sm:w-44"><span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">To</span><input className={inputClassName} type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} /></label>
        <div className="flex rounded-xl border border-sky-200 bg-sky-50 p-1">{(['dari', 'pashto', 'english'] as Language[]).map((item) => <button key={item} className={`rounded-lg px-3 py-2 text-sm font-medium ${language === item ? 'bg-white text-pink-700 shadow-sm' : 'text-slate-600'}`} type="button" onClick={() => setLanguage(item)}>{item === 'dari' ? 'دری' : item === 'pashto' ? 'پښتو' : 'English'}</button>)}</div>
        <button className={ghostButtonClassName} type="submit" disabled={loading}>{loading ? 'Loading...' : 'Generate report'}</button><button className={buttonClassName} type="button" onClick={() => window.print()} disabled={!report || !pages.length}>Print A4 report</button>
      </form>
    </section>
    {error ? <div className="no-print rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
    {report ? <><section className="print-area space-y-5">{pages.map((page, pageIndex) => <article key={`${page.kind}-${pageIndex}`} dir={isRtl ? 'rtl' : 'ltr'} lang={language === 'dari' ? 'fa-AF' : language === 'pashto' ? 'ps-AF' : 'en'} className="expense-report-page mx-auto max-w-4xl rounded-md border border-zinc-200 bg-white p-8 text-zinc-950"><header className="border-b border-zinc-200 pb-4 text-center"><div className="flex items-center justify-center gap-3"><img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-14 w-14 rounded-xl border border-sky-100 object-cover" /><div><p className="text-xs font-semibold text-sky-700">Mother and Child Health Support Center</p><h1 className="text-2xl font-bold">{text.title}</h1><p className="mt-1 text-xs text-slate-600">{text.subtitle}</p></div></div><p className="mt-3 text-xs text-slate-600">{text.from}: {report.from || '—'} · {text.to}: {report.to || '—'} · {text.generated}: {formatDate(report.generated_at)}</p></header><div className="pt-4">{page.kind === 'summary' ? <SummaryPage page={page} report={report} text={text} /> : null}{page.kind === 'expense' ? <ExpensePage page={page} text={text} /> : null}{page.kind === 'salary' ? <SalaryPage page={page} report={report} text={text} /> : null}{page.kind === 'withdrawal' ? <WithdrawalPage page={page} report={report} text={text} /> : null}</div><footer className="mt-auto border-t border-zinc-200 pt-3 text-center text-xs text-zinc-500">{text.page} {pageIndex + 1} / {pages.length}</footer></article>)}</section><section className="no-print mx-auto max-w-4xl space-y-3"><PaginationControls page={report.pagination.page} totalCount={report.pagination.total_count} pageSize={report.pagination.page_size} onPageChange={(page) => { setExpensePage(page); void loadReport(fromDate, toDate, page, withdrawalPage) }} /><PaginationControls page={report.withdrawal_pagination.page} totalCount={report.withdrawal_pagination.total_count} pageSize={report.withdrawal_pagination.page_size} onPageChange={(page) => { setWithdrawalPage(page); void loadReport(fromDate, toDate, expensePage, page) }} /></section></> : null}
  </div>
}

function SummaryPage({ page, report, text }: { page: Extract<PrintPage, { kind: 'summary' }>; report: ExpensesReport; text: Record<string, string> }) {
  return <><div className="mb-4"><div className="rounded-xl bg-sky-50 p-3"><p className="text-xs font-semibold text-sky-700">{text.totalExpenses}</p><p className="mt-1 text-xl font-bold">{formatAfn(report.total_expenses_afn)}</p></div></div><h2 className="mb-3 text-lg font-bold">{page.continuation ? text.summaryContinued : text.categorySummary}</h2><table className="w-full border-collapse text-xs"><thead><tr className="bg-slate-100 text-left"><th className="border border-zinc-300 p-2">{text.categoryDetails}</th><th className="border border-zinc-300 p-2">{text.description}</th><th className="border border-zinc-300 p-2">{text.amount}</th></tr></thead><tbody>{page.rows.map((row) => <tr key={`${row.code}-${row.category}`}><td className="border border-zinc-300 p-2">{row.category}</td><td className="border border-zinc-300 p-2">{row.subcategory} ({row.code})</td><td className="border border-zinc-300 p-2 font-semibold">{formatAfn(row.total)}</td></tr>)}</tbody></table><div className="mt-5"><h3 className="font-bold">{text.bankWithdrawals}</h3><p className="mt-1 text-xs text-slate-600">{text.withdrawalNote}</p><div className="mt-2 flex gap-3">{report.withdrawals.map((group) => <div key={group.currency} className="rounded border border-zinc-200 px-3 py-2 text-sm"><strong>{group.currency}:</strong> {Number(group.total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {group.currency}</div>)}</div></div></>
}

function ExpensePage({ page, text }: { page: Extract<PrintPage, { kind: 'expense' }>; text: Record<string, string> }) {
  return <><h2 className="text-lg font-bold">{text.categoryDetails}</h2><p className="mt-1 text-sm font-semibold text-sky-700">{page.category} — {page.subcategory} ({page.code})</p><ExpenseEntriesTable entries={page.entries} text={text} /></>
}

function SalaryPage({ page, report, text }: { page: Extract<PrintPage, { kind: 'salary' }>; report: ExpensesReport; text: Record<string, string> }) {
  return <><h2 className="text-lg font-bold">{text.salaryDetails}</h2><p className="mt-1 text-xs text-slate-600">{text.salaryNote}</p><p className="mt-2 text-sm font-bold">{text.salaryTotal}: {formatAfn(report.salary_total_afn)}</p><ExpenseEntriesTable entries={page.entries} text={text} /></>
}

function ExpenseEntriesTable({ entries, text }: { entries: ExpenseEntry[]; text: Record<string, string> }) {
  return <table className="mt-4 w-full border-collapse text-[11px]"><thead><tr className="bg-slate-100 text-left"><th className="border border-zinc-300 p-1.5">{text.date}</th><th className="border border-zinc-300 p-1.5">{text.voucher}</th><th className="border border-zinc-300 p-1.5">{text.description}</th><th className="border border-zinc-300 p-1.5">{text.department}</th><th className="border border-zinc-300 p-1.5">{text.funding}</th><th className="border border-zinc-300 p-1.5">{text.amount}</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td className="border border-zinc-300 p-1.5">{formatDate(entry.created_at)}</td><td className="border border-zinc-300 p-1.5">{entry.voucher_number}</td><td className="border border-zinc-300 p-1.5">{entry.name || entry.description || '—'}{entry.description && entry.name ? ` — ${entry.description}` : ''}</td><td className="border border-zinc-300 p-1.5">{entry.department || '—'}</td><td className="border border-zinc-300 p-1.5">{entry.funding_source || '—'}</td><td className="border border-zinc-300 p-1.5 font-semibold">{formatAfn(entry.amount)}</td></tr>)}</tbody></table>
}

function WithdrawalPage({ page, report, text }: { page: Extract<PrintPage, { kind: 'withdrawal' }>; report: ExpensesReport; text: Record<string, string> }) {
  const total = report.withdrawals.find((group) => group.currency === page.currency)?.total || '0'
  return <><h2 className="text-lg font-bold">{text.bankWithdrawals} ({page.currency})</h2><p className="mt-1 text-xs text-slate-600">{text.withdrawalNote}</p><p className="mt-2 text-sm font-bold">{text.totalWithdrawal}: {Number(total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {page.currency}</p><table className="mt-4 w-full border-collapse text-xs"><thead><tr className="bg-slate-100 text-left"><th className="border border-zinc-300 p-2">{text.date}</th><th className="border border-zinc-300 p-2">ID</th><th className="border border-zinc-300 p-2">{text.reason}</th><th className="border border-zinc-300 p-2">{text.withdrawer}</th><th className="border border-zinc-300 p-2">{text.totalWithdrawal}</th></tr></thead><tbody>{page.entries.map((entry) => <tr key={entry.id}><td className="border border-zinc-300 p-2">{formatDate(entry.created_at)}</td><td className="border border-zinc-300 p-2">#{entry.id}</td><td className="border border-zinc-300 p-2">{entry.reason}</td><td className="border border-zinc-300 p-2">{entry.withdrawer_name || '—'}</td><td className="border border-zinc-300 p-2 font-semibold">{Number(entry.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {page.currency}</td></tr>)}</tbody></table></>
}
