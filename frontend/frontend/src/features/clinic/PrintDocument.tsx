import type { ClinicalDocument, Payment } from '../../types/domain'

function formatPaymentAge(age: number | null, ageUnit: Payment['patient_age_unit'] | undefined): string {
  if (age === null) return 'N/A'
  return `${age} ${ageUnit === 'month' ? 'month' : 'year'}${age === 1 ? '' : 's'}`
}

function asLineItems(payload: Record<string, unknown>) {
  const items = payload.items
  return Array.isArray(items) ? items : []
}

function isMidwifeRecord(document: ClinicalDocument): boolean {
  return document.document_type === 'ultrasound' && Boolean((document.payload as Record<string, unknown>).midwife_record)
}

function isDeliveryRecord(document: ClinicalDocument): boolean {
  return document.document_type === 'ultrasound' && Boolean((document.payload as Record<string, unknown>).delivery_record)
}

function isGynecologyUltrasound(document: ClinicalDocument): boolean {
  return document.document_type === 'ultrasound' && Boolean((document.payload as Record<string, unknown>).gynecology_ultrasound)
}

function isMalnutritionRecord(document: ClinicalDocument): boolean {
  return document.document_type === 'rutf' && Boolean((document.payload as Record<string, unknown>).malnutrition_record)
}

function isFamilyPlanningRecord(document: ClinicalDocument): boolean {
  return document.document_type === 'family_planning' && Boolean((document.payload as Record<string, unknown>).family_planning_record)
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

export const billPaperClassName = 'print-area half-a4-bill bg-white p-4 font-sans text-[11px] leading-tight text-black shadow-none'
export const billBoxClassName = 'border border-black'
export const billCellClassName = 'border-r border-black px-2 py-1 last:border-r-0'
export const billHeaderCellClassName = 'border-r border-black bg-zinc-200 px-2 py-1 text-left font-bold last:border-r-0'

export function BillTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="relative min-h-20 pb-3 text-center">
      <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="absolute left-2 top-0 h-16 w-16 object-cover" />
      <div className="px-20 pt-2">
        <h2 className="text-2xl font-black uppercase tracking-wide">{title}</h2>
        <p className="mt-2 text-lg font-black">{subtitle}</p>
      </div>
    </header>
  )
}

export function BillReceiptNote({ receivedFrom, amount }: { receivedFrom: string; amount: string }) {
  return (
    <div className="mt-4 text-center text-sm font-bold leading-7 text-black">
      <p>Received with thanks from <strong>{receivedFrom}</strong> a sum of Afghani <strong>{amount}</strong></p>
      <div dir="rtl">
        <p>پول پرداخت‌شده قابل بازپرداخت نیست.</p>
        <p>ورکړې شوې پیسې بېرته نه ورکول کېږي.</p>
      </div>
    </div>
  )
}

export function BillSignature() {
  return (
    <div className="mt-5 flex justify-end text-sm">
      <div className="min-w-44 border border-zinc-300 px-3 py-5 text-right font-bold text-zinc-700">
        <p>Auth Sign</p>
      </div>
    </div>
  )
}

