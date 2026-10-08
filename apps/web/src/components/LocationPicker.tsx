'use client';

import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/field';

const Map = dynamic(() => import('./LocationMap').then((m) => m.LocationMap), { ssr: false });

export function LocationPicker({
  latitude,
  longitude,
  address,
  onChange,
}: {
  latitude: number;
  longitude: number;
  address: string;
  onChange: (next: { latitude: number; longitude: number; address?: string }) => void;
}) {
  return (
    <div className="space-y-3">
      <Map latitude={latitude} longitude={longitude} onChange={(lat, lng) => onChange({ latitude: lat, longitude: lng })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="lat">Latitude</Label>
          <Input
            id="lat"
            type="number"
            step="0.0001"
            value={latitude}
            onChange={(e) => onChange({ latitude: Number(e.target.value), longitude })}
          />
        </div>
        <div>
          <Label htmlFor="lng">Longitude</Label>
          <Input
            id="lng"
            type="number"
            step="0.0001"
            value={longitude}
            onChange={(e) => onChange({ latitude, longitude: Number(e.target.value) })}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="address">Address</Label>
        <Input id="address" value={address} onChange={(e) => onChange({ latitude, longitude, address: e.target.value })} />
      </div>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          navigator.geolocation.getCurrentPosition((pos) => {
            onChange({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            });
          });
        }}
      >
        Use my current location
      </Button>
    </div>
  );
}
