# Recorded announcements

The game can play the recorded C20 announcements of the Utrop library: station names, connecting phrases, the alighting warning and the door buzzer, 164 unedited MP3 clips. They are **not in this repository and never go public**. SL does not own the voice and declined to approve its use (September 2026), so the clips stay on the developer's machine, ignored by git (`public/audio/*.mp3`).

Without them the game is whole: the browser's Swedish voice reads every call after a synthesized two-note chime, and a synthesized beep takes the door buzzer's place with the same timing (`audio.ts`). That is what every public build plays (`RECORDINGS=0`, the default for `bun run deploy`).

`catalog.json` stays committed: each clip's length and SHA-256, which set the caption and door timing (`src/game/clips.ts`) and let `tests/announcement-recording.test.ts` check a local library when one is present.

## In-game playback, with the clips present

- Every station uses its next-station and station-name recordings. `nasta.mp3` already includes the signal.
- T-Centralen: next station, then `bytetill`, `ovrigatunnelbana`, `och`, `pendeltag`, followed by the shared alighting warning, and `tcentralen.mp3` on arrival.
- Kungsträdgården: inbound arrivals include `slutstation.mp3`. Outbound trains do not call it a terminus.
- `avstandet.mp3` follows each complete approach announcement, without another signal or on-screen caption.
- `buzz.mp3` is the door closing warning. Playback starts 0.4 seconds before doors slide and ends when they close.
- Solna strand has no clip in the library, so its name alone is spoken by the browser. Game-specific notices always use browser speech.

Only clips used by the current route are fetched and decoded after sound activation.

The sounds of people in `sfx/` are public domain and CC0, and are in the repository (sources in its README).
