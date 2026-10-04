# Changelog

All notable changes to this project are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-10-04

First stable release.

### Added
- Multi-tenant company hierarchy with parent/child scoping
- JWT authentication with configurable idle timeout
- Role-based access: super_admin, company_admin, user
- Google OAuth sign-in
- Asset CRUD with automatic tag generation
- Soft delete and restore
- Field-level audit log (append-only, database-trigger enforced)
- CSV / Excel / PDF export (bulk and per-asset)
- CSV import with downloadable template
- Attachments (drag-and-drop upload)
- Depreciation tracking (book value, annual)
- QR code generation and printable label sheets
- Favorites, saved filter views, compare drawer
- Bulk select and bulk edit
- Bulk scanner session
- Reservations with overlap detection
- Maintenance work orders with searchable vendor and type
- Warranty tab with recommended actions
- Notification bell with unread state
- Global search (⌘K)
- Admin: companies, users, API keys, webhooks, alerts, navigation, security, master data
- Session timeout configurable via admin UI, applied live
- Master data system for vendors, categories, and locations
- Page transitions and splash screen
- Keyboard navigation on tables
- Print stylesheet
- Dark and light themes
- 25 backend tests covering auth, tenant isolation, and asset CRUD

### Security
- Helmet security headers
- Login rate limiting (10 failed attempts per 15 min)
- CORS allowlist
- Password reset tokens (single-use, hashed, 1-hour expiry)
- Multi-tenant isolation enforced on every route
