import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { apiFetch } from '../../api/client'
import { buttonClassName, Field, ghostButtonClassName, inputClassName, Panel, SectionHeader } from '../../components/ui'
import type { ClinicalDocument, DashboardStats, DocumentType, DocumentTypeDefinition, Medicine, Patient, Payment } from '../../types/domain'
import { PrintDocument } from './PrintDocument'

type View = 'dashboard' | 'patients' | 'payments' | 'documents' | 'stock'

const emptyStats: DashboardStats = {
  patients: 0,
  pending_payments: 0,
  approved_payments: 0,
  documents: 0,
  low_stock_medicines: 0,
}

const documentTemplates: Record<DocumentType, Record<string, unknown>> = {
  prescription: { items: [{ medicine: 'Paracetamol', instructions: '1 tablet twice daily for 3 days' }] },
  lab_order: { items: [{ test: 'CBC', instructions: 'Routine blood test' }] },
  lab_bill: { items: [{ test: 'CBC', cost: 300 }], notes: 'Laboratory bill' },
  medicine_bill: { items: [{ medicine: 'ORS', quantity: 2, cost: 100 }] },
  ultrasound: { items: [{ name: 'Ultrasound', result: 'Normal', cost: 800 }] },
  vaccination: { items: [{ vaccine: 'BCG', result: 'Done' }] },
  rutf: { items: [{ name: 'RUTF sachets', quantity: 14, notes: 'One week supply' }] },
}

export function ClinicWorkspace({ view }: { view: View }) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [documents, setDocuments] = useState<ClinicalDocument[]>([])
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [documentTypes, setDocumentTypes] = useState<DocumentTypeDefinition[]>([])
  const [stats, setStats] = useState<DashboardStats>(emptyStats)
  const [selectedDocument, setSelectedDocument] = useState<ClinicalDocument | null>(null)
  const [error, setError] = useState('')

  async function loadData() {
    setError('')
    try {
      const [patientData, paymentData, documentData, medicineData, documentTypeData, dashboardData] = await Promise.allSettled([
        apiFetch<Patient[]>('/patients/'),
        apiFetch<Payment[]>('/payments/'),
        apiFetch<ClinicalDocument[]>('/documents/'),
        apiFetch<Medicine[]>('/medicines/'),
        apiFetch<DocumentTypeDefinition[]>('/documents/types/'),
        apiFetch<DashboardStats>('/dashboard/'),
      ])

      if (patientData.status === 'fulfilled') setPatients(patientData.value)
      if (paymentData.status === 'fulfilled') setPayments(paymentData.value)
      if (documentData.status === 'fulfilled') setDocuments(documentData.value)
      if (medicineData.status === 'fulfilled') setMedicines(medicineData.value)
      if (documentTypeData.status === 'fulfilled') setDocumentTypes(documentTypeData.value)
      if (dashboardData.status === 'fulfilled') setStats(dashboardData.value)
    } catch {
      setError('Unable to load clinic data.')
    }
  }

  useEffect(() => {
    void loadData()
  }, [view])

  const content = useMemo(() => {
    if (view === 'dashboard') return <Dashboard stats={stats} />
    if (view === 'patients') return <Patients patients={patients} onSaved={loadData} />
    if (view === 'payments') return <Payments payments={payments} patients={patients} onSaved={loadData} />
    if (view === 'stock') return <MedicineStock medicines={medicines} onSaved={loadData} />
    return (
      <Documents
        patients={patients}
        documents={documents}
        documentTypes={documentTypes}
        onCreated={(document) => {
          setSelectedDocument(document)
          void loadData()
        }}
        onPrint={setSelectedDocument}
      />
    )
  }, [documentTypes, documents, medicines, patients, payments, stats, view])

  return (
    <div className="space-y-5">
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {content}
      {selectedDocument ? (
        <div className="space-y-3">
          <div className="no-print flex gap-2">
            <button className={buttonClassName} onClick={() => window.print()}>Print selected document</button>
            <button className={ghostButtonClassName} onClick={() => setSelectedDocument(null)}>Close preview</button>
          </div>
          <PrintDocument document={selectedDocument} />
        </div>
      ) : null}
    </div>
  )
}

function Dashboard({ stats }: { stats: DashboardStats }) {
  const cards = [
    ['Patients', stats.patients],
    ['Pending payments', stats.pending_payments],
    ['Approved payments', stats.approved_payments],
    ['Documents', stats.documents],
    ['Low stock medicines', stats.low_stock_medicines],
  ]

  return (
    <>
      <SectionHeader title="Dashboard" subtitle="Operational snapshot for MCHC services." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <Panel key={label}>
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-zinc-950">{value}</p>
          </Panel>
        ))}
      </div>
    </>
  )
}

