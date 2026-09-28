---
name: three-webgl-game
description: Building, debugging and speeding up Under Stockholm's three.js + Rapier game (src/game). Use when adding things to the world, chasing frame rate or draw calls, checking memory, or profiling a frame with SpectorJS. Adapted from OpenAI's game-studio "three-webgl-game" skill to this project's rules: baked light, no model files, fixed budgets.
---

# three.js game work in Under Stockholm

The general advice from the original skill holds and the project already follows it: simulation lives outside three.js (the timetable is a pure function in `timetable.ts` and `routes.ts`), menus and HUD are DOM (`hud.ts`), physics is Rapier, the build is Vite and TypeScript, and every camera mode is explicit (`player.ts`, driver mode, the showcase, a life on the blue line). Two pieces of its advice do **not** apply here and must not be followed:

- **No GLB/glTF, no loaders.** All geometry, textures and sound are generated at runtime (see AGENTS.md, "No asset files"). Never add GLTFLoader, DRACOLoader or KTX2Loader.
- **No standard lit materials for the world.** Light is baked into vertex colors (`bakeLighting`, `Section.finish`) and drawn with shared `MeshBasicMaterial`s. The only real-time light is one `HemisphereLight` for the trains' exterior. New world materials go through `torchify` (`powerLights.ts`).

Read AGENTS.md first; this skill only adds how to work on speed.

## Budgets

- Landing JavaScript 6 kB, landing CSS 5 kB, all JavaScript and WASM 1.3 MB (gzip), checked by `bun run build` (`scripts/check-budgets.ts`), which also shows the Brotli size a host like Cloudflare sends.
- A station should cost a handful of draw calls: one mesh per baked layer per section, plus signs and displays in `extras`.
- What the size costs a player: `bun run load` (with `bun run build && bun run serve:prod`) times the click to playing, as a desktop and as a phone on slow 4G. Measured in September 2026: 1.5 s on the desktop (inside the loading screen's 4.5 s minimum, so size costs nothing there), 9.9 s on the phone, of which 5 s is the download with Brotli (the physics binary two thirds of it) and under 5 s building the world. Work behind the loading screen runs in slices of `LOADING_SLICE_MS` (`frames.ts`): shorter slices only add frames to wait for.
- The render resolution adapts (`RENDER_SCALES` in `resolution.ts`): half a second of slow frames lowers it a notch. A scene that only holds 60 fps at the lowest scale is too heavy.

## Real frame rates, without a person

`bun run check --perf` is the gate for a change to the world, the build steps or the frame loop (AGENTS.md, Quality gates): it runs `mem`, `fps` and `load` against floors and `perf/baseline.json`, and `--accept` writes a new baseline when a change is meant to cost. `--smoke` is its quick cousin for every push, and the whole of it runs before a deploy (`bun run release`). To look into a number, run the piece on its own. `bun run fps` (with `bun run dev` running) is the first thing to run. It opens the game in headless Chrome on this computer's own GPU, with the page visible and `requestAnimationFrame` at the screen's rate, sets up each scene through `__us` and times real frames: average fps, the 95th percentile, the share over 20 ms, the worst frame and the frames over 50 ms, with where the adaptive resolution ended up. The scenes are the heavy places, a minute aboard a real train (`__us.ride()`), and two runs out along branches at train speed, where stations are built on the way (the stutter test). It then runs the same as a phone: a phone's screen and touch and a CPU six times slower. The GPU cannot be slowed, so a real phone draws slower still: treat the phone run as the CPU side of a phone.

- `--why` prints what every frame over 50 ms spent its time on: the game's own parts (`__us.slowFrames()`, from the frame's laps) and, for work outside the frame, the long-animation-frame entries with the script that held the thread.
- `--only desktop|phone|device`, `--scene <part of a name>`, `--seconds`, `--url`, `--json <file>`.
- `--device` runs the scenes on an Android phone over USB as well (USB debugging on, adb installed): the dev server's port is reversed to the phone and Chrome on it is driven through its DevTools socket. The only measurement with a phone's real GPU.
- Before a change and after it, on the same scenes. Measured in September 2026: 60 fps on every scene on the desktop, worst frame 17 ms; 59 to 60 as a phone, worst frame 50 ms.

