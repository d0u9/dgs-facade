# dgs-facade

A small personal homepage intended for a Caddy-hosted static site.

## Routes

- `/` — homepage
- `/2048/` — playable 2048
- `/snake/` — playable Snake

## Requirements

- Node.js 20+
- npm
- Caddy for deployment (optional)

## Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:5173/
http://localhost:5173/2048/
```

## Configuration

Edit `src/config.json` to change the site name, page metadata, homepage copy,
links, footer, or the 2048 score-storage key. For example:

```json
{
  "site": { "name": "d0u9" },
  "home": {
    "cards": [
      { "href": "/snake/", "external": false }
    ]
  }
}
```

Keep all existing keys when editing the real file, then rebuild the site.

## Build

```bash
npm install
npm run build
```

The deployable static site is generated in:

```text
dist/
```

## Rolling release

Every push to `master` triggers `.github/workflows/release-latest.yml`. It builds
the site and replaces these assets in the `latest` GitHub Release:

```text
dgs-facade.tar.gz
dgs-facade.tar.gz.sha256
```

The download URLs never change:

```text
https://github.com/d0u9/dgs-facade/releases/download/latest/dgs-facade.tar.gz
https://github.com/d0u9/dgs-facade/releases/download/latest/dgs-facade.tar.gz.sha256
```

On the host, download, verify, and atomically activate the newest build:

```bash
RELEASE_URL="https://github.com/d0u9/dgs-facade/releases/download/latest"
DEPLOY_DIR="$(mktemp -d)"

curl --fail --location --proto '=https' --tlsv1.2 \
  --output "${DEPLOY_DIR}/dgs-facade.tar.gz" \
  "${RELEASE_URL}/dgs-facade.tar.gz"
curl --fail --location --proto '=https' --tlsv1.2 \
  --output "${DEPLOY_DIR}/dgs-facade.tar.gz.sha256" \
  "${RELEASE_URL}/dgs-facade.tar.gz.sha256"

cd "${DEPLOY_DIR}"
sha256sum --check dgs-facade.tar.gz.sha256
sudo install -d /srv/www
RELEASE_DIR="$(sudo mktemp -d /srv/www/d0u9-release.XXXXXX)"
sudo tar -xzf dgs-facade.tar.gz -C "${RELEASE_DIR}"
sudo ln -sfn "${RELEASE_DIR}" /srv/www/.d0u9-current
sudo mv -Tf /srv/www/.d0u9-current /srv/www/d0u9-current
```

Point Caddy at `/srv/www/d0u9-current`. Each deployment switches the symlink
atomically, so Caddy never serves a partially extracted build. Old release
directories can be retained for rollback. A private repository requires an authenticated
GitHub download request; a public repository can use the commands above as-is.

## Deploy with Caddy

For a manual deployment, copy the build output:

```bash
sudo mkdir -p /srv/www/d0u9-current
sudo rsync -a --delete dist/ /srv/www/d0u9-current/
```

Then adapt `Caddyfile.example`:

```caddy
xxx.com {
    redir https://www.xxx.com{uri}
}

www.xxx.com {
    root * /srv/www/d0u9-current
    encode zstd gzip
    file_server
}

```

Reload Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 2048 controls

Desktop:

- Arrow keys
- WASD

Mobile:

- Swipe

The best score is kept in browser `localStorage`.

## Privacy

The static site contains no analytics or tracking code.
