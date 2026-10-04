# Privacy

This repository is public. Do not add data identifying a real person, network
or deployment anywhere, including generated files and commit messages.
Deleting it later does not remove it from history.

- Use invented data, including bug reproductions: domains under `example.com`,
  `example.net`, `example.org` or `.test`; IPs in `192.0.2.0/24`,
  `198.51.100.0/24`, `203.0.113.0/24` or `2001:db8::/32`; plainly invented
  private ranges such as `10.0.0.0/24`; MACs starting `02:00:00`; names such
  as `alice` or `host-a`. Never copy real configuration values.
- Keep deployment-specific configuration private; add only generic capabilities
  here. If real data seems necessary, stop and ask the maintainer.
- Never bypass privacy hooks (`--no-verify`) or disguise rejected values.

## Track source privacy

- Keep original input filenames, directories and filesystem details in private
  build logic only. Before publishing, check UI, metadata, URLs, shared links
  and public data for leaks. Repository paths in developer docs are allowed.
- GPX file labels must use internal `<trk><name>` or `<rte><name>`; for
  waypoint-only files, use `<wpt><name>`. Fall back to a generic label, never
  the filename or `<metadata><name>`.

# Arcade

Read `docs/arcade.md` before adding or changing a game page. For shared-shell
pages, define head, top bar and intro through `src/game/games.json` and
`scripts/arcade-shell.mjs`; do not hand-write that markup.
