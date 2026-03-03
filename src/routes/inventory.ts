// ============================================
// Inventory Routes - Batch Entry + History
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { calculate, formatGB, formatMoney } from '../lib/calc';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const inventory = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ============================================================
// Main page: Tabs — Batch History | Legacy records
// ============================================================
inventory.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const tab = new URL(c.req.url).searchParams.get('tab') ?? 'history';

  // ---- Batch history ----
  const batches = await c.env.DB.prepare(`
    SELECT b.*, br.name as branch_name,
      (SELECT COUNT(*) FROM inventory_batch_lines WHERE batch_id=b.id) as line_count
    FROM inventory_batches b
    JOIN branches br ON br.id = b.branch_id
    WHERE b.company_id=?
    ORDER BY b.created_at DESC`).bind(user.company_id).all<any>();

  // ---- Grand totals from batches ----
  const totals = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb,
           COALESCE(SUM(total_gross),0) as gross,
           COALESCE(SUM(total_net),0) as net
    FROM inventory_batches WHERE company_id=?`).bind(user.company_id).first<any>();

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
      ${user.role==='owner'?`<td class="text-success font-bold">${formatMoney(b.total_gross)}</td>`:''}
      <td style="max-width:200px;color:var(--text-muted);font-size:.82rem">${b.notes||'—'}</td>
      <td>
        <button onclick="toggleRow('inv-batch-${i}')" class="btn btn-outline btn-sm">📋 Details</button>
        ${user.role==='owner'?`<button onclick="confirmDelete('/api/inventory-batch/${b.id}','${t(lang,'confirm_delete')}')" class="btn btn-danger btn-sm">${t(lang,'delete')}</button>`:''}
      </td>
    </tr>
    <tr id="inv-batch-${i}" class="hidden">
      <td colspan="${user.role==='owner'?7:6}" style="background:var(--gray-50);padding:.875rem 1rem">
        <div style="font-size:.82rem;font-weight:600;color:var(--text-muted);margin-bottom:.5rem">📦 Package Breakdown</div>
        ${lineRows || '<div style="color:var(--text-muted)">No lines</div>'}
        ${b.notes?`<div style="margin-top:.5rem;font-size:.82rem"><strong>Note:</strong> ${b.notes}</div>`:''}
      </td>
    </tr>`;
  }));

  const batchTableBody = batchRows.join('') || `
    <tr><td colspan="${user.role==='owner'?7:6}">
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
      ${user.role==='owner'?`<a href="/inventory/add" class="btn btn-primary">+ Add Stock (Batch)</a>`:''}
    </div>

    <!-- Summary Stats -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <div class="stat-card">
        <div class="stat-label">Total GB In Stock</div>
        <div class="stat-value primary">${formatGB(totals?.gb ?? 0)}</div>
      </div>
      ${user.role==='owner'?`
      <div class="stat-card">
        <div class="stat-label">Total Value</div>
        <div class="stat-value success">${formatMoney(totals?.gross ?? 0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Entries</div>
        <div class="stat-value">${batches.results?.length ?? 0}</div>
      </div>`:''}
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
            ${user.role==='owner'?`<th>Total Value</th>`:''}
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

  const branchOpts = (branches.results||[]).map((b: any) => `<option value="${b.id}">${b.name}</option>`).join('');
  const pkgOptsForJS = JSON.stringify(
    Object.fromEntries((packages.results||[]).map((p: any) => [p.id, {name: p.name, gb: p.size_gb, price: p.sale_price_per_gb}]))
  );

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
          <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:.5rem">Leave 0 for packages not included in this batch</div>
          <div class="table-wrapper" style="border:1px solid var(--border);border-radius:8px">
            <table>
              <thead><tr>
                <th>Package</th>
                <th>Quantity</th>
                <th>Total GB</th>
                <th>Value</th>
              </tr></thead>
              <tbody>${pkgRows || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:1rem">No packages configured. <a href="/packages">Add packages first →</a></td></tr>'}</tbody>
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
          <div class="calc-preview-grid" style="grid-template-columns:repeat(3,1fr)">
            <div class="calc-item">
              <div class="calc-item-label">Packages Included</div>
              <div class="calc-item-value" id="sum-pkgs">0</div>
            </div>
            <div class="calc-item">
              <div class="calc-item-label">Total GB</div>
              <div class="calc-item-value main" id="sum-gb">0 GB</div>
            </div>
            <div class="calc-item">
              <div class="calc-item-label">Total Value</div>
              <div class="calc-item-value" id="sum-val">؋ 0</div>
            </div>
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

    function updateRow(pkgId) {
      const qty = parseInt(document.getElementById('qty_'+pkgId).value) || 0;
      const p = PKGS[pkgId];
      if (!p) return;
      const gb = p.gb * qty;
      const val = gb * p.price;
      document.getElementById('gb_'+pkgId).textContent = qty > 0 ? gb.toFixed(gb%1===0?0:2)+' GB' : '—';
      document.getElementById('val_'+pkgId).textContent = qty > 0 ? '؋ '+val.toLocaleString() : '—';
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

  // Get all packages for this company
  const packages = await c.env.DB.prepare('SELECT * FROM packages WHERE company_id=? AND active=1').bind(user.company_id).all<any>();

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

  // Insert batch
  const batch = await c.env.DB.prepare(`
    INSERT INTO inventory_batches (company_id, branch_id, total_gb, total_gross, total_net, notes)
    VALUES (?,?,?,?,?,?) RETURNING id`
  ).bind(user.company_id, branch_id, Math.round(totalGb * 100) / 100, Math.round(totalGross * 100) / 100, Math.round(totalGross * 100) / 100, notes || null).first<{id:number}>();

  if (!batch) return c.json({error:'Failed to create batch'}, 500);

  // Insert lines
  for (const l of lines) {
    const calc = calculate({ size_gb: l.size_gb, quantity: l.qty, sale_price_per_gb: l.price, commission_rate: 0 });
    await c.env.DB.prepare(`
      INSERT INTO inventory_batch_lines (batch_id, company_id, package_id, quantity, size_gb, total_gb, price_per_gb, gross_amount)
      VALUES (?,?,?,?,?,?,?,?)`
    ).bind(batch.id, user.company_id, l.pkg_id, l.qty, l.size_gb, calc.total_gb, l.price, calc.gross_amount).run();

    // Also insert into legacy inventory table for backward compatibility
    await c.env.DB.prepare(`
      INSERT INTO inventory (company_id, branch_id, package_id, quantity, total_gb, gross_amount, commission_amount, net_amount, notes)
      VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(user.company_id, branch_id, l.pkg_id, l.qty, calc.total_gb, calc.gross_amount, 0, calc.gross_amount, `Batch #${batch.id}`).run();
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
