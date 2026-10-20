// Picks the name to show in a wanted language, as docs/apps/geo/gpx-names.md in dgs-toolbox
// says: the candidates are every translation and `name` itself when its language is known,
// `name` winning a tie; an exact tag first, then the first longer tag by lower-case order,
// then `name` as it is. `lang` is null when the shown text's language is not known.
export function pickName(item, wanted) {
  const want = wanted.toLowerCase();
  const candidates = new Map();
  Object.entries(item.names ?? {}).forEach(([tag, name]) => candidates.set(tag.toLowerCase(), { name, lang: tag }));
  if (item.lang) candidates.set(item.lang.toLowerCase(), { name: item.name, lang: item.lang });
  if (candidates.has(want)) return candidates.get(want);
  const longer = [...candidates.keys()].filter((tag) => tag.startsWith(`${want}-`)).sort();
  if (longer.length) return candidates.get(longer[0]);
  return { name: item.name, lang: item.lang ?? null };
}

// Every name an item answers to, so a search finds it in any language.
export const allNames = (item) => [item.name, ...Object.values(item.names ?? {})];
