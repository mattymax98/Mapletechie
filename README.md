# Mapletechies

Independent tech publication — www.mapletechie.com.

A bold editorial site covering AI, electric vehicles, cybersecurity, and consumer
gadgets, with a multi-user admin panel, weekly newsletter, reader reviews,
careers and advertising pages, and on-site analytics.

## Stack

- pnpm workspace monorepo (Node 24, TypeScript 5.9)
- Frontend: React + Vite + Tailwind + shadcn/ui
- Backend: Express 5 + Drizzle ORM + PostgreSQL
- Email: Resend
- Hosted on Railway

## Project layout

```
artifacts/
  tech-blog/      # Public website (React + Vite)
  api-server/     # REST API (Express)
  mockup-sandbox/ # Internal component preview
lib/              # Shared packages (db, api-spec, api-client-react, etc.)
scripts/          # Helper scripts
```

## Local commands

```bash
pnpm install            # install dependencies
pnpm -r run typecheck   # type-check everything
pnpm run build          # build all artifacts
```

Each artifact has its own `dev` script (`pnpm --filter @workspace/tech-blog run dev`, etc.).

## ChatGPT draft image contract

The private `POST /api/automation/posts/drafts` endpoint accepts
TipTap-compatible HTML in `content`. Article images belong directly in that
HTML at the position where they should appear:

```json
{
  "title": "Example story",
  "slug": "example-story",
  "category_id": "ai",
  "cover_image": "https://images.example.com/example-cover.jpg",
  "cover_image_alt": "A researcher examining an AI processor in a laboratory",
  "content": "<p>Opening paragraph.</p><img src=\"https://images.example.com/processor.jpg\" alt=\"Close-up of a processor designed for AI workloads\"><p>Article continues.</p>"
}
```

Image rules:

- Every `cover_image` requires a non-empty `cover_image_alt`.
- Every inline `<img>` requires a supported `src` and meaningful, non-empty
  `alt` text.
- Inline sources may be `http(s)` URLs, `/api/storage/objects/...` URLs
  returned by the MCP image-upload tool, or bundled `/covers/...` paths.
- Remote cover and inline images are copied to Mapletechie storage through the
  existing SSRF-protected image pipeline. Alt text remains in the post and is
  also recorded with newly stored media.
- The MCP workflow is: call `upload_mapletechie_image` with `alt_text`, then
  use the returned URL in `cover_image`/`cover_image_alt` or an inline
  `<img src="..." alt="...">` inside `content`.

### Live image backfills

The private `POST /api/automation/posts/backfill` endpoint and the
`backfill_mapletechie_images` MCP tool can update image fields on an existing
post, including a published post. Target exactly one post with `post_id` or
`slug`. Send `cover_image_alt` to fill the existing cover's alt text and/or
send the complete updated `content` HTML to add or repair inline images. When
`content` is supplied, every `<img>` must have meaningful alt text. The
operation preserves the post's current author, byline, status, slug, and
publish time, so it also works after an editor changes the author to themselves.

The `list_mapletechie_posts` MCP tool is the read-only discovery step for
backfills. It can filter by `status` and limit the result count, and returns
each post's `id`, `title`, `slug`, `status`, `cover_image`, and
`cover_image_alt`, newest first. For example, use `status: "draft", limit: 29`
to find the latest drafts that need image metadata repairs before calling
`backfill_mapletechie_images`.

## Required environment variables

Set these as secrets in your hosting environment (never commit them):

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — random string for session signing
- `ADMIN_PASSWORD` — admin panel password
- `RESEND_API_KEY` — Resend API key for the newsletter
- `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR` — object storage config

## License

All rights reserved.
