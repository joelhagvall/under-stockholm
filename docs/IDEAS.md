# Ideas

Ideas for the future of Under Stockholm. Not planned or prioritized, just collected.

Each idea is tagged with a rough size:

- `S` small: data, a canvas texture, a synthesized sound or a small addition to an existing system.
- `M` medium: a new module, new figure behavior or a new interaction, without changing how the game fundamentally works.
- `L` large: large-scale new geometry, a server, or a change to core systems such as the timetable.
- `Exists`: already in the code, fully or partly.
- `Done`: built from this list and struck through.

## More life in the stations

- `Done` ~~**Pigeons and a rat.** Pigeons in the ticket hall, and a rat that darts along the track and disappears when the train comes.~~ In `critters.ts`.
- `Done` ~~**Lost property.** A forgotten mitten or a phone ringing on a bench, plus a few small things to find at each station.~~ In `lostProperty.ts`: three things per station a day, one ringing phone on the whole line, handed in and counted.
- `Done` ~~**Rotating billboards.** Generated, made-up posters that change every day, advertising made-up concerts and exhibitions.~~
- `Done` ~~**More Stockholm in the sound.** A saxophonist at Kungsträdgården and a commuter talking on the phone, similar to the musician at T-Centralen.~~ A saxophonist in Kungsträdgården's hall (`saxophone.ts`) and a commuter on the phone (`platformLife.ts`).
- `Done` ~~**A newsagent kiosk in the ticket hall.** A kiosk with neon light. Buy a kanelbulle and watch the steam rise from the coffee cup.~~ In `world/kiosk.ts` and `coffee.ts`.
- `Done` ~~**Shared notes.** Short greetings on the notice board in the staff room, visible to everyone (requires moderation). Needs a server that stores the notes.~~ The relay (`server/ghosts.ts`) keeps them; they are put together from fixed parts (`notePhrases.ts`) since typed notes let slurs past any word list; without a relay they stay local.
- `Done` ~~**Holidays.** A Christmas tree in the ticket hall in December, a midsummer wreath in June and fireworks heard down the stairs on New Year's Eve.~~ In `festivities.ts`.
- `Done` ~~**Screensaver mode.** The camera travels back and forth along the line automatically, with fitting music.~~ In `screensaver.ts`: `B` or the pause menu.
- `Exists` **Weather from above.** Rain or snow is visible at the exit stair. Commuters carry wet umbrellas or have snow on their shoulders, and there is slush by the entrance. Mostly in `weather.ts` and `crowd.ts`.
- `Done` ~~**Art walk.** A guided tour with signs or audio about each station's art, in the style of SL's real art tours.~~ A plaque on every platform, read aloud (`artWalk.ts`).
- `Done` ~~**Street sounds in the stairway.** At the top you hear what is above: buses, gulls and church bells.~~
- `Exists` **Daylight in the ticket hall.** The light through the entrance doors follows the real sun, from blue morning light to orange evening sun. In `weather.ts`.
- `Exists` **Seasonal clothing.** Commuters wear thick coats and hats in January and shorts in July. In `crowd.ts`.
- `Done` ~~**Escalator out of order.** On some days an escalator stands still behind barrier tape and you have to walk. The day is derived from the date, so every player sees the same thing.~~
- `Done` ~~**A street paper vendor.** A vendor by the ticket gates who says hello.~~
- `Done` ~~**Station attendant in the glass booth.** A person in the ticket hall booth who looks up from their screen as you walk past. The booth already exists in `fares.ts`.~~
- `Done` ~~**The travelator at T-Centralen.** The long passage with moving walkways toward the commuter trains.~~ Along both walls of the City passage (`world/travelator.ts`, `belts.ts`).
- `Done` ~~**Stickers.** Hockey teams, bands and small political stickers on posts and bins, different at every station.~~
- `Done` ~~**Chewing gum stains.** Dark dots in the stone floor, most of them near the benches and door positions.~~
- `Done` ~~**Snus.** A dropped pouch on the floor and an empty snus tin on a bench.~~
- `Done` ~~**Lost cat notice.** A handwritten note with tear-off tabs on the notice board in the ticket hall.~~
- `Done` ~~**The clock that is wrong.** One platform clock that is always two minutes fast.~~
- `Done` ~~**Last train.** In the evening the departure board shows "Sista tåget avgår 00:47". The time is derived from the timetable.~~
- `S` **Running for the last train.** As the last departure nears, people run down the escalator. Builds on the last train above.
- `S` **Kista in the morning.** Commuters with access badges on lanyards round their necks and laptop backpacks.
- `S` **Security guards.** Late on weekend nights, two guards patrol the platform.



