// ============================================================
// Financial Ledger Library
// Immutable ledger for all seller financial movements.
// Rules:
//   - Allocation → +money_amount (seller owes owner)
//   - Payment    → -money_amount (seller pays owner)
//   - Correction → explicit signed amount
//   - NEVER edit or delete entries
//   - balance = SUM(money_amount) per seller
// ============================================================

export interface LedgerEntry {
  company_id:       number;
  seller_id:        number;
  transaction_type: 'allocation' | 'payment' | 'correction';
  ref_type?:        string;
  ref_id?:          number;
  gb_amount?:       number;
  money_amount:     number;   // +ve = debt increase, -ve = debt reduction
  notes?:           string;
  created_by?:      number;
}

/**
 * Get the current financial balance for a seller.
 * balance > 0 → seller owes owner (has debt)
 * balance < 0 → owner owes seller (over-paid / credit)
 */
export async function getSellerBalance(
  db: D1Database,
  company_id: number,
  seller_id: number
): Promise<number> {
  const row = await db.prepare(`
    SELECT COALESCE(SUM(money_amount), 0) as balance
    FROM financial_ledger
    WHERE company_id=? AND seller_id=?
  `).bind(company_id, seller_id).first<{ balance: number }>();
  return row?.balance ?? 0;
}

/**
 * Create a new ledger entry (immutable).
 * Balance is calculated as the running SUM, stored in balance_after.
 */
export async function createLedgerEntry(
  db: D1Database,
  entry: LedgerEntry
): Promise<void> {
  const balance = await getSellerBalance(db, entry.company_id, entry.seller_id);
  const balance_after = balance + entry.money_amount;

  await db.prepare(`
    INSERT INTO financial_ledger
      (company_id, seller_id, transaction_type, ref_type, ref_id,
       gb_amount, money_amount, balance_after, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).bind(
    entry.company_id,
    entry.seller_id,
    entry.transaction_type,
    entry.ref_type ?? null,
    entry.ref_id   ?? null,
    entry.gb_amount ?? 0,
    entry.money_amount,
    balance_after,
    entry.notes    ?? null,
    entry.created_by ?? null
  ).run();
}

/**
 * Get full ledger history for a seller (newest first)
 */
export async function getSellerLedger(
  db: D1Database,
  company_id: number,
  seller_id: number,
  limit = 200
): Promise<any[]> {
  const rows = await db.prepare(`
    SELECT fl.*,
      u.full_name as seller_name,
      creator.full_name as created_by_name
    FROM financial_ledger fl
    JOIN users u ON u.id = fl.seller_id
    LEFT JOIN users creator ON creator.id = fl.created_by
    WHERE fl.company_id=? AND fl.seller_id=?
    ORDER BY fl.created_at DESC
    LIMIT ?
  `).bind(company_id, seller_id, limit).all<any>();
  return rows.results || [];
}

/**
 * Get all seller balances for a company (used in investor dashboard)
 */
export async function getAllSellerBalances(
  db: D1Database,
  company_id: number
): Promise<{ seller_id: number; seller_name: string; balance: number; total_allocated: number; total_paid: number; total_gb: number }[]> {
  const rows = await db.prepare(`
    SELECT
      fl.seller_id,
      u.full_name as seller_name,
      COALESCE(SUM(fl.money_amount), 0) as balance,
      COALESCE(SUM(CASE WHEN fl.transaction_type='allocation' THEN fl.money_amount ELSE 0 END), 0) as total_allocated,
      COALESCE(SUM(CASE WHEN fl.transaction_type='payment' THEN ABS(fl.money_amount) ELSE 0 END), 0) as total_paid,
      COALESCE(SUM(CASE WHEN fl.transaction_type='allocation' THEN fl.gb_amount ELSE 0 END), 0) as total_gb
    FROM financial_ledger fl
    JOIN users u ON u.id = fl.seller_id
    WHERE fl.company_id=?
    GROUP BY fl.seller_id, u.full_name
    ORDER BY balance DESC
  `).bind(company_id).all<any>();
  return rows.results || [];
}

/**
 * Get company-wide ledger summary (used in investor dashboard header)
 */
export async function getCompanyLedgerSummary(
  db: D1Database,
  company_id: number
): Promise<{
  total_gb_allocated: number;
  total_price: number;
  total_paid: number;
  total_remain: number;
}> {
  const row = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN transaction_type='allocation' THEN gb_amount ELSE 0 END), 0) as total_gb_allocated,
      COALESCE(SUM(CASE WHEN transaction_type='allocation' THEN money_amount ELSE 0 END), 0) as total_price,
      COALESCE(SUM(CASE WHEN transaction_type='payment'    THEN ABS(money_amount) ELSE 0 END), 0) as total_paid,
      COALESCE(SUM(money_amount), 0) as total_remain
    FROM financial_ledger
    WHERE company_id=?
  `).bind(company_id).first<any>();

  return {
    total_gb_allocated: row?.total_gb_allocated ?? 0,
    total_price:        row?.total_price        ?? 0,
    total_paid:         row?.total_paid         ?? 0,
    total_remain:       row?.total_remain        ?? 0,
  };
}
