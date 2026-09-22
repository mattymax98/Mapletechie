---
name: YouTube iframe API under strict CSP
description: Why Mapletechie's embeds use direct postMessage events instead of YouTube's external iframe API script.
---

Use the existing `youtube-nocookie` iframe and consume its origin-checked `postMessage` events directly; do not construct a `YT.Player` around an existing iframe.

**Why:** On the live site, YouTube's iframe API attempted a TrustedHTML assignment blocked by the site's policy, replaced both working iframe elements with `about:blank`, and made player accounting unreliable.

**How to apply:** Keep `enablejsapi=1`, send the iframe the `listening` event, accept messages only from the iframe's own window and YouTube origins, and map each occurrence's ready/error events to its stable embed key.