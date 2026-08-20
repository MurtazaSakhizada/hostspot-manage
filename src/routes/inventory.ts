// ============================================
// Inventory Routes - Batch Entry + History
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { calculate, formatGB, formatMoney } from '../lib/calc';
import { createNotification } from './notifications';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const inventory = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Shared filter helper (same pattern as dashboard) ─────────
function buildDateFilter(period: string, col: string, from: string, to: string) {
  if (from && to)  return `AND date(${col}) BETWEEN '${from}' AND '${to}'`;
  if (from)        return `AND date(${col}) >= '${from}'`;
  if (to)          return `AND date(${col}) <= '${to}'`;
  if (period === 'today') return `AND date(${col}) = date('now')`;
  if (period === 'week')  return `AND ${col} >= datetime('now','-7 days')`;
  if (period === 'month') return `AND ${col} >= datetime('now','-30 days')`;
  if (period === 'year')  return `AND ${col} >= datetime('now','-365 days')`;
  return '';
}

function buildPeriodBar(period: string, base: string, from: string, to: string, extra = '') {
  const periods = ['today','week','month','year','all'];
  const labels: Record<string,string> = {
    today:'امروز', week:'این هفته', month:'این ماه', year:'امسال', all:'همه وقت'
  };
  const btns = periods.map(p => {
    const active = period === p && !from && !to;
    return `<a href="${base}?period=${p}${extra}"
        class="btn btn-sm ${active?'btn-primary':'btn-outline'}"
        style="white-space:nowrap">📅 ${labels[p]}</a>`;
  }).join('');
  return `
  <form method="GET" action="${base}" style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:1.25rem">
    ${extra ? extra.replace(/^&/,'').split('&').map((kv:string) => {
      const [k,v] = kv.split('=');
      return `<input type="hidden" name="${k}" value="${v||''}">`;
    }).join('') : ''}
    ${btns}
    <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;margin-right:.5rem">
      <label style="font-size:.8rem;color:var(--text-muted);white-space:nowrap">از تاریخ:</label>
      <input type="date" name="from" value="${from}"
        style="padding:.3rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.82rem;background:var(--bg-secondary);color:var(--text-primary)">
      <label style="font-size:.8rem;color:var(--text-muted);white-space:nowrap">تا تاریخ:</label>
      <input type="date" name="to" value="${to}"
        style="padding:.3rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.82rem;background:var(--bg-secondary);color:var(--text-primary)">
      <button type="submit" class="btn btn-sm btn-primary" style="white-space:nowrap">🔍 اعمال</button>
      ${(from||to)?`<a href="${base}?period=${period}${extra}" class="btn btn-sm btn-outline">✕ پاک‌کردن</a>`:''}
    </div>
  </form>`;
}

