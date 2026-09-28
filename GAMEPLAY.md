# Gameplay

How to move, ride, sit and listen. What the game contains is in [FEATURES.md](FEATURES.md). The short version is the [README](README.md).

## Controls

Phones and tablets use a left thumbstick to walk and a drag on the scene to look around. Both work simultaneously. On-screen buttons provide running and jumping; sitting, standing and climbing appear when available. The map button opens the route map. The pause menu provides sound, passengers, carriage sway and pixel settings, plus touch instructions. No keyboard or pointer lock is needed.

Portrait and landscape layouts respect screen safe areas. Touch rendering caps the pixel ratio at 1.5, and on any device the resolution drops a notch when frames run slow and comes back when there is headroom. Pausing or hiding the page stops the simulation and clears held input; rotating the device resets active gestures. To test the touch layout on a desktop, use `?debug&touch`.

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | Walk |
| Mouse | Look around |
| `Shift` | Run |
| `Space` | Jump (onto benches, bins, ticket gates) |
| `E` | Climb back onto the platform from the track |
| `M` | Mute |
| `P` | Toggle pixel mode |
| `H` | Toggle help |
| `N` | Show or hide passengers (also available in the HUD and pause menu) |
| `F` | Sit in a nearby unoccupied train seat, or stand up |
| `E` | Use (tap your card, show it to an inspector, tip the busker, pick up lost property and hand it in at the booth, doors, cranks, elbow through a crowd) or climb up from the track |
| `Q` / left click | Punch someone in the rush hour crowd |
| `K` | Driver mode. While driving: `W`/`S` master controller, `Space` emergency brake, `E` doors, `Q` leave the cab |
| `G` | Show or hide other players |
| `V` | Toggle carriage sway (also available in the HUD and pause menu) |
| `B` | Screensaver mode (any key ends it) |
| `Esc` | Pause |

Every key can be rebound in the pause menu under *Inställningar*, which also has look sensitivity, field of view and separate volumes for everything, announcements, ambience and trains. Keys are read by their place on the keyboard, so the defaults sit where WASD is on AZERTY and Dvorak too. `L` opens or puts away the map.

A gamepad works as well: the left stick walks, the right stick looks, A jumps, X uses, B sits or stands, LB or a pressed left stick runs, Y shows the map, Back shows help and Start pauses or resumes. In driver mode the right and left triggers (or the d-pad) move the master controller, X or A works the doors, B pulls the emergency brake and Back leaves the cab.

Stay off the tracks when a train is coming.

## Passengers

Optional passengers add twelve stylized waiting and walking figures per station, plus seated passengers inside every train. The same toggle controls both groups, is saved locally and starts off for new visitors. Passengers are decorative and do not block the player. The background platform crowd stays in its lanes; seated passengers travel with their train and leave the aisle and doorways clear. Only nearby crowds are rendered. Four commuting passengers per train board after alighting passengers have cleared the doors. They ride to the next station, step off through the platform-side doors, and stay on the platform when the train departs. These routes are deterministic timetable samples, with no pathfinding or passenger collisions. Seated riders occasionally turn their heads or nod off.

## Sitting

A nearby free seat shows an `F` prompt on desktop or a Sitt button on touch devices. Sitting lowers the camera onto the seat, keeps looking around available, and disables walking and jumping until you stand. The collision capsule stays in the aisle and continues to be carried by the train. Small camera-only suspension motion follows distance, speed, acceleration and braking. `V` disables it; the saved choice takes priority over the system reduced-motion preference.

## Sound

Synthesized wheel joints follow distance traveled, and braking adds a restrained metallic squeal. Footsteps change with the ground: stone, the carriage's rubber floor, the escalators' metal, gravel on the trackbed and concrete in the corridors. Muting applies to train sounds as well as announcements.

## Announcements

Announcements follow the listener and shared timetable. Platform arrivals do not trigger spoken notices or subtitles; departure boards retain the train information. Onboard next-station messages start three seconds before the train's leading end reaches the platform. T-Centralen's next-station clip leads directly into transfer information as the train enters. The warning follows the complete spoken message: after next-station speech elsewhere, and after both next-station and transfer information at T-Centralen. Every station uses original next-station and station-name clips. T-Centralen uses original connecting phrases for the other metro lines and commuter trains, followed by the original warning. Other arrival notices wait for the next-station recording and warning to finish while rolling in. Transfer information and the alighting warning are audio only; captions retain the station name. Kungsträdgården includes the original terminal instruction only in the inbound direction. Boarding a stationary train cannot start or replay an arrival notice. An already active notice may finish while the train stops. Leaving, pausing, muting or replacing a notice cancels pending and playing audio.

The recorded announcements are 164 unedited MP3 clips of the Utrop library. They are not in this repository and never go public, since SL does not own the voice and declined to approve it; `public/audio/catalog.json` keeps each clip's length and checksum, and a build without them plays the browser's voice instead. Only clips needed by the current route are loaded after sound activation, and source clips are joined only in memory. Next-station recordings already contain their signal, so no second signal is added. Subtitles follow speech start. Stations hold for six seconds after the two-second opening movement. The original door buzzer starts 0.4 seconds before the doors move and plays through their 2.5-second closing slide, fading out at closure. The source file is unchanged. The public build always leaves the recordings out: SL does not own the voice and declined to approve it (`RECORDINGS=0`, the default for `bun run deploy`): the browser's Swedish voice reads every call and the warning, after a synthesized two-note chime, and a synthesized beep takes the buzzer's place with the same timing. The train waits one second with closed doors before departing. Total station stops last 11.9 seconds. Passenger boarding and alighting fit inside this shorter window.

Services alternate between line 10 toward Hjulsta and line 11 toward Akalla, returning toward Kungsträdgården. Train destinations and departure boards use the same service identity. Solna strand has no clip in the library, so its name is spoken by the browser. Route reference: [SL blue-line map](https://kund.printhuset-sthlm.se/sl/vtub10_11.pdf).
