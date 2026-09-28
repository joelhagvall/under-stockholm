/** False when only the landing page is built (LANDING_ONLY=1 in vite.config.ts): the game is left out of the build. */
declare const __GAME__: boolean;
/** False in a build without the recorded announcements (RECORDINGS=0 in vite.config.ts): see `announcementSignal.ts`. */
declare const __RECORDINGS__: boolean;
