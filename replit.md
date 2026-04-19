# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains a tech blog website (TechPulse) with a React frontend and Express API backend.

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

## Artifacts

### Tech Blog (`artifacts/tech-blog`)
- Preview path: `/`
- Full tech blog site inspired by The Verge and TechCrunch
- Pages: Home, Blog, Blog Post, Shop, Contact, Category

### API Server (`artifacts/api-server`)
- Preview path: `/api`
- Express 5 REST API
- Routes: posts, categories, products, contact, stats

## Database Schema

- `posts` — blog articles with categories, tags, authors, view counts
- `categories` — blog categories with post counts and colors
- `products` — affiliate products with pricing, ratings, badges
- `contacts` — contact form submissions

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/tech-blog run dev` — run frontend locally

## Features

- Blog section with categories, tags, author info, read time
- Contact form (submissions stored in DB)
- Shop/Products section for affiliate products
- Dark editorial design (TechPulse brand)
- Fully responsive — mobile, tablet, desktop
- Stats banner, trending posts, featured hero posts

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