// ============================================================
// Main page: Owner sees full stock batches; Seller sees own allocations
// ============================================================
inventory.get('/', async (c) => {
  const user   = c.get('user');
  const lang   = c.get('lang');
  const period = c.req.query('period') ?? 'all';
  const from   = c.req.query('from')   ?? '';
  const to     = c.req.query('to')     ?? '';

  // ── SELLER VIEW: shows their own allocated stock ──────────
  if (user.role !== 'owner') {
    // For seller: filter allocation_batches by created_at
    const df = buildDateFilter(period, 'ab.created_at', from, to);

    const [allocBatches, allocTotals, soldTotals] = await Promise.all([
      c.env.DB.prepare(`
        SELECT ab.*, br.name as branch_name,
          (SELECT COUNT(*) FROM allocation_batch_lines WHERE batch_id=ab.id) as line_count
        FROM allocation_batches ab
        JOIN branches br ON br.id = ab.branch_id
        WHERE ab.company_id=? AND ab.seller_id=? ${df}
        ORDER BY ab.created_at DESC`).bind(user.company_id, user.id).all<any>(),

      c.env.DB.prepare(`
        SELECT COALESCE(SUM(total_gb),0) as gb,
               COALESCE(SUM(total_gross),0) as gross,
               COUNT(*) as batches
        FROM allocation_batches ab WHERE company_id=? AND seller_id=? ${df}`)
        .bind(user.company_id, user.id).first<any>(),

      c.env.DB.prepare(`
        SELECT COALESCE(SUM(total_gb),0) as sold_gb
        FROM sales WHERE company_id=? AND seller_id=?`)
        .bind(user.company_id, user.id).first<any>(),
    ]);

    const allocatedGb = allocTotals?.gb ?? 0;
    const soldGb      = soldTotals?.sold_gb ?? 0;
    const remainingGb = Math.max(0, allocatedGb - soldGb);

    const allocRows = await Promise.all((allocBatches.results || []).map(async (ab: any, i: number) => {
      const lines = await c.env.DB.prepare(`
        SELECT abl.*, p.name as pkg_name
        FROM allocation_batch_lines abl
        JOIN packages p ON p.id = abl.package_id
        WHERE abl.batch_id=?`).bind(ab.id).all<any>();

      const lineRows = (lines.results || []).map((l: any) => `
        <div style="display:flex;gap:1rem;align-items:center;padding:.35rem 0;border-bottom:1px solid var(--border)">
          <span class="badge badge-primary" style="min-width:80px;text-align:center">${l.pkg_name}</span>
          <span>${l.quantity} × ${l.size_gb}GB</span>
          <span class="text-primary font-bold">= ${formatGB(l.total_gb)}</span>
          <span style="margin-left:auto" class="text-warning">${formatMoney(l.commission_amount)} ${t(lang,'commission_amount')}</span>
        </div>`).join('');

      return `
      <tr>
        <td>
          <div class="font-bold">${new Date(ab.created_at).toLocaleDateString('en-GB')}</div>
          <div style="font-size:.75rem;color:var(--text-muted)">${new Date(ab.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
        </td>
        <td><strong>${ab.branch_name}</strong></td>
        <td><span class="badge badge-info">${ab.line_count} ${t(lang,'pkg_types')}${ab.line_count>1&&lang==='en'?'s':''}</span></td>
        <td class="text-primary font-bold">${formatGB(ab.total_gb)}</td>
        <td class="text-warning font-bold">${Math.round(ab.commission_rate * 100)}%</td>
        <td style="max-width:200px;color:var(--text-muted);font-size:.82rem">${ab.notes||'—'}</td>
        <td>
          <button onclick="toggleRow('alloc-inv-${i}')" class="btn btn-outline btn-sm">📋 ${t(lang,'details')}</button>
        </td>
      </tr>
      <tr id="alloc-inv-${i}" class="hidden">
        <td colspan="7" style="background:var(--gray-50);padding:.875rem 1rem">
          <div style="font-size:.82rem;font-weight:600;color:var(--text-muted);margin-bottom:.5rem">📦 ${t(lang,'package_breakdown')}</div>
          ${lineRows || `<div style="color:var(--text-muted)">${t(lang,'no_data')}</div>`}
          ${ab.notes?`<div style="margin-top:.5rem;font-size:.82rem"><strong>${t(lang,'notes')}:</strong> ${ab.notes}</div>`:''}
        </td>
      </tr>`;
    }));

    const emptyRow = `<tr><td colspan="7"><div class="empty-state">
      <div class="empty-state-icon">📦</div>
      <h3>${t(lang,'no_data')}</h3>
      <p>${t(lang,'no_allocated_stock')}</p>
    </div></td></tr>`;

    return c.html(pageShell({
      title: t(lang, 'inventory'), lang, user, activePage: 'inventory',
      body: `
      <div class="page-header">
        <div>
          <div class="page-title">📦 ${t(lang,'inventory')}</div>
          <div class="page-subtitle">${t(lang,'your_allocated_stock')}</div>
        </div>
        <a href="/sales/add" class="btn btn-primary">+ ${t(lang,'add_sale')}</a>
      </div>

      ${buildPeriodBar(period, '/inventory', from, to)}

      <!-- KPI Cards -->
      <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:1.25rem">
        <div class="stat-card">
          <div class="stat-card-accent" style="background:#7c3aed"></div>
          <div class="stat-label">📦 ${t(lang,'total_allocated')}</div>
          <div class="stat-value" style="color:#7c3aed">${formatGB(allocatedGb)}</div>
          <div class="stat-sub">${allocTotals?.batches ?? 0} ${t(lang,'batches')}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-accent" style="background:var(--success)"></div>
          <div class="stat-label">📤 ${t(lang,'total_sold')}</div>
          <div class="stat-value success">${formatGB(soldGb)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-accent" style="background:var(--primary)"></div>
          <div class="stat-label">🟢 ${t(lang,'available_gb')}</div>
          <div class="stat-value primary">${formatGB(remainingGb)}</div>
        </div>
      </div>

      <!-- Allocation Batches Table -->
      <div class="card">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;padding:.875rem 1rem;border-bottom:1px solid var(--border)">
          <div style="font-weight:600;font-size:.95rem">📋 ${t(lang,'allocation_history')}</div>
          <div style="font-size:.8rem;color:var(--text-muted)">${t(lang,'each_row_batch')}</div>
        </div>
        <div class="table-wrapper">
          <table>
            <thead><tr>
              <th>${t(lang,'date')}</th>
              <th>${t(lang,'branch')}</th>
              <th>${t(lang,'packages')}</th>
              <th>${t(lang,'total_gb')}</th>
              <th>${t(lang,'commission_rate')}</th>
              <th>${t(lang,'notes')}</th>
              <th>${t(lang,'actions')}</th>
            </tr></thead>
            <tbody>${allocRows.join('') || emptyRow}</tbody>
          </table>
        </div>
      </div>`
    }));
  }

  // ── OWNER VIEW: full company stock batches ─────────────────
  const tab = new URL(c.req.url).searchParams.get('tab') ?? 'history';
  const ownerDf = buildDateFilter(period, 'b.created_at', from, to);
  const ownerDfTotals = buildDateFilter(period, 'created_at', from, to);

  // ---- Batch history ----
  const batches = await c.env.DB.prepare(`
    SELECT b.*, br.name as branch_name,
      (SELECT COUNT(*) FROM inventory_batch_lines WHERE batch_id=b.id) as line_count
    FROM inventory_batches b
    JOIN branches br ON br.id = b.branch_id
    WHERE b.company_id=? ${ownerDf}
    ORDER BY b.created_at DESC`).bind(user.company_id).all<any>();

  // ---- Grand totals from batches (filtered) ----
  const totals = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb,
           COALESCE(SUM(total_gross),0) as gross,
           COALESCE(SUM(total_net),0) as net
    FROM inventory_batches WHERE company_id=? ${ownerDfTotals}`)
    .bind(user.company_id).first<any>();

  // ---- Build batch rows ----
  const batchRows = await Promise.all((batches.results || []).map(async (b: any, i: number) => {
    const lines = await c.env.DB.prepare(`
      SELECT l.*, p.name as pkg_name
      FROM inventory_batch_lines l
      JOIN packages p ON p.id = l.package_id
      WHERE l.batch_id=?`).bind(b.id).all<any>();

    const lineRows = (lines.results || []).map((l: any) => `
      <div style="display:flex;gap:1rem;align-items:center;padding:.35rem 0;border-bottom:1px solid var(--border)">
        <span class="badge badge-primary" style="min-width:80px;text-align:center">${l.pkg_name}</span>
        <span>${l.quantity} × ${l.size_gb}GB</span>
        <span class="text-primary font-bold">= ${formatGB(l.total_gb)}</span>
        <span style="margin-left:auto" class="text-success">${formatMoney(l.gross_amount)}</span>
      </div>`).join('');

    return `
    <tr>
      <td>
        <div class="font-bold">${new Date(b.created_at).toLocaleDateString('en-GB')}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${new Date(b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
      </td>
      <td><strong>${b.branch_name}</strong></td>
      <td>
        <span class="badge badge-primary">${b.line_count} package type${b.line_count>1?'s':''}</span>
      </td>
      <td class="text-primary font-bold">${formatGB(b.total_gb)}</td>
      <td class="text-success font-bold">${formatMoney(b.total_gross)}</td>
      <td style="max-width:200px;color:var(--text-muted);font-size:.82rem">${b.notes||'—'}</td>
      <td>
        <button onclick="toggleRow('inv-batch-${i}')" class="btn btn-outline btn-sm">📋 Details</button>
        <a href="/inventory/${b.id}/edit" class="btn btn-outline btn-sm">✏️ ویرایش</a>
        <button onclick="confirmDelete('/api/inventory-batch/${b.id}','${t(lang,'confirm_delete')}')" class="btn btn-danger btn-sm">${t(lang,'delete')}</button>
      </td>
    </tr>
    <tr id="inv-batch-${i}" class="hidden">
      <td colspan="7" style="background:var(--gray-50);padding:.875rem 1rem">
        <div style="font-size:.82rem;font-weight:600;color:var(--text-muted);margin-bottom:.5rem">📦 Package Breakdown</div>
        ${lineRows || '<div style="color:var(--text-muted)">No lines</div>'}
        ${b.notes?`<div style="margin-top:.5rem;font-size:.82rem"><strong>Note:</strong> ${b.notes}</div>`:''}
      </td>
    </tr>`;
  }));

  const batchTableBody = batchRows.join('') || `
    <tr><td colspan="7">
      <div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <h3>${t(lang,'no_data')}</h3>
        <p>No stock entries yet. Click "+ Add Stock" to begin.</p>
      </div>
    </td></tr>`;

  return c.html(pageShell({
    title: t(lang, 'inventory'), lang, user, activePage: 'inventory',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">📦 ${t(lang,'inventory')}</div>
        <div class="page-subtitle">Stock-in history &amp; records</div>
      </div>
      <a href="/inventory/add" class="btn btn-primary">+ Add Stock (Batch)</a>
    </div>

    ${buildPeriodBar(period, '/inventory', from, to)}

    <!-- Summary Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <div class="stat-card">
        <div class="stat-label">Total GB In Stock</div>
        <div class="stat-value primary">${formatGB(totals?.gb ?? 0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Value</div>
        <div class="stat-value success">${formatMoney(totals?.gross ?? 0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Entries</div>
        <div class="stat-value">${batches.results?.length ?? 0}</div>
      </div>
    </div>

    <!-- Batch History Table -->
    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;padding:.875rem 1rem;border-bottom:1px solid var(--border)">
        <div style="font-weight:600;font-size:.95rem">📋 Stock-In History</div>
        <div style="font-size:.8rem;color:var(--text-muted)">Each row = one batch entry (multiple packages)</div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Date &amp; Time</th>
            <th>${t(lang,'branch')}</th>
            <th>Packages</th>
            <th>Total GB</th>
            <th>Total Value</th>
            <th>Notes</th>
            <th>${t(lang,'actions')}</th>
          </tr></thead>
          <tbody>${batchTableBody}</tbody>
        </table>
      </div>
    </div>`
  }));
});

