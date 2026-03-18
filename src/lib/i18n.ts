// ============================================
// i18n - Three Language Support
// English / Persian-Dari (fa) / Pashto (ps)
// ============================================

export type Lang = 'en' | 'fa' | 'ps';

export const LANGUAGES: { code: Lang; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fa', label: 'دری',    dir: 'rtl' },
  { code: 'ps', label: 'پښتو',  dir: 'rtl' },
];

type TranslationKeys =
  // ── App & Auth ────────────────────────────────────────────
  | 'app_name' | 'login' | 'logout' | 'username' | 'password' | 'sign_in'
  | 'welcome' | 'back_to_login' | 'register_company' | 'create_company'
  // ── Navigation ────────────────────────────────────────────
  | 'dashboard' | 'inventory' | 'allocations' | 'sales' | 'payments'
  | 'reports' | 'expenses' | 'notifications' | 'settings' | 'management'
  | 'branches' | 'sellers' | 'packages' | 'users'
  // ── Common actions ────────────────────────────────────────
  | 'save' | 'cancel' | 'edit' | 'delete' | 'confirm_delete' | 'view_details'
  | 'expand' | 'collapse' | 'filter_by' | 'search' | 'actions' | 'confirm'
  | 'add' | 'close' | 'submit' | 'reset' | 'export_pdf' | 'export_csv'
  | 'filter' | 'clear_filter'
  // ── Status & labels ───────────────────────────────────────
  | 'active' | 'inactive' | 'status' | 'name' | 'full_name' | 'role'
  | 'owner' | 'seller_role' | 'language' | 'notes' | 'date' | 'company'
  | 'slug' | 'no_data' | 'loading' | 'error' | 'success'
  | 'optional' | 'all' | 'yes' | 'no'
  // ── Finance ───────────────────────────────────────────────
  | 'total_gb' | 'total_gross' | 'total_commission' | 'net_profit' | 'net_amount'
  | 'total_allocated' | 'total_sold' | 'available_gb' | 'commission_earned'
  | 'balance' | 'gross_amount' | 'commission_amount' | 'commission_rate'
  | 'price_per_gb' | 'size_gb' | 'quantity' | 'package'
  | 'amount' | 'total_received' | 'received_from_sellers'
  | 'gross_revenue' | 'purchase_cost' | 'net_profit_formula'
  | 'available_capital' | 'total_expenses' | 'all_expenses'
  | 'allocation_value' | 'paid_to_owner' | 'debt_label' | 'credit_label'
  | 'settled_label' | 'transactions' | 'batches'
  // ── Date filters ──────────────────────────────────────────
  | 'date_range' | 'today' | 'this_week' | 'this_month' | 'this_year'
  | 'all_time' | 'from_date' | 'to_date'
  | 'period_today' | 'period_week' | 'period_month' | 'period_year' | 'period_all'
  // ── Reports ───────────────────────────────────────────────
  | 'generate_report' | 'report_type' | 'by_branch' | 'by_seller' | 'by_date'
  | 'summary' | 'details' | 'overview' | 'drilldown'
  | 'package_breakdown' | 'show_details' | 'hide_details'
  | 'transaction_history' | 'total_packages'
  // ── Entity add labels ─────────────────────────────────────
  | 'add_inventory' | 'add_allocation' | 'add_sale' | 'add_payment' | 'add_payment_seller'
  | 'add_branch' | 'add_package' | 'add_seller' | 'add_user'
  // ── Payment types ─────────────────────────────────────────
  | 'payment_type' | 'commission_pay' | 'advance' | 'settlement' | 'other'
  // ── Branch & seller ───────────────────────────────────────
  | 'branch' | 'seller'
  // ── Dashboard owner labels ────────────────────────────────
  | 'profit_formula' | 'total_inventory_gb' | 'allocated_gb'
  | 'sold_gb' | 'gross_income' | 'commissions' | 'deducted_from_profit'
  | 'net_profit_card' | 'after_comm_purchase' | 'available_capital_card'
  | 'net_profit_minus_expenses' | 'recent_expenses' | 'view_all'
  | 'total' | 'seller_performance' | 'manage' | 'monthly_trend'
  | 'months_6' | 'days_7' | 'gross' | 'net' | 'remaining'
  // ── Dashboard seller labels ───────────────────────────────
  | 'financial_summary' | 'payment_history' | 'commission_earned_lbl'
  | 'total_paid_to_owner' | 'debt_balance' | 'payments_by_type'
  | 'debt_to_owner' | 'owner_owes_you' | 'settled'
  | 'sales_count' | 'payments_count'
  | 'seller_dashboard' | 'register_first_sale'
  | 'no_sales_yet' | 'no_allocations_yet' | 'no_payments_yet'
  | 'recent_sales' | 'stock_allocations' | 'seller_payments'
  | 'personal_expenses_card' | 'personal_tracking_only'
  | 'performance_summary' | 'total_allocation_value' | 'earned_commission'
  | 'debt_to_owner_label' | 'owner_owes_label'
  | 'all_sales' | 'all_allocations' | 'all_payments' | 'all_expenses_link'
  | 'month' | 'txns' | 'rate' | 'value'
  // ── Expenses ─────────────────────────────────────────────
  | 'expenses' | 'company_expenses' | 'personal_expenses'
  | 'expense_category' | 'expense_title' | 'expense_amount' | 'expense_date'
  | 'add_expense' | 'edit_expense' | 'total_expenses_lbl'
  | 'cat_food' | 'cat_transport' | 'cat_office' | 'cat_salary'
  | 'cat_rent' | 'cat_utilities' | 'cat_marketing' | 'cat_other'
  | 'cat_maintenance' | 'cat_general'
  | 'personal_note' | 'personal_expense_notice'
  | 'company_expenses_title' | 'personal_expenses_title'
  | 'no_expenses_yet' | 'expense_period' | 'all_period'
  | 'expense_categories_summary' | 'period_expenses' | 'categories_count'
  | 'expense_type' | 'expense_recorder' | 'save_expense' | 'save_changes'
  | 'description' | 'amount_afn' | 'extra_notes'
  | 'delete_expense_confirm' | 'filtered_period' | 'since_beginning' | 'until_today'
  // ── Notifications ─────────────────────────────────────────
  | 'notifications' | 'mark_read' | 'mark_all_read' | 'no_notifications'
  | 'low_stock_alert' | 'new_sale' | 'payment_received'
  | 'notifications_title' | 'unread_notifications' | 'unread_count'
  | 'all_caught_up' | 'clear_all' | 'delete_all_confirm'
  | 'filter_all' | 'filter_unread' | 'filter_sales' | 'filter_inventory'
  | 'filter_allocations' | 'filter_payments' | 'filter_system'
  | 'notif_view' | 'notif_delete'
  | 'notif_dropdown_title' | 'notif_view_all' | 'notif_mark_all'
  | 'failed_to_load' | 'no_notif_dropdown'
  // ── Inventory ────────────────────────────────────────────
  | 'stock_in' | 'stock_history' | 'batch' | 'remaining'
  | 'seller_inventory' | 'your_allocated_stock'
  | 'allocation_history' | 'each_row_batch'
  | 'pkg_types' | 'no_allocated_stock'
  // ── Settings ─────────────────────────────────────────────
  | 'change_password' | 'current_password' | 'new_password' | 'confirm_password'
  | 'profile' | 'update_profile'
  | 'personal_settings' | 'password_changed_success' | 'password_wrong'
  // ── Payments page ─────────────────────────────────────────
  | 'your_payments_to_owner'
  // ── Investor dashboard ─────────────────────────────────────
  | 'capital_invested' | 'total_expenses_investor' | 'net_capital'
  | 'investor_formula_label'
  // ── Seller payment label ──────────────────────────────────
  | 'seller_paid_to_owner'
  // ── Sale edit (seller) ───────────────────────────────────
  | 'edit_sale' | 'edit_sale_title' | 'sale_edit_note'
  // ── Payment edit request ─────────────────────────────────
  | 'edit_payment' | 'request_edit' | 'edit_request_sent'
  | 'edit_requests' | 'pending_requests' | 'no_requests'
  | 'approve' | 'reject' | 'admin_notes' | 'request_status'
  | 'status_pending' | 'status_approved' | 'status_rejected'
  | 'old_value' | 'new_value' | 'payment_edit_request'
  | 'request_pending_notice' | 'edit_request_title'
  | 'register_payment_seller'
  ;

