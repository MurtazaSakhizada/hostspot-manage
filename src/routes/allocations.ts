// ============================================
// Allocations Routes - Batch Allocation + History
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { calculate, formatGB, formatMoney } from '../lib/calc';
import { createNotification } from './notifications';
import { createLedgerEntry } from '../lib/ledger';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const allocations = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Shared date-filter helper ─────────────────────────────
function buildAllocDateFilter(period: string, col: string, from: string, to: string) {
  if (from && to)  return `AND date(${col}) BETWEEN '${from}' AND '${to}'`;
  if (from)        return `AND date(${col}) >= '${from}'`;
  if (to)          return `AND date(${col}) <= '${to}'`;
  if (period === 'today') return `AND date(${col}) = date('now')`;
  if (period === 'week')  return `AND ${col} >= datetime('now','-7 days')`;
  if (period === 'month') return `AND ${col} >= datetime('now','-30 days')`;
  if (period === 'year')  return `AND ${col} >= datetime('now','-365 days')`;
  return '';
}

function buildAllocPeriodBar(period: string, from: string, to: string) {
  const periods = ['today','week','month','year','all'];
  const labels: Record<string,string> = {
    today:'امروز', week:'این هفته', month:'این ماه', year:'امسال', all:'همه وقت'
  };
  const btns = periods.map(p => {
    const active = period === p && !from && !to;
    return `<a href="/allocations?period=${p}"
        class="btn btn-sm ${active?'btn-primary':'btn-outline'}"
        style="white-space:nowrap">📅 ${labels[p]}</a>`;
  }).join('');
  return `
  <form method="GET" action="/allocations" style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:1.25rem">
    ${btns}
    <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;margin-right:.5rem">
      <label style="font-size:.8rem;color:var(--text-muted);white-space:nowrap">از تاریخ:</label>
      <input type="date" name="from" value="${from}"
        style="padding:.3rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.82rem;background:var(--bg-secondary);color:var(--text-primary)">
      <label style="font-size:.8rem;color:var(--text-muted);white-space:nowrap">تا تاریخ:</label>
      <input type="date" name="to" value="${to}"
        style="padding:.3rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.82rem;background:var(--bg-secondary);color:var(--text-primary)">
      <button type="submit" class="btn btn-sm btn-primary" style="white-space:nowrap">🔍 اعمال</button>
      ${(from||to)?`<a href="/allocations?period=${period}" class="btn btn-sm btn-outline">✕ پاک‌کردن</a>`:''}
    </div>
  </form>`;
}

