BEGIN;

UPDATE posts
SET content = replace(
  content,
  '/blog/canada-openai-privacy-laws',
  '/blog/openai-canada-privacy-ruling'
)
WHERE content LIKE '%/blog/canada-openai-privacy-laws%';

UPDATE posts
SET content = replace(
  content,
  '/blog/canada-ai-strategy-adoption-before-rules',
  '/blog/canada-ai-strategy-rules-come-later'
)
WHERE content LIKE '%/blog/canada-ai-strategy-adoption-before-rules%';

UPDATE posts
SET content = replace(
  content,
  '/blog/buy-used-phone-canada-checklist',
  '/blog/used-phone-buyer-checklist-canada'
)
WHERE content LIKE '%/blog/buy-used-phone-canada-checklist%';

UPDATE posts
SET content = replace(
  content,
  '/blog/browser-password-manager-security',
  '/blog/browser-vs-password-manager'
)
WHERE content LIKE '%/blog/browser-password-manager-security%';

UPDATE posts
SET content = replace(content, '/category/software-apps', '/category/software')
WHERE content LIKE '%/category/software-apps%';

COMMIT;