type Translations = Record<TranslationKeys, string>;

// ── ENGLISH ───────────────────────────────────────────────
const en: Translations = {
  app_name: 'HotSpot Manager',
  login: 'Login',
  logout: 'Logout',
  username: 'Username',
  password: 'Password',
  sign_in: 'Sign In',
  welcome: 'Welcome',
  back_to_login: 'Back to Login',
  register_company: 'Register Company',
  create_company: 'Create Company',

  dashboard: 'Dashboard',
  inventory: 'Inventory',
  allocations: 'Allocations',
  sales: 'Sales',
  payments: 'Payments',
  reports: 'Reports',
  expenses: 'Expenses',
  notifications: 'Notifications',
  settings: 'Settings',
  management: 'Management',
  branches: 'Branches',
  sellers: 'Sellers',
  packages: 'Packages',
  users: 'Users',

  save: 'Save',
  cancel: 'Cancel',
  edit: 'Edit',
  delete: 'Delete',
  confirm_delete: 'Are you sure?',
  view_details: 'View Details',
  expand: 'Expand',
  collapse: 'Collapse',
  filter_by: 'Filter By',
  search: 'Search',
  actions: 'Actions',
  confirm: 'Confirm',
  add: 'Add',
  close: 'Close',
  submit: 'Submit',
  reset: 'Reset',
  export_pdf: 'Export PDF',
  export_csv: 'Export CSV',
  filter: 'Filter',
  clear_filter: 'Clear',

  active: 'Active',
  inactive: 'Inactive',
  status: 'Status',
  name: 'Name',
  full_name: 'Full Name',
  role: 'Role',
  owner: 'Owner',
  seller_role: 'Seller',
  language: 'Language',
  notes: 'Notes',
  date: 'Date',
  company: 'Company',
  slug: 'Company ID',
  no_data: 'No data available',
  loading: 'Loading...',
  error: 'Error',
  success: 'Success',
  optional: 'optional',
  all: 'All',
  yes: 'Yes',
  no: 'No',

  total_gb: 'Total GB',
  total_gross: 'Total Gross',
  total_commission: 'Total Commission',
  net_profit: 'Net Profit',
  net_amount: 'Net Amount',
  total_allocated: 'Total Allocated GB',
  total_sold: 'Total Sold GB',
  available_gb: 'Available GB',
  commission_earned: 'Commission Earned',
  balance: 'Balance',
  gross_amount: 'Gross Amount',
  commission_amount: 'Commission',
  commission_rate: 'Commission Rate',
  price_per_gb: 'Price/GB',
  size_gb: 'Size (GB)',
  quantity: 'Quantity',
  package: 'Package',
  amount: 'Amount',
  total_received: 'Total Received',
  received_from_sellers: 'Received from sellers',
  gross_revenue: 'Gross Revenue',
  purchase_cost: 'Purchase Cost',
  net_profit_formula: 'Net Profit',
  available_capital: 'Available Capital',
  total_expenses: 'Total Expenses',
  all_expenses: 'All Expenses',
  allocation_value: 'Allocation Value',
  paid_to_owner: 'Paid to Owner',
  debt_label: 'Debt',
  credit_label: 'Credit',
  settled_label: 'Settled',
  transactions: 'transactions',
  batches: 'batches',

  date_range: 'Date Range',
  today: 'Today',
  this_week: 'This Week',
  this_month: 'This Month',
  this_year: 'This Year',
  all_time: 'All Time',
  from_date: 'From Date',
  to_date: 'To Date',
  period_today: '📅 Today',
  period_week: '📅 This Week',
  period_month: '📅 This Month',
  period_year: '📅 This Year',
  period_all: '📅 All Time',

  generate_report: 'Generate Report',
  report_type: 'Report Type',
  by_branch: 'By Branch',
  by_seller: 'By Seller',
  by_date: 'By Date',
  summary: 'Summary',
  details: 'Details',
  overview: 'Overview',
  drilldown: 'Drill Down',
  package_breakdown: 'Package Breakdown',
  show_details: 'Show Details',
  hide_details: 'Hide Details',
  transaction_history: 'Transaction History',
  total_packages: 'Total Packages',

  add_inventory: 'Add Inventory',
  add_allocation: 'Add Allocation',
  add_sale: 'Add Sale',
  add_payment: 'Add Payment',
  add_payment_seller: 'Add Payment',
  add_branch: 'Add Branch',
  add_package: 'Add Package',
  add_seller: 'Add Seller',
  add_user: 'Add User',

  payment_type: 'Payment Type',
  commission_pay: 'Commission',
  advance: 'Advance',
  settlement: 'Settlement',
  other: 'Other',

  branch: 'Branch',
  seller: 'Seller',

  // Owner dashboard
  profit_formula: '💡 Profit Formula',
  total_inventory_gb: 'Total Inventory GB',
  allocated_gb: 'Allocated GB',
  sold_gb: 'Sold GB',
  gross_income: 'Gross Revenue',
  commissions: 'Commissions',
  deducted_from_profit: 'Deducted from profit',
  net_profit_card: 'Net Profit',
  after_comm_purchase: 'After commission + purchase',
  available_capital_card: '💎 Available Capital',
  net_profit_minus_expenses: 'Net profit − expenses',
  recent_expenses: '💸 Recent Expenses',
  view_all: 'View All →',
  total: 'Total',
  seller_performance: '👥 Seller Performance',
  manage: 'Manage →',
  monthly_trend: '📅 Monthly Trend',
  months_6: 'Last 6 months',
  days_7: 'Last 7 days',
  gross: 'Gross',
  net: 'Net',
  remaining: 'Remaining',

  // Seller dashboard
  financial_summary: 'Financial Summary',
  payment_history: 'All-time payment history',
  commission_earned_lbl: 'Commission Earned',
  total_paid_to_owner: 'Total Paid to Owner',
  debt_balance: 'Debt / Balance',
  payments_by_type: 'Payments Breakdown by Type',
  debt_to_owner: '⚠️ Debt to owner',
  owner_owes_you: '✅ Owner owes you',
  settled: '✓ Settled',
  sales_count: 'sales',
  payments_count: 'payments',
  seller_dashboard: 'Seller Dashboard',
  register_first_sale: '+ Register First Sale',
  no_sales_yet: 'No sales registered yet',
  no_allocations_yet: 'No allocations yet',
  no_payments_yet: 'No payments yet',
  recent_sales: '💰 Recent Sales',
  stock_allocations: '🔀 Stock Allocations',
  seller_payments: '💳 Seller Payments',
  personal_expenses_card: '💸 Personal Expenses',
  personal_tracking_only: 'These expenses are for personal tracking only and do not affect debt calculations.',
  performance_summary: '📊 Performance Summary',
  total_allocation_value: 'Allocation Value',
  earned_commission: 'Earned Commission',
  debt_to_owner_label: 'Debt to Owner',
  owner_owes_label: 'Owner Owes You',
  all_sales: 'All Sales →',
  all_allocations: 'View All →',
  all_payments: 'All Payments →',
  all_expenses_link: 'All Expenses →',
  month: 'Month',
  txns: 'Txns',
  rate: 'Rate',
  value: 'Value',

  // Expenses
  company_expenses: 'Company Expenses',
  personal_expenses: 'Personal Expenses',
  expense_category: 'Category',
  expense_title: 'Title',
  expense_amount: 'Amount',
  expense_date: 'Date',
  add_expense: 'Add Expense',
  edit_expense: 'Edit Expense',
  total_expenses_lbl: 'Total Expenses',
  cat_food: 'Food & Drinks',
  cat_transport: 'Transport',
  cat_office: 'Office Supplies',
  cat_salary: 'Salary',
  cat_rent: 'Rent',
  cat_utilities: 'Utilities',
  cat_marketing: 'Marketing',
  cat_other: 'Other',
  cat_maintenance: 'Maintenance',
  cat_general: 'General',
  personal_note: 'These expenses are for personal tracking only and do not affect system calculations.',
  personal_expense_notice: 'These expenses are for your personal tracking only and do not affect debt or system balances.',
  company_expenses_title: 'Company Expenses',
  personal_expenses_title: 'Personal Expenses',
  no_expenses_yet: 'No expenses recorded yet.',
  expense_period: 'Period',
  all_period: 'All Time',
  expense_categories_summary: '📊 Category Summary',
  period_expenses: 'Period Expenses',
  categories_count: 'Categories',
  expense_type: 'Expense Type',
  expense_recorder: 'Recorded By',
  save_expense: '💾 Save',
  save_changes: '💾 Save Changes',
  description: 'Description',
  amount_afn: 'Amount (AFN)',
  extra_notes: 'Notes (optional)',
  delete_expense_confirm: 'Delete this expense?',
  filtered_period: 'filtered period',
  since_beginning: 'since beginning',
  until_today: 'until today',

  // Notifications
  notifications_title: '🔔 Notifications',
  unread_notifications: 'unread notifications',
  unread_count: 'unread',
  all_caught_up: "You're all caught up!",
  clear_all: '🗑 Clear All',
  delete_all_confirm: 'Delete all notifications?',
  filter_all: 'All',
  filter_unread: 'Unread',
  filter_sales: '💰 Sales',
  filter_inventory: '📦 Inventory',
  filter_allocations: '🔀 Allocations',
  filter_payments: '💳 Payments',
  filter_system: '⚙️ System',
  notif_view: 'View →',
  notif_delete: 'Delete',
  notif_dropdown_title: 'Notifications',
  notif_view_all: 'View all',
  notif_mark_all: '✓ Mark all read',
  failed_to_load: 'Failed to load',
  no_notif_dropdown: 'No notifications',
  mark_read: 'Mark as Read',
  mark_all_read: 'Mark All Read',
  no_notifications: 'No notifications',
  low_stock_alert: 'Low Stock Alert',
  new_sale: 'New Sale',
  payment_received: 'Payment Received',

  // Inventory
  stock_in: 'Stock In',
  stock_history: 'Stock History',
  batch: 'Batch',
  seller_inventory: 'Seller Inventory',
  your_allocated_stock: 'Your Allocated Stock',
  allocation_history: 'Allocation History',
  each_row_batch: 'Each row = one allocation batch',
  pkg_types: 'pkg type',
  no_allocated_stock: 'No allocated stock yet.',

  // Settings
  change_password: 'Change Password',
  current_password: 'Current Password',
  new_password: 'New Password',
  confirm_password: 'Confirm Password',
  profile: 'Profile',
  update_profile: 'Update Profile',
  personal_settings: 'Personal Settings',
  password_changed_success: 'Password changed successfully.',
  password_wrong: 'Current password is incorrect.',

  // Payments
  your_payments_to_owner: 'Your payments to the system owner',

  // Investor dashboard
  capital_invested: 'Capital Invested',
  total_expenses_investor: 'Total Expenses',
  net_capital: 'Net Capital',
  investor_formula_label: '📐 Investor Formula',
  // Sale edit
  edit_sale: 'Edit Sale',
  edit_sale_title: '✏️ Edit Sale',
  sale_edit_note: 'Note: editing a sale recalculates commission automatically.',
  // Payment edit request
  edit_payment: 'Edit Payment',
  request_edit: 'Request Edit',
  edit_request_sent: '✅ Edit request submitted. Waiting for admin approval.',
  edit_requests: '📋 Edit Requests',
  pending_requests: 'Pending requests',
  no_requests: 'No edit requests.',
  approve: 'Approve',
  reject: 'Reject',
  admin_notes: 'Admin Notes',
  request_status: 'Status',
  status_pending: '🕐 Pending',
  status_approved: '✅ Approved',
  status_rejected: '❌ Rejected',
  old_value: 'Previous Value',
  new_value: 'Proposed Value',
  payment_edit_request: 'Payment Edit Request',
  request_pending_notice: '⏳ There is a pending edit request for this payment.',
  edit_request_title: '📝 Request to Edit Payment',
  register_payment_seller: '+ Register Payment',
};