function Patients({ patients, onSaved }: { patients: Patient[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ registration_number: '', first_name: '', last_name: '', gender: 'female', date_of_birth: '', phone: '', address: '', guardian_name: '' })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await apiFetch<Patient>('/patients/', { method: 'POST', body: JSON.stringify({ ...form, date_of_birth: form.date_of_birth || null }) })
    setForm({ registration_number: '', first_name: '', last_name: '', gender: 'female', date_of_birth: '', phone: '', address: '', guardian_name: '' })
    await onSaved()
  }

  return (
    <>
      <SectionHeader title="Patients" subtitle="Register and review patient records." />
      <Panel>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
          <Field label="Registration no."><input className={inputClassName} value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} required /></Field>
          <Field label="First name"><input className={inputClassName} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} required /></Field>
          <Field label="Last name"><input className={inputClassName} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></Field>
          <Field label="Gender"><select className={inputClassName} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></Field>
          <Field label="Date of birth"><input className={inputClassName} type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} /></Field>
          <Field label="Phone"><input className={inputClassName} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Guardian"><input className={inputClassName} value={form.guardian_name} onChange={(e) => setForm({ ...form, guardian_name: e.target.value })} /></Field>
          <Field label="Address"><input className={inputClassName} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
          <div className="md:col-span-4"><button className={buttonClassName}>Register patient</button></div>
        </form>
      </Panel>
      <DataTable headers={['Reg no.', 'Name', 'Gender', 'Phone']} rows={patients.map((patient) => [patient.registration_number, `${patient.first_name} ${patient.last_name}`, patient.gender, patient.phone])} />
    </>
  )
}

function Payments({ payments, patients, onSaved }: { payments: Payment[]; patients: Patient[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ patient: '', service: '', amount: '', notes: '' })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await apiFetch<Payment>('/payments/', { method: 'POST', body: JSON.stringify({ ...form, patient: Number(form.patient) }) })
    setForm({ patient: '', service: '', amount: '', notes: '' })
    await onSaved()
  }

  async function approve(paymentId: number) {
    await apiFetch<Payment>(`/payments/${paymentId}/approve/`, { method: 'POST' })
    await onSaved()
  }

  return (
    <>
      <SectionHeader title="Payments" subtitle="Create service payments and approve pending payments." />
      <Panel>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
          <Field label="Patient"><PatientSelect patients={patients} value={form.patient} onChange={(patient) => setForm({ ...form, patient })} /></Field>
          <Field label="Service"><input className={inputClassName} value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} required /></Field>
          <Field label="Amount"><input className={inputClassName} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></Field>
          <Field label="Notes"><input className={inputClassName} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="md:col-span-4"><button className={buttonClassName}>Create payment</button></div>
        </form>
      </Panel>
      <Panel>
        <div className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-zinc-200"><th className="py-2">Patient</th><th>Service</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-zinc-100"><td className="py-2">{payment.patient_name}</td><td>{payment.service}</td><td>{payment.amount}</td><td>{payment.status}</td><td>{payment.status === 'pending' ? <button className={ghostButtonClassName} onClick={() => void approve(payment.id)}>Approve</button> : null}</td></tr>)}</tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}

function Documents({ patients, documents, documentTypes, onCreated, onPrint }: { patients: Patient[]; documents: ClinicalDocument[]; documentTypes: DocumentTypeDefinition[]; onCreated: (document: ClinicalDocument) => void; onPrint: (document: ClinicalDocument) => void }) {
  const firstType = documentTypes[0]?.code ?? 'prescription'
  const [form, setForm] = useState({ patient: '', document_type: firstType, title: '', total_amount: '0', payload: JSON.stringify(documentTemplates[firstType], null, 2) })

  useEffect(() => {
    if (documentTypes.length && !documentTypes.some((type) => type.code === form.document_type)) {
      const nextType = documentTypes[0].code
      setForm((current) => ({ ...current, document_type: nextType, payload: JSON.stringify(documentTemplates[nextType], null, 2) }))
    }
  }, [documentTypes, form.document_type])

  function changeDocumentType(documentType: DocumentType) {
    setForm({ ...form, document_type: documentType, payload: JSON.stringify(documentTemplates[documentType], null, 2) })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const document = await apiFetch<ClinicalDocument>('/documents/', {
      method: 'POST',
      body: JSON.stringify({
        patient: Number(form.patient),
        document_type: form.document_type,
        title: form.title || documentTypes.find((type) => type.code === form.document_type)?.label,
        total_amount: form.total_amount,
        payload: JSON.parse(form.payload),
      }),
    })
    onCreated(document)
  }

  return (
    <>
      <SectionHeader title="Clinical documents" subtitle="Create prescriptions, lab orders, bills, ultrasound, vaccination, and RUTF papers." />
      <Panel>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Patient"><PatientSelect patients={patients} value={form.patient} onChange={(patient) => setForm({ ...form, patient })} /></Field>
            <Field label="Document type"><select className={inputClassName} value={form.document_type} onChange={(e) => changeDocumentType(e.target.value as DocumentType)}>{documentTypes.map((type) => <option key={type.code} value={type.code}>{type.label}</option>)}</select></Field>
            <Field label="Title"><input className={inputClassName} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Total cost"><input className={inputClassName} value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} /></Field>
          </div>
          <Field label="Payload JSON"><textarea className={`${inputClassName} min-h-44 font-mono`} value={form.payload} onChange={(e) => setForm({ ...form, payload: e.target.value })} /></Field>
          <button className={buttonClassName}>Create printable document</button>
        </form>
      </Panel>
      <Panel>
        <div className="grid gap-2">
          {documents.map((document) => (
            <button key={document.id} className="rounded border border-zinc-200 px-3 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => onPrint(document)}>
              <span className="font-medium">{document.document_type_label}</span> for {document.patient_name} - {document.title}
            </button>
          ))}
        </div>
      </Panel>
    </>
  )
}