// ============================================================
// Add Inventory - Batch Form (multiple packages at once)
// ============================================================
inventory.get('/add', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/inventory');

  const branches = await c.env.DB.prepare('SELECT * FROM branches WHERE company_id=? AND active=1').bind(user.company_id).all<any>();
  const packages = await c.env.DB.prepare('SELECT * FROM packages WHERE company_id=? AND active=1 ORDER BY size_gb ASC').bind(user.company_id).all<any>();

  // Get company purchase price
  const company = await c.env.DB.prepare('SELECT settings FROM companies WHERE id=?').bind(user.company_id).first<{settings:string}>();
  const settings = JSON.parse(company?.settings || '{}');
  const purchasePricePerGb: number = settings.purchase_price_per_gb ?? 0;

  const branchOpts = (branches.results||[]).map((b: any) => `<option value="${b.id}">${b.name}</option>`).join('');
  const pkgOptsForJS = JSON.stringify(
    Object.fromEntries((packages.results||[]).map((p: any) => [p.id, {name: p.name, gb: p.size_gb, price: p.sale_price_per_gb}]))
  );

  const hasPurchasePrice = purchasePricePerGb > 0;
  const purchasePriceLine = hasPurchasePrice
    ? `<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.5rem">
         Purchase price: <strong style="color:var(--warning)">${formatMoney(purchasePricePerGb)}/GB</strong>
         — costs shown in yellow below
       </div>`
    : `<div style="font-size:.78rem;color:var(--warning);margin-bottom:.5rem">
         ⚠️ No purchase price set. <a href="/settings" style="color:var(--primary)">Set it in Settings →</a> to track real profit.
       </div>`;

  // Build initial package rows (one per active package)
  const pkgRows = (packages.results||[]).map((p: any) => `
    <tr data-pkg-id="${p.id}" data-gb="${p.size_gb}" data-price="${p.sale_price_per_gb}">
      <td>
        <div class="font-bold">${p.name}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${p.size_gb} GB @ ${formatMoney(p.sale_price_per_gb)}/GB</div>
      </td>
      <td>
        <input type="number" name="qty_${p.id}" id="qty_${p.id}" min="0" value="0"
          class="qty-input" data-pkg="${p.id}"
          oninput="updateRow(${p.id})"
          style="width:80px;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;text-align:center;font-size:.9rem"/>
      </td>
      <td id="gb_${p.id}" class="text-primary font-bold">—</td>
      <td id="val_${p.id}" class="text-success">—</td>
      ${hasPurchasePrice ? `<td id="cost_${p.id}" class="text-warning" style="font-size:.85rem">—</td>` : ''}
    </tr>`).join('');

  return c.html(pageShell({
    title: 'Add Stock (Batch)', lang, user, activePage: 'inventory',
    body: `
    <div class="page-header">
      <div class="page-title">📦 Add Stock Entry (Batch)</div>
      <a href="/inventory" class="btn btn-outline">← Back</a>
    </div>
    <div class="card" style="max-width:700px">
      <form method="POST" action="/inventory" id="inv-form">

        <!-- Branch & Date -->
        <div class="form-row">
          <div class="form-group">
            <label>${t(lang,'branch')} *</label>
            <select name="branch_id" required>${branchOpts}</select>
          </div>
          <div class="form-group">
            <label>Entry Date</label>
            <input type="date" name="entry_date" value="${new Date().toISOString().split('T')[0]}"/>
          </div>
        </div>

        <!-- Package Quantities -->
        <div class="form-group">
          <label style="font-weight:600;font-size:.9rem">📋 Enter Quantities per Package</label>
          ${purchasePriceLine}
          <div class="table-wrapper" style="border:1px solid var(--border);border-radius:8px">
            <table>
              <thead><tr>
                <th>Package</th>
                <th>Quantity</th>
                <th>Total GB</th>
                <th>Sale Value</th>
                ${hasPurchasePrice ? `<th style="color:var(--warning)">Purchase Cost</th>` : ''}
              </tr></thead>
              <tbody>${pkgRows || `<tr><td colspan="${hasPurchasePrice?5:4}" style="text-align:center;color:var(--text-muted);padding:1rem">No packages configured. <a href="/packages">Add packages first →</a></td></tr>`}</tbody>
            </table>
          </div>
        </div>

        <!-- Notes -->
        <div class="form-group">
          <label>Notes (optional)</label>
          <textarea name="notes" rows="2" placeholder="e.g. Received from supplier, batch #123..."></textarea>
        </div>

        <!-- Live Summary -->
        <div class="calc-preview" id="batch-summary" style="display:none">
          <div style="font-size:.85rem;font-weight:600;margin-bottom:.75rem">📊 Batch Summary</div>
          <div class="calc-preview-grid" style="grid-template-columns:repeat(${hasPurchasePrice?4:3},1fr)">
            <div class="calc-item">
              <div class="calc-item-label">Packages Included</div>
              <div class="calc-item-value" id="sum-pkgs">0</div>
            </div>
            <div class="calc-item">
              <div class="calc-item-label">Total GB</div>
              <div class="calc-item-value main" id="sum-gb">0 GB</div>
            </div>
            <div class="calc-item">
              <div class="calc-item-label">Sale Value</div>
              <div class="calc-item-value" id="sum-val">؋ 0</div>
            </div>
            ${hasPurchasePrice ? `
            <div class="calc-item">
              <div class="calc-item-label" style="color:var(--warning)">Purchase Cost</div>
              <div class="calc-item-value" id="sum-cost" style="color:var(--warning)">؋ 0</div>
            </div>` : ''}
          </div>
        </div>

        <div class="modal-footer" style="border:none;padding:0;margin-top:1.25rem">
          <a href="/inventory" class="btn btn-outline">${t(lang,'cancel')}</a>
          <button type="submit" class="btn btn-primary" id="submit-btn" disabled>💾 Save Batch</button>
        </div>
      </form>
    </div>`,
    scripts: `<script>
    const PKGS = ${pkgOptsForJS};
    const PURCHASE_PRICE = ${purchasePricePerGb};

    function updateRow(pkgId) {
      const qty = parseInt(document.getElementById('qty_'+pkgId).value) || 0;
      const p = PKGS[pkgId];
      if (!p) return;
      const gb = p.gb * qty;
      const val = gb * p.price;
      const cost = gb * PURCHASE_PRICE;
      document.getElementById('gb_'+pkgId).textContent = qty > 0 ? gb.toFixed(gb%1===0?0:2)+' GB' : '—';
      document.getElementById('val_'+pkgId).textContent = qty > 0 ? '؋ '+val.toLocaleString() : '—';
      const costEl = document.getElementById('cost_'+pkgId);
      if (costEl) costEl.textContent = qty > 0 && PURCHASE_PRICE > 0 ? '؋ '+Math.round(cost).toLocaleString() : '—';
      updateSummary();
    }

    function updateSummary() {
      let totalGb = 0, totalVal = 0, pkgCount = 0;
      document.querySelectorAll('.qty-input').forEach(inp => {
        const qty = parseInt(inp.value) || 0;
        if (qty > 0) {
          const pkgId = inp.dataset.pkg;
          const p = PKGS[pkgId];
          if (p) {
            totalGb += p.gb * qty;
            totalVal += p.gb * qty * p.price;
            pkgCount++;
          }
        }
      });
      document.getElementById('sum-pkgs').textContent = pkgCount+' type'+(pkgCount!==1?'s':'');
      document.getElementById('sum-gb').textContent = totalGb.toFixed(totalGb%1===0?0:2)+' GB';
      document.getElementById('sum-val').textContent = '؋ '+Math.round(totalVal).toLocaleString();
      const costEl = document.getElementById('sum-cost');
      if (costEl && PURCHASE_PRICE > 0) costEl.textContent = '؋ '+Math.round(totalGb*PURCHASE_PRICE).toLocaleString();
      const summary = document.getElementById('batch-summary');
      const btn = document.getElementById('submit-btn');
      if (pkgCount > 0) {
        summary.style.display = '';
        btn.disabled = false;
      } else {
        summary.style.display = 'none';
        btn.disabled = true;
      }
    }
    </script>`
  }));
});

