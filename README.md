# carboncaste.io

Corporate landing page and public legal/support directory for Carbon Caste Inc.

## Public routes

- `/` - company landing page and Rezonance product link
- `/privacy.html` - corporate website privacy policy
- `/terms.html` - corporate website terms
- `/contact.html` - company and product-support contacts
- `/.well-known/security.txt` - security contact

Rezonance keeps its product-specific support, privacy, and terms pages at `https://rezonance.carboncaste.io`.

## Local verification

```sh
npm run check
npm run serve
BASE_URL=http://127.0.0.1:8126 npm run smoke
```

The repository has no runtime package dependencies. The production service uses Node's built-in HTTP server from `server/static-server.mjs`.

## A6 deployment

The production files live at `/home/humble/services/carboncaste-web/current` on `ssh humble`. The user service template is `deploy/carboncaste-web.service` and listens only on `127.0.0.1:8126`. Cloudflare Tunnel maps `carboncaste.io` and `www.carboncaste.io` to that local origin.

Deploy by synchronizing the tracked working tree, installing the service template, reloading the user service manager, and restarting `carboncaste-web.service`. Validate the loopback origin before changing or confirming Cloudflare routing.
