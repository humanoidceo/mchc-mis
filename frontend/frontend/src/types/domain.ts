export type RoleCode =
  | 'super_admin'
  | 'website_content_editor'
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
  age: number | null
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
  patient_full_name: string
  service: string
  department: string
  doctor_name: string
  patient_age: number | null
  doctor_fee: string
  payment_type: 'full' | 'free' | 'discount'
  discount_percentage: string
  discount_amount: string
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

export type SearchResponse<T> = {
  results: T[]
  next_offset: number | null
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

export type LabTest = {
  id: number
  name: string
  normal_range_from: string
  normal_range_to: string
  unit: string
  is_active: boolean
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
  period: 'daily' | 'weekly' | 'monthly' | 'annual'
  period_label: string
  patients: number
  full_paid: number
  free: number
  discounted: number
  pending_payments: number
  approved_payments: number
  total_payments: number
  pending_amount: string
  approved_amount: string
  total_amount: string
  departments: Array<{
    department: string
    patients: number
    payments: number
    amount: string
  }>
  documents: number
  low_stock_medicines: number
}

export type WebsitePageKey = 'home' | 'about' | 'mission' | 'vision' | 'services' | 'contact'

export type WebsitePageContent = {
  id: number
  page: WebsitePageKey
  page_label: string
  language: 'en' | 'fa' | 'ps'
  language_label: string
  content: Record<string, unknown>
  image_url: string
  image_file: string
  updated_at: string
  updated_by_name: string
}

export type WebsiteSettings = {
  id: number
  logo_url: string
  logo_file: string
  updated_at: string
  updated_by_name: string
}
