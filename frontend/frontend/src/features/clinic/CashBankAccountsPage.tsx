import { useDeferredValue, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ExternalLink, FileImage, FileText, Upload } from 'lucide-react'

import { ApiError, apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, PaginationControls, Panel, SectionHeader } from '../../components/ui'
import type { CashBankBalance, CashBankTransaction, PaginatedResponse } from '../../types/domain'

function errorMessage(caught: unknown): string {
  if (caught instanceof ApiError) {
    if (caught.details && typeof caught.details === 'object') {
      return Object.values(caught.details as Record<string, unknown>).flat().map(String).join(' ') || caught.message
    }
    return caught.message
  }
  return 'Unable to save the cash or bank transaction.'
}

function formatBalance(value: string, currency: CashBankBalance['currency']): string {
  return `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
}

function isPdfSlip(fileName: string): boolean {
  return fileName.toLowerCase().endsWith('.pdf')
}

export function CashBankAccountsPage() {
  const [transactions, setTransactions] = useState<CashBankTransaction[]>([])
  const [balances, setBalances] = useState<CashBankBalance[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [form, setForm] = useState({ transaction_type: 'deposit' as CashBankTransaction['transaction_type'], amount: '', currency: 'AFN' as CashBankTransaction['currency'], depositor_name: '', withdrawer_name: '', reason: '', slip: null as File | null })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [pendingDeletion, setPendingDeletion] = useState<CashBankTransaction | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setPage(1)
  }, [deferredSearch])

  async function loadData(currentPage = page, currentSearch = deferredSearch) {
    try {
      const params = new URLSearchParams({ page: String(currentPage) })
      if (currentSearch.trim()) params.set('q', currentSearch.trim())
      const [transactionResponse, balanceResponse] = await Promise.all([
        apiFetch<PaginatedResponse<CashBankTransaction>>(`/cash-bank-transactions/?${params.toString()}`),
        apiFetch<{ balances: CashBankBalance[] }>('/cash-bank-transactions/balances/'),
      ])
      setTransactions(transactionResponse.results)
      setTotalCount(transactionResponse.count)
      setBalances(balanceResponse.balances)
      setError('')
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  useEffect(() => {
    void loadData(page, deferredSearch)
  }, [page, deferredSearch])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingId && !form.slip) {
      setError(`Upload the ${form.transaction_type === 'deposit' ? 'deposit' : 'withdrawal'} slip.`)
      return
    }
    const payload = new FormData()
    payload.append('transaction_type', form.transaction_type)
    payload.append('amount', form.amount)
    payload.append('currency', form.currency)
    payload.append('depositor_name', form.depositor_name.trim())
    payload.append('withdrawer_name', form.withdrawer_name.trim())
    payload.append('reason', form.reason.trim())
    if (form.slip) payload.append('slip', form.slip)
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await apiFetch<CashBankTransaction>(editingId ? `/cash-bank-transactions/${editingId}/` : '/cash-bank-transactions/', { method: editingId ? 'PATCH' : 'POST', body: payload })
      setForm({ transaction_type: 'deposit', amount: '', currency: 'AFN', depositor_name: '', withdrawer_name: '', reason: '', slip: null })
      setNotice(editingId ? 'Ledger entry updated.' : `${form.transaction_type === 'deposit' ? 'Deposit' : 'Withdrawal'} recorded.`)
      setEditingId(null)
      setPage(1)
      await loadData(1, deferredSearch)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  function startEdit(transaction: CashBankTransaction) {
    setEditingId(transaction.id)
    setForm({ transaction_type: transaction.transaction_type, amount: transaction.amount, currency: transaction.currency, depositor_name: transaction.depositor_name, withdrawer_name: transaction.withdrawer_name, reason: transaction.reason, slip: null })
    setError('')
    setNotice('')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm({ transaction_type: 'deposit', amount: '', currency: 'AFN', depositor_name: '', withdrawer_name: '', reason: '', slip: null })
  }

  async function deleteTransaction() {
    if (!pendingDeletion) return
    const transaction = pendingDeletion
    setError('')
    setNotice('')
    try {
      await apiFetch(`/cash-bank-transactions/${transaction.id}/`, { method: 'DELETE' })
      if (editingId === transaction.id) cancelEdit()
      setNotice('Ledger entry deleted.')
      setPendingDeletion(null)
      await loadData(page, deferredSearch)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <>
      <SectionHeader title="Cash & Bank Accounts" subtitle="Record and review deposit and withdrawal slips. Balances are calculated separately for AFN and USD." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {balances.map((balance) => (
          <Panel key={balance.currency}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Current balance ({balance.currency})</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{formatBalance(balance.balance, balance.currency)}</p>
          </Panel>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr]">
        <Panel>
          <form onSubmit={submit} className="grid gap-3">
            {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
            {notice ? <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div> : null}
            <Field label="Transaction type">
              <select className={inputClassName} value={form.transaction_type} onChange={(event) => setForm((current) => ({ ...current, transaction_type: event.target.value as CashBankTransaction['transaction_type'] }))}>
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={form.transaction_type === 'deposit' ? 'Deposit amount' : 'Withdrawal amount'}><input className={inputClassName} type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} required /></Field>
              <Field label="Currency type"><select className={inputClassName} value={form.currency} onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value as CashBankTransaction['currency'] }))}><option value="AFN">AFN</option><option value="USD">USD</option></select></Field>
            </div>
            {form.transaction_type === 'deposit' ? <Field label="Depositor name"><input className={inputClassName} value={form.depositor_name} onChange={(event) => setForm((current) => ({ ...current, depositor_name: event.target.value }))} required /></Field> : <Field label="Withdrawer name"><input className={inputClassName} value={form.withdrawer_name} onChange={(event) => setForm((current) => ({ ...current, withdrawer_name: event.target.value }))} required /></Field>}
            <Field label="Reason"><textarea className={`${inputClassName} min-h-28`} value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} required /></Field>
            <Field label={form.transaction_type === 'deposit' ? 'Deposit slip (PDF or image)' : 'Withdrawal slip (PDF or image)'}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed border-sky-200 bg-sky-50/70 p-4 transition hover:border-sky-400 hover:bg-sky-100/70">
                <input className="sr-only" type="file" accept=".pdf,image/png,image/jpeg,image/webp" onChange={(event) => setForm((current) => ({ ...current, slip: event.target.files?.[0] ?? null }))} required={!editingId} />
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${form.slip ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-sky-600 shadow-sm'}`}>
                  {form.slip ? (isPdfSlip(form.slip.name) ? <FileText className="h-6 w-6" /> : <FileImage className="h-6 w-6" />) : <Upload className="h-6 w-6" />}
                </span>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{form.slip?.name || 'Choose deposit or withdrawal slip'}</span><span className="mt-1 block text-xs text-slate-500">{form.slip ? 'File selected — click to replace it.' : 'PDF, PNG, JPG, JPEG, or WEBP · up to 8 MB'}</span></span>
              </label>
            </Field>
            {editingId ? <p className="text-xs text-zinc-500">Leave the slip blank to keep the currently uploaded file.</p> : null}
            <div className="flex flex-wrap gap-2"><button className={buttonClassName} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update entry' : `Record ${form.transaction_type === 'deposit' ? 'deposit' : 'withdrawal'}`}</button>{editingId ? <button className={ghostButtonClassName} type="button" onClick={cancelEdit}>Cancel</button> : null}</div>
          </form>
        </Panel>
        <Panel>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><p className="text-sm font-semibold text-slate-950">Ledger entries</p><p className="text-sm text-zinc-600">IDs are generated by the system. Deleted entries are soft-deleted and removed from current balances.</p></div>
            <button className={buttonClassName} type="button" onClick={() => void loadData(page, deferredSearch)}>Refresh</button>
          </div>
          <Field label="Search by reason or recorded by"><input className={inputClassName} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ledger" /></Field>
          <div className="mt-4 grid gap-3">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="rounded border border-sky-100 bg-white p-4 shadow-sm shadow-sky-100/60">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-lg font-semibold text-slate-950">#{transaction.id} — {transaction.transaction_type_label}</p><p className={`mt-1 text-sm font-semibold ${transaction.transaction_type === 'deposit' ? 'text-emerald-700' : 'text-rose-700'}`}>{transaction.transaction_type === 'deposit' ? '+' : '−'}{formatBalance(transaction.amount, transaction.currency)}</p><p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{new Date(transaction.created_at).toLocaleString()}</p></div>
                  <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">{transaction.created_by_name || 'Reception'}</span>
                </div>
                <p className="mt-3 text-sm text-slate-700">{transaction.reason}</p>
                <p className="mt-2 text-sm text-slate-700"><strong>{transaction.transaction_type === 'deposit' ? 'Depositor' : 'Withdrawer'}:</strong> {transaction.transaction_type === 'deposit' ? transaction.depositor_name : transaction.withdrawer_name}</p>
                {transaction.slip_url ? <a className="mt-3 flex items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-sky-800 transition hover:border-sky-300 hover:bg-sky-100" href={transaction.slip_url} target="_blank" rel="noreferrer"><span className={`flex h-10 w-10 items-center justify-center rounded-lg ${isPdfSlip(transaction.slip_name) ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-700'}`}>{isPdfSlip(transaction.slip_name) ? <FileText className="h-5 w-5" /> : <FileImage className="h-5 w-5" />}</span><span className="min-w-0 flex-1"><span className="block text-xs font-medium uppercase tracking-[0.16em] text-sky-600">{isPdfSlip(transaction.slip_name) ? 'PDF slip' : 'Image slip'}</span><span className="block truncate text-sm font-semibold">{transaction.slip_name || 'View slip'}</span></span><ExternalLink className="h-4 w-4 shrink-0" /></a> : null}
                <div className="mt-4 flex flex-wrap gap-2"><button className={ghostButtonClassName} type="button" onClick={() => startEdit(transaction)}>Edit</button><button className={ghostButtonClassName} type="button" onClick={() => setPendingDeletion(transaction)}>Delete</button></div>
              </div>
            ))}
            {!transactions.length ? <div className="rounded border border-dashed border-zinc-200 p-4 text-sm text-zinc-500">No cash or bank entries recorded.</div> : null}
          </div>
          <PaginationControls page={page} totalCount={totalCount} onPageChange={setPage} />
        </Panel>
      </div>
      {pendingDeletion ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div role="alertdialog" aria-modal="true" aria-labelledby="cash-bank-delete-title" className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-2xl text-rose-600">!</div><h2 id="cash-bank-delete-title" className="mt-4 text-xl font-semibold text-slate-950">Delete this ledger entry?</h2><p className="mt-2 text-sm text-slate-600">Entry #{pendingDeletion.id} will be removed from the current balance. It remains recoverable in the audit trail.</p><div className="mt-6 flex justify-center gap-3"><button className={ghostButtonClassName} type="button" onClick={() => setPendingDeletion(null)}>Cancel</button><button className="rounded border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700" type="button" onClick={() => void deleteTransaction()}>Yes, delete it</button></div></div></div> : null}
    </>
  )
}
