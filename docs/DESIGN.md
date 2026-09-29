# Metro design references

The game uses generated geometry and canvas textures. Reference photographs guide proportions, materials, signage and station identities; no photographs are shipped as game assets.

## Reference set

- [Alstom: C20 Stockholm Metro](https://www.alstom.com/alstom-sweden). Blue rounded cab fascia, inset black windscreen surround, silver sides, blue doors and short articulated sections.
- [C20 passenger-door placement study](https://www.diva-portal.org/smash/get/diva2%3A478710/FULLTEXT01.pdf). A/M/B sections with two, three and two door apertures per side. Three units give 21 boarding positions per side.
- [Classic C20 interior photograph](https://commons.wikimedia.org/wiki/File:Tunnelbana-C20-Interior.jpg). Rounded blue patterned seat pads, pale seat shells, curved yellow grips, glass vestibule screens, gray inner doors, emergency columns and paired ceiling lights.
- [Stockholm escalator photographs](https://ilyabirman.net/meanwhile/all/stockholm-metro-tekniska-hogskolan-universitetet/). Ribbed metal treads, broad steel balustrades, black rounded handrails, comb plates and transverse fluorescent lighting.
- [SL: art along the blue line](https://sl.se/aktuellt/puls/utforska-konsten-langs-bla-linjen). Station identities and blue-line context.
- [Kungsträdgården reference photographs](https://www.ecksplorer.com/blog/the-worlds-longest-art-gallery-riding-on-the-stockholm-tunnelbana). Green vault, exposed stone, red and white edging, geometric terrazzo and classical fragments.
- [T-Centralen ceiling photograph](https://commons.wikimedia.org/wiki/File:T-Centralen_ceiling.jpg). Large paired blue leaves on pale, irregular rock.
- [Rådhuset platform photographs](https://ilyabirman.net/meanwhile/all/stockholm-metro-radhuset/). Terracotta sprayed rock, dark stone paving, fluorescent troughs and pale station-name panels.
- [Fridhemsplan blue-line photographs](https://stockholmstunnelbana.blogg.se/2014/december/fridhemsplan-bla-linjen.html). Muted stone, maritime display objects and a suspended bird sculpture.

## Interpretation

The result is a playable interpretation, not a surveyed replica. Platform plans, structural pier placement, distances, exits and artworks are simplified. As in reality, each unit has a cab at both ends: where units are coupled, two cab bulkheads close the train off, and there is no way through from one unit to the next. The blue and green lines run the C20 (three units), with the blue and yellow character of the older C20 interior, not a complete reproduction of the refurbished fleet; the red line runs the C30 (two units of four sections with open gangways, scaled to the C20's train length), from photographs: white body, blue doors, a window to each bay and a black front inside a ring of light. The whole blue line is playable. Stadshagen, Västra skogen and most of the branch stations are free interpretations, not based on photographs; Solna centrum's red sky over a dark forest, Hallonbergen's children's drawings and Akalla's tiles take their cue from the real art. The branch stations' passenger numbers are estimates. Kymlinge lies in the tunnel between Hallonbergen and Kista, as it does in reality. The red and green line hall at T-Centralen is a simplified single hall with two island platforms; in reality the lines have separate levels.

All static architectural additions are batched into Section builders. New floor-level structures have matching colliders. Door visuals, collision openings and the boarding logic share DOOR_XS. Timetable motion remains a pure function.

Escalators use individual instanced steps with tread and riser grooves. Level run-in and run-out sections meet a thirty-degree flight. Steps and passenger transport share the same horizontal speed, while smooth ramp colliders prevent camera judder. Nearby flights animate in opposite directions; distant instances are hidden. Rounded steel newels, continuous rubber handrails, panel joints, brush strips and comb plates follow the photo references.

The classic C20 cabin has separate rounded seat cushions and tilted backrests, open pedestals, yellow seat-edge grips, vestibule poles, glass screens, emergency panels, ceiling seams and paired light troughs. Door leaves have blue exterior faces and gray interior faces. All textures and passenger posters are generated, with poster text in the Swedish locale file.

## Visual review

Start with `bun run dev`, open one of these URLs, then click **Gå ner i tunnelbanan**. The debug-only `freeze` flag stops timetable progression while keeping movement and rendering active.

- Cab and Kungsträdgården: `/?debug&freeze&x=76&z=-2.8&yaw=1.19&t=20`
- T-Centralen: `/?debug&freeze&x=480&z=2.4&yaw=-1.57&t=20`
- Rådhuset: `/?debug&freeze&x=980&z=2.4&yaw=-1.57&t=20`
- Fridhemsplan: `/?debug&freeze&x=1480&z=2.4&yaw=-1.57&t=20`
- Interior: `/?debug&freeze&x=0&y=1.12&z=-6.6&yaw=-1.57&t=20`
- Interior detail: `/?debug&freeze&x=8&y=1.12&z=-6.6&yaw=-2.34&pitch=-0.2&t=20`
- Escalator entrance: `/?debug&freeze&x=76&y=1.12&z=1.18&yaw=-1.57&t=20`

- Night, with the scrubber: `/?debug&x=20&z=1&yaw=1.3&clock=03:10`
- Snow at the exit: `/?debug&x=117&y=13.1&z=1&yaw=-1.57&pitch=0.12&t=20&weather=snow`
- The busker: `/?debug&x=608.5&y=13.1&z=17&yaw=3.3&t=20`
- The shelter: `/?debug&x=880&y=-6&z=0&yaw=-1.2&t=20`
- Kymlinge: `/?debug&x=5090&y=1.1&z=-2&yaw=-1.9&t=20`
- Solna centrum: `/?debug&x=3480&z=2.4&yaw=-1.57&t=20`
- Huvudsta (the shifted Hjulsta branch): `/?debug&x=8480&z=2.4&yaw=-1.57&t=20`
- Red and green lines: `/?debug&x=530&y=7.1&z=33&yaw=1.35&t=20`
- The kiosk: `/?debug&x=120&y=13.1&z=-1&yaw=-0.75&t=20`
- Lucia: `/?debug&clock=2026-12-13T08:00&x=505&z=0.5&yaw=-1.57`
- Night track work: `/?debug&clock=2026-09-23T03:10`
- Screensaver: `/?debug&t=200&screensaver`

Kymlinge, the staff rooms and the shelter are interpretations too: raw rock and work lamps for a station that was never finished, painted concrete and bunks for a Swedish civil defence shelter. Silverpilen uses the C20 geometry with an unpainted aluminium palette rather than a model of the 1960s prototype sets.

Run `bun test tests/train-layout.test.ts tests/escalator.test.ts`, `bun run typecheck` and `bun run build` after geometry edits. Escalator tests cover step/carry synchronization and Rapier traversal of both landing transitions in both station orientations.