// ── DARI / PERSIAN (fa) ───────────────────────────────────
const fa: Translations = {
  app_name: 'مدیریت هات‌اسپات',
  login: 'ورود',
  logout: 'خروج',
  username: 'نام کاربری',
  password: 'رمز عبور',
  sign_in: 'ورود به سیستم',
  welcome: 'خوش آمدید',
  back_to_login: 'بازگشت به ورود',
  register_company: 'ثبت شرکت',
  create_company: 'ایجاد شرکت',

  dashboard: 'داشبورد',
  inventory: 'موجودی',
  allocations: 'تخصیص‌ها',
  sales: 'فروش‌ها',
  payments: 'دریافتی‌ها',
  reports: 'راپورها',
  expenses: 'مصارف',
  notifications: 'اعلانات',
  settings: 'تنظیمات',
  management: 'مدیریت',
  branches: 'شعبه‌ها',
  sellers: 'فروشندگان',
  packages: 'پکیج‌ها',
  users: 'کاربران',

  save: 'ذخیره',
  cancel: 'لغو',
  edit: 'ویرایش',
  delete: 'حذف',
  confirm_delete: 'آیا مطمئن هستید؟',
  view_details: 'مشاهده جزئیات',
  expand: 'بازکردن',
  collapse: 'بستن',
  filter_by: 'فیلتر بر اساس',
  search: 'جستجو',
  actions: 'عملیات',
  confirm: 'تأیید',
  add: 'افزودن',
  close: 'بستن',
  submit: 'ارسال',
  reset: 'بازنشانی',
  export_pdf: 'دانلود PDF',
  export_csv: 'دانلود CSV',
  filter: 'فلتر',
  clear_filter: 'پاک کردن',

  active: 'فعال',
  inactive: 'غیرفعال',
  status: 'وضعیت',
  name: 'نام',
  full_name: 'نام کامل',
  role: 'نقش',
  owner: 'مالک',
  seller_role: 'فروشنده',
  language: 'زبان',
  notes: 'یادداشت',
  date: 'تاریخ',
  company: 'شرکت',
  slug: 'شناسه شرکت',
  no_data: 'داده‌ای موجود نیست',
  loading: 'در حال بارگذاری...',
  error: 'خطا',
  success: 'موفق',
  optional: 'اختیاری',
  all: 'همه',
  yes: 'بله',
  no: 'خیر',

  total_gb: 'مجموع گیگابایت',
  total_gross: 'مجموع ناخالص',
  total_commission: 'مجموع کمیسیون',
  net_profit: 'سود خالص',
  net_amount: 'مبلغ خالص',
  total_allocated: 'مجموع تخصیص‌یافته',
  total_sold: 'مجموع فروخته‌شده',
  available_gb: 'گیگابایت موجود',
  commission_earned: 'کمیسیون کسب‌شده',
  balance: 'مانده حساب',
  gross_amount: 'مبلغ ناخالص',
  commission_amount: 'کمیسیون',
  commission_rate: 'نرخ کمیسیون',
  price_per_gb: 'قیمت هر GB',
  size_gb: 'حجم (GB)',
  quantity: 'تعداد',
  package: 'پکیج',
  amount: 'مبلغ',
  total_received: 'مجموع دریافتی',
  received_from_sellers: 'دریافت شده از فروشندگان',
  gross_revenue: 'درآمد ناخالص',
  purchase_cost: 'قیمت خرید',
  net_profit_formula: 'سود خالص',
  available_capital: 'سرمایه موجود',
  total_expenses: 'مجموع مصارف',
  all_expenses: 'همه مصارف',
  allocation_value: 'ارزش تخصیص',
  paid_to_owner: 'پرداختی به مالک',
  debt_label: 'بدهی',
  credit_label: 'طلب',
  settled_label: 'تسویه',
  transactions: 'تراکنش',
  batches: 'دسته',

  date_range: 'بازه زمانی',
  today: 'امروز',
  this_week: 'این هفته',
  this_month: 'این ماه',
  this_year: 'این سال',
  all_time: 'همه وقت',
  from_date: 'از تاریخ',
  to_date: 'تا تاریخ',
  period_today: '📅 امروز',
  period_week: '📅 این هفته',
  period_month: '📅 این ماه',
  period_year: '📅 امسال',
  period_all: '📅 همه وقت',

  generate_report: 'تهیه راپور',
  report_type: 'نوع راپور',
  by_branch: 'بر اساس شعبه',
  by_seller: 'بر اساس فروشنده',
  by_date: 'بر اساس تاریخ',
  summary: 'خلاصه',
  details: 'جزئیات',
  overview: 'نمای کلی',
  drilldown: 'جزئیات بیشتر',
  package_breakdown: 'جزئیات پکیج‌ها',
  show_details: 'نمایش جزئیات',
  hide_details: 'پنهان‌کردن جزئیات',
  transaction_history: 'تاریخچه تراکنش‌ها',
  total_packages: 'مجموع پکیج‌ها',

  add_inventory: 'افزودن موجودی',
  add_allocation: 'افزودن تخصیص',
  add_sale: 'ثبت فروش',
  add_payment: 'ثبت دریافتی',
  add_payment_seller: 'ثبت پرداختی',
  add_branch: 'افزودن شعبه',
  add_package: 'افزودن پکیج',
  add_seller: 'افزودن فروشنده',
  add_user: 'افزودن کاربر',

  payment_type: 'نوع پرداختی',
  commission_pay: 'کمیسیون',
  advance: 'پیش‌پرداخت',
  settlement: 'تسویه‌حساب',
  other: 'سایر',

  branch: 'شعبه',
  seller: 'فروشنده',

  // Owner dashboard
  profit_formula: '💡 فرمول سود',
  total_inventory_gb: 'مجموع GB موجودی',
  allocated_gb: 'GB تخصیص یافته',
  sold_gb: 'GB فروخته شده',
  gross_income: 'درآمد ناخالص',
  commissions: 'کمیشن‌ها',
  deducted_from_profit: 'کسر از سود (کمیشن)',
  net_profit_card: 'سود خالص',
  after_comm_purchase: 'بعد از کمیشن + خرید',
  available_capital_card: '💎 سرمایه موجود',
  net_profit_minus_expenses: 'سود خالص − مصارف',
  recent_expenses: '💸 مصارف اخیر',
  view_all: 'همه →',
  total: 'مجموع',
  seller_performance: '👥 عملکرد فروشندگان',
  manage: 'مدیریت →',
  monthly_trend: '📅 روند ماهانه',
  months_6: '۶ ماه اخیر',
  days_7: '۷ روز اخیر',
  gross: 'ناخالص',
  net: 'خالص',
  remaining: 'باقی‌مانده',

  // Seller dashboard
  financial_summary: 'خلاصه مالی',
  payment_history: 'تاریخچه پرداختی‌ها',
  commission_earned_lbl: 'کمیسیون کسب‌شده',
  total_paid_to_owner: 'مجموع دریافتی از فروشندگان',
  debt_balance: 'بدهی / مانده حساب',
  payments_by_type: 'پرداختی‌ها بر اساس نوع',
  debt_to_owner: '⚠️ بدهی به مالک',
  owner_owes_you: '✅ مالک بدهکار شماست',
  settled: '✓ تسویه شده',
  sales_count: 'فروش',
  payments_count: 'پرداختی',
  seller_dashboard: 'داشبورد فروشنده',
  register_first_sale: '+ ثبت اولین فروش',
  no_sales_yet: 'هنوز فروشی ثبت نشده',
  no_allocations_yet: 'هنوز تخصیصی ثبت نشده',
  no_payments_yet: 'هنوز پرداختی ثبت نشده',
  recent_sales: '💰 فروش‌های اخیر',
  stock_allocations: '🔀 تخصیص موجودی',
  seller_payments: '💳 پرداختی‌های شما به مالک',
  personal_expenses_card: '💸 مصارف شخصی',
  personal_tracking_only: 'این مصارف صرفاً برای کنترل شخصی شما ثبت شده و در محاسبه بدهی یا حساب سیستم تأثیر ندارد.',
  performance_summary: '📊 خلاصه کل عملکرد',
  total_allocation_value: 'ارزش تخصیص',
  earned_commission: 'کمیشن کسبی',
  debt_to_owner_label: 'بدهی به مالک',
  owner_owes_label: 'مالک بدهکار',
  all_sales: 'همه فروش‌ها →',
  all_allocations: 'همه →',
  all_payments: 'همه پرداختی‌ها →',
  all_expenses_link: 'همه مصارف →',
  month: 'ماه',
  txns: 'تراکنش',
  rate: 'نرخ',
  value: 'ارزش',

  // Expenses
  company_expenses: 'مصارف شرکت',
  personal_expenses: 'مصارف شخصی',
  expense_category: 'دسته‌بندی',
  expense_title: 'عنوان',
  expense_amount: 'مبلغ',
  expense_date: 'تاریخ',
  add_expense: 'افزودن مصرف',
  edit_expense: 'ویرایش مصرف',
  total_expenses_lbl: 'مجموع مصارف',
  cat_food: 'خوراک و نوشیدنی',
  cat_transport: 'حمل‌ونقل',
  cat_office: 'لوازم اداری',
  cat_salary: 'حقوق و دستمزد',
  cat_rent: 'کرایه',
  cat_utilities: 'آب و برق و گاز',
  cat_marketing: 'بازاریابی',
  cat_other: 'سایر',
  cat_maintenance: 'ترمیم و نگهداری',
  cat_general: 'عمومی',
  personal_note: 'این مصارف فقط برای پیگیری شخصی هستند و در محاسبات بدهی تأثیری ندارند.',
  personal_expense_notice: 'این مصارف صرفاً برای کنترل شخصی شما ثبت می‌شود و در محاسبه بدهی یا حساب سیستم تأثیری ندارد.',
  company_expenses_title: '💸 مصارف شرکت',
  personal_expenses_title: '💸 مصارف شخصی',
  no_expenses_yet: 'هنوز مصرفی ثبت نشده',
  expense_period: 'دوره',
  all_period: 'همه وقت',
  expense_categories_summary: '📊 خلاصه دسته‌بندی',
  period_expenses: 'مصارف دوره',
  categories_count: 'دسته‌بندی‌ها',
  expense_type: 'نوع مصرف',
  expense_recorder: 'ثبت‌کننده',
  save_expense: '💾 ذخیره',
  save_changes: '💾 ذخیره تغییرات',
  description: 'عنوان / توضیحات',
  amount_afn: 'مبلغ (افغانی)',
  extra_notes: 'یادداشت (اختیاری)',
  delete_expense_confirm: 'این مصرف حذف شود؟',
  filtered_period: 'دوره فلتر شده',
  since_beginning: 'از ابتدا',
  until_today: 'امروز',

  // Notifications
  notifications_title: '🔔 اعلانات',
  unread_notifications: 'اعلان خوانده‌نشده',
  unread_count: 'خوانده‌نشده',
  all_caught_up: 'همه چیز به‌روز است!',
  clear_all: '🗑 پاک کردن همه',
  delete_all_confirm: 'همه اعلانات حذف شود؟',
  filter_all: 'همه',
  filter_unread: 'خوانده‌نشده',
  filter_sales: '💰 فروش',
  filter_inventory: '📦 موجودی',
  filter_allocations: '🔀 تخصیص',
  filter_payments: '💳 دریافتی',
  filter_system: '⚙️ سیستم',
  notif_view: 'مشاهده →',
  notif_delete: 'حذف',
  notif_dropdown_title: 'اعلانات',
  notif_view_all: 'همه اعلانات',
  notif_mark_all: '✓ همه را خوانده علامت بزن',
  failed_to_load: 'بارگذاری ناموفق',
  no_notif_dropdown: 'اعلانی موجود نیست',
  mark_read: 'علامت‌گذاری به‌عنوان خوانده‌شده',
  mark_all_read: 'علامت‌گذاری همه',
  no_notifications: 'اعلانی موجود نیست',
  low_stock_alert: 'هشدار موجودی کم',
  new_sale: 'فروش جدید',
  payment_received: 'دریافتی ثبت شد',

  // Inventory
  stock_in: 'ورود موجودی',
  stock_history: 'تاریخچه موجودی',
  batch: 'دسته',
  seller_inventory: 'موجودی فروشنده',
  your_allocated_stock: 'موجودی تخصیص‌یافته به شما',
  allocation_history: 'تاریخچه تخصیص‌ها',
  each_row_batch: 'هر ردیف = یک دسته تخصیص',
  pkg_types: 'نوع پکیج',
  no_allocated_stock: 'هنوز موجودی تخصیص‌یافته‌ای ندارید.',

  // Settings
  change_password: 'تغییر رمز عبور',
  current_password: 'رمز فعلی',
  new_password: 'رمز جدید',
  confirm_password: 'تأیید رمز جدید',
  profile: 'پروفایل',
  update_profile: 'بروزرسانی پروفایل',
  personal_settings: 'تنظیمات شخصی',
  password_changed_success: 'رمز عبور با موفقیت تغییر یافت.',
  password_wrong: 'رمز عبور فعلی نادرست است.',

  // Payments
  your_payments_to_owner: 'پرداختی‌های شما به مالک',
  seller_paid_to_owner: 'پرداختی به مالک',

  // Investor dashboard
  capital_invested: 'سرمایه گذاری شده',
  total_expenses_investor: 'مجموع مصارف',
  net_capital: 'سرمایه موجود',
  investor_formula_label: '📐 فرمول مالی سرمایه‌گذار',
  // Sale edit
  edit_sale: 'ویرایش فروش',
  edit_sale_title: '✏️ ویرایش فروش',
  sale_edit_note: 'توجه: ویرایش فروش کمیسیون را به‌صورت خودکار محاسبه مجدد می‌کند.',
  // Payment edit request
  edit_payment: 'ویرایش پرداختی',
  request_edit: 'درخواست ویرایش',
  edit_request_sent: '✅ درخواست ویرایش ارسال شد. منتظر تأیید ادمین.',
  edit_requests: '📋 درخواست‌های ویرایش',
  pending_requests: 'درخواست‌های در انتظار',
  no_requests: 'درخواست ویرایشی موجود نیست.',
  approve: 'تأیید',
  reject: 'رد کردن',
  admin_notes: 'یادداشت ادمین',
  request_status: 'وضعیت',
  status_pending: '🕐 در انتظار',
  status_approved: '✅ تأیید شده',
  status_rejected: '❌ رد شده',
  old_value: 'مقدار قبلی',
  new_value: 'مقدار پیشنهادی',
  payment_edit_request: 'درخواست ویرایش پرداختی',
  request_pending_notice: '⏳ یک درخواست ویرایش در انتظار تأیید وجود دارد.',
  edit_request_title: '📝 درخواست ویرایش پرداختی',
  register_payment_seller: '+ ثبت پرداختی',
};

