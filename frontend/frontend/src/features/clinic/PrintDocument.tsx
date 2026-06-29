import type { ClinicalDocument } from '../../types/domain'

function asLineItems(payload: Record<string, unknown>) {
  const items = payload.items
  return Array.isArray(items) ? items : []
}

export function PrintDocument({ document }: { document: ClinicalDocument }) {
  const lines = asLineItems(document.payload)

  return (
    <section className="print-area rounded-md border border-zinc-200 bg-white p-6 text-zinc-950">
      <header className="border-b border-zinc-200 pb-4">
        <p className="text-sm font-medium text-sky-600">AFZENDA</p>
        <h2 className="text-xl font-semibold">Mother and Child Health Care Center</h2>
        <p className="text-sm text-zinc-600">Health of mother and child; foundation of a healthy society</p>
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
                  <td className="py-2">{String(row.name ?? row.test ?? row.medicine ?? row.vaccine ?? 'Item')}</td>
                  <td className="py-2">{String(row.instructions ?? row.result ?? row.quantity ?? row.notes ?? '')}</td>
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
