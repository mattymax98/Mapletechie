# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains "Mapletechie" (mapletechie.com) — a tech blog website inspired by The Verge and TechCrunch, with a React frontend and Express API backend.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/tech-blog)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **UI**: Tailwind CSS, shadcn/ui, framer-motion
- **SEO**: react-helmet-async (Open Graph, Twitter Cards, JSON-LD ready)

## Artifacts

### Tech Blog (`artifacts/tech-blog`)
- Preview path: `/`
- Full tech blog site: Mapletechie (mapletechie.com)
- Pages: Home, Blog, Blog Post, Shop, Contact, Category, Admin
- SEO: react-helmet-async applied to all pages (title, description, OG tags, Twitter cards)
- Admin panel at `/admin` (password-protected, no Layout wrapper)
- `public/robots.txt` included; sitemap.xml served dynamically from API

### API Server (`artifacts/api-server`)
- Preview path: `/api`
- Express 5 REST API
- Routes: posts (CRUD), categories, products, contact, stats, admin verify, sitemap.xml
- Admin auth: `Authorization: Bearer <ADMIN_PASSWORD>` header required for POST/PUT/DELETE on posts

## Database Schema

Tables: `posts`, `categories`, `products`, `contact_submissions`, `jobs`, `job_applications`, `reviews`, `ad_inquiries`.

Seeded with: 6 posts, 6 categories, 6 products, 1 job (`senior-editor`).

## Public Pages (Mapletechie)

Home, Latest, Blog Post, Category, Shop, About, Contact, **Careers** (`/careers`, `/careers/:slug`), **Advertise** (`/advertise`), **Reader Reviews** (`/reviews`).

## Admin Pages

Dashboard, Posts (CRUD), Users, Profile, **Jobs** (`/admin/jobs` — full CRUD), **Inbox** (`/admin/inbox` — unified view of job applications, reader reviews w/ approve/reject, ad inquiries, and contact messages).

## Admin Panel

- URL: `/admin` (redirects to `/admin/login` if not logged in)
- Password: set in `ADMIN_PASSWORD` environment variable (default: `Maple2025!Admin`)
- Capabilities: create, edit, delete posts; mark featured; set category, author, cover image, read time

## SEO Setup

- `SEO` component: `artifacts/tech-blog/src/components/SEO.tsx`
- Applied to: Home, Blog Index, Blog Post, Shop, Contact pages
- Dynamic sitemap: `GET /api/sitemap.xml`
- robots.txt: `artifacts/tech-blog/public/robots.txt` (points sitemap to mapletechie.com)
- Site domain constant in SEO.tsx: update `SITE_URL` when deploying

## API Spec

Located at `lib/api-spec/openapi.yaml`. Run codegen with:
```
pnpm --filter @workspace/api-spec run codegen
```

## Key Environment Variables

- `DATABASE_URL` — PostgreSQL connection string (auto-managed by Replit)
- `SESSION_SECRET` — Session secret (set in Replit Secrets)
- `ADMIN_PASSWORD` — Admin panel password (set as env var; change from default in Replit Secrets)
- `SITE_DOMAIN` — Used in sitemap.xml generation (default: `https://mapletechie.com`)
