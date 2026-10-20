# Curated map projects

Edit `projects.json` to publish a fixed project. `trackIds` contains stable IDs from the generated track index or the private ID ledger. A track stays in its original source once; the project only references it. The same ID may appear in several projects.

Optional project fields: `startDate` and `endDate` (`YYYY-MM-DD`) for the time range, and `desc` for a short description. These appear on the project card and detail view. Leave them out until the information is ready; the card will still show the project name and track count.

For other languages, `lang` gives the language of `name` and `desc` (a BCP 47 tag such as `zh`), and `names` and `descs` map a tag to a translation, as in `"names": { "en": "Heilongjiang" }`. The page shows the one for the visitor's language and falls back to `name` and `desc`.

Places are a separate feature in `places.json`; they do not belong to projects. Each place needs a unique five-character lowercase letter/digit `id`, a `name`, and WGS84 `lon` and `lat`. Optional fields are `date` (`YYYY-MM-DD`) and `desc`, and the same `lang`, `names` and `descs` as a project. Only include locations and descriptions you intend to make public.

The build validates references and place data. The published page contains project names, track IDs, and the explicitly listed places, never the source file paths.