## Atmosphere



### Light

- `Done` ~~**The broken fluorescent tube.** Every station has one tube that flickers and hums. The same tube every day until someone replaces it.~~
- `Done` ~~**Tunnel lamps sweeping past.** At speed, light from the tunnel lamps slides rhythmically through the carriage, across faces and seats. The interior light is baked, so this needs a way to modulate it per frame.~~ In `rideLight.ts`.
- `Done` ~~**Sparks from the power rail.** On cold winter nights the power rail flashes blue as the train passes, visible far into the tunnel.~~
- `Done` ~~**Dust in the light cones.** When a train arrives, dust swirls up and shows in the lamplight.~~
- `Done` ~~**Tail lights fading away.** As the train leaves, its red tail lights glow on the tunnel wall and slowly shrink into the dark. Can follow the pattern in `headlights.ts`.~~
- `Done` ~~**Flickering carriage lights.** Over the points, the lights in the carriage blink off for half a second.~~
- `Done` ~~**The power cut.** A couple of times a year the power goes. The fluorescent tubes die, only the green exit signs and the emergency lights glow, and the train stands dark in the tunnel. Passengers switch on their phone torches and the beams sweep over the rock wall. After a while an announcement, then everything comes back with a clunk and a hum. Since the lighting is baked, the emergency light can be a second baked set of vertex colors per section that the shared materials switch to, so it costs almost nothing per frame. The trains' timetable holds them where they stand for the length of the cut (like the override in `emergencyBrake.ts`, but on every train at once). The days and times are derived from the date, so everyone is in the dark together.~~ In `powerCut.ts` and `powerLights.ts`.
- `S` **Silverpilen drains the station.** As the ghost train glides through, the fluorescent tubes dim and stutter in a sphere that travels with her, and the station goes quiet: the saxophone, the sneezes, the phone talker and the crowd fade out. The waiting passengers stare at their phones as if nothing is there, except the waving child, who waves. The same moment for everyone. Builds on the `torchify` patch in `powerLights.ts` (one position and radius uniform), the pure schedule in `silverpilen.ts`, the `world` bus in `audio.ts` and the child role in `crowd.ts`. Speech cannot be faded, so `ambient` lines are skipped during the pass.



### Sound

- `Done` ~~**Doors let the sound in.** When the doors open the sound of the platform floods in, and when they close everything turns muffled again.~~ The outside world goes through a filter that closes with the doors (`Audio.setMuffle`).
- `Done` ~~**Rumble through the rock.** At T-Centralen you hear the red and green lines thunder somewhere above, without seeing them.~~
- `Done` ~~**Footsteps.** Steps sound different on stone, the rubber floor of the carriage and the metal of the escalator. Walking is silent today, possibly on purpose.~~ In `footsteps.ts`.
- `Done` ~~**Ventilation.** Fans roar at the tunnel mouth and a cold draft is felt at the platform edge.~~
- `Done` ~~**The rails sing.** Before the train is visible, the track starts to tick and sing faintly.~~
- `Done` ~~**Passing train.** In the tunnel the carriage shakes and the pressure wave hits with a dull bang as a train passes the other way.~~
- `Done` ~~**The horn.** The train gives a short blast as it leaves the tunnel and enters the station.~~
- `Done` ~~**Prosit.** Someone sneezes and someone else says "prosit".~~
- `Done` ~~**Squeaky escalator.** One of the escalators squeaks in rhythm.~~
- `S` **Metro radio.** A page that only plays the sound of one station, live, with no graphics: trains arriving on the same clock as the game, the announcements, the escalator, the saxophonist at Kungsträdgården, rain in the stairway when it rains. Lo-fi to keep on while working. Pick a station and a spot (platform, ticket hall, carriage). Needs an audio-only path that never loads three.js or Rapier: the events come from the route timetables in `routes.ts` and the clock, played through the synths in `audio.ts` with a fixed listener. The Media Session API gives play and pause on the lock screen, and it keeps playing in a background tab. Reached from `?radio` and a "Lyssna" link on the landing page. Built once and taken out: not wanted.



