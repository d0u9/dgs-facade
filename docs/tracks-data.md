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

`data/tracks/ids.json` records which id belongs to which track. The mock data
in `data/tracks/` is currently kept outside this branch's commits, so keep a
separate backup of the ledger with the source files and provide both to the
build environment. A deployment without this directory has an empty track
library. Without the ledger, a rebuild can assign different ids and shared
links can stop resolving. The build prints the ids it has just assigned as a
reminder.

An id is five characters with no relation to the track's name, because a link
carries the whole workspace and because an id derived from a name changes
whenever the name does. The build matches a track to its id by source path
first, then by a fingerprint of the track's shape, so renaming the file or the
track inside it keeps the id. Entries for tracks that are gone stay in the
file, so an id is never given to a second track; delete an entry by hand if
you want its id released.

If a link does break, the fix is to edit `ids.json`: put the id that was
shared against the track's current source key.

## Stops in playback

A track that stands still plays back as real time spent watching a motionless
dot: the map marker is placed by position and the elevation profile's cursor by
distance along the track, so through a stop neither of them moves. One drive in
this library parks for 47 minutes, which at 60x is 47 seconds of a page that
looks like it has hung.

Stops are found once per track and replayed at a boosted rate, so any stop
takes about `IDLE_WALL_S` (1.5 s) however long it really was. The playback
clock stays the track's own time, so the marker, the profile, the scrubber and
the link are unaffected.

A stop is a window of at least `IDLE_MIN_S` (60 s) averaging under
`IDLE_SPEED_MS` (0.05 m/s). Neither the gap between two samples nor the
distance between them answers on its own: a parked phone's position jitters,
and simplification thins a long stop down to a couple of samples far apart.
Measured over a window, the slowest stretch of the hikes here averages
0.25 m/s, so a slow walk is not taken for a stop. All three constants are at
the top of `src/tracks.jsx`.

Four things say a stop is a stop rather than a hang: the marker pulses, the
detail card names it and how long it lasts, the profile shades the stops so
they can be seen coming, and a progress bar under the profile carries the
track's time, since the profile's own axis is distance.

A recording that was paused and resumed looks the same to this rule as a
vehicle that stood still, and is currently labelled a stop either way. See
below.

## Known gaps

**`<trkseg>` boundaries are discarded.** The segments of one `<trk>` are
concatenated into a single line, so a recording paused in one place and
resumed in another is drawn as a straight line between the two and its length
counts towards the track's distance. The drive in this library has 27
segments whose seams total 358 m against 56 km, so it is invisible there; a
recording resumed 20 km away would not be.

**A recording gap is reported as a stop.** Both show as a long stretch that
covers no distance, and the playback label says `stopped`. Telling them apart
needs the segment boundaries above.

**Duration counts the gaps**, so the average speed a track reports is lower
than the speed it was actually driven or walked at.

**Waypoints are collected per file, not per track.** A file with several
tracks and several waypoints gets one waypoint entry covering all of them.

**Tracks from one file are not grouped** in the list. They share a `source`,
which the search box matches, and nothing else marks them as related.

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