## Measuring a frame

Start the dev server (`bun run dev`) and open the game with `?debug` (plus `x`, `z`, `yaw`, `clock=`, `weather=` to set a scene). `__us.perf(seconds, rate)` runs frames by hand, also in a hidden tab, and times them:

```js
__us.goto(1);            // T-Centralen
__us.perf(3, 30);
// { frameMs, logicMs, renderMs, calls, triangles, geometries, textures, programs }
```

- `renderMs` includes waiting for the GPU (a one-pixel read after each render), so it is the real cost of drawing. `logicMs` is everything else: trains, physics, crowds, audio, HUD.
- `calls` and `triangles` are the last frame's. Compare scenes, not absolute numbers: a hidden or throttled tab is slower than a visible one.
- Measure the heavy places: T-Centralen's platforms, riding a train through the tunnels, the open air at Slussen and over Riddarfjärden, the City passage at rush hour (`clock=08:00`, `__us.city()`), and a crowded platform with passengers on.

`__us.laps(seconds, rate)` splits the frame into its parts (trains, physics, player, build, crowd, announcements, escalators and world, hazards, sound, sky, life, effects, boards, render), in milliseconds per frame. Start there: it covers the plain code in `boot.ts` that the method timings below miss.

To see which code takes the logic time, `await __us.hotspots(seconds, rate, top)` (dev server only) times every method of every class in `src/game` over frames run by hand and lists the heaviest, in milliseconds per frame (a method includes what it calls) and calls per frame. It is far more useful than a sampling profiler here: Chrome's JS Self-Profiling samples too coarsely for frames run by hand. Code in plain functions (most of `boot.ts`'s frame, the escalator closures) does not show up; wrap it by hand if needed.

For a single frame in detail, open the game with `?debug&spector` in the dev server. SpectorJS (a dev dependency, never in the build) is loaded and `__us.spector()` captures the next frame. It resolves to a summary: draw calls by program and by material, the most expensive calls by vertex count, and state changes. Spector's own UI (`spector.displayUI()` on `window.__spector`) shows the same capture for a person to look at.

## Where frame time usually goes, and what to do

- **Objects in the scene.** three.js works out every object's matrix every frame, hidden or not (`matrixWorldAutoUpdate` does not stop it from going through the children). A train out of service therefore leaves the scene (`Train.setActive`), which took T-Centralen from 11 000 objects to 4 000. Keep whole groups that are out of use out of the scene, not just hidden.
- **Colliders.** Rapier pays for every collider that moves. Trains far from the player rest theirs (`Train.setNear`, 400 m in `boot.ts`): the physics step went from 4.7 to about 1 ms.
- **Checks that are cheap first.** `World.interactableNear` measures the distance before it asks a thing whether it can be used.

- **Draw calls.** Static geometry belongs in the section's builders, never as separate meshes. Repeated props are `InstancedMesh`. A new sign or display in `extras` costs a call each: merge what does not change.
- **Per-frame allocation.** No `new Vector3()`, arrays or closures in per-frame paths; keep scratch objects on the instance. Look for `.clone()`, `.map(...)` and spread in `update` methods.
- **Timetable work.** `stateAt` is cheap but called a lot; share one `stateOf(svc)` per train per frame instead of recomputing.
- **Textures painted on the way.** A station's artwork is drawn on a canvas the first time it is used, 30 to 60 ms each. `stationSteps` paints it in the dry pass, behind the loading screen, so the build on the way finds it in the cache. Do the same for any new canvas texture a lazily built section needs.
- **Catching up.** A section missing within `MUST_REACH` (150 m) of the player is built at once; within `NEAR_REACH` (400 m) it gets 6 ms of each frame (`World.keepUp`). A build further off is set aside, not finished, when something nearer is needed.
- **Lazy builds.** Stations, stretches and turnbacks off the trunk build one step per frame (`World.later`), and a step over 16 ms is a stutter while riding. To find them, wrap `__us.world.step` in the page and time each call while moving the player along the line with `__us.player.teleport` and `__us.step`. `stationSteps` yields between its stages, the open stretches and open turnbacks build as generators, and `Section.finishSteps` yields after packing a big layer and after every `BAKE_CHUNK` (5 000) baked vertices. What is left are single builder calls that trigger garbage collection (the builders allocate a lot of small vectors); that is the next thing to fix if building still stutters.
- **Shader compiles.** A first-seen material compiles on the frame it appears. New materials should be created at start and warmed (`World.warm`, `renderer.compileAsync`), not made on the fly.
- **Overdraw.** Big transparent, additive surfaces (fog, glows, beams) are costly on phones. Keep them small and few.

