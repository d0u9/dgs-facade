# Privacy rule

- Never expose original uploaded or source filenames, directory names, absolute paths, or other filesystem details in user-facing UI, page metadata, URLs, shared links, or public data files.
- A GPX file-level label must use its internal track `<trk><name>` or route `<rte><name>`. For a waypoint-only GPX, use an internal waypoint `<wpt><name>`. Never use `<metadata><name>` for this label: it can repeat the original filename. If no suitable internal name exists, use a generic label.
- Keep filesystem paths and original filenames only in private build logic when necessary. Before publishing generated files, check that these details are absent.