### Times and seasons

- `Done` ~~**Mist in the stairway.** In winter warm tunnel air meets cold outside air in the stairway and a thin mist forms.~~
- `Done` ~~**Fogged windows.** In winter the train windows are fogged, and someone has drawn a heart with a finger.~~
- `Done` ~~**Weekend night.** People on their way home from the bars sing a little too loud and have glitter in their hair, and a high-heeled shoe is left on the platform.~~ In `festivities.ts` and `crowd.ts`.
- `Done` ~~**Sunday morning.** Almost empty, just someone with a bouquet of flowers and a jogger running up the stairs.~~
- `Done` ~~**Graduation.** In June, students in white caps with balloons sing in the carriage.~~ In `festivities.ts`.
- `Done` ~~**Autumn leaves.** Wet leaves carried in on shoes lie in the stairway and the ticket hall.~~
- `Done` ~~**Breath in the cold.** In winter the commuters' breath is visible near the exit.~~
- `S` **The ice rink in Kungsträdgården.** From December to February people carry skates over their shoulders up toward the park.
- `S` **Cherry blossom in Kungsträdgården.** In April people have pink petals on their shoes, and tourists take photos in the stairway.
- `S` **May Day.** Flags and banners on the way to Kungsträdgården on May 1, without party logos. Fits in `festivities.ts`.
- `S` **Easter, Walpurgis and Shrove Tuesday.** Children dressed as Easter witches on Maundy Thursday, students heading for the bonfires on April 30 and boxes of semlor on Shrove Tuesday. Fits in `festivities.ts`.
- `S` **Gravel on the stairs.** When it is icy outside, the stairway and the floor by the entrance are gritty with gravel. Builds on `weather.ts`.
- `S` **The Donald Duck hour.** On Christmas Eve from 15:00 to 16:00 the metro is almost empty, because the whole country is watching Kalle Anka on TV.
- `S` **Midsummer Eve.** The city is empty, and the few who ride carry pickled herring and flower wreaths.
- `S` **Tjugondag Knut.** In mid January, stripped Christmas trees lie thrown out by the entrances.
- `S` **Pride.** In the first week of August: rainbow flags, glitter and full carriages on the day of the parade.
- `S` **Marathon day.** On a Saturday in early June, runners ride home with medals and foil blankets.
- `S` **End of school.** In mid June, children ride with flowers and parents with cameras.
- `S` **The office Christmas party.** On Fridays in December: Santa hats, colleagues a little too cheerful and a bag of glögg.
- `S` **All Saints' Day.** On the Saturday between October 31 and November 6, green line trains toward Skogskyrkogården fill with people carrying candles and lanterns, and the open-air station glows at dusk. The man with the flowers is among them, which answers the discovery book's "Ingen vet vem de är till". Builds on `calendar.occasion`, the candle, lantern and flower carries in `crowd.ts`, the candle points in `festivities.ts` and the regular's plan in `regularLife.ts`.
- `S` **Advent candlesticks in the windows.** In December the lit windows of the suburban blocks and the street houses show the seven-bulb candlestick and a paper star, as in almost every Swedish window. Builds on `windowsOn` and `WINDOW_LIGHT` in `street.ts`, already faded by darkness in `weather.ts`, extended to the blocks in `outdoor.ts` with a canvas window tile.
- `S` **The piston wind carries the season.** When a train comes up a tunnel that opens to the sky, the gust ahead of it blows the outside in: snowflakes in winter, birch leaves in autumn, poplar fluff in June. Builds on `tunnelWind` and the dust motes in `wind.ts`, `World.openRanges` for whether open air lies down the tube, and `weather.state` with `clock.season`.



