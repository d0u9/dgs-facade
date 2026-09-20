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

`data/tracks/ids.json` records which id belongs to which track. It is committed
with the track files it describes, and the two belong together: a deployment
without `data/tracks/` has an empty track library, and a rebuild without the
ledger can assign different ids, which stops shared links resolving. The build
prints the ids it has just assigned as a reminder.

An id is five characters with no relation to the track's name, because a link
carries the whole workspace and because an id derived from a name changes
whenever the name does. The build matches a track to its id by source path
first, then by a fingerprint of the track's shape, so renaming the file or the
track inside it keeps the id. Entries for tracks that are gone stay in the
file, so an id is never given to a second track; delete an entry by hand if
you want its id released.

If a link does break, the fix is to edit `ids.json`: put the id that was
shared against the track's current source key.

## Waypoints on the map

In 2D a waypoint is a dot with its name beside it, and the name is never faded,
even while another track is isolated: it is the only thing that tells one
waypoint from another.

In 3D the flat dot and the flat name are both switched off and each waypoint
becomes a callout: a leader line straight up from the point, a shelf across the
top of it, and the name on the shelf. The leader is what says where the point
is, so the name itself never has to sit on the terrain. Terrain is drawn at
`TERRAIN_EXAG` (2.5), which is what makes a name laid on the surface unreadable
against the hillshade and the track line, so the callouts float clear of it.
How far is given in screen pixels, not in metres: `WPT_FLOAT_PX` is 110, and
`PIN_FLOAT_PX` 150 for the playback marker. A fixed height in metres is lost in
the relief when the map is zoomed out and thrown off the top of the screen when
it is zoomed in; a number of pixels holds the same look at every zoom, and is
converted against the view's own scale each time the view settles. The callout
is what a click hits, since the ground dot is gone.

A waypoint has no elevation in many exports — none of the ones in this library
do — so the ground under it is sampled from the DEM. That query answers 0 until
the tile it needs is in memory, which is what used to leave a callout at sea
level, far below its own point, until something happened to redraw it. The
sample is retaken when the map next goes idle, the last good value is kept in
the meantime, and the retry stops once every waypoint has a height, so a still
map does no work. Switching to 3D starts the sampling over, because the ground
under every waypoint has just moved and the DEM for the view is not in memory
yet. A waypoint outside the view never receives a tile, so the retry also has a
fixed budget of twelve passes and then gives up rather than running on every
idle for as long as the page is open.

A callout is also dimmed far less than a track line is. A faded line is still a
line; a faded name is unreadable, and the name is the whole point of the
callout. A waypoint from the same file as the selection is not dimmed at all.

The shelf is an icon, not a line layer: a line in world coordinates turns
edge-on as the camera orbits, while an icon is a billboard and stays across the
screen whatever the bearing. One wide icon is drawn at the size each name
needs — deck sizes an icon by its height and keeps its aspect, so a shelf that
has to come out N pixels wide is asked for at N / aspect. The name's layer
takes `characterSet: 'auto'`, because deck's default atlas is ASCII and would
drop every Chinese character in a name.

## The detail card on a phone

The card shares a stage about 400 px tall with the map, and the six figures a
track reports take more of that than the map can spare. On a screen narrower
than 760 px they fold behind one line, which still carries the two that answer
what the track is — its distance and its duration — and the rest open on a tap.
The profile, the title and the playback row all lose a few pixels there as
well, so the closed card fits without scrolling.

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

## Files with several items

A file that produces more than one item — sub-tracks, or a track and its
waypoints — is one row in the list with a submenu under it.

The row itself draws the whole file and zooms to it. When the file holds
exactly one recording that recording is selected too, so the detail card, the
elevation profile and playback are there without a second click; a file of
several tracks has no such subject and nothing in it is selected. The tick box
draws the file without moving the camera, and the caret on the right folds the
submenu, which ticks and selects one sub-track or the waypoint set. Picking a
file of one recording does not open its submenu — there is nothing in it to
choose between, and the caret is there for the waypoint list; a file of several
tracks does open, because the submenu is how one of them is reached.

A picked file is isolated on the map the way a picked track is: the rest fades
and every item of that file stays lit. A file of exactly one track and its
waypoints takes the track's name; any other file takes the file name.

Waypoints often carry no time. Such a waypoint entry borrows the start and end
of the file's own tracks, so it sorts and groups beside them instead of
falling into `undated`.

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
| `base`    | `amap` or `osm`, always written                     |
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

`base` used to be left out when it matched the sender's own default, and a
reader with no `base` fell back to `navigator.language`. Amap tiles are in
GCJ-02 and the track coordinates are shifted to match, so the same `at` means
one place on Amap and a place a few hundred metres away on OpenStreetMap: a
link from a zh-CN sender opened somewhere else for everyone else. It is always
written now, and switching basemap moves the camera by the same shift as the
tracks, so the view stays on what it was looking at.

A camera carried by `at` is held against every automatic fit, not only the
first one. The page moves under itself on the way up — the workspace resolves,
unknown ids are dropped, geometry arrives — and each of those used to be able
to trigger a fit that threw the restored view away. Automatic fits are refused
until the visitor moves first: picks something, opens a file, or presses fit.

The map is built before the track index arrives, so the first fit has nothing
to fit to and the view is fitted again as soon as the tracks land. A reload
therefore opens on the restored workspace, not on the world, and a camera
carried by `at` survives because the empty first pass leaves it alone.
