import type { ClinicalDocument, Payment } from '../../types/domain'

function asLineItems(payload: Record<string, unknown>) {
  const items = payload.items
  return Array.isArray(items) ? items : []
}

function isMidwifeRecord(document: ClinicalDocument): boolean {
  return document.document_type === 'ultrasound' && Boolean((document.payload as Record<string, unknown>).midwife_record)
}

function payloadValue(document: ClinicalDocument, key: string): string {
  const value = (document.payload as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : ''
}

function midwifeVisitTypeLabel(document: ClinicalDocument): string {
  return payloadValue(document, 'visit_type') === 'pnc' ? 'PNC' : 'ANC'
}

function documentRowDetails(row: Record<string, unknown>): string {
  const quantityLabel = row.vaccine ? 'Dose(s)' : 'Qty'
  const details = [row.quantity ? `${quantityLabel}: ${String(row.quantity)}` : '', row.instructions ? String(row.instructions) : '', row.result ? String(row.result) : '', row.notes ? String(row.notes) : '']
  return details.filter(Boolean).join(' | ')
}

export function PrintDocument({ document }: { document: ClinicalDocument }) {
  if (isMidwifeRecord(document)) {
    const highRisk = Boolean((document.payload as Record<string, unknown>).high_risk)

    return (
      <section className="print-area a4-report rounded-md border border-zinc-200 bg-white p-6 text-zinc-950">
        <header className="flex items-center gap-4 border-b border-zinc-200 pb-4">
          <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-16 w-16 rounded object-cover" />
          <div>
            <p className="text-sm font-medium text-sky-600">AFZENDA</p>
            <h2 className="text-xl font-semibold">Mother and Child Health Care Center</h2>
            <p className="text-sm text-zinc-600">Maternal care record</p>
          </div>
        </header>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <p><strong>Visit type:</strong> {midwifeVisitTypeLabel(document)}</p>
          <p><strong>Date:</strong> {new Date(document.created_at).toLocaleString()}</p>
          <p><strong>Patient:</strong> {document.patient_name}</p>
          <p><strong>Prepared by:</strong> {document.created_by_name || 'MCHC staff'}</p>
          <p><strong>Patient status:</strong> {payloadValue(document, 'patient_status') === 'follow_up' ? 'Follow-up' : 'New'}</p>
          <p><strong>High risk:</strong> {highRisk ? 'Yes' : 'No'}</p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded border border-sky-100 p-4">
            <h3 className="text-base font-semibold">Clinical summary</h3>
            <div className="mt-3 grid gap-2 text-sm">
              <p><strong>Gestational age:</strong> {payloadValue(document, 'gestational_age_weeks') || 'Not recorded'}</p>
              <p><strong>Estimated delivery date:</strong> {payloadValue(document, 'estimated_delivery_date') || 'Not recorded'}</p>
              <p><strong>Next visit date:</strong> {payloadValue(document, 'next_visit_date') || 'Not recorded'}</p>
              <p><strong>Blood pressure:</strong> {payloadValue(document, 'blood_pressure') || 'Not recorded'}</p>
              <p><strong>Weight:</strong> {payloadValue(document, 'weight_kg') || 'Not recorded'}</p>
              <p><strong>Fetal heart rate:</strong> {payloadValue(document, 'fetal_heart_rate') || 'Not recorded'}</p>
              <p><strong>Gravida:</strong> {payloadValue(document, 'gravida') || 'Not recorded'}</p>
              <p><strong>Parity:</strong> {payloadValue(document, 'parity') || 'Not recorded'}</p>
            </div>
          </section>

          <section className="rounded border border-sky-100 p-4">
            <h3 className="text-base font-semibold">Risk and follow-up</h3>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <p className="font-medium">Danger signs</p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'danger_signs') || 'None recorded'}</p>
              </div>
              <div>
                <p className="font-medium">Assessment and plan</p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'assessment') || 'Not recorded'}</p>
              </div>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded border border-sky-100 p-4">
          <h3 className="text-base font-semibold">Notes</h3>
          <p className="mt-3 min-h-24 whitespace-pre-wrap text-sm text-zinc-700">{payloadValue(document, 'notes') || 'No additional notes.'}</p>
        </section>

        <div className="mt-10 border-t border-zinc-200 pt-4 text-sm">
          <span>Midwife signature: __________________</span>
        </div>
      </section>
    )
  }

  const lines = asLineItems(document.payload)
  const halfA4 = document.document_type === 'prescription' || document.document_type === 'lab_order'
  const showLogo = halfA4 || document.document_type === 'vaccination'
  const showCosts = !['prescription', 'vaccination'].includes(document.document_type)
  const patientStatus = typeof document.payload.patient_status === 'string' ? document.payload.patient_status : ''
  const patientStatusLabel = patientStatus === 'follow_up' ? 'Follow-up' : patientStatus === 'new' ? 'New' : ''

  return (
    <section className={`print-area rounded-md border border-zinc-200 bg-white p-6 text-zinc-950 ${halfA4 ? 'half-a4-bill' : ''}`}>
      <header className="flex items-center gap-4 border-b border-zinc-200 pb-4">
        {showLogo ? <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-14 w-14 rounded object-cover" /> : null}
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
        {patientStatusLabel ? <p><strong>Patient status:</strong> {patientStatusLabel}</p> : null}
      </div>

      <h3 className="mt-6 text-lg font-semibold">{document.title}</h3>

      {lines.length ? (
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-300 text-left">
              <th className="py-2">Item</th>
              <th className="py-2">Details</th>
              {showCosts ? <th className="py-2 text-right">Cost</th> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((item, index) => {
              const row = item as Record<string, unknown>
              return (
                <tr key={index} className="border-b border-zinc-100">
                  <td className="py-2">{String(row.name ?? row.test_name ?? row.test ?? row.medicine_name ?? row.medicine ?? row.vaccine ?? 'Item')}</td>
                  <td className="py-2">{documentRowDetails(row)}</td>
                  {showCosts ? <td className="py-2 text-right">{String(row.cost ?? row.amount ?? '')}</td> : null}
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
        {showCosts ? <span>Total cost: {document.total_amount}</span> : <span />}
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
