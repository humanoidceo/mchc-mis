export type RoleCode =
  | 'super_admin'
  | 'receptionist'
  | 'doctor'
  | 'laboratory'
  | 'pharmacist'
  | 'midwife'
  | 'vaccinator'
  | 'malnutrition'

export type PermissionDefinition = {
  code: string
  label: string
  group: string
  default_roles: string[]
}

export type RoleDefinition = {
  code: RoleCode
  label: string
}

export type UserProfile = {
  role: RoleCode
  role_label: string
  phone: string
  allowed_permissions: string[]
}

export type User = {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  is_active: boolean
  is_superuser: boolean
  profile: UserProfile | null
  permissions: string[]
}

export type Patient = {
  id: number
  registration_number: string
  first_name: string
  last_name: string
  gender: 'female' | 'male' | 'other'
  date_of_birth: string | null
  phone: string
  address: string
  guardian_name: string
  created_at: string
}

export type Payment = {
  id: number
  patient: number
  patient_name: string
  service: string
  amount: string
  status: 'pending' | 'approved'
  notes: string
  created_at: string
}

export type DocumentType =
  | 'prescription'
  | 'lab_order'
  | 'lab_bill'
  | 'medicine_bill'
  | 'ultrasound'
  | 'vaccination'
  | 'rutf'

export type DocumentTypeDefinition = {
  code: DocumentType
  label: string
  permission: string
}

export type ClinicalDocument = {
  id: number
  patient: number
  patient_name: string
  document_type: DocumentType
  document_type_label: string
  title: string
  payload: Record<string, unknown>
  total_amount: string
  created_at: string
  created_by_name: string
}

export type Medicine = {
  id: number
  name: string
  unit: string
  sale_price: string
  current_stock: number
  low_stock_threshold: number
  is_active: boolean
  is_low_stock: boolean
}

export type StockMovement = {
  id: number
  medicine: number
  medicine_name: string
  movement_type: 'in' | 'out' | 'adjustment'
  quantity: number
  note: string
  created_at: string
}

export type DashboardStats = {
  patients: number
  pending_payments: number
  approved_payments: number
  documents: number
  low_stock_medicines: number
}