function MedicineStock({ medicines, onSaved }: { medicines: Medicine[]; onSaved: () => Promise<void> }) {
  const [medicine, setMedicine] = useState({ name: '', unit: 'tablet', sale_price: '0', low_stock_threshold: '10' })
  const [movement, setMovement] = useState({ medicine: '', movement_type: 'in', quantity: '0', note: '' })

  async function addMedicine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await apiFetch<Medicine>('/medicines/', { method: 'POST', body: JSON.stringify(medicine) })
    setMedicine({ name: '', unit: 'tablet', sale_price: '0', low_stock_threshold: '10' })
    await onSaved()
  }

  async function addMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await apiFetch('/stock-movements/', { method: 'POST', body: JSON.stringify({ ...movement, medicine: Number(movement.medicine), quantity: Number(movement.quantity) }) })
    setMovement({ medicine: '', movement_type: 'in', quantity: '0', note: '' })
    await onSaved()
  }

  return (
    <>
      <SectionHeader title="Medicine stock" subtitle="Manage pharmacy items and stock movements." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <form onSubmit={addMedicine} className="grid gap-3 md:grid-cols-2">
            <Field label="Name"><input className={inputClassName} value={medicine.name} onChange={(e) => setMedicine({ ...medicine, name: e.target.value })} required /></Field>
            <Field label="Unit"><input className={inputClassName} value={medicine.unit} onChange={(e) => setMedicine({ ...medicine, unit: e.target.value })} /></Field>
            <Field label="Sale price"><input className={inputClassName} value={medicine.sale_price} onChange={(e) => setMedicine({ ...medicine, sale_price: e.target.value })} /></Field>
            <Field label="Low stock threshold"><input className={inputClassName} value={medicine.low_stock_threshold} onChange={(e) => setMedicine({ ...medicine, low_stock_threshold: e.target.value })} /></Field>
            <button className={buttonClassName}>Add medicine</button>
          </form>
        </Panel>
        <Panel>
          <form onSubmit={addMovement} className="grid gap-3 md:grid-cols-2">
            <Field label="Medicine"><select className={inputClassName} value={movement.medicine} onChange={(e) => setMovement({ ...movement, medicine: e.target.value })} required><option value="">Select</option>{medicines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
            <Field label="Movement"><select className={inputClassName} value={movement.movement_type} onChange={(e) => setMovement({ ...movement, movement_type: e.target.value })}><option value="in">Stock in</option><option value="out">Stock out</option><option value="adjustment">Adjustment</option></select></Field>
            <Field label="Quantity"><input className={inputClassName} value={movement.quantity} onChange={(e) => setMovement({ ...movement, quantity: e.target.value })} /></Field>
            <Field label="Note"><input className={inputClassName} value={movement.note} onChange={(e) => setMovement({ ...movement, note: e.target.value })} /></Field>
            <button className={buttonClassName}>Record movement</button>
          </form>
        </Panel>
      </div>
      <DataTable headers={['Medicine', 'Unit', 'Price', 'Stock']} rows={medicines.map((item) => [item.name, item.unit, item.sale_price, `${item.current_stock}${item.is_low_stock ? ' low' : ''}`])} />
    </>
  )
}

function PatientSelect({ patients, value, onChange }: { patients: Patient[]; value: string; onChange: (value: string) => void }) {
  return (
    <select className={inputClassName} value={value} onChange={(event) => onChange(event.target.value)} required>
      <option value="">Select patient</option>
      {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.registration_number} - {patient.first_name} {patient.last_name}</option>)}
    </select>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <Panel>
      <div className="overflow-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200">{headers.map((header) => <th key={header} className="py-2 font-semibold">{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-zinc-100">{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`} className="py-2">{cell}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
