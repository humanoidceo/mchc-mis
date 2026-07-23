export type RoleCode =
  | 'super_admin'
  | 'website_content_editor'
  | 'receptionist'
  | 'doctor'
  | 'gynecologist'
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
  trash_retention_days: number
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

export type Employee = {
  id: number
  first_name: string
  last_name: string
  position: string
  salary: string
  join_date: string
  national_id_card_number: string
  email: string
  contact_info: string
  mobile_number: string
  image: string
  image_url: string
  created_by_name: string
  created_at: string
  updated_at: string
}

export type EmployeeSearchOption = {
  id: number
  first_name: string
  last_name: string
  position: string
  salary: string
}

export type Patient = {
  id: number
  registration_number: string
  first_name: string
  last_name: string
  age: number | null
  age_unit: 'month' | 'year'
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
  patient_age_unit: 'month' | 'year'
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
  | 'family_planning'
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

export type PrivateDocument = {
  id: number
  title: string
  category: string
  file: string
  file_url: string
  file_name: string
  file_extension: string
  file_size_bytes: number
  max_size_mb: string
  uploaded_by: number
  uploaded_by_name: string
  created_at: string
  updated_at: string
}

export type TrashItem = {
  model: string
  model_label: string
  id: number
  title: string
  deleted_at: string
}

export type LaboratoryPatientSearchOption = {
  id: number
  registration_number: string
  first_name: string
  last_name: string
  age: number | null
  phone: string
}

export type LaboratoryOrderItem = {
  test: number | null
  test_name: string
  instructions: string
  matched: boolean
}

export type LaboratoryOrder = {
  id: number
  title: string
  created_at: string
  patient: number
  patient_name: string
  items: LaboratoryOrderItem[]
}

export type LaboratoryBill = {
  id: number
  patient: number
  patient_name: string
  title: string
  payload: Record<string, unknown>
  total_amount: string
  created_at: string
  payment_id: number | null
  payment_status: 'pending' | 'approved' | null
  customer_type: 'internal' | 'external'
  customer_type_label: string
  lab_order_document_id: number | null
  item_count: number
  has_results: boolean
}

export type LaboratoryDashboardStats = {
  period: 'daily' | 'weekly' | 'monthly' | 'annual'
  period_label: string
  pending_lab_orders: number
  bills_created: number
  internal_patients: number
  internal_amount: string
  external_patients: number
  external_amount: string
  full_paid: number
  full_paid_amount: string
  discounted: number
  discounted_amount: string
  free: number
  free_amount: string
  pending_reception_payments: number
  pending_reception_amount: string
  approved_reception_payments: number
  approved_reception_amount: string
  monthly_amount: string
  patient_trend: Array<{
    label: string
    value: number
  }>
  recent_bills_count: number
  recent_bills: LaboratoryBill[]
}

export type MidwifeDashboardStats = {
  period: 'daily' | 'weekly' | 'monthly' | 'annual'
  period_label: string
  patients: number
  anc_visits: number
  pnc_visits: number
  deliveries: number
  high_risk: number
  due_followups: number
  total_records: number
  patient_trend: Array<{
    label: string
    value: number
  }>
  recent_records_count: number
  recent_records: ClinicalDocument[]
}

export type MalnutritionDashboardStats = {
  period: 'daily' | 'weekly' | 'monthly' | 'annual'
  period_label: string
  patients: number
  severe_cases: number
  moderate_cases: number
  edema_cases: number
  appetite_failures: number
  pending_pharmacy: number
  approved_pharmacy: number
  total_records: number
  patient_trend: Array<{
    label: string
    value: number
  }>
  recent_records_count: number
  recent_records: ClinicalDocument[]
}

export type SearchResponse<T> = {
  results: T[]
  next_offset: number | null
}

export type PaginatedResponse<T> = {
  count: number
  next: string | null
  previous: string | null
  results: T[]
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
  display_name: string
  category: string
  is_panel: boolean
  parent_panel: number | null
  sort_order: number
  normal_range_from: string
  normal_range_to: string
  unit: string
  is_active: boolean
  component_count: number
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

export type Expense = {
  id: number
  name: string
  category: string
  amount: string
  description: string
  salary_payment: number | null
  salary_advance: number | null
  created_by: number
  created_by_name: string
  created_at: string
  updated_at: string
}

export type ExpenseCategoryOption = {
  id: number
  name: string
}

export type DashboardStats = {
  period: 'daily' | 'weekly' | 'monthly' | 'annual' | 'custom'
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
  patient_trend: Array<{
    label: string
    value: number
  }>
  departments: Array<{
    department: string
    patients: number
    payments: number
    amount: string
  }>
  documents: number
  low_stock_medicines: number
  expenses_count: number
  expenses_amount: string
}

export type SalaryPayment = {
  id: number
  employee: number
  employee_name: string
  employee_position: string
  afghan_year: number
  months: string[]
  month_count: number
  absence_days: number
  advance_payment: string
  advance_balance_carried: string
  monthly_salary: string
  gross_salary: string
  absence_deduction: string
  taxable_salary: string
  tax_amount: string
  net_salary: string
  payable_amount: string
  notes: string
  created_by: number
  created_by_name: string
  linked_expense_id: number | null
  created_at: string
  updated_at: string
}

export type SalaryAdvance = {
  id: number
  employee: number
  employee_name: string
  employee_position: string
  afghan_year: number
  afghan_month: string
  amount: string
  settled_amount: string
  outstanding_amount: string
  notes: string
  created_by: number
  created_by_name: string
  linked_expense_id: number | null
  created_at: string
  updated_at: string
}

export type PharmacyRutfOrder = {
  id: number
  patient: number
  patient_name: string
  created_by_name: string
  title: string
  created_at: string
  payload: Record<string, unknown>
  rutf_quantity: number
  pharmacy_status: string
  approved_by_name: string
}

export type FamilyPlanningOrderItem = {
  medicine: number
  medicine_name: string
  quantity: number
}

export type PharmacyFamilyPlanningOrder = {
  id: number
  patient: number
  patient_name: string
  created_by_name: string
  title: string
  created_at: string
  payload: Record<string, unknown>
  items: FamilyPlanningOrderItem[]
  item_count: number
  pharmacy_status: string
  dispensed_by_name: string
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

export type PharmacySetting = {
  id: number
  pharmacy_name: string
  phone: string
  address: string
  default_profit_percentage: string
}

export type PharmacyMedicine = {
  id: number
  name: string
  generic_name: string
  dosage_form: string
  strength: string
  country_of_product: string
  production_date: string | null
  expiry_date: string | null
  quantity: number
  buy_price: string
  profit_percentage: string
  sell_price: string
  stock_status: 'low' | 'medium' | 'healthy'
  created_at: string
  updated_at: string
}

export type PharmacySaleItem = {
  id: number
  medicine: number | null
  medicine_name: string
  generic_name: string
  quantity: number
  unit_price: string
  total_price: string
}

export type PharmacySale = {
  id: number
  bill_no: string
  customer_type: 'internal' | 'external'
  customer_type_label: string
  patient: number | null
  patient_name: string
  customer_name: string
  created_at: string
  items: PharmacySaleItem[]
  item_count: number
  total_amount: string
  payment_id: number | null
  payment_status: 'pending' | 'approved' | null
  prescription_document_id: number | null
}

export type PharmacyDashboardStats = {
  period: 'daily' | 'weekly' | 'monthly' | 'annual' | 'custom'
  period_label: string
  medicines_count: number
  medicines_registered_count: number
  low_stock_count: number
  sales_count: number
  internal_patients: number
  internal_amount: string
  external_patients: number
  external_amount: string
  full_paid: number
  full_paid_amount: string
  discounted: number
  discounted_amount: string
  free: number
  free_amount: string
  pending_reception_payments: number
  pending_reception_amount: string
  approved_reception_payments: number
  approved_reception_amount: string
  stock_units: string
  inventory_value: string
  total_billed: string
  sold_medicines_total: string
  sold_medicines_profit: string
  sold_medicines_price: string
  family_planning_items_dispensed: number
  patient_trend: Array<{
    label: string
    value: number
  }>
  recent_sales_count: number
  recent_sales: PharmacySale[]
  low_stock_items: PharmacyMedicine[]
}

export type PharmacyPatientSearchOption = {
  id: number
  registration_number: string
  first_name: string
  last_name: string
  age: number | null
  phone: string
}

export type PharmacyPrescriptionItem = {
  medicine: number | null
  medicine_name: string
  quantity: string
  instructions: string
  pharmacy_medicine: number | null
  pharmacy_medicine_name: string
  pharmacy_stock: number
  pharmacy_sell_price: string
  matched: boolean
}

export type PharmacyPrescription = {
  id: number
  title: string
  created_at: string
  patient: number
  patient_name: string
  items: PharmacyPrescriptionItem[]
}

export type WebsiteSettings = {
  id: number
  logo_url: string
  logo_file: string
  updated_at: string
  updated_by_name: string
}
