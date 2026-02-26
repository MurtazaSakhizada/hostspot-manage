# 📶 HotSpot Manager — Multi-Tenant SaaS

A production-ready SaaS application for internet HotSpot businesses.  
**Zero manual math. Instant investor clarity. GB → Money → Profit.**

---

## 🔗 Live URLs
- **App:** https://3000-ixdonqt77pj2x99zuri6x-a402f90a.sandbox.novita.ai
- **Login:** https://3000-ixdonqt77pj2x99zuri6x-a402f90a.sandbox.novita.ai/login

---

## 🔑 Demo Credentials

| Role | Username | Password |
|------|----------|----------|
| Owner/Investor | `admin` | `admin123` |
| Seller (15% commission) | `seller1` | `seller123` |
| Seller (20% commission) | `seller2` | `seller123` |

---

## ✅ Completed Features

### Core
- [x] Multi-tenant architecture (fully isolated per company)
- [x] Secure RBAC: Owner vs Seller roles
- [x] Locked calculation engine (zero manual math)
- [x] Session-based authentication (SHA-256 passwords)

### Dashboards
- [x] **Owner Dashboard:** Total GB | Total Gross | Commission | Net Profit
- [x] Drill-down: Branch → Seller → Package breakdown
- [x] **Seller Dashboard:** Net-only values (NO gross exposure)
- [x] Period filter: Today / Week / Month / Year / All Time

### Modules
- [x] Inventory Management (add stock with auto-calc)
- [x] Allocation Management (assign GB to sellers with commission)
- [x] Sales Management (record sales with instant calculation)
- [x] Payments tracking (commission / advance / settlement)
- [x] Reports (by date / branch / seller + CSV export)
- [x] Branch Management
- [x] Package Management (GB bundles + pricing)
- [x] User Management (with per-user commission rates)

### Language Support
- [x] English (LTR)
- [x] Persian/Dari دری (RTL)
- [x] Pashto پښتو (RTL)
- [x] Per-user language preference saved

### UX
- [x] Mobile-first responsive design
- [x] Expand/Collapse drill-down rows
- [x] Auto-calculation preview in all forms
- [x] Print/PDF export via browser
- [x] CSV data export

---

## 🔢 Locked Calculation Logic

```
total_gb = package_size × quantity
gross_amount = total_gb × sale_price_per_gb
commission_amount = gross_amount × commission_rate
net_amount = gross_amount - commission_amount
```

**All calculations are system-only — no editable money/GB fields.**

---

## 🗄️ Data Architecture

### Storage: Cloudflare D1 (SQLite)

| Table | Purpose |
|-------|---------|
| `companies` | Multi-tenant root |
| `users` | Owners & Sellers (with commission_rate) |
| `branches` | Physical locations |
| `packages` | GB bundles (size + price) |
| `inventory` | Stock purchased |
| `allocations` | GB assigned to sellers |
| `sales` | Actual sales transactions |
| `payments` | Commission/advance payments |
| `sessions` | Auth sessions |

---

## 🚀 Tech Stack

- **Backend:** Hono (TypeScript) on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **Frontend:** Server-rendered HTML + Tailwind CSS (CDN)
- **Auth:** Session cookies + SHA-256 password hashing
- **Build:** Vite + @hono/vite-build

---

## 🏗️ Project Structure

```
webapp/
├── src/
│   ├── index.ts          # Main app + middleware
│   ├── lib/
│   │   ├── auth.ts       # Session management
│   │   ├── calc.ts       # LOCKED calculation engine
│   │   ├── i18n.ts       # 3-language translations
│   │   └── layout.ts     # HTML shell builder
│   └── routes/
│       ├── auth.ts       # Login/Register
│       ├── dashboard.ts  # Owner + Seller dashboards
│       ├── inventory.ts  # Stock management
│       ├── allocations.ts # Seller assignments
│       ├── sales.ts      # Sales recording
│       ├── payments.ts   # Payment tracking
│       ├── reports.ts    # Reports + CSV export
│       └── admin.ts      # Branches/Packages/Users
├── migrations/
│   ├── 0001_initial_schema.sql
│   └── 0002_seed_data.sql
├── public/static/
│   └── style.css         # Complete responsive CSS
└── ecosystem.config.cjs  # PM2 config
```

---

## 📦 Deployment (Cloudflare Pages)

```bash
# 1. Create D1 database
npx wrangler d1 create webapp-production
# Update database_id in wrangler.jsonc

# 2. Apply migrations
npx wrangler d1 migrations apply webapp-production

# 3. Build & Deploy
npm run build
npx wrangler pages deploy dist --project-name webapp
```

---

## 🔧 Local Development

```bash
npm run build
pm2 start ecosystem.config.cjs
# Open: http://localhost:3000
```

---

## 📊 Role Access Matrix

| Feature | Owner | Seller |
|---------|-------|--------|
| Dashboard | Full (Gross/Commission/Net) | Net-only |
| Inventory | Full | View (Net only) |
| Add Inventory | ✅ | ❌ |
| Allocations | Full | Own allocations (Net only) |
| Sales | Full | Own sales (Net only) |
| Payments | Full | Own payments |
| Reports | Full | Own data |
| Branches/Packages/Users | ✅ | ❌ |

---

**Platform:** Cloudflare Pages  
**Status:** ✅ Active  
**Last Updated:** 2026-02-26
