import { STOCKHOLM } from './clock';

/**
 * The open data the game reads, all without keys. Only the relay polls them
 * (`server/feeds.ts`); clients read its shared copy (`relay.ts`). SL's
 * departures come from GTFS Regional, with keys (`server/gtfs.ts`).
 * No three.js here: the relay and the landing page import it.
 */

/** SL's deviations API: traffic information for the blue line. */
export const SL_DEVIATIONS = 'https://deviations.integration.sl.se/v1/messages?future=false&transport_mode=METRO&line=10&line=11';

/** Open-Meteo: the weather in Stockholm right now. */
export const WEATHER = `https://api.open-meteo.com/v1/forecast?latitude=${STOCKHOLM.lat}&longitude=${STOCKHOLM.lon}&current=temperature_2m,precipitation,weather_code&timezone=Europe%2FStockholm`;

/** SMHI's impact based weather warnings, for all of Sweden. */
export const SMHI_WARNINGS = 'https://opendata-download-warnings.smhi.se/ibww/api/version/1/warning.json';

/** Sveriges Radio: P4 Stockholm's news as an Atom feed, about two days of it. */
export const SR_NEWS = 'https://api.sr.se/api/rss/program/103';