After any change: `bun run typecheck`, `bun test`, `bun run build` (the budgets), and the same `__us.perf` scenes again to compare.

## Memory

The world is built and taken down as the player moves (`World.later`, `World.evict`), so a leak is anything a build leaves behind after it is gone. It rarely shows in a diff and it grows with every trip along the line.

`bun run mem` (with `bun run dev` running) is the check. It runs three scenarios in headless Chrome: travelling out along the branches and back, a life on the blue line (the time machine swaps the trains' stock) and the driver's cab in and out. Each is warmed up twice, then measured over six rounds (`--rounds`, `--scene`). It fails if a single geometry or texture uploaded to the GPU is neither freed nor in use, or if canvases, the JS heap, Blink's heap (canvas text caches live there), DOM nodes or listeners grow past a small margin. Run it after anything that builds, caches, frees or swaps things in the world. Measured in September 2026: no growth in any scenario, in about a minute and a half.

The leaks found so far all had the same shape, so look for it first:

- **A module-level cache keyed by something a build made.** `artMaterials` in `section.ts` kept every lazily built station's clutter atlas (a 5 MB canvas) forever; a texture made for one section is now `artLayer(texture, true)` and its material goes with it. `RideLight.dimmed` gained a material per mirror. Cache only what is shared and bounded; for anything else, let go of it when its owner goes.
- **A closure that outlives the build.** Kymlinge's `flicker` kept the old build (and kept updating it) after it was taken down. Anything a lazy build hands to the rest of the game needs a `release` in `World.later`.
- **Things `freeMemory` does not know about.** An `InstancedMesh` keeps its instance buffers until `dispose()`; three.js keeps the last render list of a scene (`World.warm` renders an empty frame after warming to let go).

When `mem` fails, find out why with the Chrome DevTools MCP (`.mcp.json` starts it with `--memoryDebugging`; the memory-leak-debugging skill in the chrome-devtools-mcp repository has the general workflow). Snapshots are 300 to 400 MB and the MCP only writes inside the project, so save them to `.heap/` (ignored by git), close them with `close_heapsnapshot` and delete the folder when done. What works in this game:

1. `take_heapsnapshot` at a baseline and after the rounds, `compare_heapsnapshots` for the summary. Object ids are not stable between snapshots here, so read the diff as counts per class: `CanvasTexture`, `Detached <canvas>`, `MeshBasicMaterial`, `WebGLBuffer` and Blink's `FrameShapeCache` are the usual suspects.
2. To learn which code made the survivors, hook creation in the page before the rounds: wrap `BufferGeometry.prototype.setAttribute`, `Material.prototype.setValues` or `document.createElement('canvas')` to keep a `WeakRef` and a stack trace. Take a snapshot to force garbage collection, then list what is still alive and not in the scene, grouped by stack.
3. For one survivor, tag it (a `data-` attribute on a canvas, say), snapshot again, find it with `query_heapsnapshot_objects` and read `get_heapsnapshot_retaining_paths`: the path names the Map, closure or render list that holds it.