// ============================================================
// Main page: Allocation Batch History
// ============================================================
allocations.get('/', async (c) => {
  const user   = c.get('user');
  const lang   = c.get('lang');
  const period = c.req.query('period') ?? 'all';
  const from   = c.req.query('from')   ?? '';
  const to     = c.req.query('to')     ?? '';

  const sellerFilter = user.role === 'seller' ? `AND ab.seller_id = ${user.id}` : '';
  const dateFilter   = buildAllocDateFilter(period, 'ab.created_at', from, to);

  // ---- Batch history ----
  const batches = await c.env.DB.prepare(`
    SELECT ab.*, u.full_name as seller_name, br.name as branch_name,
      (SELECT COUNT(*) FROM allocation_batch_lines WHERE batch_id=ab.id) as line_count
    FROM allocation_batches ab
    JOIN users u ON u.id = ab.seller_id
    JOIN branches br ON br.id = ab.branch_id
    WHERE ab.company_id=? ${sellerFilter} ${dateFilter}
    ORDER BY ab.created_at DESC`).bind(user.company_id).all<any>();

  // ---- Grand totals (filtered) ----
  const dfTotals = buildAllocDateFilter(period, 'created_at', from, to);
  const sfTotals = user.role === 'seller' ? `AND seller_id = ${user.id}` : '';
  const totals = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb,
           COALESCE(SUM(total_gross),0) as gross,
           COALESCE(SUM(total_commission),0) as comm,
           COALESCE(SUM(total_net),0) as net
    FROM allocation_batches WHERE company_id=? ${sfTotals} ${dfTotals}`)
    .bind(user.company_id).first<any>();

  // ---- Build batch details (load lines for each batch) ----
  const batchesWithLines: Array<{batch: any; lineRows: string}> = [];
  for (const b of (batches.results || [])) {
    const lines = await c.env.DB.prepare(`
      SELECT l.*, p.name as pkg_name
      FROM allocation_batch_lines l
      JOIN packages p ON p.id = l.package_id
      WHERE l.batch_id=?`).bind(b.id).all<any>();

    const lineRows = (lines.results || []).map((l: any) => `
      <div style="display:flex;gap:1rem;align-items:center;padding:.35rem 0;border-bottom:1px solid var(--border)">
        <span class="badge badge-primary" style="min-width:80px;text-align:center">${l.pkg_name}</span>
        <span>${l.quantity} × ${l.size_gb} GB</span>
        <span class="text-primary font-bold">= ${formatGB(l.total_gb)}</span>
        ${user.role==='owner'?`
        <span style="color:var(--text-muted)">| ${formatMoney(l.gross_amount)}</span>
        <span class="text-warning">- ${formatMoney(l.commission_amount)} comm</span>
        <span class="text-success font-bold" style="margin-left:auto">= ${formatMoney(l.net_amount)}</span>
        `:`<span class="text-success" style="margin-left:auto">${formatMoney(l.net_amount)}</span>`}
      </div>`).join('');

    batchesWithLines.push({ batch: b, lineRows });
  }

  const colCount = user.role === 'owner' ? 8 : 5;

  // ---- Group by seller (owner) or flat (seller) ----
  let batchTableBody = '';
  if (user.role === 'owner') {
    // Group batches by seller name
    const grouped: Record<string, typeof batchesWithLines> = {};
    for (const entry of batchesWithLines) {
      const key = entry.batch.seller_name || 'نامشخص';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(entry);
    }

    let batchIdx = 0;
    const groupedRows = Object.entries(grouped).map(([sellerName, entries]) => {
      const sellerGb = entries.reduce((s, e) => s + e.batch.total_gb, 0);
      const sellerGross = entries.reduce((s, e) => s + e.batch.total_gross, 0);
      const sellerComm = entries.reduce((s, e) => s + e.batch.total_commission, 0);
      const sellerNet = entries.reduce((s, e) => s + e.batch.total_net, 0);

      const itemRows = entries.map(({ batch: b, lineRows }) => {
        const i = batchIdx++;
        const commPct = Math.round((b.commission_rate || 0) * 100);
        return `
        <tr>
          <td style="padding-right:1.5rem">
            <div class="font-bold">${new Date(b.created_at).toLocaleDateString('en-GB')}</div>
            <div style="font-size:.75rem;color:var(--text-muted)">${new Date(b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
          </td>
          <td><div style="font-size:.8rem;color:var(--text-muted)">${b.branch_name}</div></td>
          <td><span class="badge badge-primary">${b.line_count} type${b.line_count>1?'s':''}</span></td>
          <td class="text-primary font-bold">${formatGB(b.total_gb)}</td>
          <td>${formatMoney(b.total_gross)}</td>
          <td class="text-warning">${formatMoney(b.total_commission)} <span class="badge badge-warning">${commPct}%</span></td>
          <td class="text-success font-bold">${formatMoney(b.total_net)}</td>
          <td>
            <button onclick="toggleRow('al-batch-${i}')" class="btn btn-outline btn-sm">📋 Details</button>
            <button onclick="confirmDelete('/api/allocation-batch/${b.id}','${t(lang,'confirm_delete')}')" class="btn btn-danger btn-sm">${t(lang,'delete')}</button>
          </td>
        </tr>
        <tr id="al-batch-${i}" class="hidden">
          <td colspan="${colCount}" style="background:var(--gray-50);padding:.875rem 1rem">
            <div style="font-size:.82rem;font-weight:600;color:var(--text-muted);margin-bottom:.5rem">📦 Package Breakdown</div>
            ${lineRows || '<div style="color:var(--text-muted)">No lines</div>'}
            ${b.notes?`<div style="margin-top:.5rem;font-size:.82rem"><strong>Note:</strong> ${b.notes}</div>`:''}
          </td>
        </tr>`;
      }).join('');

      return `
      <tr style="background:var(--gray-50);border-top:2px solid var(--info,#0891b2)">
        <td colspan="${colCount}" style="padding:.6rem 1rem">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
            <div style="font-weight:700;font-size:1rem;color:var(--primary)">👤 ${sellerName}</div>
            <div style="display:flex;gap:1rem;font-size:.82rem;flex-wrap:wrap">
              <span>📶 <strong>${formatGB(sellerGb)}</strong></span>
              <span>💰 <strong>${formatMoney(sellerGross)}</strong></span>
              <span class="text-warning">کمیسیون: <strong>${formatMoney(sellerComm)}</strong></span>
              <span class="text-success">خالص: <strong>${formatMoney(sellerNet)}</strong></span>
              <span style="color:var(--text-muted)">${entries.length} تخصیص</span>
            </div>
          </div>
        </td>
      </tr>
      ${itemRows}`;
    }).join('');

    batchTableBody = groupedRows || `
      <tr><td colspan="${colCount}">
        <div class="empty-state">
          <div class="empty-state-icon">🔀</div>
          <h3>${t(lang,'no_data')}</h3>
          <p>No allocations yet. Click "+ Allocate" to begin.</p>
        </div>
      </td></tr>`;
  } else {
    // Seller view: flat list
    let flatIdx = 0;
    batchTableBody = batchesWithLines.map(({ batch: b, lineRows }) => {
      const i = flatIdx++;
      return `
      <tr>
        <td>
          <div class="font-bold">${new Date(b.created_at).toLocaleDateString('en-GB')}</div>
          <div style="font-size:.75rem;color:var(--text-muted)">${new Date(b.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
        </td>
        <td style="font-size:.8rem;color:var(--text-muted)">${b.branch_name}</td>
        <td><span class="badge badge-primary">${b.line_count} type${b.line_count>1?'s':''}</span></td>
        <td class="text-primary font-bold">${formatGB(b.total_gb)}</td>
        <td class="text-success font-bold">${formatMoney(b.total_net)}</td>
        <td>
          <button onclick="toggleRow('al-batch-${i}')" class="btn btn-outline btn-sm">📋 Details</button>
        </td>
      </tr>
      <tr id="al-batch-${i}" class="hidden">
        <td colspan="${colCount}" style="background:var(--gray-50);padding:.875rem 1rem">
          <div style="font-size:.82rem;font-weight:600;color:var(--text-muted);margin-bottom:.5rem">📦 Package Breakdown</div>
          ${lineRows || '<div style="color:var(--text-muted)">No lines</div>'}
          ${b.notes?`<div style="margin-top:.5rem;font-size:.82rem"><strong>Note:</strong> ${b.notes}</div>`:''}
        </td>
      </tr>`;
    }).join('') || `
      <tr><td colspan="${colCount}">
        <div class="empty-state">
          <div class="empty-state-icon">🔀</div>
          <h3>${t(lang,'no_data')}</h3>
        </div>
      </td></tr>`;
  }

  return c.html(pageShell({
    title: t(lang,'allocations'), lang, user, activePage: 'allocations',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">🔀 ${t(lang,'allocations')}</div>
        <div class="page-subtitle">Stock allocation history to sellers</div>
      </div>
      ${user.role==='owner'?`<a href="/allocations/add" class="btn btn-primary">+ Allocate to Seller</a>`:''}
    </div>

    ${buildAllocPeriodBar(period, from, to)}

    <!-- Summary Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <div class="stat-card">
        <div class="stat-label">${t(lang,'total_gb')}</div>
        <div class="stat-value primary">${formatGB(totals?.gb ?? 0)}</div>
      </div>
      ${user.role==='owner'?`
      <div class="stat-card">
        <div class="stat-label">${t(lang,'total_gross')}</div>
        <div class="stat-value">${formatMoney(totals?.gross ?? 0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t(lang,'total_commission')}</div>
        <div class="stat-value warning">${formatMoney(totals?.comm ?? 0)}</div>
      </div>`:''}
      <div class="stat-card">
        <div class="stat-label">${t(lang,'net_amount')}</div>
        <div class="stat-value success">${formatMoney(totals?.net ?? 0)}</div>
      </div>
    </div>

    <!-- Allocation History Table -->
    <div class="card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;padding:.875rem 1rem;border-bottom:1px solid var(--border)">
        <div style="font-weight:600;font-size:.95rem">📋 Allocation History</div>
        <div style="font-size:.8rem;color:var(--text-muted)">Each row = one allocation to a seller (multiple packages)</div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Date</th>
            <th>Branch</th>
            <th>Packages</th>
            <th>Total GB</th>
            ${user.role==='owner'?`<th>Gross</th><th>Commission</th><th>Net</th>`:`<th>Net</th>`}
            <th>${t(lang,'actions')}</th>
          </tr></thead>
          <tbody>${batchTableBody}</tbody>
        </table>
      </div>
    </div>`
  }));
});

// ============================================================
// Add Allocation - Batch Form (select seller, then multi-package)
// ============================================================
allocations.get('/add', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/allocations');

  const branches = await c.env.DB.prepare('SELECT * FROM branches WHERE company_id=? AND active=1').bind(user.company_id).all<any>();
  const packages = await c.env.DB.prepare('SELECT * FROM packages WHERE company_id=? AND active=1 ORDER BY size_gb ASC').bind(user.company_id).all<any>();
  const sellers = await c.env.DB.prepare("SELECT * FROM users WHERE company_id=? AND role='seller' AND active=1").bind(user.company_id).all<any>();

  const branchOpts = (branches.results||[]).map((b: any) => `<option value="${b.id}">${b.name}</option>`).join('');
  const sellerOpts = (sellers.results||[]).map((s: any) =>
    `<option value="${s.id}" data-rate="${s.commission_rate}">${s.full_name} (${Math.round(s.commission_rate*100)}% comm)</option>`
  ).join('');

  const pkgOptsForJS = JSON.stringify(
    Object.fromEntries((packages.results||[]).map((p: any) => [p.id, {name: p.name, gb: p.size_gb, price: p.sale_price_per_gb}]))
  );

  // Build package rows
  const pkgRows = (packages.results||[]).map((p: any) => `
    <tr data-pkg-id="${p.id}">
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
      <td id="gross_${p.id}">—</td>
      <td id="comm_${p.id}" class="text-warning">—</td>
      <td id="net_${p.id}" class="text-success font-bold">—</td>
    </tr>`).join('');

  return c.html(pageShell({
    title: 'Allocate to Seller', lang, user, activePage: 'allocations',
    body: `
    <div class="page-header">
      <div class="page-title">🔀 Allocate Stock to Seller (Batch)</div>
      <a href="/allocations" class="btn btn-outline">← Back</a>
    </div>
    <div class="card" style="max-width:750px">
      <form method="POST" action="/allocations" id="alloc-form">

        <!-- Seller, Branch -->
        <div class="form-row">
          <div class="form-group">
            <label>${t(lang,'seller')} *</label>
            <select name="seller_id" id="sel-sel" required onchange="updateAllRates()">${sellerOpts||'<option value="">No sellers found</option>'}</select>
          </div>
          <div class="form-group">
            <label>${t(lang,'branch')} *</label>
            <select name="branch_id" required>${branchOpts}</select>
          </div>
        </div>

        <!-- Commission rate display -->
        <div style="margin:-0.25rem 0 1rem;padding:.5rem .875rem;background:var(--gray-50);border-radius:8px;font-size:.85rem;display:flex;gap:.5rem;align-items:center">
          <span>Commission Rate:</span>
          <strong id="rate-display" class="text-warning">—</strong>
          <span style="color:var(--text-muted)">(auto-applied from seller profile)</span>
        </div>

        <!-- Package Quantities -->
        <div class="form-group">
          <label style="font-weight:600;font-size:.9rem">📋 Enter Quantities per Package</label>
          <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:.5rem">Leave 0 for packages not included in this allocation</div>
          <div class="table-wrapper" style="border:1px solid var(--border);border-radius:8px">
            <table>
              <thead><tr>
                <th>Package</th>
                <th>Quantity</th>
                <th>GB</th>
                <th>Gross</th>
                <th>Commission</th>
                <th>Net</th>
              </tr></thead>
              <tbody>${pkgRows || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:1rem">No packages. <a href="/packages">Add packages first →</a></td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <!-- Notes -->
        <div class="form-group">
          <label>Notes (optional)</label>
          <textarea name="notes" rows="2" placeholder="e.g. Weekly stock allocation..."></textarea>
        </div>

        <!-- Live Summary -->
        <div class="calc-preview" id="batch-summary" style="display:none">
          <div style="font-size:.85rem;font-weight:600;margin-bottom:.75rem">📊 Allocation Summary</div>
          <div class="calc-preview-grid" style="grid-template-columns:repeat(4,1fr)">
            <div class="calc-item">
              <div class="calc-item-label">Packages</div>
              <div class="calc-item-value" id="sum-pkgs">0</div>
            </div>
            <div class="calc-item">
              <div class="calc-item-label">Total GB</div>
              <div class="calc-item-value main" id="sum-gb">0 GB</div>
            </div>
            <div class="calc-item">
              <div class="calc-item-label">Total Gross</div>
              <div class="calc-item-value" id="sum-gross">؋ 0</div>
            </div>
            <div class="calc-item">
              <div class="calc-item-label">Commission</div>
              <div class="calc-item-value" id="sum-comm" style="color:var(--warning)">؋ 0</div>
            </div>
            <div class="calc-item" style="grid-column:1/-1;background:var(--success-bg,#f0fdf4);border-radius:8px">
              <div class="calc-item-label">Net to Owner</div>
              <div class="calc-item-value main" id="sum-net" style="color:var(--success)">؋ 0</div>
            </div>
          </div>
        </div>

        <div class="modal-footer" style="border:none;padding:0;margin-top:1.25rem">
          <a href="/allocations" class="btn btn-outline">${t(lang,'cancel')}</a>
          <button type="submit" class="btn btn-primary" id="submit-btn" disabled>💾 Save Allocation</button>
        </div>
      </form>
    </div>`,
    scripts: `<script>
    const PKGS = ${pkgOptsForJS};
    const SELLERS = {};
    document.querySelectorAll('#sel-sel option').forEach(o => { SELLERS[o.value] = parseFloat(o.dataset.rate||0); });

    function getRate() {
      const selId = document.getElementById('sel-sel').value;
      return SELLERS[selId] || 0;
    }

    function updateAllRates() {
      const rate = getRate();
      document.getElementById('rate-display').textContent = (rate*100).toFixed(0)+'%';
      document.querySelectorAll('.qty-input').forEach(inp => updateRow(inp.dataset.pkg));
    }

    function updateRow(pkgId) {
      const qty = parseInt(document.getElementById('qty_'+pkgId).value) || 0;
      const p = PKGS[pkgId];
      const rate = getRate();
      if (!p) return;
      const gb = p.gb * qty;
      const gross = gb * p.price;
      const comm = gross * rate;
      const net = gross - comm;
      document.getElementById('gb_'+pkgId).textContent    = qty>0 ? gb.toFixed(gb%1===0?0:2)+' GB' : '—';
      document.getElementById('gross_'+pkgId).textContent = qty>0 ? '؋ '+Math.round(gross).toLocaleString() : '—';
      document.getElementById('comm_'+pkgId).textContent  = qty>0 ? '؋ '+Math.round(comm).toLocaleString() : '—';
      document.getElementById('net_'+pkgId).textContent   = qty>0 ? '؋ '+Math.round(net).toLocaleString() : '—';
      updateSummary();
    }

    function updateSummary() {
      const rate = getRate();
      let totalGb=0, totalGross=0, totalComm=0, totalNet=0, pkgCount=0;
      document.querySelectorAll('.qty-input').forEach(inp => {
        const qty = parseInt(inp.value)||0;
        if (qty>0) {
          const p = PKGS[inp.dataset.pkg];
          if (p) {
            const gb = p.gb*qty, gross=gb*p.price, comm=gross*rate;
            totalGb+=gb; totalGross+=gross; totalComm+=comm; totalNet+=(gross-comm);
            pkgCount++;
          }
        }
      });
      document.getElementById('sum-pkgs').textContent  = pkgCount+' type'+(pkgCount!==1?'s':'');
      document.getElementById('sum-gb').textContent    = totalGb.toFixed(totalGb%1===0?0:2)+' GB';
      document.getElementById('sum-gross').textContent = '؋ '+Math.round(totalGross).toLocaleString();
      document.getElementById('sum-comm').textContent  = '؋ '+Math.round(totalComm).toLocaleString()+' ('+(rate*100).toFixed(0)+'%)';
      document.getElementById('sum-net').textContent   = '؋ '+Math.round(totalNet).toLocaleString();
      const show = pkgCount>0;
      document.getElementById('batch-summary').style.display = show?'':'none';
      document.getElementById('submit-btn').disabled = !show;
    }

    // init
    updateAllRates();
    </script>`
  }));
});

// ============================================================
// POST: Save Allocation Batch
// ============================================================
allocations.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'}, 403);

  const form = await c.req.formData();
  const seller_id = parseInt(form.get('seller_id')?.toString() ?? '0');
  const branch_id = parseInt(form.get('branch_id')?.toString() ?? '0');
  const notes = form.get('notes')?.toString() ?? '';

  const seller = await c.env.DB.prepare('SELECT * FROM users WHERE id=? AND company_id=?').bind(seller_id, user.company_id).first<any>();
  if (!seller) return c.json({error:'Seller not found'}, 404);

  const packages = await c.env.DB.prepare('SELECT * FROM packages WHERE company_id=? AND active=1').bind(user.company_id).all<any>();

  type LineData = { pkg_id: number; qty: number; size_gb: number; price: number };
  const lines: LineData[] = [];
  for (const pkg of (packages.results || [])) {
    const qty = parseInt(form.get(`qty_${pkg.id}`)?.toString() ?? '0') || 0;
    if (qty > 0) {
      lines.push({ pkg_id: pkg.id, qty, size_gb: pkg.size_gb, price: pkg.sale_price_per_gb });
    }
  }

  if (lines.length === 0) {
    return new Response(null, { status: 302, headers: { 'Location': '/allocations/add?err=empty' } });
  }

  const commRate = seller.commission_rate;
  let totalGb = 0, totalGross = 0, totalComm = 0, totalNet = 0;
  for (const l of lines) {
    const calc = calculate({ size_gb: l.size_gb, quantity: l.qty, sale_price_per_gb: l.price, commission_rate: commRate });
    totalGb += calc.total_gb;
    totalGross += calc.gross_amount;
    totalComm += calc.commission_amount;
    totalNet += calc.net_amount;
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Insert batch header
  const batch = await c.env.DB.prepare(`
    INSERT INTO allocation_batches
      (company_id, seller_id, branch_id, commission_rate, total_gb, total_gross, total_commission, total_net, notes)
    VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`
  ).bind(user.company_id, seller_id, branch_id, commRate, round2(totalGb), round2(totalGross), round2(totalComm), round2(totalNet), notes || null)
   .first<{id:number}>();

  if (!batch) return c.json({error:'Failed to create batch'}, 500);

  // Insert lines
  for (const l of lines) {
    const calc = calculate({ size_gb: l.size_gb, quantity: l.qty, sale_price_per_gb: l.price, commission_rate: commRate });
    await c.env.DB.prepare(`
      INSERT INTO allocation_batch_lines (batch_id, company_id, package_id, quantity, size_gb, total_gb, price_per_gb, gross_amount, commission_amount, net_amount)
      VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(batch.id, user.company_id, l.pkg_id, l.qty, l.size_gb, calc.total_gb, l.price, calc.gross_amount, calc.commission_amount, calc.net_amount).run();

    // Also insert into legacy allocations table
    await c.env.DB.prepare(`
      INSERT INTO allocations (company_id, seller_id, branch_id, package_id, quantity, total_gb, gross_amount, commission_rate, commission_amount, net_amount, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(user.company_id, seller_id, branch_id, l.pkg_id, l.qty, calc.total_gb, calc.gross_amount, commRate, calc.commission_amount, calc.net_amount, `Batch #${batch.id}`).run();
  }

  // Fetch seller name for notification
  const sellerRow = await c.env.DB.prepare('SELECT full_name FROM users WHERE id=?').bind(seller_id).first<{full_name:string}>();
  await createNotification(c.env.DB, {
    company_id: user.company_id,
    type: 'info',
    category: 'allocation',
    title: 'Allocation Recorded',
    message: `${formatGB(round2(totalGb))} allocated to ${sellerRow?.full_name ?? 'seller'} \u00b7 Net: ${formatMoney(round2(totalNet))}`,
    link: '/allocations'
  });

  // ── Create immutable ledger entry ──────────────────────────
  // money_amount = totalNet (net amount seller owes owner for this allocation)
  await createLedgerEntry(c.env.DB, {
    company_id:       user.company_id,
    seller_id:        seller_id,
    transaction_type: 'allocation',
    ref_type:         'allocation_batch',
    ref_id:           batch.id,
    gb_amount:        round2(totalGb),
    money_amount:     round2(totalNet),
    notes:            `Allocation batch #${batch.id}: ${formatGB(round2(totalGb))} · Net: ${formatMoney(round2(totalNet))}`,
    created_by:       user.id,
  });

  return new Response(null, { status: 302, headers: { 'Location': '/allocations' } });
});

// ============================================================
// DELETE: Remove an entire allocation batch
// Also removes the matching financial_ledger entry so dashboard stays accurate
// ============================================================
allocations.delete('/api/allocation-batch/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'}, 403);
  const id = c.req.param('id');

  const batch = await c.env.DB.prepare('SELECT * FROM allocation_batches WHERE id=? AND company_id=?').bind(id, user.company_id).first<any>();
  if (!batch) return c.json({error:'Not found'}, 404);

  // Remove ledger entry that references this batch (keeps financial totals accurate)
  await c.env.DB.prepare(`
    DELETE FROM financial_ledger
    WHERE company_id=? AND ref_type='allocation_batch' AND ref_id=?
  `).bind(user.company_id, id).run();

  await c.env.DB.prepare('DELETE FROM allocation_batch_lines WHERE batch_id=?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM allocation_batches WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success: true});
});

// Keep legacy delete
allocations.delete('/api/allocations/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'}, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM allocations WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

export default allocations;