### People

- `Done` ~~**The farewell.** A couple says goodbye at the doors. One stays behind and waves as the train leaves.~~ In `platformLife.ts`.
- `Done` ~~**Asleep against the window.** A commuter sleeps with their head against the glass, and it bumps lightly at every rail joint. Seated riders already nod off, so this builds on that.~~
- `Done` ~~**The child at the front.** A child presses their face to the window toward the cab and looks into the tunnel.~~
- `Done` ~~**Waving child.** A child on the platform waves at the train as it leaves.~~
- `Done` ~~**Swaying at the pole.** Standing passengers hold the yellow poles and sway as the train brakes.~~
- `Done` ~~**The regulars.** The same people in the same places every weekday: the woman with a walker at Västra skogen at 07:42, the guy with a guitar case who always boards at Solna centrum, the man who reads a paper book in the same seat. A few per station, each with a fixed look and a routine derived from a seed and the date: when they arrive, where on the platform they wait, which train they take (the first departure after they arrive, from the timetable) and where they sit. So they behave the same for everyone, and missing their train means it really left. Their weeks have texture too: a sick day now and then, gone for most of July, a new haircut, a cast on an arm for six weeks, a bump that turns into a pram. The player's recognition is saved locally: after a few days of being near one of them they start to nod, later say "god morron". Each one found goes in the discovery book. Builds on `figures.ts`, `crowd.ts` and `platformLife.ts`.~~ In `regulars.ts` and `regularLife.ts`.



## Stockholm behavior

- `Done` ~~**Stand to the right on the escalator.** Commuters stand on the right and walk on the left. If you block the way you hear an annoyed "ursäkta".~~ Then a sigh, then the rule spelled out, and a "tack" when you step right.
- `Done` ~~**The silent seat rule.** Nobody sits next to you as long as there is a fully empty pair of seats left. As the carriage fills up, people finally take the seat next to you, reluctantly.~~ In `carriageLife.ts`.
- `Done` ~~**Running for the train.** A commuter rushes toward the doors as they close and either misses the train or just makes it.~~ In `platformLife.ts`.
- `Done` ~~**Music from a phone speaker.** A passenger plays music without headphones, and the others in the carriage look up and sigh.~~
- `Done` ~~**Summer heat.** In July the carriages are stuffy. People fan themselves with newspapers and a window is open a crack.~~
- `Done` ~~**Suitcases at T-Centralen.** People with rolling suitcases heading for the Arlanda Express.~~
- `Done` ~~**The Friday bag.** On Friday afternoons people carry bottle bags that clink a little.~~
- `Done` ~~**The can collector.** Someone goes from bin to bin looking for cans to return for the deposit.~~ In `platformLife.ts`.
- `Done` ~~**Passive-aggressive notes.** Notes in the staff room kitchen, such as "Till den som tog min yoghurt ...".~~
- `Done` ~~**Cinnamon bun day.** On October 4 everyone sells buns and people carry paper bags of them.~~
- `Done` ~~**Crayfish party.** In August people head home in paper hats with crayfish lanterns.~~
- `M` **Derby day in Solna.** Supporters in scarves sing and fill the carriages toward Solna centrum, and police stand on the platform. The match days are derived from the clock.
- `S` **The fare dodger.** Someone slips through the gate right behind you.
- `S` **The inspector warning.** A fellow passenger checks their phone and whispers "kontrollanter på Fridhemsplan". Taken from where the ticket inspectors in `fares.ts` actually are.
- `S` **The bag on the seat.** Someone puts their bag on the seat beside them to keep it free, and moves it with a sigh as the carriage fills up. Builds on `carriageLife.ts`.
- `S` **Standing by the doors.** People stay by the doors even when there are free seats further in.
- `Done` ~~**Summer Stockholm.** In July the city is half empty. Trains run less often on the summer timetable, there are fewer commuters and more tourists. Which trains run is already derived from the clock in `operations.ts`.~~ One train per route rests on the summer timetable (`operations.ts`), July is quieter and tourists ask the way.