// ============================================================
// POST: Save Inventory Batch
// ============================================================
inventory.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'}, 403);

  const form = await c.req.formData();
  const branch_id = parseInt(form.get('branch_id')?.toString() ?? '0');
  const notes = form.get('notes')?.toString() ?? '';

  // Get all packages for this company + purchase price from settings
  const packages = await c.env.DB.prepare('SELECT * FROM packages WHERE company_id=? AND active=1').bind(user.company_id).all<any>();
  const co = await c.env.DB.prepare('SELECT settings FROM companies WHERE id=?').bind(user.company_id).first<{settings:string}>();
  const coSettings = JSON.parse(co?.settings || '{}');
  const purchasePricePerGb: number = coSettings.purchase_price_per_gb ?? 0;

  // Build lines from form data
  type LineData = { pkg_id: number; qty: number; size_gb: number; price: number };
  const lines: LineData[] = [];
  for (const pkg of (packages.results || [])) {
    const qty = parseInt(form.get(`qty_${pkg.id}`)?.toString() ?? '0') || 0;
    if (qty > 0) {
      lines.push({ pkg_id: pkg.id, qty, size_gb: pkg.size_gb, price: pkg.sale_price_per_gb });
    }
  }

  if (lines.length === 0) {
    return new Response(null, { status: 302, headers: { 'Location': '/inventory/add?err=empty' } });
  }

  // Calculate totals
  let totalGb = 0, totalGross = 0;
  for (const l of lines) {
    const calc = calculate({ size_gb: l.size_gb, quantity: l.qty, sale_price_per_gb: l.price, commission_rate: 0 });
    totalGb += calc.total_gb;
    totalGross += calc.gross_amount;
  }
  const totalPurchaseCost = Math.round(totalGb * purchasePricePerGb * 100) / 100;

  // Insert batch (now with purchase_cost + purchase_price_per_gb)
  const batch = await c.env.DB.prepare(`
    INSERT INTO inventory_batches (company_id, branch_id, total_gb, total_gross, total_net, purchase_cost, purchase_price_per_gb, notes)
    VALUES (?,?,?,?,?,?,?,?) RETURNING id`
  ).bind(
    user.company_id, branch_id,
    Math.round(totalGb * 100) / 100,
    Math.round(totalGross * 100) / 100,
    Math.round(totalGross * 100) / 100,
    totalPurchaseCost,
    purchasePricePerGb,
    notes || null
  ).first<{id:number}>();

  if (!batch) return c.json({error:'Failed to create batch'}, 500);

  // Insert lines
  for (const l of lines) {
    const calc = calculate({ size_gb: l.size_gb, quantity: l.qty, sale_price_per_gb: l.price, commission_rate: 0 });
    await c.env.DB.prepare(`
      INSERT INTO inventory_batch_lines (batch_id, company_id, package_id, quantity, size_gb, total_gb, price_per_gb, gross_amount)
      VALUES (?,?,?,?,?,?,?,?)`)
    .bind(batch.id, user.company_id, l.pkg_id, l.qty, l.size_gb, calc.total_gb, l.price, calc.gross_amount).run();

    // Also insert into legacy inventory table for backward compatibility
    await c.env.DB.prepare(`
      INSERT INTO inventory (company_id, branch_id, package_id, quantity, total_gb, gross_amount, commission_amount, net_amount, notes)
      VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(user.company_id, branch_id, l.pkg_id, l.qty, calc.total_gb, calc.gross_amount, 0, calc.gross_amount, `Batch #${batch.id}`).run();
  }

  // Create notification
  const branchRow = await c.env.DB.prepare('SELECT name FROM branches WHERE id=?').bind(branch_id).first<{name:string}>();
  await createNotification(c.env.DB, {
    company_id: user.company_id,
    type: 'success',
    category: 'inventory',
    title: 'Stock-In Recorded',
    message: `${formatGB(Math.round(totalGb*100)/100)} added to ${branchRow?.name ?? 'branch'} · Value: ${formatMoney(Math.round(totalGross*100)/100)}`,
    link: '/inventory'
  });

  return new Response(null, { status: 302, headers: { 'Location': '/inventory' } });
});

