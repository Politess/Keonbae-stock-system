# Keonbae Stock Management System

A full-stack multi-restaurant stock management platform built for Keonbae restaurants. Restaurants can request stock from a central kitchen, with oversight and approval from central management. Features automatic stock movement tracking, low stock alerts, and incident reporting.

🌐 **Live Demo:** [https://keonbae-stock-system-ui2r.vercel.app/](https://keonbae-stock-system-ui2r.vercel.app/)

---

## Project Development Journey

This project was built incrementally, starting from a basic concept and evolving into a fully deployed production system. Here's how it came together:

### Phase 1 — Planning & Design
- Identified the core problem: restaurants need a structured way to request stock from a central kitchen
- Defined the workflow: Order placement → Approval → Dispatch → Receipt
- Designed three user roles: Administrator, Central Management, Restaurant Staff
- Sketched the database schema covering users, restaurants, items, stock, orders, and audit logs

### Phase 2 — Database Foundation
- Set up PostgreSQL locally in WSL (Ubuntu)
- Created the schema with custom enums for roles, statuses, units, and categories
- Built database triggers for automatic stock deduction/addition on order events
- Created views for low stock alerts
- Seeded initial data: 2 restaurants, 4 user accounts, sample items

### Phase 3 — Backend API
- Built Express.js server with modular route structure
- Implemented JWT authentication with bcrypt password hashing (12 salt rounds)
- Created role-based middleware for authorization
- Built order workflow endpoints (create, approve, dispatch, receive)
- Added stock management endpoints (kitchen and per-restaurant)
- Implemented audit log for all stock movements
- Added user management (admin only)

### Phase 4 — Frontend Development
- Built single-page application with vanilla JavaScript (no framework)
- Created login screen with JWT authentication
- Built role-specific dashboards (different views per user type)
- Implemented order management UI with modal forms
- Added stock viewing tables with visual level indicators (green/amber/red bars)
- Built filter system (category + search by name/SKU)
- Added dark mode toggle with localStorage persistence

### Phase 5 — Enhancements & Refinements
- Loaded real menu data: **120 items across 7 categories with SKU codes**
  - Sashimi/Sushi (18 items) — `BOHJF-001` to `BOHJF-018`
  - Korean Seafood (7 items) — `BOHKF-019` to `BOHKF-025`
  - BBQ Meat (6 items) — `BOHBQ-026` to `BOHBQ-031`
  - Raw Meat (17 items) — `BOHRM-032` to `BOHRM-048`
  - Vegetables (23 items) — `BOHVG-049` to `BOHVG-071`
  - Dessert (9 items) — `BOHDE-072` to `BOHDE-080`
  - Kitchen Essentials (40 items) — `BOHKE-081` to `BOHKE-120`
- Added rejection reasons for orders (mandatory text field)
- Implemented order archiving to hide completed orders from view
- Added expandable order details showing all line items
- Built low stock incident reporting with 9 predefined reasons
- Added unit selection in order forms (kg, litre, box, crate)
- Added quantity dropdown with preset values + custom option
- Enabled restaurant managers to manage their own stock (add/edit/delete)
- Added restaurant-specific stock view for central management with selector buttons

### Phase 6 — Cloud Deployment
- Created GitHub repository for version control
- Migrated database to **Supabase** (managed PostgreSQL, London region)
- Configured connection pooling for serverless environments
- Deployed backend to **Vercel** as serverless functions
- Deployed frontend to **Vercel** as static site
- Set up environment variables for production credentials
- Configured CORS for cross-origin requests
- Set up auto-deployment on git push

---

## Overview

Keonbae is a stock control system for multi-branch restaurant operations. Restaurants order stock from a central kitchen through an order request workflow. The central management approves orders, dispatches them, and restaurants confirm receipt — with PostgreSQL triggers automatically managing stock movements at every step.

### Core Workflow

```
Restaurant Staff places order
            ↓
Status: PENDING
            ↓
Central Management reviews → approves or rejects (with reason)
            ↓
Status: APPROVED
            ↓
Central Management dispatches → kitchen stock auto-deducts
            ↓
Status: DISPATCHED
            ↓
Restaurant confirms receipt → restaurant stock auto-increases
            ↓
Status: RECEIVED
```

---

## Features

### User Roles & Permissions

| Role | Permissions |
|------|------------|
| **Administrator** | Full system access; manage users, restaurants, items, stock; delete log entries |
| **Central Management** | Approve/reject orders, dispatch goods, manage central inventory, view all restaurants |
| **Restaurant Staff** | Place orders, confirm receipt, manage own restaurant's stock, log low stock reasons |

### Order Management
- Multi-item orders with quantity and unit selection
- Order status tracking (Pending → Approved → Dispatched → Received)
- Rejection with mandatory reason
- Archive completed/cancelled orders
- Expandable order details showing all line items with SKUs
- Order history and audit trail

### Stock Management
- 120 items across 7 categories
- SKU codes for every item (e.g., `BOHJF-001`)
- Multiple units of measurement (kg, litre, box, crate)
- Restaurant managers can add and update their own stock
- Automatic stock deduction on dispatch
- Automatic stock addition on receipt
- Manual stock adjustments with audit logging

### Low Stock Alerts & Reporting
- Visual stock level indicators (green/amber/red bars)
- Dashboard alerts for items below minimum threshold
- **Mandatory reason** when reporting low stock with options including:
  - Busy week
  - Portion overused
  - Expired
  - Bad quality
  - Chef error
  - Staff error
  - Theft
  - Spillage / damaged
  - Other
- Resolution tracking for low stock incidents

### Search & Filter
- Filter by category across all stock views
- Search by item name or SKU
- Category-grouped item dropdowns in order forms

### UI/UX
- Dark mode toggle (persistent across sessions)
- Responsive design
- Role-based dashboards
- Live status badges
- Visual metric cards

---

## Tech Stack

### Frontend
- **HTML5 / CSS3 / Vanilla JavaScript** — No framework dependencies, pure web standards
- **Tabler Icons** — Lightweight SVG icon library
- **CSS Variables** — For light/dark theme system

### Backend
- **Node.js** (v20+) — JavaScript runtime
- **Express.js** — Web framework
- **JWT (jsonwebtoken)** — Authentication tokens
- **bcrypt** — Password hashing (12 rounds)
- **pg** — PostgreSQL client for Node.js
- **CORS** — Cross-origin resource sharing
- **dotenv** — Environment variable management

### Database
- **PostgreSQL 16** — Relational database
- **Custom triggers** — Automatic stock movement on dispatch/receive
- **Views** — Pre-computed low stock alerts
- **Enums** — Type-safe role/status/category fields
- **Indexes** — Optimized lookups for orders and movements

### Hosting & Infrastructure
- **Supabase** — Managed PostgreSQL database (London region)
- **Vercel** — Serverless hosting for both frontend (static) and backend (Node.js functions)
- **GitHub** — Source control and CI/CD trigger

---

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `restaurants` | Restaurant branches (Keonbae_KB, Keonbae_RW) |
| `users` | User accounts with roles |
| `items` | Master catalogue (120 items with SKUs) |
| `kitchen_stock` | Central kitchen inventory |
| `restaurant_stock` | Per-restaurant inventory |
| `stock_orders` | Order header records |
| `order_items` | Individual line items per order |
| `stock_movements` | Audit trail of every stock change |
| `low_stock_reasons` | Incident reports for below-minimum stock |
| `supplier_deliveries` | Inbound supplier deliveries |

### Custom Types (Enums)

- `user_role`: administrator, central_management, restaurant_staff
- `unit_type`: kg, g, litre, ml, box, crate, piece, bag, bottle, can
- `item_category`: Sashimi/Sushi, Korean Seafood, BBQ Meat, Raw Meat, Vegetables, Dessert, Kitchen Essentials
- `order_status`: pending, approved, rejected, dispatched, received, cancelled
- `movement_direction`: IN, OUT
- `movement_source`: order_dispatch, order_receipt, supplier_delivery, manual_adjustment, wastage, transfer

### Database Triggers

- `on_order_dispatched` — Auto-deducts kitchen stock and logs movement when order is dispatched
- `on_order_received` — Auto-adds to restaurant stock and logs movement when order is received
- `set_order_ref` — Auto-generates human-readable order references (KB-0001, KB-0002, etc.)
- `touch_updated_at` — Maintains `updated_at` timestamps automatically

---

## API Endpoints

### Authentication
- `POST /api/auth/login` — Authenticate and return JWT token
- `GET /api/auth/me` — Get current user info

### Orders
- `GET /api/orders` — List orders (filtered by role)
- `GET /api/orders/:id` — Get order with line items
- `POST /api/orders` — Create new stock order
- `PATCH /api/orders/:id/approve` — Approve order
- `PATCH /api/orders/:id/reject` — Reject with reason
- `PATCH /api/orders/:id/dispatch` — Dispatch (triggers stock deduction)
- `PATCH /api/orders/:id/receive` — Confirm receipt (triggers stock addition)
- `PATCH /api/orders/:id/cancel` — Cancel order
- `PATCH /api/orders/:id/archive` — Hide from list
- `PATCH /api/orders/:id/unarchive` — Restore to list

### Stock
- `GET /api/kitchen/stock` — Kitchen inventory
- `GET /api/kitchen/stock/low` — Items below minimum
- `GET /api/restaurant-stock/:restaurant_id` — Restaurant inventory
- `PUT /api/restaurant-stock/:restaurant_id/:item_id` — Set quantity & min
- `DELETE /api/restaurant-stock/:restaurant_id/:item_id` — Remove item from stock
- `PATCH /api/kitchen/stock/:item_id/adjust` — Manual adjustment

### Items & Categories
- `GET /api/items` — List all items with SKU
- `POST /api/items` — Create new item (admin/central)
- `PATCH /api/items/:id` — Update item
- `GET /api/items/meta/categories` — Available categories
- `GET /api/items/meta/units` — Available units

### Movements
- `GET /api/movements` — Stock movement audit log
- `DELETE /api/movements/:id` — Delete log entry (admin only)

### Low Stock Reasons
- `GET /api/low-stock-reasons/:restaurant_id` — Reports for a restaurant
- `POST /api/low-stock-reasons` — Log a new incident
- `PATCH /api/low-stock-reasons/:id/resolve` — Mark resolved

### Users (Admin only)
- `GET /api/users` — List all users
- `POST /api/users` — Create user
- `PATCH /api/users/:id` — Update user
- `DELETE /api/users/:id` — Delete user

### Restaurants
- `GET /api/restaurants` — List restaurants
- `POST /api/restaurants` — Create restaurant (admin)
- `PATCH /api/restaurants/:id` — Update restaurant (admin)

---

## Project Structure

```
keonbae/
├── keonbae_schema.sql              # Complete database schema with seed data
├── keonbae-api/                    # Backend API
│   ├── package.json
│   ├── vercel.json                 # Vercel deployment config
│   ├── .env                        # Local environment variables (gitignored)
│   └── src/
│       ├── server.js               # Entry point
│       ├── app.js                  # Express setup, routes, CORS
│       ├── db.js                   # PostgreSQL connection pool
│       ├── middleware/
│       │   └── auth.js             # JWT authentication & authorization
│       └── routes/
│           ├── auth.js             # Login, current user
│           ├── users.js            # User CRUD (admin only)
│           ├── restaurants.js      # Restaurant management
│           ├── items.js            # Item catalogue
│           ├── kitchenStock.js     # Kitchen inventory
│           ├── restaurantStock.js  # Restaurant inventory
│           ├── orders.js           # Order workflow
│           ├── movements.js        # Audit log
│           └── lowStockReasons.js  # Incident reports
└── keonbae-ui/                     # Frontend
    ├── index.html                  # Single-page application
    └── vercel.json                 # Vercel static config
```

---

## Local Development Setup

### Prerequisites
- Node.js v18+
- PostgreSQL 14+
- Git
- WSL (if on Windows)

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/Politess/Keonbae-stock-system.git
   cd Keonbae-stock-system
   ```

2. **Set up PostgreSQL database**
   ```bash
   sudo -u postgres psql
   ```
   ```sql
   CREATE DATABASE keonbae;
   CREATE USER keonbae_user WITH PASSWORD 'your_password';
   GRANT ALL PRIVILEGES ON DATABASE keonbae TO keonbae_user;
   \c keonbae
   GRANT ALL ON SCHEMA public TO keonbae_user;
   \q
   ```

3. **Load the schema**
   ```bash
   psql -U keonbae_user -d keonbae -f keonbae_schema.sql
   ```

4. **Set up the API**
   ```bash
   cd keonbae-api
   npm install
   cp .env.example .env
   # Edit .env with your database credentials
   npm run dev
   ```

5. **Open the frontend**
   - Open `keonbae-ui/index.html` in a browser
   - Or use Live Server in VS Code
   - The frontend will connect to the API at `http://localhost:3000`

---

## Deployment

### Database — Supabase
1. Create a project at [supabase.com](https://supabase.com) (London region recommended)
2. Use the SQL Editor to run `keonbae_schema.sql`
3. Copy the Transaction Pooler connection string

### Backend — Vercel
1. Import the GitHub repo to Vercel
2. Set **Root Directory** to `keonbae-api`
3. Add environment variables:
   - `DATABASE_URL` — Supabase pooler connection string
   - `JWT_SECRET` — Long random string for token signing
4. Deploy

### Frontend — Vercel
1. Import the same GitHub repo as a new project
2. Set **Root Directory** to `keonbae-ui`
3. Update the `API` constant in `index.html` to point to your deployed backend URL
4. Deploy

---

## Default Accounts

| Role | Email | Password |
|------|-------|----------|
| Administrator | admin@keonbae.com | admin123 |
| Central Management | central@keonbae.com | central123 |
| Staff (Keonbae_KB) | staff.central@keonbae.com | staff123 |
| Staff (Keonbae_RW) | staff.north@keonbae.com | staff123 |

> ⚠️ **Change these passwords immediately in production!**

---

## Security Features

- **Bcrypt password hashing** with 12 salt rounds
- **JWT tokens** with 12-hour expiration
- **Role-based access control** at the API level
- **Parameterised SQL queries** to prevent injection
- **CORS configured** for cross-origin requests
- **Environment variables** for sensitive configuration
- **SSL/TLS** for database connections in production

---

## Future Enhancements

- Email notifications for order status changes
- Mobile app version
- Reports & analytics dashboards
- Auto-generation of orders when stock falls below minimum
- Supplier management module
- Expiry date tracking
- Wastage reporting
- Multi-language support
- Custom domain (e.g., keonbae.com)

---

## License

Private project — All rights reserved.

---

## Acknowledgements

Built with:
- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [PostgreSQL](https://www.postgresql.org/)
- [Supabase](https://supabase.com/)
- [Vercel](https://vercel.com/)
- [Tabler Icons](https://tabler.io/icons)
