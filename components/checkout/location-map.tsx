"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

export type MapPosition = { lat: number; lng: number };

// FTT-styled SVG pin as a divIcon — avoids Leaflet's broken default marker
// images under bundlers, and stays on-brand (burgundy body, gold edge).
const PIN_ICON = L.divIcon({
  className: "ftt-map-pin",
  html: `<svg width="30" height="30" viewBox="0 0 24 24" fill="#601D1C" stroke="#B39152" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg"><path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.6" fill="#FDF7F1" stroke="none"/></svg>`,
  iconSize: [30, 30],
  iconAnchor: [15, 28],
});

const INDIA_CENTER: [number, number] = [20.5937, 78.9629];

function Recenter({ lat, lng }: MapPosition) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 14));
  }, [lat, lng, map]);
  return null;
}

type LocationMapProps = {
  position: MapPosition | null;
  onPositionChange: (lat: number, lng: number) => void;
};

export default function LocationMap({
  position,
  onPositionChange,
}: LocationMapProps) {
  const center: [number, number] = position
    ? [position.lat, position.lng]
    : INDIA_CENTER;

  return (
    <div className="relative z-0 h-56 w-full overflow-hidden rounded-2xl border border-ftt-border [isolation:isolate]">
      <MapContainer
        center={center}
        zoom={position ? 14 : 4}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {position ? (
          <>
            <Marker
              position={[position.lat, position.lng]}
              icon={PIN_ICON}
              draggable
              eventHandlers={{
                dragend: (event) => {
                  const { lat, lng } = (
                    event.target as L.Marker
                  ).getLatLng();
                  onPositionChange(lat, lng);
                },
              }}
            />
            <Recenter lat={position.lat} lng={position.lng} />
          </>
        ) : null}
      </MapContainer>
    </div>
  );
}