// ============================================================
// GET /inventory/:id/edit  — Edit form for an existing inventory batch
// ============================================================
inventory.get('/:id/edit', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/inventory');

  const id = c.req.param('id');
  const batch = await c.env.DB.prepare(
    'SELECT b.*, br.name as branch_name FROM inventory_batches b JOIN branches br ON br.id=b.branch_id WHERE b.id=? AND b.company_id=?'
  ).bind(id, user.company_id).first<any>();
  if (!batch) return c.redirect('/inventory');

  const lines = await c.env.DB.prepare(
    'SELECT l.*, p.name as pkg_name FROM inventory_batch_lines l JOIN packages p ON p.id=l.package_id WHERE l.batch_id=?'
  ).bind(id).all<any>();

  const packages = await c.env.DB.prepare(
    'SELECT * FROM packages WHERE company_id=? AND active=1 ORDER BY size_gb ASC'
  ).bind(user.company_id).all<any>();

  const branches = await c.env.DB.prepare(
    'SELECT * FROM branches WHERE company_id=? AND active=1 ORDER BY name ASC'
  ).bind(user.company_id).all<any>();

  const company = await c.env.DB.prepare('SELECT settings FROM companies WHERE id=?').bind(user.company_id).first<{settings:string}>();
  const settings = JSON.parse(company?.settings || '{}');
  const purchasePricePerGb: number = settings.purchase_price_per_gb ?? 0;

  // Build qty map from existing lines
  const qtyMap: Record<number, number> = {};
  for (const l of (lines.results || [])) qtyMap[l.package_id] = l.quantity;

  const branchOpts = (branches.results || []).map((b: any) =>
    `<option value="${b.id}" ${String(b.id) === String(batch.branch_id) ? 'selected' : ''}>${b.name}</option>`
  ).join('');

  const pkgOptsForJS = JSON.stringify(
    Object.fromEntries((packages.results || []).map((p: any) => [p.id, { name: p.name, gb: p.size_gb, price: p.sale_price_per_gb }]))
  );

  const hasPurchasePrice = purchasePricePerGb > 0;
  const purchasePriceLine = hasPurchasePrice
    ? `<div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.5rem">
         Purchase price: <strong style="color:var(--warning)">${formatMoney(purchasePricePerGb)}/GB</strong>
         — costs shown in yellow below
       </div>`
    : '';

  const pkgRows = (packages.results || []).map((p: any) => {
    const qty = qtyMap[p.id] ?? 0;
    return `
    <tr data-pkg-id="${p.id}" data-gb="${p.size_gb}" data-price="${p.sale_price_per_gb}">
      <td>
        <div class="font-bold">${p.name}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${p.size_gb} GB @ ${formatMoney(p.sale_price_per_gb)}/GB</div>
      </td>
      <td>
        <input type="number" name="qty_${p.id}" id="qty_${p.id}" min="0" value="${qty}"
          class="qty-input" data-pkg="${p.id}" oninput="updateRow(${p.id})"
          style="width:80px;padding:.35rem .5rem;border:1px solid var(--border);border-radius:6px;text-align:center;font-size:.9rem"/>
      </td>
      <td id="gb_${p.id}" class="text-primary font-bold">${qty > 0 ? (p.size_gb * qty).toFixed(p.size_gb * qty % 1 === 0 ? 0 : 2) + ' GB' : '—'}</td>
      <td id="val_${p.id}" class="text-success">${qty > 0 ? formatMoney(p.size_gb * qty * p.sale_price_per_gb) : '—'}</td>
      ${hasPurchasePrice ? `<td id="cost_${p.id}" class="text-warning" style="font-size:.85rem">${qty > 0 ? formatMoney(p.size_gb * qty * purchasePricePerGb) : '—'}</td>` : ''}
    </tr>`;
  }).join('');

  return c.html(pageShell({
    title: 'ویرایش انباری', lang, user, activePage: 'inventory',
    body: `
    <div class="page-header">
      <div class="page-title">✏️ ویرایش انباری #${batch.id}</div>
      <a href="/inventory" class="btn btn-outline">← بازگشت</a>
    </div>
    <div class="card" style="max-width:700px">
      <form method="POST" action="/inventory/${id}/edit" id="inv-form">

        <div class="form-row">
          <div class="form-group">
            <label>${t(lang,'branch')} *</label>
            <select name="branch_id" required>${branchOpts}</select>
          </div>
          <div class="form-group">
            <label>تاریخ ثبت</label>
            <input type="date" name="entry_date" value="${batch.created_at ? batch.created_at.split('T')[0] : new Date().toISOString().split('T')[0]}"/>
          </div>
        </div>

        <div class="form-group">
          <label style="font-weight:600;font-size:.9rem">📋 تعداد هر پکیج را وارد کنید</label>
          ${purchasePriceLine}
          <div class="table-wrapper" style="border:1px solid var(--border);border-radius:8px">
            <table>
              <thead><tr>
                <th>پکیج</th>
                <th>تعداد</th>
                <th>مجموع GB</th>
                <th>ارزش فروش</th>
                ${hasPurchasePrice ? `<th style="color:var(--warning)">هزینه خرید</th>` : ''}
              </tr></thead>
              <tbody>${pkgRows || `<tr><td colspan="${hasPurchasePrice ? 5 : 4}" style="text-align:center;color:var(--text-muted);padding:1rem">پکیجی یافت نشد. <a href="/packages">ابتدا پکیج اضافه کنید →</a></td></tr>`}</tbody>
            </table>
          </div>
        </div>

        <div class="form-group">
          <label>یادداشت (اختیاری)</label>
          <textarea name="notes" rows="2">${batch.notes || ''}</textarea>
        </div>

        <div class="calc-preview" id="batch-summary">
          <div style="font-size:.85rem;font-weight:600;margin-bottom:.75rem">📊 خلاصه انباری</div>
          <div class="calc-preview-grid" style="grid-template-columns:repeat(${hasPurchasePrice ? 4 : 3},1fr)">
            <div class="calc-item">
              <div class="calc-item-label">تعداد پکیج</div>
              <div class="calc-item-value" id="sum-pkgs">—</div>
            </div>
            <div class="calc-item">
              <div class="calc-item-label">مجموع GB</div>
              <div class="calc-item-value main" id="sum-gb">—</div>
            </div>
            <div class="calc-item">
              <div class="calc-item-label">ارزش فروش</div>
              <div class="calc-item-value" id="sum-val">—</div>
            </div>
            ${hasPurchasePrice ? `
            <div class="calc-item">
              <div class="calc-item-label" style="color:var(--warning)">هزینه خرید</div>
              <div class="calc-item-value" id="sum-cost" style="color:var(--warning)">—</div>
            </div>` : ''}
          </div>
        </div>

        <div class="modal-footer" style="border:none;padding:0;margin-top:1.25rem">
          <a href="/inventory" class="btn btn-outline">انصراف</a>
          <button type="submit" class="btn btn-primary" id="submit-btn">💾 ذخیره تغییرات</button>
        </div>
      </form>
    </div>`,
    scripts: `<script>
    const PKGS = ${pkgOptsForJS};
    const PURCHASE_PRICE = ${purchasePricePerGb};

    function updateRow(pkgId) {
      const qty = parseInt(document.getElementById('qty_'+pkgId).value) || 0;
      const p = PKGS[pkgId];
      if (!p) return;
      const gb = p.gb * qty;
      const val = gb * p.price;
      const cost = gb * PURCHASE_PRICE;
      document.getElementById('gb_'+pkgId).textContent = qty > 0 ? gb.toFixed(gb%1===0?0:2)+' GB' : '—';
      document.getElementById('val_'+pkgId).textContent = qty > 0 ? '؋ '+Math.round(val).toLocaleString() : '—';
      const costEl = document.getElementById('cost_'+pkgId);
      if (costEl) costEl.textContent = qty > 0 && PURCHASE_PRICE > 0 ? '؋ '+Math.round(cost).toLocaleString() : '—';
      updateSummary();
    }

    function updateSummary() {
      let totalGb = 0, totalVal = 0, pkgCount = 0;
      document.querySelectorAll('.qty-input').forEach(inp => {
        const qty = parseInt(inp.value) || 0;
        if (qty > 0) {
          const p = PKGS[inp.dataset.pkg];
          if (p) { totalGb += p.gb * qty; totalVal += p.gb * qty * p.price; pkgCount++; }
        }
      });
      document.getElementById('sum-pkgs').textContent = pkgCount + ' نوع';
      document.getElementById('sum-gb').textContent = totalGb.toFixed(totalGb%1===0?0:2)+' GB';
      document.getElementById('sum-val').textContent = '؋ '+Math.round(totalVal).toLocaleString();
      const costEl = document.getElementById('sum-cost');
      if (costEl && PURCHASE_PRICE > 0) costEl.textContent = '؋ '+Math.round(totalGb*PURCHASE_PRICE).toLocaleString();
    }

    // Init calculations on page load
    document.querySelectorAll('.qty-input').forEach(inp => {
      if ((parseInt(inp.value)||0) > 0) updateRow(inp.dataset.pkg);
    });
    updateSummary();
    </script>`
  }));
});

