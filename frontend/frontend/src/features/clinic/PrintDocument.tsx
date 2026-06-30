import type { ClinicalDocument, Payment } from '../../types/domain'

function asLineItems(payload: Record<string, unknown>) {
  const items = payload.items
  return Array.isArray(items) ? items : []
}

function documentRowDetails(row: Record<string, unknown>): string {
  const details = [row.quantity ? `Qty: ${String(row.quantity)}` : '', row.instructions ? String(row.instructions) : '', row.result ? String(row.result) : '', row.notes ? String(row.notes) : '']
  return details.filter(Boolean).join(' | ')
}

export function PrintDocument({ document }: { document: ClinicalDocument }) {
  const lines = asLineItems(document.payload)
  const halfA4 = document.document_type === 'prescription' || document.document_type === 'lab_order'

  return (
    <section className={`print-area rounded-md border border-zinc-200 bg-white p-6 text-zinc-950 ${halfA4 ? 'half-a4-bill' : ''}`}>
      <header className="flex items-center gap-4 border-b border-zinc-200 pb-4">
        {halfA4 ? <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-14 w-14 rounded object-cover" /> : null}
        <div>
          <p className="text-sm font-medium text-sky-600">AFZENDA</p>
          <h2 className="text-xl font-semibold">Mother and Child Health Care Center</h2>
          <p className="text-sm text-zinc-600">{halfA4 ? document.document_type_label : 'Health of mother and child; foundation of a healthy society'}</p>
        </div>
      </header>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <p><strong>Document:</strong> {document.document_type_label}</p>
        <p><strong>Date:</strong> {new Date(document.created_at).toLocaleString()}</p>
        <p><strong>Patient:</strong> {document.patient_name}</p>
        <p><strong>Prepared by:</strong> {document.created_by_name || 'MCHC staff'}</p>
      </div>

      <h3 className="mt-6 text-lg font-semibold">{document.title}</h3>

      {lines.length ? (
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-2">Item</th>
              <th className="py-2">Details</th>
              <th className="py-2 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((item, index) => {
              const row = item as Record<string, unknown>
              return (
                <tr key={index} className="border-b border-zinc-100">
                  <td className="py-2">{String(row.name ?? row.test_name ?? row.test ?? row.medicine_name ?? row.medicine ?? row.vaccine ?? 'Item')}</td>
                  <td className="py-2">{documentRowDetails(row)}</td>
                  <td className="py-2 text-right">{String(row.cost ?? row.amount ?? '')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <pre className="mt-3 whitespace-pre-wrap rounded border border-zinc-200 bg-zinc-50 p-3 text-sm">
          {JSON.stringify(document.payload, null, 2)}
        </pre>
      )}

      <div className="mt-6 flex justify-between border-t border-zinc-200 pt-4 text-sm">
        <span>Total cost: {document.total_amount}</span>
        <span>Signature: __________________</span>
      </div>
    </section>
  )
}

export function PrintPaymentBill({ payment, printedBy }: { payment: Payment; printedBy: string }) {
  const patientName = payment.patient_full_name || payment.patient_name
  const createdAt = new Date(payment.created_at).toLocaleString()
  const isFree = payment.payment_type === 'free'
  const isDiscount = payment.payment_type === 'discount'

  return (
    <section className="print-area half-a4-bill rounded-md border border-zinc-200 bg-white p-6 text-zinc-950">
      <header className="flex items-center gap-4 border-b border-zinc-200 pb-4">
        <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-16 w-16 rounded object-cover" />
        <div>
          <p className="text-sm font-medium text-sky-600">AFZENDA</p>
          <h2 className="text-xl font-semibold">Mother and Child Health Care Center</h2>
          <p className="text-sm text-zinc-600">Reception bill</p>
        </div>
      </header>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <p><strong>Date and time:</strong> {createdAt}</p>
        <p><strong>Bill status:</strong> {payment.status}</p>
        <p><strong>Patient:</strong> {patientName}</p>
        <p><strong>Age:</strong> {payment.patient_age ?? 'N/A'}</p>
        <p><strong>Department:</strong> {payment.department || payment.service}</p>
      </div>

      <table className="mt-6 w-full border-collapse text-sm">
        <tbody>
          <tr className="border-b border-zinc-100">
            <td className="py-2 font-medium">Amount of doctor fees</td>
            <td className="py-2 text-right">{payment.doctor_fee}</td>
          </tr>
          <tr className="border-b border-zinc-100">
            <td className="py-2 font-medium">Payment type</td>
            <td className="py-2 text-right">{isFree ? 'Free' : isDiscount ? 'Discount percentage' : 'Full payment'}</td>
          </tr>
          {isDiscount ? (
            <tr className="border-b border-zinc-100">
              <td className="py-2 font-medium">Discount</td>
              <td className="py-2 text-right">{payment.discount_percentage}% ({payment.discount_amount})</td>
            </tr>
          ) : null}
          {isFree ? (
            <tr className="border-b border-zinc-100">
              <td className="py-2 font-medium">Amount to pay</td>
              <td className="py-2 text-right font-semibold">Free</td>
            </tr>
          ) : null}
          <tr className="border-b border-zinc-200">
            <td className="py-2 text-lg font-semibold">{isDiscount ? 'Amount after discount' : 'Final amount'}</td>
            <td className="py-2 text-right text-lg font-semibold">{isFree ? 'Free' : payment.amount}</td>
          </tr>
        </tbody>
      </table>

      {payment.notes ? <p className="mt-4 text-sm"><strong>Notes:</strong> {payment.notes}</p> : null}

      <div className="mt-8 border-t border-zinc-200 pt-4 text-sm">
        <span><strong>Printed by:</strong> {printedBy}</span>
      </div>

      <div className="mt-6 border-t border-zinc-200 pt-3 text-center text-sm font-semibold leading-7 text-zinc-800" dir="rtl">
        <p>پول پرداخت‌شده قابل بازپرداخت نیست.</p>
        <p>ورکړې شوې پیسې بېرته نه ورکول کېږي.</p>
      </div>
    </section>
  )
}
