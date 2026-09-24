# Curated map projects

Edit `projects.json` to publish a fixed project. `trackIds` contains stable IDs from the generated track index or the private ID ledger. A track stays in its original source once; the project only references it. The same ID may appear in several projects.

Optional project fields: `startDate` and `endDate` (`YYYY-MM-DD`) for the time range, and `desc` for a short description. These appear on the project card and detail view. Leave them out until the information is ready; the card will still show the project name and track count.

Places are a separate feature in `places.json`; they do not belong to projects. Each place needs a unique five-character lowercase letter/digit `id`, a `name`, and WGS84 `lon` and `lat`. Optional fields are `date` (`YYYY-MM-DD`) and `desc`. Only include locations and descriptions you intend to make public. The current entries are visibly labeled as examples and must be replaced or removed before publishing real visits.

The build validates references and place data. The published page contains project names, track IDs, and the explicitly listed places, never the source file paths.