## More of the metro

- `Done` ~~**More stations.** Solna centrum (red sky and green forest), Västra skogen and Kista. Stations are data only, so this gives the most world for the least work.~~ Stadshagen and Västra skogen are in, and with the branches below so are Solna centrum, Kista and the rest.
- `Done` ~~**The branch toward Akalla and Hjulsta.** This is where Kymlinge fits in at its real location. The timetable is a single loop today, so a branch changes both the timetable and the world layout.~~ All 20 stations, one timetable per route (`routes.ts`), Kymlinge between Hallonbergen and Kista. The Hjulsta branch is built further along x and reached through a portal in the junction tunnel; branch stations are built when you come near.
- `Done` ~~**The red and green lines at T-Centralen.** The passage leads there and their platforms are visible, even if they cannot be ridden.~~ A hall off the City passage with both island platforms and their trains (`world/transfer.ts`, `transferTrains.ts`); you can watch but not board.
- `Done` ~~**Reflections in the train window.** In the tunnel you see yourself and the carriage mirrored in the dark glass.~~ In `rideLight.ts`.
- `Done` ~~**Graffiti in the tunnels.** Tags and old paintings on the rock wall that only show up at speed from the train.~~
- `Done` ~~**View ahead.** Stand at the very front of the first carriage and watch the tunnel come toward you through the cab window. The cab already exists for driver mode.~~
- `Done` ~~**Night track work.** Yellow work vehicles with flashing lights and people in high-visibility clothing on the track between trains.~~ In `trackWork.ts`.
- `Done` ~~**Emergency brake.** Pull it and the train stops dead, and the driver says something over the speaker. Passenger trains are a pure function of the clock, so stopping one breaks that model.~~ A local detour from the timetable, then a delay made up in a turnback (`emergencyBrake.ts`).
- `Done` ~~**Dogs and prams.** Passengers with a dog or a pram who stand by the doors.~~
- `Done` ~~**Empty train.** Now and then a train rushes through without stopping, showing "Ej i trafik", followed by a strong gust of wind. Can be an extra run derived from the clock, like Silverpilen.~~ In `express.ts`.
- `Done` ~~**The rolling can.** An empty can rolls back and forth on the carriage floor as the train brakes and accelerates.~~
- `Done` ~~**Phone glow.** In the dark tunnel, passengers' faces are lit blue by their phone screens.~~
- `Done` ~~**Forgotten newspaper.** A newspaper with today's date lies on a seat in the carriage. The newspaper texture already exists in `wind.ts`.~~
- `Done` ~~**Signals in the tunnel.** Red and green signals along the track, and points that switch with a clunk in the turnback.~~ In `signals.ts`.
- `Done` ~~**Emergency exits.** Green signs glowing in the tunnel, and an escape route you can walk into.~~ A cross passage halfway along every tunnel, with a stair up to an alarmed exit (`world/parts.ts`).
- `Done` ~~**School trip.** Children in hi-vis vests filling a whole carriage, with a teacher counting them.~~ In `carriageLife.ts`.
- `M` **The extension.** The blue line is being extended for real, toward Barkarby from Akalla and toward Nacka from Kungsträdgården. A construction wall at the end of the tunnel reading "Här bygger vi ut tunnelbanan", and a blasting warning siren at night.
- `S` **Free newspapers.** Read copies of a free morning paper pile up on the seats. Unbranded, like the kiosk. Builds on the newspaper texture in `wind.ts`.
- `M` **Stopped for a signal fault.** During a disruption a train sometimes stops in the tunnel and the driver says "Vi står still på grund av signalfel" over the speaker. Can reuse the override in `emergencyBrake.ts`, with `disruptions.ts` deciding when.
- `M` **Replacement buses.** Some summer weeks part of the line is closed, and signs point to the replacement buses. Changes which stations the trains run to, so it touches the route timetables.
- `L` **Out into the light.** Once the red and green lines can be ridden: the train leaves the tunnel at Slussen and crosses the bridge to Gamla stan in daylight, with Riddarfjärden, Riddarholmskyrkan's spire and the Söder heights around it. The most beautiful half minute of the Stockholm metro, and a contrast to everything underground. Needs a new above-ground section type: the bridge and its colliders, a water plane, and the skyline as generated silhouettes from small inline outlines (no asset files). The sky and sun follow `weather.ts`, so it is the real light of the moment: blue morning, orange evening, black night with the city lights reflected in the water, rain or snow on the windows. The baked lighting stays neutral and a time-of-day tint on the shared materials does the rest. The sound opens up out of the tunnel roar, with wind and gulls. Later the other stretches above ground can follow: Liljeholmen's bridge on the red line and the green line through Skanstull and southward.