// ============================================================
// POST /inventory/:id/edit  — Save edited inventory batch
// ============================================================
inventory.post('/:id/edit', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Forbidden' }, 403);

  const id = c.req.param('id');
  const batch = await c.env.DB.prepare(
    'SELECT * FROM inventory_batches WHERE id=? AND company_id=?'
  ).bind(id, user.company_id).first<any>();
  if (!batch) return c.redirect('/inventory');

  const form = await c.req.formData();
  const branch_id = parseInt(form.get('branch_id')?.toString() ?? '0');
  const notes = form.get('notes')?.toString() ?? '';

  const packages = await c.env.DB.prepare(
    'SELECT * FROM packages WHERE company_id=? AND active=1'
  ).bind(user.company_id).all<any>();

  const co = await c.env.DB.prepare('SELECT settings FROM companies WHERE id=?').bind(user.company_id).first<{settings:string}>();
  const coSettings = JSON.parse(co?.settings || '{}');
  const purchasePricePerGb: number = coSettings.purchase_price_per_gb ?? 0;

  // Build lines from form data
  type LineData = { pkg_id: number; qty: number; size_gb: number; price: number };
  const lines: LineData[] = [];
  for (const pkg of (packages.results || [])) {
    const qty = parseInt(form.get(`qty_${pkg.id}`)?.toString() ?? '0') || 0;
    if (qty > 0) {
      lines.push({ pkg_id: pkg.id, qty, size_gb: pkg.size_gb, price: pkg.sale_price_per_gb });
    }
  }

  if (lines.length === 0) {
    return new Response(null, { status: 302, headers: { 'Location': `/inventory/${id}/edit?err=empty` } });
  }

  // Recalculate totals
  let totalGb = 0, totalGross = 0;
  for (const l of lines) {
    const calc = calculate({ size_gb: l.size_gb, quantity: l.qty, sale_price_per_gb: l.price, commission_rate: 0 });
    totalGb += calc.total_gb;
    totalGross += calc.gross_amount;
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const totalPurchaseCost = round2(totalGb * purchasePricePerGb);

  // Update batch header
  await c.env.DB.prepare(`
    UPDATE inventory_batches
    SET branch_id=?, total_gb=?, total_gross=?, total_net=?, purchase_cost=?, purchase_price_per_gb=?, notes=?
    WHERE id=? AND company_id=?`
  ).bind(
    branch_id,
    round2(totalGb),
    round2(totalGross),
    round2(totalGross),
    totalPurchaseCost,
    purchasePricePerGb,
    notes || null,
    id,
    user.company_id
  ).run();

  // Replace lines: delete old, insert new
  await c.env.DB.prepare('DELETE FROM inventory_batch_lines WHERE batch_id=?').bind(id).run();
  for (const l of lines) {
    const calc = calculate({ size_gb: l.size_gb, quantity: l.qty, sale_price_per_gb: l.price, commission_rate: 0 });
    await c.env.DB.prepare(`
      INSERT INTO inventory_batch_lines (batch_id, company_id, package_id, quantity, size_gb, total_gb, price_per_gb, gross_amount)
      VALUES (?,?,?,?,?,?,?,?)`
    ).bind(parseInt(id), user.company_id, l.pkg_id, l.qty, l.size_gb, calc.total_gb, l.price, calc.gross_amount).run();
  }

  return new Response(null, { status: 302, headers: { 'Location': '/inventory' } });
});

// ============================================================
// DELETE: Remove an entire batch (and its lines)
// ============================================================
inventory.delete('/api/inventory-batch/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'}, 403);
  const id = c.req.param('id');

  // Verify ownership
  const batch = await c.env.DB.prepare('SELECT * FROM inventory_batches WHERE id=? AND company_id=?').bind(id, user.company_id).first<any>();
  if (!batch) return c.json({error:'Not found'}, 404);

  await c.env.DB.prepare('DELETE FROM inventory_batch_lines WHERE batch_id=?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM inventory_batches WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success: true});
});

// Keep legacy delete for old records
inventory.delete('/api/inventory/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'}, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM inventory WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success: true});
});

export default inventory;
