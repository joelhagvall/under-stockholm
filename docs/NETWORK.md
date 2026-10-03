# The whole network, alive

A view of the entire Stockholm metro at once, in `src/network/` (`?natet`, *Se hela nätet* on the landing page and in the pause menu). The short pitch is in IDEAS.md under "Bigger ideas".

Built: the data with real positions, depths and the water (`data.ts`, `geo.ts`, checked by `tests/network.test.ts`), the long exposure poster (`exposure.ts`), the 3D view with tubes, stations that breathe with their riders, live trains with trails, real trains, other players as fireflies, the time scrubber and a day in a minute, the geography to line map morph and a note per departure (`view.ts`), and the city in cross-section: the ground with its real heights (`terrain.ts`, from the Copernicus DEM by `scripts/terrain.ts`), the buildings of the inner city and round every station (`surface.ts`, from OpenStreetMap by `scripts/osm-city.ts`), and a notch cut out of it in front of the point looked at, with the face of the cut drawn. The dive is simpler than planned below: the camera drops to the station, fades, and the game loads and starts on its platform without the pause menu (`GameOptions.station`), with its own loading screen and its own renderer. Not built yet: the seamless flight on one shared canvas, the flight back out, and today's exposure on the landing page.

## The picture

- Every line is a glowing tube hanging at its real depth under a see-through Stockholm: the ground has its real heights, so a station's tracks lie at the ground's height less its depth, and between two stations underground the tube keeps at least 8 m under the ground. Heights are stretched tenfold seen from far out, so the network reads as a root system under the city, down to twice close by, and not at all at true scale. Kungsträdgården lies far under the sea, Tekniska högskolan up inside Östermalm's hill.
- The water comes from the heights (the sea and the lakes at their bottom), with a small inline coastline polyline beyond them. The ground is a faint, translucent sheet shaded by its slopes, and the buildings glassy blocks over it.
- The cross-section: four clipping planes take a notch out of the ground and the buildings in front of the point looked at, and a wall along the back of the notch shows the ground's profile from the surface down into the dark, the tubes passing through it.
- Every train is a point of light with a fading trail, in its line's color.
- Players online (the relay's ghosts) glow as fireflies at their position.
- Each station breathes with its riders: a soft pulse scaled by `riders`, stronger at rush hour.

## What makes it more than a map

- **The same trains as the game.** Positions come from `Timetable.stateAt(time)`, so the view shows exactly the trains you meet on entering. In real mode it shows SL's trains through the relay, with the same warped clocks as `realService.ts`.
- **A day in a minute.** A time scrubber runs the clock fast: rush hour pulses through the net, the night break empties it (`operations.ts`), Silverpilen streaks past at night. Letting go snaps back to now.
- **Geography to schematic.** One slider morphs between true geography and the schematic SL map. Every station has both positions, and the vertex shader lerps between them with a single uniform, so tubes, trains and labels all follow.
- **The network as music.** Every departure plays a synthesized note, pitch per line, panned by x. The metro becomes generative music that follows the clock: dense at rush hour, sparse at night, silent in the night break.
- **Dive in.** Click a station and the camera follows a real train into the game without a cut. See "Seamless into the game" below.
- **Long exposure.** Every run of the day drawn as one long-exposure photograph, a unique poster per date. See "Long exposure" below.

## How to build it

### Data (`network.ts`, no three.js)

- Every station: name, line(s), geographic position (SWEREF 99 or lat/lon converted to meters from a fixed origin, T-Centralen at 0), depth below ground, schematic position.
- Every line: an ordered polyline of stations per route, plus a few shape points between stations where the real tunnel bends.
- A coastline polyline for water, simplified to a few hundred points. Inline numbers, not an asset file.
- Kept free of three.js like `routes.ts`, so the landing page can use it for a 2D version.
- Reuse the line data from the all-lines work: `BLUE_LINE.stations` and its siblings plus `src/landing/lines.ts`. Add a test like `tests/line-map.test.ts` so the copies agree.

### Train positions

- One timetable per route, as in `routeTimetables` in `routes.ts`.
- `stateAt(time + offset)` gives the distance along the route. Map it onto the route's geographic polyline by arc length, piecewise between stations, so a train at a platform sits exactly at the station and moves smoothly between.
- Track 1 and track 2 get a small sideways offset so both directions show.
- Trails: sample the timetable at `t - k * dt` for a few k per train each frame (it is a pure function, so the past is free), or keep a small ring buffer. Draw as fading line segments.

### Rendering (three.js, lazy loaded)

- Tubes: one `TubeGeometry` per line along a Catmull-Rom curve through the stations at depth, merged into one mesh with additive, slightly transparent material.
- Trains: one `InstancedMesh` of small glowing quads or spheres for all trains, one draw call.
- Stations: instanced too, with a per-instance pulse attribute.
- Geo/schematic morph: store both positions as attributes (`position` and `schematic`), lerp in the vertex shader by a `uMorph` uniform.
- Glow: a cheap bloom pass or just additive sprites, whichever holds the frame rate on mobile.
- Camera: orbit controls, with a scripted dive for "click a station".

### Sound

- Reuse the synths in `audio.ts`. One voice per line with its own scale, triggered when a train's phase goes from `closing` to `moving`.
- Keep it quiet and filtered by default, with a mute toggle.

### Entry points

- `?natet` in the URL, a button in the pause menu and "Se hela nätet" on the landing page.
- Load it with a dynamic `import()` like the game, so the landing page budget is untouched. `main.ts` must not import it statically.
- The dive into the game uses the existing boot with a station index, like `goto(i)`.

## Long exposure

Every run of one day drawn as a single long-exposure photograph: bright where trains pass often, faint where they are rare, the night break a dark gap. A new image every date, the same for everyone, made to be saved and shared.

- **The whole day at once.** The timetable is a pure function, so a day needs no simulation: for every service, sample `stateAt` from first to last train (every few seconds is enough), map each sample to its position and draw the path. Any date works, also past and future ones.
- **Why every day differs.** Weekday or weekend, summer timetable, the night break (`operations.ts`), express runs (`express.ts`), Silverpilen's night run and the made-up disruptions all come from the clock, so each date gives its own pattern. Weather from the relay can tint the ground for today.
- **Drawing.** Canvas 2D with `globalCompositeOperation = 'lighter'` is enough: thin, faint strokes in the line colors that add up where trains repeat. Tone map at the end (log curve) so the trunk through T-Centralen does not burn out while quiet branches still show. Stations as small points, T-Centralen as the brightest knot. Plain Canvas 2D keeps it free of three.js, so the landing page could show today's image too.
- **Two views.** Schematic (clean, poster-like) or geographic (the real shape of the city), the same choice as the morph slider.
- **The poster.** A title and date in Swedish ("Tunnelbanan | 24 september 2026"), a few numbers from the same samples (runs, train kilometers, first and last departure) and the station names small. Rendered at print size (A2 at 150 dpi, drawn in tiles if the canvas limit bites).
- **Save and share.** `canvas.toBlob` to a PNG named after the date, and the Web Share API with the file on phones.
- **Real mode later.** For SL's real trains the relay would have to keep the day's departures. Without that, the poster shows the game's day, which is the honest version anyway: the trains you could have met.

Where it lives: a button in the network view ("Dagens exponering"), a date picker, and possibly a small copy of today's image on the landing page, loaded after the page is idle.

## Seamless into the game

Click a station in the network view and the camera picks up the next train heading there, follows it from outside through the network, slides in through the window and you are seated in the game: same train, same second, no loading screen.

- **Pick the train.** The service whose next stop is the chosen station and which gets there soonest, but no sooner than the flight needs (about 10 to 20 seconds), read from the route timetables.
- **The flight.** The camera starts wide, drops down to the tube, closes in on the train and follows it by its timetable position, so it is the same train the game will seat you in. The last stretch is inside the dark tunnel, which hides the swap.
- **Load during the flight.** On the click, start `import('./game/boot')` and the trunk build (`World.load`) straight away. The flight is the loading screen. Stations on a branch need `World.later` to build the target station first. If loading is not done when the train arrives, the camera keeps following it to the next station instead of showing a spinner.
- **One canvas.** The network view and the game share one `WebGLRenderer` and canvas, so there is no context switch or white flash. The network scene is disposed only after the swap.
- **The swap.** In the tunnel, at a dark moment, switch the scene and put the player in a seat on that service, reusing `stageArrival` in `boot.ts` with the service and the station given instead of chosen. The camera pose at the end of the flight should match the seat, so the cut is invisible.
- **Sound carries over.** Let the train's rumble start during the flight with the same parameters as the ride sound, so the audio runs straight through.
- **Pointer lock.** It needs a user gesture, and the flight outlasts the click. Ask for the lock on the station click itself, or end with a short "Klicka för att ta över" once seated. On touch, nothing is needed.
- **Also backwards.** Esc in the game could fly back out: up through the tunnel roof into the network view, where your train is still a point of light.

## Order of work

1. `network.ts` with geography, depth and schematic positions, plus the test that it agrees with the game's line data.
2. Long exposure. It needs only the data and the timetables, no 3D, so it can come first and ship on its own.
3. A static 3D view: tubes, stations, coastline, orbit camera.
4. Live trains from the timetables, then trails.
5. Seamless into the game.
6. Time scrubber and the geo/schematic morph.
7. Sound, real mode, ghosts.

## Hard parts

- **Coastline and depths.** Must be small inline data. Depths per station are published by SL and in public sources, but need collecting by hand.
- **Mobile frame rate.** Keep everything instanced and the bloom optional.
- **Real mode.** Needs the relay to carry departures for every line, not only the blue one.
