# Tracks data

Track files live in `data/tracks/<type>/`. `scripts/build-tracks.mjs` reads
them into static JSON under `public/tracks-data/`: `index.json` holds the
metadata the page filters on, and `<id>.json` holds one track's geometry,
fetched only when the map draws it. That output is generated and not
committed.

A Vite plugin runs the build on `buildStart` and again on any change under
`data/tracks`, so the dev server needs no separate step.

## Add a file

```
pnpm add-track ~/Downloads/ride.gpx --type bike
pnpm add-track ride.gpx --type bike --name "Morning loop" --featured
```

That copies the file into `data/tracks/bike/`, optionally renames the track
inside it, rebuilds, and prints a link to the new track. `--type` is one of
`drive drone flight ship hike run bike other`; without it the file is filed
under `other`.

Copying a file into `data/tracks/<type>/` by hand does the same thing. The
dev server rebuilds on any change under `data/tracks`, and `pnpm tracks`
rebuilds without starting it.

`.gpx`, `.kml`, `.geojson` and `.json` are all read. A file with several
tracks in it becomes several tracks on the page; its `<wpt>` points are
collected into one waypoint entry.

`data/tracks/featured.json` lists source paths, names or ids. Featured tracks
are the ones the page offers before the visitor has picked anything.

## Ids

`data/tracks/ids.json` records which id belongs to which track. **Commit it.**
Without it a rebuild hands out new ids, and every link anyone has shared stops
resolving. The build prints the ids it has just assigned as a reminder.

An id is five characters with no relation to the track's name, because a link
carries the whole workspace and because an id derived from a name changes
whenever the name does. The build matches a track to its id by source path
first, then by a fingerprint of the track's shape, so renaming the file or the
track inside it keeps the id. Entries for tracks that are gone stay in the
file, so an id is never given to a second track; delete an entry by hand if
you want its id released.

If a link does break, the fix is to edit `ids.json`: put the id that was
shared against the track's current source key.

## What a link carries

Everything the view is made of lives in the query string, so a copied URL
reopens what the sender was looking at. The map toolbar's `⧉ link` button
copies it; the address bar holds the same thing.

| Parameter | Holds                                              |
| --------- | -------------------------------------------------- |
| `ws`      | tracks on the map, ids run together, five characters each |
| `sel`     | selected track                                      |
| `at`      | camera as `lon,lat,zoom,pitch,bearing`              |
| `3d`      | `1` with terrain on                                 |
| `base`    | `amap` or `osm`, written only when it differs from the visitor's default |
| `panel`   | `peek`, `half` or `full`, written only when it is not `half` |
| `t`       | playback position in seconds                        |
| `play`    | `1` while playback is running                       |
| `r`       | playback rate, written only when it is not 60       |
| `type` `kind` `q` `from` `to` `dmin` `dmax` `altmin` `view` | the filters |

Playback moves every frame, and rewriting the URL that often would cost more
than it buys, so `t` is only written while playback is paused. A link taken
mid-playback carries the point playback started from, and whoever opens it
seeks there and runs on from there.

Ids in a link that the library no longer has are dropped, and the panel says
how many. Past forty tracks the link stops listing them; the map itself is
unaffected.

Opening a link does not overwrite the workspace the visitor had saved. It is
kept once they change it themselves.
