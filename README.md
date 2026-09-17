# dgs-facade

A small personal homepage, browser arcade, and collection of local utilities,
intended for a Caddy-hosted static site.

## Routes

- `/` — homepage
- `/arcade/` — browser arcade
- `/arcade/2048/` — playable 2048
- `/arcade/snake/` — playable Snake
- `/arcade/minesweeper/` — playable Minesweeper
- `/arcade/hextris/` — playable Hextris
- `/arcade/battleship/` — playable Battleship
- `/utilities/` — browser-only utilities
- `/utilities/base64/` — Base64 encoder and decoder

## Requirements

- Node.js 20.19+ or 22.12+
- pnpm 10
- Caddy for deployment (optional)

## Development

```bash
pnpm install
pnpm dev
```

Open:

```text
http://localhost:5173/
http://localhost:5173/arcade/
http://localhost:5173/utilities/
```

## Configuration

Edit `src/config.json` to change the site name, homepage metadata and copy,
footer, or game score-storage keys. For example:

```json
{
  "site": { "name": "d0u9", "homeTitle": "d0u9 / home" },
  "home": {
    "status": "online",
    "footerRight": "d0u9"
  }
}
```

Keep all existing keys when editing the real file, then rebuild the site.

## Design

New pages and components should follow the shared
[design guidelines](docs/design-guidelines.md). The visual language combines a
modern 1990s-terminal feel with a near-black and fluorescent-green palette,
while keeping interaction and status cues color-blind accessible.

Deferred work and implementation notes are tracked in the project
[TODO](docs/todo.md).

## Build

```bash
pnpm install
pnpm build
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

## Game controls

2048 and Snake support:

- Arrow keys
- WASD

Mobile:

- Swipe

The best score is kept in browser `localStorage`.

## Privacy

The static site contains no analytics or tracking code.
