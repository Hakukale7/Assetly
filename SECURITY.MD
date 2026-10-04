# Security Policy

## Reporting a Vulnerability

Please report security issues privately to security@yourproject.example, not via public GitHub issues.

Include:
- Description of the issue
- Steps to reproduce
- Impact assessment
- Any suggested fix

We aim to respond within 72 hours.

## Supported Versions

Only the latest minor release receives security updates.

## Security Design

- JWT in `Authorization: Bearer` header (not cookies) — no CSRF surface
- bcrypt password hashing (cost factor 10)
- Rate limiting on login (20 attempts / 15 min)
- Append-only audit log enforced by database trigger
- Multi-tenant isolation at the application layer (`accessibleIds`)
- Secrets required from environment — process exits if `JWT_SECRET` is missing
- SQL parameterization everywhere — no string concatenation
- Helmet.js security headers
