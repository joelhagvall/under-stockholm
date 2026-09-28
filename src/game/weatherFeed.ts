import { hash01, stockholm } from './clock';
import { relayFeed } from './relay';

/**
 * The weather up on the street, as data: Open-Meteo's current conditions through the relay, or a seasonal guess
 * from the date. No three.js.
 */

export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'snow' | 'sleet';

export interface WeatherState {
  kind: WeatherKind;
  /** 0..1 */
  intensity: number;
  temperature: number;
  source: 'live' | 'season' | 'debug';
}

/** A plausible guess from the date alone, the same for everyone on a given day. */
export function seasonalWeather(epoch: number): WeatherState {
  const c = stockholm(epoch);
  const day = Math.floor(epoch / 86400);
  const r = hash01(day, 5);
  const cold = c.month === 12 || c.month <= 2;
  const shoulder = c.month === 3 || c.month === 11;
  const temperature = cold ? -3 + r * 5 : shoulder ? 1 + r * 7 : c.month >= 6 && c.month <= 8 ? 16 + r * 8 : 6 + r * 9;
  let kind: WeatherKind = r < 0.45 ? 'clear' : r < 0.7 ? 'cloudy' : 'rain';
  if (kind === 'rain' && temperature < 0.5) kind = 'snow';
  else if (kind === 'rain' && temperature < 2.5) kind = 'sleet';
  return { kind, intensity: kind === 'clear' || kind === 'cloudy' ? 0 : 0.4 + hash01(day, 6) * 0.5, temperature, source: 'season' };
}

/** WMO weather codes, as used by Open-Meteo. */
function fromCode(code: number, temperature: number, precipitation: number): WeatherState {
  let kind: WeatherKind = 'clear';
  if (code >= 71 && code <= 77) kind = 'snow';
  else if (code === 85 || code === 86) kind = 'snow';
  else if (code === 66 || code === 67 || ((code >= 51 && code <= 67) && temperature < 1.5)) kind = 'sleet';
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) kind = 'rain';
  else if (code >= 2) kind = 'cloudy';
  const wet = kind === 'rain' || kind === 'snow' || kind === 'sleet';
  return { kind, intensity: wet ? Math.min(1, 0.35 + precipitation / 3) : 0, temperature, source: 'live' };
}

type OpenMeteo = { current?: { temperature_2m: number; precipitation: number; weather_code: number } };

export async function fetchWeather(): Promise<WeatherState | null> {
  try {
    // Only through the relay, so Open-Meteo sees one poll however many play. Without one the weather follows the season.
    const data = (await relayFeed<OpenMeteo>('weather'))?.data;
    if (!data?.current) return null;
    return fromCode(data.current.weather_code, data.current.temperature_2m, data.current.precipitation);
  } catch {
    return null;
  }
}

export const isWet = (w: WeatherState) => w.kind === 'rain' || w.kind === 'snow' || w.kind === 'sleet';
