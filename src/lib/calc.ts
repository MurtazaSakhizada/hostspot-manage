// ============================================
// Calculation Engine - LOCKED LOGIC (NO EXCEPTIONS)
// ============================================

export interface CalcInput {
  size_gb: number;
  quantity: number;
  sale_price_per_gb: number;
  commission_rate: number;
}

export interface CalcResult {
  total_gb: number;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
}

/**
 * SINGLE SOURCE OF TRUTH for all financial calculations.
 * Used for inventory, allocations, sales, reports, PDFs.
 */
export function calculate(input: CalcInput): CalcResult {
  const total_gb = input.size_gb * input.quantity;
  const gross_amount = total_gb * input.sale_price_per_gb;
  const commission_amount = gross_amount * input.commission_rate;
  const net_amount = gross_amount - commission_amount;
  return {
    total_gb: round2(total_gb),
    gross_amount: round2(gross_amount),
    commission_amount: round2(commission_amount),
    net_amount: round2(net_amount),
  };
}

/**
 * Multi-line calculation (multiple packages in one transaction)
 */
export interface LineItem {
  size_gb: number;
  quantity: number;
  sale_price_per_gb: number;
  commission_rate: number;
}

export interface MultiCalcResult {
  total_gb: number;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  lines: CalcResult[];
}

export function calculateMulti(items: LineItem[]): MultiCalcResult {
  const lines = items.map(calculate);
  return {
    total_gb: round2(lines.reduce((s, l) => s + l.total_gb, 0)),
    gross_amount: round2(lines.reduce((s, l) => s + l.gross_amount, 0)),
    commission_amount: round2(lines.reduce((s, l) => s + l.commission_amount, 0)),
    net_amount: round2(lines.reduce((s, l) => s + l.net_amount, 0)),
    lines,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Format numbers for display
export function formatGB(n: number): string {
  // Always show in GB - never convert to TB
  return n.toFixed(n % 1 === 0 ? 0 : 2) + ' GB';
}

export function formatMoney(n: number, symbol = '؋'): string {
  return symbol + ' ' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
