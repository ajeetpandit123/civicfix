import type { Env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export type GeocodeResult = {
  address: string;
  latitude: number;
  longitude: number;
};

export interface Geocoder {
  reverse(lat: number, lng: number): Promise<GeocodeResult | null>;
  search(query: string): Promise<GeocodeResult[]>;
}

class NoneGeocoder implements Geocoder {
  async reverse(lat: number, lng: number): Promise<GeocodeResult | null> {
    return { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, latitude: lat, longitude: lng };
  }
  async search(): Promise<GeocodeResult[]> {
    return [];
  }
}

class NominatimGeocoder implements Geocoder {
  constructor(private readonly userAgent: string) {}

  async reverse(lat: number, lng: number): Promise<GeocodeResult | null> {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lng));
      url.searchParams.set('format', 'jsonv2');
      const res = await fetch(url, { headers: { 'User-Agent': this.userAgent } });
      if (!res.ok) return new NoneGeocoder().reverse(lat, lng);
      const data = (await res.json()) as { display_name?: string };
      return {
        address: data.display_name ?? `${lat}, ${lng}`,
        latitude: lat,
        longitude: lng,
      };
    } catch (err) {
      logger.warn({ err }, 'geocode_reverse_failed');
      return new NoneGeocoder().reverse(lat, lng);
    }
  }

  async search(query: string): Promise<GeocodeResult[]> {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '5');
      const res = await fetch(url, { headers: { 'User-Agent': this.userAgent } });
      if (!res.ok) return [];
      const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      return data.map((d) => ({
        address: d.display_name,
        latitude: Number(d.lat),
        longitude: Number(d.lon),
      }));
    } catch (err) {
      logger.warn({ err }, 'geocode_search_failed');
      return [];
    }
  }
}

export function createGeocoder(env: Env): Geocoder {
  if (env.GEOCODER_PROVIDER === 'nominatim') return new NominatimGeocoder(env.GEOCODER_USER_AGENT);
  return new NoneGeocoder();
}