## Real data

- `Done` ~~**Real ridership per station.** SL's published boarding statistics per station (static yearly figures) set how crowded each station is, so T-Centralen is packed and the quiet stations stay quiet.~~
- `Done` ~~**Real service disruptions.** SL's deviations API feeds real disruption texts to the departure boards and the announcements, such as "Försenad trafik på grund av signalfel vid ...". Needs a fallback when the data is stale, like `realService.ts`.~~
- `Done` ~~**Real broken lifts and escalators.** SL publishes out-of-order lifts and escalators as deviations. When an escalator is broken at the real Kungsträdgården, it stands still in the game too. Builds on the date-derived broken escalator that already exists.~~ From the facility messages in SL's deviations (`disruptions.ts`).
- `Done` ~~**Real headlines.** Sveriges Radio's open API gives today's Ekot headlines for the forgotten newspaper on the seat, or P4 Stockholm's traffic messages. The newspaper texture already exists in `wind.ts`.~~ P4 Stockholm's feed, in `news.ts`.
- `M` **Real crowding per train.** If SL's data gives how full each departure is, the relay passes it on and it sets how packed the carriage you board actually is, not only the yearly average per station. A late train after a disruption arrives crammed, the one right behind it half empty. Needs checking which SL API exposes crowding and for which trains; without data it falls back to `riders` as today.
- `M` **Kymlinge's real passing times.** In real-trains mode the dusty board at Kymlinge flickers on and lists when SL's real line 11 trains pass the station that never opened. `readTimetable` in `server/gtfs.ts` already reads those calls but drops them, because Kymlinge has no entry in `SITES`: keep it as a pseudo-site in the shared feed code (so both relays follow) and draw the board with `world/kymlinge.ts` and `gfx/signs.ts`. Could be a clue in `mystery.ts` too.



## Things to do

- `Done` ~~**Staff key.** Find a key that unlocks doors that are otherwise closed.~~ On a hook in the shelter under Rådhuset; it opens the alarmed exits and a cabinet at Kymlinge (`staffKey.ts`).
- `Done` ~~**Map of explored places.** The map fills in with the passages and rooms you have visited.~~ In `explore.ts`.
- `M` **Memories on the wall.** Players pin a short memory to a real spot, such as "Här träffade jag min fru 1998" on a bench at Solna centrum, and it shows as faint handwriting when you stand close. Stored by the relay and put together from fixed parts like the shared notes (`notePhrases.ts`), with a report button and a cap per spot so a place never gets crowded. Pinned to a station and a position, so it survives the world being rebuilt. Over time the metro becomes a shared archive of what happened to people down here.
- `S` **The travel diary.** The travel card in the pause menu keeps your history: kilometers ridden, stations visited, your most common departure, the longest ride, nights out after the last train, the first time you saw Silverpilen. Saved in the browser like `explore.ts` and `discoveries.ts`, and counted from what already happens (riding, `World.locate`, the discoveries).



## Bigger ideas