// ── PASHTO (ps) ───────────────────────────────────────────
const ps: Translations = {
  app_name: 'هات‌سپاټ مدیریت',
  login: 'ننوتل',
  logout: 'وتل',
  username: 'د کارونکي نوم',
  password: 'پټ نوم',
  sign_in: 'سیستم کې ننوتل',
  welcome: 'ښه راغلاست',
  back_to_login: 'ننوتلو ته بیرته',
  register_company: 'شرکت ثبتول',
  create_company: 'شرکت جوړول',

  dashboard: 'ډشبورډ',
  inventory: 'موجودي',
  allocations: 'تخصیصونه',
  sales: 'پلورونه',
  payments: 'تادیات',
  reports: 'راپورونه',
  expenses: 'لګښتونه',
  notifications: 'خبرتیاوې',
  settings: 'ترتیبات',
  management: 'مدیریت',
  branches: 'څانګې',
  sellers: 'پلورونکي',
  packages: 'پکیجونه',
  users: 'کاروونکي',

  save: 'خوندي کول',
  cancel: 'لغوه کول',
  edit: 'سمول',
  delete: 'ړنګول',
  confirm_delete: 'ایا ډاډه یاست؟',
  view_details: 'توضیحات وګورئ',
  expand: 'پراخول',
  collapse: 'ټول کول',
  filter_by: 'فلتر',
  search: 'لټون',
  actions: 'عملیات',
  confirm: 'تایید',
  add: 'اضافه کول',
  close: 'بندول',
  submit: 'لیږل',
  reset: 'بیا ترتیبول',
  export_pdf: 'PDF ډاونلوډ',
  export_csv: 'CSV ډاونلوډ',
  filter: 'فلتر',
  clear_filter: 'پاکول',

  active: 'فعال',
  inactive: 'غیرفعال',
  status: 'حالت',
  name: 'نوم',
  full_name: 'بشپړ نوم',
  role: 'دنده',
  owner: 'مالک',
  seller_role: 'پلورونکی',
  language: 'ژبه',
  notes: 'یادداشتونه',
  date: 'نیټه',
  company: 'شرکت',
  slug: 'د شرکت پیژندنه',
  no_data: 'معلومات شتون نلري',
  loading: 'لوډیږي...',
  error: 'تیروتنه',
  success: 'بریالی',
  optional: 'اختیاري',
  all: 'ټول',
  yes: 'هو',
  no: 'نه',

  total_gb: 'ټولټال GB',
  total_gross: 'ټولټال ناخالص',
  total_commission: 'ټولټال کمیشن',
  net_profit: 'خالص ګټه',
  net_amount: 'خالص مقدار',
  total_allocated: 'ټولټال تخصیص شوي',
  total_sold: 'ټولټال پلورل شوي',
  available_gb: 'موجود GB',
  commission_earned: 'ګټل شوی کمیشن',
  balance: 'بیلانس',
  gross_amount: 'ناخالص مقدار',
  commission_amount: 'کمیشن',
  commission_rate: 'د کمیشن کچه',
  price_per_gb: 'د هر GB بیه',
  size_gb: 'اندازه (GB)',
  quantity: 'مقدار',
  package: 'پکیج',
  amount: 'مقدار',
  total_received: 'ټول ترلاسه شوي',
  received_from_sellers: 'له پلورونکو ترلاسه شوي',
  gross_revenue: 'ناخالص عاید',
  purchase_cost: 'د اخیستلو قیمت',
  net_profit_formula: 'خالص ګټه',
  available_capital: 'موجود سرمایه',
  total_expenses: 'ټول لګښتونه',
  all_expenses: 'ټول لګښتونه',
  allocation_value: 'د تخصیص ارزښت',
  paid_to_owner: 'مالک ته تادیه',
  debt_label: 'پور',
  credit_label: 'طلب',
  settled_label: 'تصفیه',
  transactions: 'معاملات',
  batches: 'ډله',

  date_range: 'د نیټې سلسله',
  today: 'نن',
  this_week: 'دا اونۍ',
  this_month: 'دا میاشت',
  this_year: 'دا کال',
  all_time: 'ټول وخت',
  from_date: 'له نیټې',
  to_date: 'تر نیټې',
  period_today: '📅 نن',
  period_week: '📅 دا اونۍ',
  period_month: '📅 دا میاشت',
  period_year: '📅 دا کال',
  period_all: '📅 ټول وخت',

  generate_report: 'راپور جوړول',
  report_type: 'د راپور ډول',
  by_branch: 'د څانګې پر بنسټ',
  by_seller: 'د پلورونکي پر بنسټ',
  by_date: 'د نیټې پر بنسټ',
  summary: 'لنډیز',
  details: 'توضیحات',
  overview: 'عمومي لید',
  drilldown: 'نور توضیحات',
  package_breakdown: 'د پکیج توضیحات',
  show_details: 'توضیحات وښیئ',
  hide_details: 'توضیحات پټ کړئ',
  transaction_history: 'د معاملاتو تاریخچه',
  total_packages: 'ټول پکیجونه',

  add_inventory: 'موجودي اضافه کول',
  add_allocation: 'تخصیص اضافه کول',
  add_sale: 'پلور ثبتول',
  add_payment: 'تادیه اضافه کول',
  add_payment_seller: 'تادیه اضافه کول',
  add_branch: 'څانګه اضافه کول',
  add_package: 'پکیج اضافه کول',
  add_seller: 'پلورونکی اضافه کول',
  add_user: 'کارونکی اضافه کول',

  payment_type: 'د تادیې ډول',
  commission_pay: 'کمیشن',
  advance: 'پیش‌تادیه',
  settlement: 'تصفیه',
  other: 'نور',

  branch: 'څانګه',
  seller: 'پلورونکی',

  // Owner dashboard
  profit_formula: '💡 د ګټې فورمول',
  total_inventory_gb: 'د موجودۍ ټولټال GB',
  allocated_gb: 'تخصیص شوي GB',
  sold_gb: 'پلورل شوي GB',
  gross_income: 'ناخالص عاید',
  commissions: 'کمیشنونه',
  deducted_from_profit: 'له ګټې کمول (کمیشن)',
  net_profit_card: 'خالص ګټه',
  after_comm_purchase: 'د کمیشن + اخیستلو وروسته',
  available_capital_card: '💎 موجود سرمایه',
  net_profit_minus_expenses: 'خالص ګټه − لګښتونه',
  recent_expenses: '💸 وروستي لګښتونه',
  view_all: 'ټول →',
  total: 'ټول',
  seller_performance: '👥 د پلورونکو فعالیت',
  manage: 'مدیریت →',
  monthly_trend: '📅 میاشتنی رجحان',
  months_6: 'وروستۍ ۶ میاشتې',
  days_7: 'وروستي ۷ ورځې',
  gross: 'ناخالص',
  net: 'خالص',
  remaining: 'پاتې',

  // Seller dashboard
  financial_summary: 'مالي لنډیز',
  payment_history: 'د تادیاتو تاریخچه',
  commission_earned_lbl: 'ګټل شوی کمیشن',
  total_paid_to_owner: 'ټول تادیات مالک ته',
  debt_balance: 'پور / بیلانس',
  payments_by_type: 'د ډول پر بنسټ تادیات',
  debt_to_owner: '⚠️ پور مالک ته',
  owner_owes_you: '✅ مالک تاسو ته پور لري',
  settled: '✓ تصفیه شوې',
  sales_count: 'پلور',
  payments_count: 'تادیه',
  seller_dashboard: 'د پلورونکي ډشبورډ',
  register_first_sale: '+ لومړی پلور ثبتول',
  no_sales_yet: 'لا هیڅ پلور ثبت شوی نه دی',
  no_allocations_yet: 'لا هیڅ تخصیص ثبت شوی نه دی',
  no_payments_yet: 'لا هیڅ تادیه ثبت شوې نه ده',
  recent_sales: '💰 وروستي پلورونه',
  stock_allocations: '🔀 د موجودۍ تخصیصونه',
  seller_payments: '💳 د پلورونکي تادیات سیستم ته',
  personal_expenses_card: '💸 شخصي لګښتونه',
  personal_tracking_only: 'دا لګښتونه یوازې ستاسو شخصي تعقیب لپاره دي او د پور محاسبې باندې اغیزه نه کوي.',
  performance_summary: '📊 د فعالیت ټول لنډیز',
  total_allocation_value: 'د تخصیص ارزښت',
  earned_commission: 'ګټل شوی کمیشن',
  debt_to_owner_label: 'پور مالک ته',
  owner_owes_label: 'مالک پور لري',
  all_sales: 'ټول پلورونه →',
  all_allocations: 'ټول →',
  all_payments: 'ټولې تادیات →',
  all_expenses_link: 'ټول لګښتونه →',
  month: 'میاشت',
  txns: 'معاملات',
  rate: 'کچه',
  value: 'ارزښت',

  // Expenses
  company_expenses: 'د شرکت لګښتونه',
  personal_expenses: 'شخصي لګښتونه',
  expense_category: 'کټګوري',
  expense_title: 'سرلیک',
  expense_amount: 'مقدار',
  expense_date: 'نیټه',
  add_expense: 'لګښت اضافه کول',
  edit_expense: 'لګښت سمول',
  total_expenses_lbl: 'ټول لګښتونه',
  cat_food: 'خواړه او څښاک',
  cat_transport: 'لیږدونه',
  cat_office: 'اداري توکي',
  cat_salary: 'معاش',
  cat_rent: 'کرایه',
  cat_utilities: 'اوبه او برښنا',
  cat_marketing: 'بازارموندنه',
  cat_other: 'نور',
  cat_maintenance: 'ترمیم',
  cat_general: 'عمومي',
  personal_note: 'دا لګښتونه یوازې د شخصي تعقیب لپاره دي او د پور محاسبې باندې اغیزه نه کوي.',
  personal_expense_notice: 'دا لګښتونه یوازې ستاسو شخصي تعقیب لپاره ثبت کیږي او د پور یا سیستم حساب باندې اغیزه نه لري.',
  company_expenses_title: '💸 د شرکت لګښتونه',
  personal_expenses_title: '💸 شخصي لګښتونه',
  no_expenses_yet: 'لا هیڅ لګښت ثبت شوی نه دی',
  expense_period: 'موده',
  all_period: 'ټول وخت',
  expense_categories_summary: '📊 د کټګورۍ لنډیز',
  period_expenses: 'د مودې لګښتونه',
  categories_count: 'کټګورۍ',
  expense_type: 'د لګښت ډول',
  expense_recorder: 'ثبتوونکی',
  save_expense: '💾 خوندي کول',
  save_changes: '💾 بدلونونه خوندي کول',
  description: 'سرلیک / توضیحات',
  amount_afn: 'مقدار (افغاني)',
  extra_notes: 'یادداشت (اختیاري)',
  delete_expense_confirm: 'دا لګښت لرې شي؟',
  filtered_period: 'فلتر شوې موده',
  since_beginning: 'له پیله',
  until_today: 'تر نن',

  // Notifications
  notifications_title: '🔔 خبرتیاوې',
  unread_notifications: 'نه لوستل شوې خبرتیاوې',
  unread_count: 'نه لوستل شوې',
  all_caught_up: 'ټول تازه دي!',
  clear_all: '🗑 ټولې پاکول',
  delete_all_confirm: 'ټولې خبرتیاوې لرې شي؟',
  filter_all: 'ټولې',
  filter_unread: 'نه لوستل شوې',
  filter_sales: '💰 پلورونه',
  filter_inventory: '📦 موجودي',
  filter_allocations: '🔀 تخصیصونه',
  filter_payments: '💳 تادیات',
  filter_system: '⚙️ سیستم',
  notif_view: 'کتل →',
  notif_delete: 'ړنګول',
  notif_dropdown_title: 'خبرتیاوې',
  notif_view_all: 'ټولې خبرتیاوې',
  notif_mark_all: '✓ ټولې لوستل شوې',
  failed_to_load: 'لوډول بریالی نه شو',
  no_notif_dropdown: 'خبرتیا نشته',
  mark_read: 'د لوستل شوي په توګه نښه کول',
  mark_all_read: 'ټول نښه کول',
  no_notifications: 'خبرتیا نشته',
  low_stock_alert: 'د کم موجودي خبرتیا',
  new_sale: 'نوی پلور',
  payment_received: 'تادیه ترلاسه شوه',

  // Inventory
  stock_in: 'د موجودي داخلول',
  stock_history: 'د موجودي تاریخچه',
  batch: 'ډله',
  seller_inventory: 'د پلورونکي موجودي',
  your_allocated_stock: 'ستاسو تخصیص شوې موجودي',
  allocation_history: 'د تخصیصاتو تاریخچه',
  each_row_batch: 'هر کتار = یو تخصیص ډله',
  pkg_types: 'ډول پکیج',
  no_allocated_stock: 'تاسو لا هیڅ تخصیص شوی موجودي نه لرئ.',

  // Settings
  change_password: 'پټ نوم بدلول',
  current_password: 'اوسنی پټ نوم',
  new_password: 'نوی پټ نوم',
  confirm_password: 'نوی پټ نوم تایید',
  profile: 'پروفایل',
  update_profile: 'پروفایل تازه کول',
  personal_settings: 'شخصي ترتیبات',
  password_changed_success: 'پټ نوم بریالیتوب سره بدل شو.',
  password_wrong: 'اوسنی پټ نوم غلط دی.',

  // Payments
  your_payments_to_owner: 'ستاسو تادیات مالک ته',

  // Investor dashboard
  capital_invested: 'پانګه اچونه',
  total_expenses_investor: 'ټول لګښتونه',
  net_capital: 'خالص پانګه',
  investor_formula_label: '📐 د پانګه‌والو مالي فورمول',

  // Seller paid to owner
  seller_paid_to_owner: 'د مالک ته تادیه',
  // Sale edit
  edit_sale: 'پلور سمول',
  edit_sale_title: '✏️ پلور سمول',
  sale_edit_note: 'یادونه: د پلور سمول کمیشن اتوماتیک بیا محاسبه کوي.',
  // Payment edit request
  edit_payment: 'تادیه سمول',
  request_edit: 'د سمولو غوښتنه',
  edit_request_sent: '✅ د سمولو غوښتنه واستول شوه. د ادمین تایید انتظار.',
  edit_requests: '📋 د سمولو غوښتنې',
  pending_requests: 'انتظار لرونکې غوښتنې',
  no_requests: 'هیڅ د سمولو غوښتنه نشته.',
  approve: 'تایید',
  reject: 'رد کول',
  admin_notes: 'د ادمین یادداشت',
  request_status: 'حالت',
  status_pending: '🕐 انتظار',
  status_approved: '✅ تایید شوې',
  status_rejected: '❌ رد شوې',
  old_value: 'پخوانی مقدار',
  new_value: 'وړاندیز شوی مقدار',
  payment_edit_request: 'د تادیې د سمولو غوښتنه',
  request_pending_notice: '⏳ د دې تادیې لپاره یوه انتظار لرونکې غوښتنه شته.',
  edit_request_title: '📝 د تادیې د سمولو غوښتنه',
  register_payment_seller: '+ تادیه ثبتول',
};

const translations: Record<Lang, Translations> = { en, fa, ps };

export function t(lang: Lang, key: TranslationKeys): string {
  return translations[lang]?.[key] ?? translations['en'][key] ?? key;
}

export function getDir(lang: Lang): 'ltr' | 'rtl' {
  return LANGUAGES.find(l => l.code === lang)?.dir ?? 'ltr';
}
