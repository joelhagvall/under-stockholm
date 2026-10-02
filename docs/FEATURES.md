# Features

The short version is the [README](../README.md). This is the rest. How to play is in [GAMEPLAY.md](GAMEPLAY.md).

[The network](#the-network) · [Live Stockholm](#live-stockholm) · [The service](#the-service) · [The platform](#the-platform) · [The train](#the-train) · [Places to find](#places-to-find) · [Beyond the platform](#beyond-the-platform) · [How it is built](#how-it-is-built) · [Project structure](#project-structure)

## The network

- **Generated cave stations.** Each station is built from data: a blasted-rock vault (broad bulges, blasting-round scallops, fine roughness, smooth normals and darkened recesses), an island platform with stone slabs and tactile strips, tracks, a service rail with uplights, speakers and cameras, clocks showing the real time, information pillars, benches, signage, an escalator shaft and a ticket hall with gates and an exit stair.
- **As deep as the real ones.** Every underground station lies at its own depth, from the real stations' (mostly Swedish Wikipedia, after *Stockholm Under*): the escalators climb 30 m at Kungsträdgården, Husby and Duvbo and 33 m at Västra skogen, Sweden's longest, up an inclined shaft, while the green line's inner city stations under the streets are a short ride. Kista lies in the open, as its viaduct does.
- **Halls where the real ones are.** Each station's ticket halls stand where its real ones do (read from Albert Guillaumes' station plans, as a reference), 39 stations have more than one, each with its own gates, stairs and street, and 38 deep stations have inclined lifts, snedbanehissar, 52 in all: a glass cabin in its own shaft beside the escalators that waits with its doors open at the platform, rides up to the hall and back and carries you with it. Where the real walk to the hall is long, a tiled passage leads from the top of the escalators. At 28 stations escalators climb from along the platform to a hall above it: up through the ceiling at twelve tiled stations (Hötorget's octagonal hall among them), through the rock's crown at eight rock caves (Kungsträdgården, Västra skogen and Mörby centrum among them) and past the roof at eight in the open (Gullmarsplan, Blackeberg, Farsta strand). At 38 stations in the open the escalators go down through the platform to a hall under the tracks, whose stairs come up on a little square beside them, beyond the fences: at most of them, as the real ones do, the flight runs down past the platform's end to a hall under the open track beyond it. 27 stations built as two platform tunnels have a wall down the middle of the island. Where a hall takes the end of the platform the staff door or a turnback is at, the staff door moves beside its escalators, and a passage goes in under them.
- **Station art.** Every station looks like its real self, after photos and descriptions of the real ones: underground the colours of its rock or tiles, its floor, its ceiling and columns, and its signature art painted round the vault or standing on the platform (Stadion's rainbow over the wall down its island, the glass dodecahedron at Tekniska högskolan, Hötorget's neon loops, Bagarmossen's glowing glass band, Husby's birch trunks and steamboats, the red bicycle and runestone at Bergshamra). In the open, the roof over the platform is the real one: its shape (a flat slab, Peter Celsing's butterfly roofs on the Farsta and Hagsätra lines, a gable), how much of the platform it covers, the colour of its steel (Hallunda's lime green, Norsborg's orange, Globen's blue, Sandsborg's oxblood) and lamp posts beyond it; rock or concrete cuttings where the line runs in one, viaducts at Kista, Ropsten (its tracks ending in mid-air toward Lidingö), Hässelby gård, Brommaplan, Bredäng, Vårby gård and Farsta, where the ground lies far below the deck and the ticket hall stands on it under the tracks, a town centre's deck over Vällingby, Gullmarsplan, Axelsberg and Farsta strand, and the arena beside Globen. The art objects of the open-air stations stand on their platforms too. Generated interpretations, not replicas.
- **The whole metro.** All three lines, SL's 100 stations (plus Kymlinge, which never opened) and seven routes: the blue line (10 Hjulsta, 11 Akalla), the red line (13 Ropsten to Norsborg, 14 Mörby centrum to Fruängen) and the green line (17 Åkeshov to Skarpnäck, 18 Alvik to Farsta strand, 19 Hässelby strand to Hagsätra). Every route has its own timetable. On a line's trunk the routes take turns and never meet; a shorter route waits out the difference in its turnbacks, and 17 and 18 turn back on sidings between the running tracks beyond Åkeshov and Alvik. The connecting track between the green line and the blue is there too, though no train in service takes it: in the tunnel from Thorildsplan toward Fridhemsplan, and in the blue line's between Rådhuset and Fridhemsplan, a switch in a cavern of its own leads off the westbound track under a red signal to a tube that runs away into the dark behind a locked gate.
- **Branches and portals.** The world stays one straight corridor along x. Each line is laid out along one route, and every other route's own stations (a branch) are built elsewhere along x; its trains cross between two identical copies of the junction tunnel at a point deeper than the fog reaches. The red line branches at both ends, the green line three ways.
- **Shared stations.** T-Centralen, Gamla stan and Slussen are one station each for the red and green lines: four tracks and two island platforms, one direction of both lines on each, so you change by walking across the platform. The green line runs in beside the red one through portals before T-Centralen and after Slussen.
- **T-Centralen on two levels.** The red and green platforms lie as the real ones do, one over the other, a level per direction with red and green either side of each island: southbound trains call at the lower level, stairs lead down to it through the upper island's floor, and the escalators to the ticket halls leave from the upper.
- **Walkways between lines.** From the blue line's T-Centralen, Blå gången (painted blue rock) leads to the red and green platforms; at Fridhemsplan a tiled passage joins the blue and green lines. The two ends lie far apart along x, so each is built as the same Z of corridor and you cross between them, unseen, in the middle of its long run.
- **The open air.** More than half of the red and green lines run above ground, and so do their stations: platforms under canopies on steel posts, fenced track beds with birches, pines and blocks of flats beyond (round each station the real ones, their footprints and heights from OpenStreetMap, the map turned so the real tracks run along the game's), and concrete tunnel mouths where the line goes into the hill. The sky follows the sun's real position and the weather, dusk turns the lamps on, rain and snow fall around you, and the fog opens out to the horizon. Junctions stay covered around their portals.
- **Over the water.** Between T-Centralen and Slussen the red and green lines cross Riddarfjärden in the open, as in reality: bridges over the water, Gamla stan's open-air station with its 1950s ticket hall spanning the tracks, Centralbron's motorway deck alongside, the old town's plastered houses and copper roofs to the east, Riddarholmen with its church's cast-iron spire, the City Hall's tower with the three crowns across the bay and Södermalm's green cliffs toward Slussen.
- **Built as you go.** The blue trunk is built behind the loading screen. Everything else is laid out at once (colliders, zones, signs' positions) and only built when you come near, and taken down again when you are far away, so loading and memory stay about what they were for the blue line alone.

The red and green stations follow reference photographs: the cream vaults, white tiles and ceramic frieze of T-Centralen's lower platforms, Slussen's golden terrazzo and blue-grey tiles, Gamla stan's woven walls and mosaic floors, Östermalmstorg's line drawings in concrete, Stadion's rainbow, Tekniska högskolan's marbled blue, Mariatorget's golden slats, Hötorget's pale turquoise tiles, Medborgarplatsen's yellow tiles and blue columns, Skarpnäck's red ceiling and many more. The blue line's look takes cues from reference photographs of C20 trains and the first four stations: geometric red/green terrazzo and classical fragments at Kungsträdgården, large blue leaves at T-Centralen, terracotta rock and stone portal surrounds at Rådhuset, and muted rock with maritime objects at Fridhemsplan. Stadshagen (a running-track band under pale rock) and Västra skogen (birch trunks on dark green rock) are free interpretations. Paired fluorescent troughs, white station-name panels, amber departure displays and a Swedish passenger-information overlay connect the environments.

See [DESIGN.md](DESIGN.md) for image sources, deliberate simplifications and reproducible debug views. The geometry and art remain generated interpretations rather than exact replicas.

## Live Stockholm

- **Real trains.** The trains follow SL's live metro by default (*Riktiga tåg (SL)* in the pause menu turns it off), line by line: all three lines from Trafiklab's GTFS Regional feeds, or the blue line alone from SL's Transport API when the relay has no keys (its quota is too small for every station), while a line without data keeps to the timetable. Real destinations, real departure times on the boards, trains that wait at the platform until the real one leaves. Silverpilen still runs among them: she waits in the east turnback for a gap between SL's trains, stands in the dark tunnel behind a real train that holds her up, and fades if one catches up from behind. Positions are inferred from SL's departure times (refreshed every 15 s from GTFS), so trains run slower through the game's compressed tunnels. The landing page shows each line live, one at a time, by the game's rule: SL's trains where SL covers the line, the game's timetable elsewhere. SL is only polled by the relay, once for everyone, so without a relay the pause menu's toggle is hidden and the landing map keeps to the timetable.
- **Real Stockholm time.** Game time is Unix time, so every visitor sees the same trains at the same moment. Clocks, boards and the HUD show Stockholm time. On weekday nights (01:00 to 05:00) trains finish their loop and leave service in the east turnback cavern, boards read "Sista tåget har gått" with the first morning train, lights dim, escalators stop and a floor scrubber hums along the nearest platform. The weekend nights run all night. Passenger numbers follow rush hours.
- **Up on the street.** At every underground station the exit stairs go on up through an open cut to the real street round that exit, from OpenStreetMap: the city is laid so the real entrance furthest out toward that end of the platform lies where the stairs come up (just outside the house where OSM has it indoors), turned about it so the stairs come up where the map has room for them, clear of houses and water with open ground ahead, and round a paved square with the blue T on its pole, lamps, benches and planters stand the real houses (their footprints and heights, stone ground floors with shop windows in the city, pitched roofs on villas), the streets with their names on the corner houses, parks, woods, water and trees, and you can walk out among them. The sky shows through the open top of the stairs, windows light up as it gets dark and snow settles on the square while it snows. At the stations above ground where the hall stands over the tracks, a door at the top of its stairs opens straight onto the same kind of street, level with the landing, under the station's name on the front of the hall's own building. Where OSM has nothing, the square is shut in by plastered houses of five and six storeys, with a road, parked cars and a zebra crossing.
- **Weather at the exits.** The light follows the sun's real position over Stockholm and the current weather from Open-Meteo (through the relay; a seasonal guess without one): snow blows in over the top steps, rain drives past the doors, wet footprints cross the ticket hall, and passengers carry umbrellas and winter hats.
- **Real facilities.** When SL reports an escalator out of order at a station, it stands still in the game too.
- **Days and seasons.** On some days a down escalator stands still with signs by it, and one up escalator squeaks all week. Friday afternoons bring clinking bottle bags, October 4 brings cinnamon bun bags, August nights bring crayfish party hats and lanterns, and Sunday mornings are almost empty apart from someone with flowers and a jogger who runs up the escalator. Winter fogs the train windows (someone has drawn a heart), mists the stairs and shows your breath near the doors; autumn leaves lie on the steps; in July the carriages are stuffy, windows are tipped open and people fan themselves.
- **The power cut.** A couple of times a year, on days picked by the date, the power goes for four to seven minutes, for everyone at once. The tubes die with a flicker and a clunk, only the green exit signs and a faint emergency light remain, and every train coasts to a stop wherever it is and stands dark. Your phone torch comes on, the passengers around you light theirs and the beams sweep over the rock. After half a minute an announcement, then the lights flicker back and the trains pull away, running a little fast until they are back on time. The hold is a warp of the timetable clock (`powerCut.ts`), so everyone sees the same trains stand in the same places.
- **The year.** A Christmas tree and a paper star in the halls through advent, a midsummer wreath in June, fireworks heard down the stairs at New Year, a Lucia procession singing on the platforms on December 13, students in white caps singing in the carriages in early June, a gang singing on the way home on weekend nights and a lost high-heeled shoe the morning after. On the summer timetable one train per route rests, the city is half empty and tourists ask the way in English.

## The service

- **The C30 on the red line.** The red line runs the C30, as it has since 2020: two units of four sections with open gangways between them and three pairs of doors to a section, a smooth white body with blue doors and a window to each bay, and a front of black glass inside a ring of light. Inside, pale walls, yellow poles and seats with black and white triangles. As on every train, the units are coupled cab to cab, so you cannot walk from one to the next.
- **Trains you can ride.** Three C20-inspired units, each with three articulated sections and a 2/3/2 door layout: sloped cab fronts with a big windscreen and destination display, a silver body with a dark window band and blue doors, textured door leaves, and an interior with its own baked ceiling lighting, fabric seats, vinyl floor, grab rails and next-stop displays. Eight trains run the blue line, thirteen the red and twenty-two the green, about ten minutes apart on each route as SL runs them by day. Doors open on the platform side and stand open as long as the station is busy, about 12 s out in the suburbs and half a minute at T-Centralen and Slussen, then chime and close. You ride along through the tunnels, and at the ends of the line the trains shunt across in a turnback cavern.
- **Timetable as a pure function.** The whole service is modeled as one loop (west on track 1, across, east on track 2, across). A train's position, speed and door state are a function of the clock plus an offset, so trains can never collide and departure boards are easy to compute.
- **The tunnels.** Block signals turn red behind every train, the points motor clunks before a train shunts across a turnback, green signs point to a cross passage halfway along every tunnel with a stair up to an alarmed exit, and now and then an empty train marked "Ej i trafik" rushes through a station without stopping. On weeknights a yellow maintenance vehicle stands in one of the tunnels with its beacons turning while the crew grinds a joint.
- **Tunnel wind.** Headlights pool on the trackbed and glint along the rails before a train appears. The piston wind rises as it nears the cave, with a gusty whoosh, and loose newspaper pages lift and skid along the platform.
- **Metro audio.** Tunnel rumble and motor whine use Web Audio. The browser's Swedish voice reads every announcement over a synthesized chime and door warning, with Swedish subtitles. Local builds can play recorded C20 clips instead; they never go out (`RECORDINGS=0`). Browser speech handles game-specific notices. People around the player speak their lines aloud in it only with "Voices around you" on in the settings (off by default: it is the announcer's voice again), and never in Swedish without a Swedish voice installed. Timing and the clip library are in [GAMEPLAY.md](GAMEPLAY.md).

## The platform

- **Detailed escalators and cabin.** Moving ribbed steps, level landings, steel balustrades, rounded black handrails and comb plates follow Stockholm photo references. The cabin is the renovated C20's: between the doors a row of side seats along one wall and groups of four facing along the train across the aisle, the walls taking turns, side seats to the gangways and up to the cab bulkheads, navy seats patterned with triangles and a yellow priority seat by each door, flex areas with a lean bar and pram and wheelchair signs by the doors and at the gangways, pleated gray gangways with a turntable plate, a yellow cab bulkhead, dot-matrix destination displays over the gangways and cab doors, yellow poles, rails and grab handles on the door columns, glass screens, emergency panels and paired light troughs. The time machine's 1975 cars and Silverpilen keep the older stock's groups of four all along, with brown ribbed seats and steel poles, and passengers, seats and colliders follow the stock. Escalator steps share their speed with passenger transport; smooth ramp colliders keep the camera steady.
- **Stations that look used.** Chewing gum trodden into the stone, a snus tin on a bench, stickers on the pillars and bins, a lost cat notice in the ticket hall and made-up posters that change every day. One platform clock at Rådhuset has always been two minutes fast, and one fluorescent tube per station flickers and hums. The amber boards list each track's next two trains, route number first, with a line of notices under them, and in the evening they say when the last trains leave.
- **People.** A child waves at departing trains, a dog and a pram wait on the platform, travellers pull suitcases at T-Centralen, a child stands at the front window of every train, passengers hold the rail and sway as the train brakes, one sleeps against the window and phones light faces blue. In the ticket hall the booth attendant looks up as you pass and a street paper vendor says hello (and sells you a copy with `E`). On the escalators people stand on the right and walk on the left; stand still on the left and the walker behind you says "ursäkta", then sighs, then explains the rule.
- **Life in the stations.** Pigeons peck by the doors and take off up the stairs when you come close, and a rat runs along the foot of the platform and dives for a drain when the rails start to sing. A saxophonist plays generated jazz in Kungsträdgården's hall. A commuter talks too loudly on the phone, a can collector goes from bin to bin, a couple says goodbye at the doors and one of them waves the train off, and someone sprints for the closing doors and either makes it or does not. Every station's main ticket hall has a kiosk: buy coffee and a bun and carry the steaming cup with you. Lost property turns up on benches and by the gates, including a phone that rings and that you can answer. Pick a thing up and it hops into the air, flies up in front of you and drops into the bag on the HUD, which holds five: hand them in at the booth in any ticket hall for a finder's reward on the card. The pause menu shows the collection, every kind you have found and silhouettes of the rest, with a bonus for the whole set.
- **Sound and light between the trains.** Buses, gulls and church bells at the top of the stairs, the red and green lines rumbling through the rock at T-Centralen, fans at the tunnel mouths, rails that tick and sing before a train shows, a horn as trains leave the tunnel, a bang and a shudder when a train passes the other way, a sneeze and a "prosit", and now and then music from someone's phone speaker. Dust swirls in the lamp light as a train arrives, red tail lights fade into the tunnel, carriages clunk over the points and the power rail sparks blue on cold nights.
- **The regulars.** The same people in the same places every weekday: the woman with a walker at Västra skogen just before 07:45, the guy with a guitar case at Solna centrum, the man who reads his paperback on the platform at Rådhuset, twelve named ones in all and one more at every other station. Each walks down at their time, waits at their spot and takes the first train that comes on their track, so missing it means it really left, then rides a few stations in the same seat. Their weeks have texture: a sick day now and then, three or four weeks off in July, a haircut every couple of months, an arm in a cast for six weeks, and for one of them a bump that turns into a pram. Be near one on a few different days and they start to nod at you, later they say "god morron". Recognition is saved locally; each named one goes in the discovery book.
- **Busker.** An accordion player in a tiled passage off T-Centralen's ticket hall plays generated polska-like tunes with positional sound and echo, from 08:00 to 22:00. Tip them with `E`.
- **Rush hour in the City passage.** The passage past the busker runs 150 m to the commuter train gates. At rush hour it is packed with about 200 simulated commuters who keep right, queue and press on you, plus silhouettes further off. Elbow your way through with `E`, but some argue and shove back. Punch with `Q` or a left click: people go down, hotheads hit back, and after three punches the guards walk you out to the ticket hall. Your time through is recorded.
- **The street preacher.** On most days a preacher with a hand-painted sign and her hands folded in prayer works the street side of T-Centralen's gates. Come within a dozen meters and she comes running, calling out, and follows wherever you run: through the gates, down the escalators, along the platform and onto your train if the doors are still open. Outrun her or leave her behind closing doors; if she catches you she takes your arm and you get the whole sermon. Now and then she runs after a teenager cutting through the hall instead. Taking a leaflet calms her. An invented character, not a real person.

## The train

- **In the carriage.** An empty can rolls up and down the aisle as the train brakes and pulls away, today's newspaper lies on a seat (yesterday's calm news from Sveriges Radio, through the relay; in 1975, real news of that day in 1975), and the cab has a window: stand at the very front and watch the tunnel come toward you. Graffiti flashes past on the tunnel walls.
- **In the trains.** The lamps of the tunnel sweep through the carriage as you ride, and the dark windows show the carriage, and you, mirrored. Inside, the platform's sound only comes in through open doors. A school class in high-visibility vests fills a car while the teacher counts heads, and at rush hour nobody sits next to you until there is no empty pair left. Pull the emergency brake and the train stops dead in the tunnel while the driver speaks; it runs on late (only for you).
- **Driver mode.** Press `K` (or use the pause menu) to drive a practice C20 from the cab on its own timeline while regular service steps aside: master controller, ATC braking curve, doors, and a score for stopping with the nose at each station's stop board.

## Places to find

- **Staff areas.** A gate at each far platform end leads down to a staff door: service corridors into the turnback caverns, a staff room with a locked emergency exit at T-Centralen, and a civil defence shelter deep under Rådhuset: stairs down to a lock between blast doors (a decontamination shower, gas masks on their hooks), a rock vault sprayed with concrete with triple bunks for 480, fluorescent tubes (one flickering) and a ventilation duct along the crown, and three rooms at the far end: command (a radio to switch on, a dead telephone, a map of the shelters, a clock stopped at twenty past four), the filter room with its hand-cranked fan and the welded reserve exit, and dry toilets.
- **Kymlinge and Silverpilen.** Beyond the west turnback cavern a dark tunnel leads to Kymlinge, the station that never opened. Once an hour, at an unpredictable minute, the silver ghost train glides west without a sound, stops at one station with its doors open and continues to Kymlinge before vanishing into the dark. It is a pure function of the clock and runs between regular trains (tests check at least 221 m clearance).
- **Tickets and inspectors.** Tap in at the gates' yellow readers with `E` (the card and fines are stored locally; with the SL card's balance short, a contactless bank card pays instead, as at SL's gates) or jump them. Now and then two inspectors board a train and walk toward you; when they ask, show your card with `E` (or Use). Without a valid ticket you are fined 1 850 kr and walked off at the next station.
- **Things to do.** An art walk with a plaque about each station's art, read aloud. A staff key on a hook in the shelter under Rådhuset opens the alarmed exits. Clues from T-Centralen's staff room to a locked cabinet at Kymlinge tell the story of Silverpilen, and staying aboard her past Kymlinge wakes you at Kungsträdgården at five in the morning, in a time loop of your own. Shared notes on the staff room boards, the map filling in as you explore, a time machine back to 1975 (green trains, split-flap boards, posters and clothes of the time, no phones) and a screensaver mode that rides the line on its own. A discovery book in the pause menu collects every hidden moment you have seen and hints at the rest, and a showcase tour (the pause menu or "Watch the tour" on the landing page) jumps between them: rush hour, snow and a Christmas tree, Lucia morning, 1975, Silverpilen, night track work and Kymlinge. The first time you set off, you start seated on a train rolling into a station.
- **Other players as ghosts.** Other players appear as faint silhouettes, riding inside the same trains, and the status bar says how many are down here. Only anonymous positions are shared, twice a second, and each player sees the 48 nearest. `G` toggles them.

## Beyond the platform

- **The whole network.** *Se hela nätet* on the landing page, in the pause menu or `?natet`: every line as a glowing tube at its real depth under a see-through Stockholm with its real hills, water and buildings (the ground from the Copernicus DEM, the houses of the inner city and round every station from OpenStreetMap), the tracks running straight from one station's height to the next and under any dip or lake between. A notch is cut out of the city in front of the point looked at, so one looks through the face of the cut into the ground, where Kungsträdgården lies far under the sea and Tekniska högskolan up in Östermalm's hill (the *Genomskärning* button takes it away). The connecting track between the green line and the blue shows as a thin grey line from past Thorildsplan to the blue line between Fridhemsplan and Rådhuset. Heights are stretched tenfold seen from far out and twice close by, or not at all with *Sann skala*, and a label close by or pointed at says how deep its station lies. every train a point of light with a fading trail, SL's own in real time by default (placed from their departure times, as a line under the title says) and the game's timetables while the clock is scrubbed or run through the day, stations breathing with their riders and other players as fireflies. A time scrubber and "a day in a minute", a slider that morphs from geography to the SL line map, a soft note for every departure, and a click on a station dives down into the game, aboard a train pulling in there.
- **The long exposure.** Every run of a day drawn as one long-exposure photograph, bright where trains pass often and dark in the night break, as a poster with the date and the day's numbers (runs, train kilometers, first and last departure). Any date, schematic or real shape, saved as a PNG at print size or shared from a phone.
- **A life on the blue line.** A three-minute piece from the pause menu or `?liv`: one ride from Kungsträdgården to Akalla where every station is a stretch of years, from 1975 to 2050. You start as a child beside a parent and end with a walker in the aisle; the trains and posters change with the years, the boards show the year, and the woman across the aisle ages with you until one day her seat is empty. No words but the station names and the years.

## How it is built

- **Progressive build.** The blue trunk is generated a slice at a time behind a progress bar, the rest of the network while you ride toward it, one step per frame, and taken down again far behind you.
- **Sky and daylight.** Open-air sections have their own materials, lit by a sky term in the bake and scaled with the daylight at runtime, so the lamps still shine at dusk.
- **Baked lighting.** Point lights are baked into vertex colors when the world is generated and multiplied with procedural canvas textures (grain, stone slabs, artwork). Static geometry is drawn unlit, so a station costs a handful of draw calls.
- **Physics.** [Rapier](https://rapier.rs) handles collision and the first-person character controller (steps, slopes, escalators, train doors).
- **Retro mode.** Press `P` to render at reduced resolution with nearest-neighbor upscaling.
- **Two languages, one world.** Menus, help and settings in Swedish, or English by choice (*English* / *Svenska* in the pause menu or on the landing page), switched without a reload. Signs, announcements and boards stay Swedish. The landing page exists in both, linked for search engines.
- **Settings.** Look sensitivity, field of view, master, announcement, ambience and train volume, and every key rebindable, in the pause menu and saved locally. Keys are read by position (`KeyboardEvent.code`), so WASD works on AZERTY and Dvorak too. The game draws at most 60 frames a second whatever the screen; *Batteriläge* (battery saver) holds it to 30, one pixel per screen pixel and, from the next start, the power-saving GPU, and is offered once when the adaptive resolution reaches its lowest notch.
- **Stuck?** *Fastnat? Tillbaka till perrongen* in the pause menu puts you back on the nearest platform. A mouse move that leaps across the screen out of nowhere (a browser glitch) is dropped rather than snapping the view round.
- **Gamepad.** Left stick walks, right stick looks, A jumps, X uses, B sits, LB or a pressed left stick runs, Y shows the map and Start pauses; in the cab the triggers work the controller.
- **Continue and first steps.** Where you stood is saved every few seconds, and the landing page offers *Fortsätt där du var* with the station. Key hints show once each, the first time they matter: use, sit and the menu.
- **Shareable and installable.** Link previews with a picture from T-Centralen, a web app manifest and generated icons, so the game can go on the home screen and open full screen.

## Project structure

```
index.html             Landing page in Swedish
en/index.html          The same page in English
docs/                  How it is built and played (FEATURES, GAMEPLAY, DESIGN, DRIFT, NETWORK, IDEAS), and the README's clip
src/
  main.ts              Landing page, lazy-loads the game and the network view
  lang.ts              Menu language: the player's choice or the browser's
  place.ts             Where the player last stood, for "continue where you were"
  style.css            Landing page and HUD styles
  game/
    boot.ts            Game setup and main loop
    clock.ts           Stockholm time, service hours, sun position
    operations.ts      Which trains run, next arrivals, last train, start time
    realService.ts     SL's live metro as warped timetable clocks, line by line
    sl.ts              SL Transport API: departures per station
    disruptions.ts     SL traffic messages on the boards and the speaker
    silverpilen.ts     The ghost train's hourly schedule
    silverReal.ts      Her runs among SL's real trains
    night.ts           Night dimming and the floor scrubber
    wind.ts            Piston wind, sound and newspapers
    weather.ts         Street weather, daylight, snow, rain, footprints
    weatherFeed.ts     The weather as data: Open-Meteo through the relay, or the season (no three.js)
    busker.ts          Accordion player and generated music
    rush.ts            Rush hour crowd in the City passage
    calendar.ts        Days, occasions and holidays: broken escalators, Friday bags, bun day, Lucia
    routes.ts          Routes, station positions and route timetables (no three.js)
    festivities.ts     Christmas tree, midsummer wreath, fireworks, Lucia, students, weekend nights
    choir.ts           Generated singing
    critters.ts        Pigeons and a rat
    lostProperty.ts    Lost property and the ringing phone
    bag.ts             The bag on the HUD, item pictures and the collection
    saxophone.ts       The saxophonist at Kungsträdgården
    saxSolo.ts         His generated solo and reed, and when he plays (no three.js)
    platformLife.ts    Phone talker, can collector, farewells, running for the train
    regulars.ts        The regulars' looks, stations, times and weeks (no three.js)
    regularLife.ts     The regulars on the platform and aboard, and knowing the player
    powerCut.ts        When the power goes, and the timetable clock around it (no three.js)
    powerLights.ts     The dark, the phone torches and the exit signs in a power cut
    life.ts            A life on the blue line: its years, ages and company
    carriageLife.ts    School trips and the seat rule
    coffee.ts          Coffee and buns from the kiosk
    footsteps.ts       Footsteps by surface
    rideLight.ts       Tunnel lamps sweeping through the carriage, window reflections
    signals.ts         Block signals and the points in the turnbacks
    express.ts         The empty train that does not stop
    trackWork.ts       Night track work
    emergencyBrake.ts  The emergency brake's detour from the timetable
    belts.ts           People on the moving walkways
    explore.ts         Places visited, for the map
    staffKey.ts        The staff key
    artWalk.ts         The art walk plaques
    mystery.ts         The Silverpilen clues
    notes.ts           Shared notes on the staff room boards
    notePhrases.ts     The fixed parts notes are put together from (shared with the relay)
    screensaver.ts     Screensaver mode and its music
    showcase.ts        The showcase tour: scenes at their own times
    discoveries.ts     The discovery book
    era.ts             The time machine
    preacher.ts        The street preacher at T-Centralen
    ambience.ts        Street, rock rumble, fans, singing rails, horn, sneezes, phone music
    effects.ts         Flickering tube, power rail sparks, carriage lights over the points
    cabin.ts           Rolling can, today's newspaper, fogged windows, tipped windows
    hallLife.ts        Booth attendant, street paper vendor, breath in the cold
    escalatorLife.ts   Escalator riders: stand right, walk left, "ursäkta"
    props.ts           Dog, pram, suitcase, walker and can geometry
    fares.ts           Gates, SL card, dodging and inspectors
    driver.ts          Driver mode (practice train)
    ghosts.ts          Other players via the relay
    telemetry.ts       One anonymous performance report per visit, to the relay
    figures.ts         Shared instanced people
    headlights.ts      Headlight pools and rail glints
    sfx.ts             Spatial sound helpers
    layout.ts          World dimensions (platform, tunnels, train, escalators)
    line.ts            The network: blue line data, station themes, network helpers
    lines/
      red.ts           The red line's stations and themes
      green.ts         The green line's stations and themes
      theme.ts         Theme helpers: rock, tiles, line drawings
      canopies.ts      What stands over each open-air platform, by station
    clips.ts           Lengths of the recorded announcement clips
    timetable.ts       Loop-based timetable and motion profiles
    train.ts           Train runtime: colliders, doors, lights, displays
    trainModel.ts      Train geometry (exterior and baked interior)
    player.ts          First-person character controller
    settings.ts        Sensitivity, field of view, volumes and key bindings
    settingsPanel.ts   The settings card in the pause menu
    gamepad.ts         The Gamepad API, polled once a frame
    firstSteps.ts      Key hints shown once each
    touchControls.ts   Touch overlay and pointer capture
    touchGestures.ts   Independent movement and camera gestures
    audio.ts           Synthesized sound and announcements
    recordings.ts      Recorded sneeze, sigh and bottle clink (public/audio/sfx/)
    hud.ts             Status bar, subtitles, line map, pause screen
    physics.ts         Rapier setup and collider helpers
    gfx/
      builder.ts       Mesh builder and vertex light baking
      textures.ts      Procedural canvas textures (grain, slabs, vines, fabric, doors)
      stationArt.ts    Painted vaults: the painter and the first stations' art
      art/             Each line's painted vaults and wall textures
      posters.ts       Made-up posters, stickers and handwritten notices
      signs.ts         Canvas signs and displays
      noise.ts         Value noise and fBm
      color.ts         RGB helpers
    world/
      world.ts         Builds the line, locates the player, escalator belts
      station.ts       Cave, platform, escalators, ticket halls, passages, signs, boards
      incline.ts       Inclined lifts beside the escalators: the shaft and a cabin that follows the time
      stationDetails.ts Station-specific piers, columns and sculptural details
      details/         Each line's stations' own objects: sculptures, showcases, columns, fences
      canopy.ts        Open-air roofs, lamp posts, cuttings, decks and the Globen arena
      parts.ts         Tracks, tunnel tubes and turnback caverns
      section.ts       World chunk: builder layers, baked lights, materials
      shapes.ts        Arch profiles, rock extrusion, walls with openings
      service.ts       Staff doors, corridors, staff room, shelter
      kymlinge.ts      The closed tunnel and Kymlinge
      signage.ts       Shared sign helpers
      clutter.ts       Gum, snus, stickers, posters, lost cat and escalator notices
      graffiti.ts      Tags and pieces on the tunnel walls
      zones.ts         Named areas and usable things
      kiosk.ts         The kiosk in the ticket hall
      walkway.ts       Walkways between lines' stations, and crossing them
      outdoor.ts       Open-air track, fences, scenery and tunnel mouths
      osm.ts           The real buildings round open-air stations, from osm/<line>.json (OpenStreetMap, scripts/osm.ts)
      sky.ts           The sky and daylight over the open air
      city.ts          Riddarfjärden: bridges, water, Gamla stan, Riddarholmen, Centralbron
      street.ts        The street over a hall: the square, and made-up houses and a road where OSM has none
      streetOsm.ts     The real city round an exit (OpenStreetMap, from osm/streets/, scripts/osm-streets.ts)
      streetLayers.ts  Fetching each street's file and building its city when the player comes near
      shifted.ts       Physics wrapper for geometry built in one place and moved
      travelator.ts    Moving walkways in the City passage
  network/
    data.ts            Every station in real geography and on the line map, trains along both (no three.js)
    geo.ts             Stations' latitude, longitude and depth, and the water
    terrain.ts         The ground's height above the sea, from terrain.json (Copernicus DEM, scripts/terrain.ts)
    surface.ts         The city over the network: ground, buildings from city/ (OpenStreetMap, scripts/osm-city.ts), the face of the cut
    view.ts            The whole network in 3D, lazy loaded
    exposure.ts        The day's long exposure poster (Canvas 2D)
scripts/
  deploy.ts            The only way to go live: the whole gate on what was pushed, then the build and the upload
  check.ts             The quality gate: types, tests, budgets, leaks, frame rates, loading, Lighthouse and pa11y, against floors and perf/baseline.json
  hooks/               The git pre-push hook, and the Claude Code hooks that run the gate and block deploys around it
  nightly.ts           The whole gate every night on what was pushed, with a history and a notification
  dev.ts               The dev server with the relay behind it, on free ports
  check-budgets.ts     Compressed size budgets, run by the build
  worker-check.ts      The Worker's and the hub's limits end to end, in wrangler dev (DRIFT.md, section 3)
  fps.ts               Real frame rates in headless Chrome, as a desktop, an emulated phone and a phone over USB
  mem.ts               Leak check: travel the network, a life and the cab, fail if anything is left behind
  load.ts              Time from the click to playing, desktop and slow 4G phone
  serve.ts             Compressed static server for the production build, with the Bun relay behind it
  og-image.ts          Renders the landing picture (public/og.jpg) and link preview cards from the game
  readme-clip.ts       Records the README's opening clip (docs/under-stockholm.webp) from the game
  launch-video.ts      The launch video (video/, not committed), cut to its own music
  capture.ts           Films scenes frame by frame for the clip and the videos, with captions
  music.ts             Music for the videos, rendered with Web Audio in the page
  icon.ts              The app icons as PNG, drawn at build time
server/                The Bun relay (development), and what it shares with the hub
  ghosts.ts            WebSocket relay for other players, notes and feeds
  pose.ts              Other players: protocol, limits and each player's nearest (shared)
  perf.ts              Anonymous performance reports, kept in a file
  perfCore.ts          What a report holds and what they sum up to (shared)
  feeds.ts             The feeds, with the GTFS timetable kept in a file
  feedCore.ts          Shared cache of SL, SMHI, Open-Meteo and SR feeds (shared)
  gtfsFeed.ts          Departures from GTFS Regional, the daily timetable and the realtime feed (shared)
  gtfs.ts              SL's metro from Trafiklab's GTFS Regional feeds, the zip read as it downloads
worker/                Production on Cloudflare (wrangler.jsonc, DRIFT.md)
  index.ts             Files from the build; the relay's paths, cached and rate limited, to the hub
  hub.ts               The hub: one Durable Object for other players, notes, reports and feeds
```

## Adding a station

Stations are data. Add an entry to a line's `stations` (`src/game/line.ts` for the blue line, `src/game/lines/red.ts` and `green.ts`) with a name, its place on the network map, a theme (a paint function, ambient and lamp colors, and optionally an `art` texture for the vault), on a branch its route (`branch`), `open` if it lies above ground, and for a tiled station its `look`. The world generator places it, builds the tunnels on both sides and adds it to the timetable, signs and departure boards. A station another line calls at too is listed on the second line with `shared` and the first line's id.

## Debug and the relay

Add `?debug` to the URL to skip pointer lock and expose `window.__us` (`player`, `world`, `timetable`, `operations`, `services`, `silver`, `driver`, `weather`, `fares`, `ghosts`, `physics`, `renderer`, a writable `time`, `goto(stationIndex)`, `kymlinge()`, `summonSilverpilen()`, `drive()`, `setWeather(kind)` and `info()`). Debug time does not follow the wall clock: `t=20` counts from a fixed weekday noon, `clock=03:10` (or `clock=2026-12-24T18:00`) picks a Stockholm time, `weather=snow|rain|sleet|cloudy|clear` forces the weather and `silverpilen` schedules a run right away. `stromavbrott` (or `stromavbrott=300`, seconds) starts a power cut a few seconds in, `liv` starts a life on the blue line and `__us.lifeScene(i)` stages one of its stations at once. `?natet&debug` exposes `window.__net` (`step(seconds, rate)`, `dive(name)`).

`server/ghosts.ts` is a small Bun WebSocket relay. It keeps no player data: clients send their position (or their place inside a train) twice a second and receive the nearest others. It also shares its clock (in the socket's hello) so all players see the same trains. In development `bun run dev` (`scripts/dev.ts`) starts the relay on a free port and Vite proxies `/ghosts`, `/feeds`, `/notes`, `/perf` and `/errors` to it, so the game talks to its own origin. In production the same paths on the same origin are answered by the hub, a Durable Object in the game's Worker (`worker/`, see [DRIFT.md](DRIFT.md)). `VITE_GHOSTS_URL=wss://your-host/ghosts` points a build at another relay, and `VITE_GHOSTS_URL=off` turns the feature off and hides its toggle.

The same server keeps the shared notes for the staff room boards at `/notes`: short greetings put together from fixed parts in `src/game/notePhrases.ts` (a greeting, or a phrase with a thing or a station in its gap; nothing is typed, and the relay takes only text the parts make and shows only such notes), one per client every 90 seconds, saved to `NOTES_FILE`. Remove one with `DELETE /notes/:id` and `authorization: Bearer $NOTES_ADMIN_TOKEN`. Without a relay, notes stay in the player's browser. `bun run ghosts` starts it on its own, on a free port (`PORT`, `MAX_CLIENTS`, `NOTES_FILE`, `NOTES_ADMIN_TOKEN` configurable).