- `Done` ~~**Time machine.** Pick a year, for example 1975 with older trains, split-flap displays and different posters.~~ 1975 in the pause menu (`era.ts`): green trains, split-flap boards, posters and clothes of the time.
- `S` **The strip ticket.** In 1975 you get your strip ticket stamped at the gate booth instead of tapping a card. Builds on `era.ts` and `fares.ts`.
- `M` **2050.** The other direction of the time machine, next to 1975 in `era.ts`: driverless trains with no cab, glass platform screen doors, the Nacka branch and the yellow line open on the boards and the map, adverts on screens instead of posters, and cleaner, quieter platforms. Announcements in a synthetic voice. The pause menu then offers three times: 1975, now and 2050.
- `Done` ~~**Lucia.** A Lucia procession singing on the platform on December 13.~~ In `festivities.ts`.
- `Done` ~~**The Silverpilen mystery.** Clues in the staff rooms, old newspaper clippings and a logbook that lead on to Kymlinge.~~ Five clues from T-Centralen to Kymlinge (`mystery.ts`).
- `Done` ~~**The time loop.** Ride Silverpilen past Kymlinge and you wake up at Kungsträdgården at 05:00, as the first train leaves. Game time follows the real clock, so this needs a per-player time offset.~~ Stay aboard Silverpilen past Kymlinge (`boot.ts`, `timeLoop`).
- `Done` ~~**Rush hour in the City passage.** Simulate the long passage between the blue line, the other metro lines and the commuter trains at T-Centralen/City, packed at rush hour density (2 to 3 people per m²). To get through you have to shove, argue and fight your way forward. Around 200 fully simulated commuters near the player (each figure is 16 instanced parts in `figures.ts`, so more gets heavy on mobile), with a cheap static background crowd further down the passage so it reads as 500 or more. Needs pushing between figures and the player, and the passage geometry itself.~~ In `rush.ts`: the passage off T-Centralen's hall now runs 150 m to the commuter train gates, packed at rush hour. Press E to elbow your way through; hotheads argue and shove back.
- `Exists` **Driver mode.** Drive the train yourself between two stations, as a separate mode alongside the regular timetable. In `driver.ts`.
- `Done` ~~**The discovery book.** A collection in the pause menu with every hidden thing in the game: the rat that flees when the rails sing, Silverpilen, Lucia, the emergency brake, the Donald Duck hour. What you have not seen yet shows as a hint ("Julafton, klockan tre."), so the depth of the game is visible from the start and gives a reason to come back at other times. `explore.ts`, lost property, the art walk and the mystery are half of it already. Saved in the browser.~~ In `discoveries.ts`: 52 moments, each found when its caption shows.
- `Done` ~~**Showcase mode.** Like the screensaver, but it jumps in time and cuts between the highlights: snow at the stairway, rush hour in the City passage, Silverpilen, 1975, night track work, Lucia. A "Se en tur" button on the landing page next to "Enter the metro", and the same mode doubles as a trailer to record.~~ In `showcase.ts`: eight scenes, from the pause menu or "Se en tur" on the landing page.
- `Done` ~~**A staged first minute.** Instead of standing still on a platform, the game starts seated in a carriage rolling into T-Centralen: the tunnel light sweeps past, the doors open, the crowd pours out and a short line says where you are.~~ On the first resume, seated on a train on its way into a station, T-Centralen if one is due (`stageArrival` in `boot.ts`).
- `Done` ~~**The whole network, alive.** A separate view of every line at once: glowing tubes hanging at their real depth under a dark, generated Stockholm (water and islands from a small inline coastline, depth exaggerated tenfold), so the network reads as a root system under the city with the blue line deepest of all. Every train is a point of light with a fading trail, placed by the same `Timetable.stateAt(time)` as the game, so the view shows exactly the trains you meet on entering, or SL's real trains in real mode through the relay. Players online glow as fireflies and each station breathes with its riders. A scrubber runs a whole day in a minute: rush hour pulses through the net, the night break empties it and Silverpilen streaks past at night. One slider morphs between true geography and the schematic SL map, each station lerping between two positions in the vertex shader. Every departure plays a synthesized note, pitch per line, so the network becomes music that follows the clock. Click a station and the camera dives through the ground and into the game on that platform. Needs a three.js-free `network.ts` with every station's geographic position, depth and schematic position, instanced drawing so all trains are one draw call, and lazy loading like the game (`?natet`, the pause menu and "Se hela nätet" on the landing page). The full plan is in NETWORK.md.~~ `src/network/`, see NETWORK.md.
- `S` **Board any light.** Click a train on the landing page's line map, or a firefly in the network view, and the game opens aboard that exact train (or the stranger's train). The dot and the train are the same by construction, both placed by `stateAt(cutClock(t) + offset)`. Builds on the `game-<slot>` ids from `gameTrains()` in `landing/trains.ts`, the `ride` index in the network view's snapshots, and `launch` in `main.ts` with `diveTo` in `boot.ts` taking a service instead of a station. Keep it in the landing's lazy map chunk.
- `Done` ~~**A life on the blue line.** A short, poetic piece of about three minutes. You ride the same commute over and over, and every station is a year of your life. First a school child holding a parent's hand, then a teenager with headphones, a student, a parent with a pram, someone tired in a suit, a grandparent, an old person with a walker. The carriage, the clothes, the posters and the trains age around you, from 1975 through now to 2050, and the faces of the regulars age with you. No text except the station names and the years on the boards. Builds on `era.ts` for the look of each time, `figures.ts` for the ages, and the seat and ride from the staged first minute. Reached from the pause menu and a link on the landing page.~~ In `life.ts`.
- `S` **Silverpilen, once.** Once a year, at a moment nobody announces, a special Silverpilen run happens for every player at the same time and never comes back the same way: a different route, a stop at a station it never stops at, doors that open. The moment comes from a secret only the relay knows, so not even the source code gives it away. The relay must not tell clients in advance (anyone could read it from the network): it reveals the run only when it starts, over the ghosts connection, and from then on the run is a pure function of the clock so late arrivals see the same train. Without a relay it never happens. The clips spread ("såg ni den?!") and it becomes a myth, like the real one. Builds on `silverpilen.ts` and `server/ghosts.ts`.
- `S` **Silverpilen in the dark.** During every power cut, while every train stands frozen and dark where `cutClock` stopped it, Silverpilen glides silently past the torch-lit platforms: the only thing moving. Builds on `cutOn` in `powerCut.ts` and `runStart` in `silverpilen.ts`, with a run lined up with the cut's start that `cutClock` does not warp. Both are pure functions of the date, so every player sees her at the same second, and the track is clear because every regular train stands still.
- `S` **Silverpilen takes the absent.** On a day a named regular is off sick, one of Silverpilen's pale riders wears their coat, hair and trait. The next day they are back on their platform, and a caption says they look tired and remember nothing. Fits the clue scratched in the concrete, "HON STANNAR FÖR DEM SOM VÄNTAR". Builds on `silverRiders` in `boot.ts`, repainted from the regular's look when `regularDay().why` is `sick`. Both sides are pure functions of the date, so every player sees the same missing person.
- `L` **The great departure.** A live event, first on New Year's Eve: at 23:50 every player online stands on the same platform, as real figures instead of ghosts. One train rolls in, everyone crowds aboard, and it counts down to midnight in the tunnel, pulling into Kungsträdgården as the clock strikes twelve, with the fireworks from `festivities.ts` thundering down the stairs. The train is a special service derived from the clock; the relay only carries who is there. Each player is placed in a carriage and a spot by a hash of their id, the same on every client, and extra trains follow when the first is full. The nearest few hundred are full `figures.ts` figures, the rest a cheap instanced crowd, so it holds up with thousands. The relay needs to fan out positions to that many players at once, which is the hard part (Durable Objects per carriage, see DRIFT.md). Later the same event can run for other dates: Lucia, the last day before the summer timetable, the game's birthday.