export function PrintDocument({ document }: { document: ClinicalDocument }) {
  if (isFamilyPlanningRecord(document)) {
    return (
      <section className="print-area a4-report rounded-md border border-zinc-200 bg-white p-6 text-zinc-950">
        <header className="flex items-center gap-4 border-b border-zinc-200 pb-4">
          <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-16 w-16 rounded object-cover" />
          <div>
            <p className="text-sm font-medium text-sky-600">AFZENDA</p>
            <h2 className="text-xl font-semibold">Mother and Child Health Support Center</h2>
            <p className="text-sm text-zinc-600">Family planning issue note</p>
          </div>
        </header>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <p><strong>Patient:</strong> {document.patient_name}</p>
          <p><strong>Date:</strong> {new Date(document.created_at).toLocaleString()}</p>
          <p><strong>Prepared by:</strong> {document.created_by_name || 'MCHC staff'}</p>
          <p><strong>Pharmacy status:</strong> {payloadValue(document, 'pharmacy_status') === 'dispensed' ? 'Dispensed' : 'Pending'}</p>
        </div>

        <section className="mt-6 rounded border border-sky-100 p-4">
          <h3 className="text-base font-semibold">Requested items</h3>
          <div className="mt-3 space-y-2 text-sm">
            {asLineItems(document.payload).map((row, index) => (
              <div key={`${String(row.medicine_name || row.medicine || index)}-${index}`} className="flex items-center justify-between rounded border border-sky-100 bg-sky-50/50 px-3 py-2">
                <span className="font-medium text-slate-950">{String(row.medicine_name || row.medicine || 'Family planning item')}</span>
                <span>Qty: {String(row.quantity || '0')}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10 border-t border-zinc-200 pt-4 text-sm">
          <span>Pharmacy signature: __________________</span>
        </div>
      </section>
    )
  }

  if (isMalnutritionRecord(document)) {
    return (
      <section className="print-area a4-report rounded-md border border-zinc-200 bg-white p-6 text-zinc-950">
        <header className="flex items-center gap-4 border-b border-zinc-200 pb-4">
          <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-16 w-16 rounded object-cover" />
          <div>
            <p className="text-sm font-medium text-sky-600">AFZENDA</p>
            <h2 className="text-xl font-semibold">Mother and Child Health Support Center</h2>
            <p className="text-sm text-zinc-600">Malnutrition assessment and RUTF order</p>
          </div>
        </header>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <p><strong>Patient:</strong> {document.patient_name}</p>
          <p><strong>Date:</strong> {new Date(document.created_at).toLocaleString()}</p>
          <p><strong>Prepared by:</strong> {document.created_by_name || 'MCHC staff'}</p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded border border-sky-100 p-4">
            <h3 className="text-base font-semibold">Assessment</h3>
            <div className="mt-3 grid gap-2 text-sm">
              <p><strong>MUAC:</strong> {payloadValue(document, 'muac_mm') || 'Not recorded'} mm</p>
              <p><strong>Weight:</strong> {payloadValue(document, 'weight_kg') || 'Not recorded'} kg</p>
              <p><strong>Height or length:</strong> {payloadValue(document, 'height_cm') || 'Not recorded'} cm</p>
              <p><strong>Bilateral edema:</strong> {payloadValue(document, 'bilateral_edema') === 'yes' ? 'Yes' : 'No'}</p>
              <p><strong>Appetite test:</strong> {payloadValue(document, 'appetite_test') === 'fail' ? 'Fail' : 'Pass'}</p>
              <p><strong>Nutrition status:</strong> {payloadValue(document, 'nutrition_status') === 'severe' ? 'Severe acute malnutrition' : payloadValue(document, 'nutrition_status') === 'moderate' ? 'Moderate acute malnutrition' : 'At risk'}</p>
            </div>
          </section>

          <section className="rounded border border-sky-100 p-4">
            <h3 className="text-base font-semibold">RUTF order</h3>
            <div className="mt-3 grid gap-2 text-sm">
              <p><strong>RUTF quantity:</strong> {String((document.payload as Record<string, unknown>).rutf_quantity ?? 0)}</p>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded border border-sky-100 p-4">
          <h3 className="text-base font-semibold">Notes</h3>
          <p className="mt-3 min-h-24 whitespace-pre-wrap text-sm text-zinc-700">{payloadValue(document, 'notes') || 'No additional notes.'}</p>
        </section>

        <div className="mt-10 border-t border-zinc-200 pt-4 text-sm">
          <span>Malnutrition doctor signature: __________________</span>
        </div>
      </section>
    )
  }

  if (isDeliveryRecord(document)) {
    return (
      <section className="print-area a4-report rounded-md border border-zinc-200 bg-white p-6 text-zinc-950">
        <header className="flex items-center gap-4 border-b border-zinc-200 pb-4">
          <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-16 w-16 rounded object-cover" />
          <div>
            <p className="text-sm font-medium text-sky-600">AFZENDA</p>
            <h2 className="text-xl font-semibold">Mother and Child Health Support Center</h2>
            <p className="text-sm text-zinc-600">Delivery record</p>
          </div>
        </header>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <p><strong>Delivery date:</strong> {payloadValue(document, 'delivery_datetime') ? new Date(payloadValue(document, 'delivery_datetime')).toLocaleString() : new Date(document.created_at).toLocaleString()}</p>
          <p><strong>Prepared by:</strong> {document.created_by_name || 'MCHC staff'}</p>
          <p><strong>Patient:</strong> {document.patient_name}</p>
          <p><strong>Delivery mode:</strong> {payloadValue(document, 'delivery_mode') === 'assisted_vaginal' ? 'Assisted vaginal' : payloadValue(document, 'delivery_mode') === 'c_section' ? 'C-section' : payloadValue(document, 'delivery_mode') === 'referred' ? 'Referred' : 'Normal vaginal'}</p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded border border-sky-100 p-4">
            <h3 className="text-base font-semibold">Mother and labour</h3>
            <div className="mt-3 grid gap-2 text-sm">
              <p><strong>Gestational age:</strong> {payloadValue(document, 'gestational_age_weeks') || 'Not recorded'}</p>
              <p><strong>Gravida:</strong> {payloadValue(document, 'gravida') || 'Not recorded'}</p>
              <p><strong>Parity:</strong> {payloadValue(document, 'parity') || 'Not recorded'}</p>
              <p><strong>Labour onset:</strong> {payloadValue(document, 'labor_onset') || 'Not recorded'}</p>
              <p><strong>Cervical dilation:</strong> {payloadValue(document, 'cervical_dilation_cm') || 'Not recorded'}</p>
              <p><strong>Fetal heart rate:</strong> {payloadValue(document, 'fetal_heart_rate') || 'Not recorded'}</p>
              <p><strong>Contraction pattern:</strong> {payloadValue(document, 'contraction_pattern') || 'Not recorded'}</p>
              <p><strong>Membranes:</strong> {payloadValue(document, 'membrane_status') || 'Not recorded'}</p>
              <p><strong>Liquor:</strong> {payloadValue(document, 'liquor_status') || 'Not recorded'}</p>
              <p><strong>Maternal BP:</strong> {payloadValue(document, 'maternal_blood_pressure') || 'Not recorded'}</p>
              <p><strong>Maternal pulse:</strong> {payloadValue(document, 'maternal_pulse') || 'Not recorded'}</p>
              <p><strong>Maternal temperature:</strong> {payloadValue(document, 'maternal_temperature') || 'Not recorded'}</p>
            </div>
          </section>

          <section className="rounded border border-sky-100 p-4">
            <h3 className="text-base font-semibold">Newborn and outcome</h3>
            <div className="mt-3 grid gap-2 text-sm">
              <p><strong>Baby outcome:</strong> {payloadValue(document, 'baby_status') === 'stillbirth' ? 'Stillbirth' : payloadValue(document, 'baby_status') === 'early_neonatal_death' ? 'Early neonatal death' : 'Live birth'}</p>
              <p><strong>Baby sex:</strong> {payloadValue(document, 'baby_sex') || 'Not recorded'}</p>
              <p><strong>Birth weight:</strong> {payloadValue(document, 'birth_weight_kg') || 'Not recorded'}</p>
              <p><strong>APGAR 1 minute:</strong> {payloadValue(document, 'apgar_1') || 'Not recorded'}</p>
              <p><strong>APGAR 5 minutes:</strong> {payloadValue(document, 'apgar_5') || 'Not recorded'}</p>
              <p><strong>Mother status:</strong> {payloadValue(document, 'mother_status') === 'referred' ? 'Referred' : payloadValue(document, 'mother_status') === 'critical' ? 'Critical' : 'Stable'}</p>
            </div>
          </section>
        </div>

        <section className="mt-6 rounded border border-sky-100 p-4">
          <h3 className="text-base font-semibold">Complications and interventions</h3>
          <div className="mt-3 space-y-3 text-sm">
            <div>
              <p className="font-medium">Complications</p>
              <p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'complications') || 'None recorded'}</p>
            </div>
            <div>
              <p className="font-medium">Interventions and referral</p>
              <p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'interventions') || 'None recorded'}</p>
            </div>
            <div>
              <p className="font-medium">Notes</p>
              <p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'notes') || 'No additional notes.'}</p>
            </div>
          </div>
        </section>

        <div className="mt-10 border-t border-zinc-200 pt-4 text-sm">
          <span>Midwife signature: __________________</span>
        </div>
      </section>
    )
  }

  if (isGynecologyUltrasound(document)) {
    const reportType = payloadValue(document, 'report_type') === 'pelvic' ? 'Pelvic gynecologic ultrasound' : 'Obstetric ultrasound'
    const patientStatus = payloadValue(document, 'patient_status') === 'follow_up' ? 'Follow-up' : 'New'

    return (
      <section className="print-area a4-report rounded-md border border-zinc-200 bg-white p-6 text-zinc-950">
        <header className="flex items-center gap-4 border-b border-zinc-200 pb-4">
          <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-16 w-16 rounded object-cover" />
          <div>
            <p className="text-sm font-medium text-sky-600">AFZENDA</p>
            <h2 className="text-xl font-semibold">Mother and Child Health Support Center</h2>
            <p className="text-sm text-zinc-600">Gynecology ultrasound report</p>
          </div>
        </header>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <p><strong>Report type:</strong> {reportType}</p>
          <p><strong>Date:</strong> {new Date(document.created_at).toLocaleString()}</p>
          <p><strong>Patient:</strong> {document.patient_name}</p>
          <p><strong>Prepared by:</strong> {document.created_by_name || 'MCHC staff'}</p>
          <p><strong>Patient status:</strong> {patientStatus}</p>
          <p><strong>Indication:</strong> {payloadValue(document, 'indication') || 'Not recorded'}</p>
          <p><strong>LMP:</strong> {payloadValue(document, 'lmp') || 'Not recorded'}</p>
          {payloadValue(document, 'estimated_due_date') ? <p><strong>Estimated due date:</strong> {payloadValue(document, 'estimated_due_date')}</p> : null}
        </div>

        {payloadValue(document, 'report_type') === 'pelvic' ? (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section className="rounded border border-sky-100 p-4">
              <h3 className="text-base font-semibold">Pelvic findings</h3>
              <div className="mt-3 space-y-3 text-sm">
                <div><p className="font-medium">Uterus</p><p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'uterus') || 'Not recorded'}</p></div>
                <div><p className="font-medium">Endometrium</p><p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'endometrium') || 'Not recorded'}</p></div>
                <div><p className="font-medium">Adnexa</p><p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'adnexa') || 'Not recorded'}</p></div>
              </div>
            </section>
            <section className="rounded border border-sky-100 p-4">
              <h3 className="text-base font-semibold">Ovaries and pelvis</h3>
              <div className="mt-3 space-y-3 text-sm">
                <div><p className="font-medium">Right ovary</p><p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'right_ovary') || 'Not recorded'}</p></div>
                <div><p className="font-medium">Left ovary</p><p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'left_ovary') || 'Not recorded'}</p></div>
                <div><p className="font-medium">Pouch of Douglas</p><p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'cul_de_sac') || 'Not recorded'}</p></div>
              </div>
            </section>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section className="rounded border border-sky-100 p-4">
              <h3 className="text-base font-semibold">Pregnancy summary</h3>
              <div className="mt-3 grid gap-2 text-sm">
                <p><strong>Gestational age:</strong> {payloadValue(document, 'gestational_age_weeks') || 'Not recorded'}</p>
                <p><strong>Fetal count:</strong> {payloadValue(document, 'fetal_count') || 'Not recorded'}</p>
                <p><strong>Fetal heartbeat:</strong> {payloadValue(document, 'fetal_heartbeat') === 'no' ? 'Absent' : 'Present'}</p>
                <p><strong>Fetal heart rate:</strong> {payloadValue(document, 'fetal_heart_rate') || 'Not recorded'}</p>
                <p><strong>Fetal movement:</strong> {payloadValue(document, 'fetal_movement') || 'Not recorded'}</p>
                <p><strong>Presentation:</strong> {payloadValue(document, 'fetal_presentation') || 'Not recorded'}</p>
              </div>
            </section>
            <section className="rounded border border-sky-100 p-4">
              <h3 className="text-base font-semibold">Placenta and fluid</h3>
              <div className="mt-3 grid gap-2 text-sm">
                <p><strong>Placenta position:</strong> {payloadValue(document, 'placenta_position') || 'Not recorded'}</p>
                <p><strong>Amniotic fluid:</strong> {payloadValue(document, 'amniotic_fluid') || 'Not recorded'}</p>
                <p><strong>Cervix:</strong> {payloadValue(document, 'cervix_status') || 'Not recorded'}</p>
                <div>
                  <p className="font-medium">Biometry or growth summary</p>
                  <p className="mt-1 whitespace-pre-wrap text-zinc-700">{payloadValue(document, 'biometry_summary') || 'Not recorded'}</p>
                </div>
              </div>
            </section>
          </div>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <section className="rounded border border-sky-100 p-4">
            <h3 className="text-base font-semibold">Impression</h3>
            <p className="mt-3 min-h-24 whitespace-pre-wrap text-sm text-zinc-700">{payloadValue(document, 'impression') || 'Not recorded'}</p>
          </section>
          <section className="rounded border border-sky-100 p-4">
            <h3 className="text-base font-semibold">Recommendation</h3>
            <p className="mt-3 min-h-24 whitespace-pre-wrap text-sm text-zinc-700">{payloadValue(document, 'recommendation') || 'Not recorded'}</p>
          </section>
        </div>

        <section className="mt-6 rounded border border-sky-100 p-4">
          <h3 className="text-base font-semibold">Notes</h3>
          <p className="mt-3 min-h-20 whitespace-pre-wrap text-sm text-zinc-700">{payloadValue(document, 'notes') || 'No additional notes.'}</p>
        </section>

        <div className="mt-10 border-t border-zinc-200 pt-4 text-sm">
          <span>Gynecologist signature: __________________</span>
        </div>
      </section>
    )
  }

  if (isMidwifeRecord(document)) {
    const highRisk = Boolean((document.payload as Record<string, unknown>).high_risk)

    return (
      <section className="print-area a4-report rounded-md border border-zinc-200 bg-white p-6 text-zinc-950">
        <header className="flex items-center gap-4 border-b border-zinc-200 pb-4">
          <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-16 w-16 rounded object-cover" />
          <div>
            <p className="text-sm font-medium text-sky-600">AFZENDA</p>
            <h2 className="text-xl font-semibold">Mother and Child Health Support Center</h2>
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
  const isBillDocument = document.document_type === 'lab_bill' || document.document_type === 'medicine_bill'

  if (isBillDocument) {
    return (
      <section className={billPaperClassName}>
        <BillTitle title="Mother and Child Health Support Center" subtitle={document.document_type_label} />

        <div className={billBoxClassName}>
          <div className="grid grid-cols-[7rem_1fr_7rem_1fr] border-b border-black">
            <div className={billHeaderCellClassName}>Document:</div>
            <div className={billCellClassName}>{document.document_type_label}</div>
            <div className={billHeaderCellClassName}>Date:</div>
            <div className={billCellClassName}>{new Date(document.created_at).toLocaleString()}</div>
          </div>
          <div className="grid grid-cols-[7rem_1fr_7rem_1fr] border-b border-black">
            <div className={billHeaderCellClassName}>Patient ID:</div>
            <div className={billCellClassName}>{document.patient}</div>
            <div className={billHeaderCellClassName}>Patient name:</div>
            <div className={billCellClassName}>{document.patient_name}</div>
          </div>
          <div className="grid grid-cols-[7rem_1fr_7rem_1fr] border-b border-black">
            <div className={billHeaderCellClassName}>Prepared by:</div>
            <div className={billCellClassName}>{document.created_by_name || 'MCHC staff'}</div>
            <div className={billHeaderCellClassName}>Title:</div>
            <div className={billCellClassName}>{document.title}</div>
          </div>
        </div>

        {lines.length ? (
          <table className="mt-3 w-full border-collapse border border-black text-left text-[11px]">
            <thead>
              <tr className="bg-zinc-200">
                <th className="border border-black px-2 py-1 font-bold">Item</th>
                <th className="border border-black px-2 py-1 font-bold">Details</th>
                <th className="border border-black px-2 py-1 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((item, index) => {
                const row = item as Record<string, unknown>
                return (
                  <tr key={index}>
                    <td className="border border-black px-2 py-1 font-medium">{String(row.name ?? row.test_name ?? row.test ?? row.medicine_name ?? row.medicine ?? row.vaccine ?? 'Item')}</td>
                    <td className="border border-black px-2 py-1">{documentRowDetails(row)}</td>
                    <td className="border border-black px-2 py-1 text-right">{String(row.cost ?? row.amount ?? '')}</td>
                  </tr>
                )
              })}
              <tr className="bg-zinc-100 font-bold">
                <td className="border border-black px-2 py-1" colSpan={2}>Total cost</td>
                <td className="border border-black px-2 py-1 text-right">{document.total_amount}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <pre className="mt-3 whitespace-pre-wrap border border-black bg-zinc-50 p-3 text-[11px]">
            {JSON.stringify(document.payload, null, 2)}
          </pre>
        )}

        <BillReceiptNote receivedFrom={document.created_by_name || 'MCHC staff'} amount={document.total_amount} />
        <BillSignature />
      </section>
    )
  }

  return (
    <section className={`print-area rounded-md border border-zinc-200 bg-white p-6 text-zinc-950 ${halfA4 ? 'half-a4-bill' : ''}`}>
      <header className="flex items-center gap-4 border-b border-zinc-200 pb-4">
        {showLogo ? <img src="/media/website/logo/mchc-logo.jpeg" alt="MCHC logo" className="h-14 w-14 rounded object-cover" /> : null}
        <div>
          <p className="text-sm font-medium text-sky-600">AFZENDA</p>
          <h2 className="text-xl font-semibold">Mother and Child Health Support Center</h2>
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
    <section className={billPaperClassName}>
      <BillTitle title="Mother and Child Health Support Center" subtitle="Reception bill" />

      <div className={billBoxClassName}>
        <div className="grid grid-cols-[8rem_1fr_7rem_1fr] border-b border-black">
          <div className={billHeaderCellClassName}>Date and time:</div>
          <div className={billCellClassName}>{createdAt}</div>
          <div className={billHeaderCellClassName}>Bill status:</div>
          <div className={billCellClassName}>{payment.status}</div>
        </div>
        <div className="grid grid-cols-[8rem_1fr_7rem_1fr] border-b border-black">
          <div className={billHeaderCellClassName}>Patient ID:</div>
          <div className={billCellClassName}>{payment.patient}</div>
          <div className={billHeaderCellClassName}>Patient name:</div>
          <div className={billCellClassName}>{patientName}</div>
        </div>
        <div className="grid grid-cols-[8rem_1fr_7rem_1fr] border-b border-black">
          <div className={billHeaderCellClassName}>Age:</div>
          <div className={billCellClassName}>{formatPaymentAge(payment.patient_age, payment.patient_age_unit)}</div>
          <div className={billHeaderCellClassName}>Department:</div>
          <div className={billCellClassName}>{payment.department || payment.service}</div>
        </div>
        <div className="grid grid-cols-[8rem_1fr_7rem_1fr]">
          <div className={billHeaderCellClassName}>Payment type:</div>
          <div className={billCellClassName}>{isFree ? 'Free' : isDiscount ? 'Discount percentage' : 'Full payment'}</div>
          <div className={billHeaderCellClassName}>Account:</div>
          <div className={billCellClassName}>{printedBy}</div>
        </div>
      </div>

      <table className="mt-3 w-full border-collapse border border-black text-left text-[11px]">
        <thead>
          <tr className="bg-zinc-200">
            <th className="border border-black px-2 py-1 font-bold">Service</th>
            <th className="border border-black px-2 py-1 font-bold">Payment type</th>
            <th className="border border-black px-2 py-1 text-right font-bold">Amount</th>
            <th className="border border-black px-2 py-1 text-right font-bold">Discount</th>
            <th className="border border-black px-2 py-1 text-right font-bold">Net amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1">{payment.service || payment.department || 'Reception bill'}</td>
            <td className="border border-black px-2 py-1">{isFree ? 'Free' : isDiscount ? 'Discount percentage' : 'Full payment'}</td>
            <td className="border border-black px-2 py-1 text-right">{payment.doctor_fee}</td>
            <td className="border border-black px-2 py-1 text-right">{isDiscount ? `${payment.discount_percentage}% (${payment.discount_amount})` : isFree ? payment.doctor_fee : '0'}</td>
            <td className="border border-black px-2 py-1 text-right font-bold">{isFree ? 'Free' : payment.amount}</td>
          </tr>
          <tr className="bg-zinc-100 font-bold">
            <td className="border border-black px-2 py-1" colSpan={2}>Final amount</td>
            <td className="border border-black px-2 py-1 text-right">{payment.doctor_fee}</td>
            <td className="border border-black px-2 py-1 text-right">{isDiscount || isFree ? payment.discount_amount : '0'}</td>
            <td className="border border-black px-2 py-1 text-right">{isFree ? 'Free' : payment.amount}</td>
          </tr>
        </tbody>
      </table>

      {payment.notes ? <p className="mt-3 text-sm"><strong>Notes:</strong> {payment.notes}</p> : null}

      <BillReceiptNote receivedFrom={printedBy} amount={isFree ? '0' : payment.amount} />
      <BillSignature />
    </section>
  )
}
