'use client';

import {divIcon} from 'leaflet';
import {MapContainer, Marker, Polygon, TileLayer, useMapEvents} from 'react-leaflet';
import type {MapPoint, Zone} from '@/app/[locale]/admin/zones/page';

function ClickToDraw({points, onChange}: {points: MapPoint[]; onChange: (points: MapPoint[]) => void}) {
  useMapEvents({click: (event) => onChange([...points, [event.latlng.lat, event.latlng.lng]])});
  return null;
}

function numberedIcon(number: number) {
  return divIcon({
    className: 'zone-point-shell',
    html: `<span class="zone-point">${number}</span>`,
    iconAnchor: [14, 14],
    iconSize: [28, 28]
  });
}

function zonePositions(zone: Zone): MapPoint[] {
  return (zone.polygon.coordinates[0] ?? []).map(([longitude, latitude]) => [latitude, longitude]);
}

export default function ZoneMapEditor({zones, points, onChange}: {
  zones: Zone[];
  points: MapPoint[];
  onChange: (points: MapPoint[]) => void;
}) {
  function movePoint(index: number, point: MapPoint) {
    onChange(points.map((current, currentIndex) => currentIndex === index ? point : current));
  }

  return <MapContainer className="map zone-map" center={[41.035, 28.99]} zoom={12} scrollWheelZoom>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/>
    {zones.map((zone) => <Polygon key={zone.id} positions={zonePositions(zone)} pathOptions={{color: '#173f35', fillColor: '#173f35', fillOpacity: .12, weight: 2}}/>)}
    {points.length >= 2 && <Polygon positions={points} pathOptions={{color: '#dd7135', fillColor: '#dd7135', fillOpacity: .24, weight: 3}}/>}
    {points.map((point, index) => <Marker key={index} position={point} icon={numberedIcon(index + 1)} draggable eventHandlers={{
      dragend: (event) => {
        const location = event.target.getLatLng();
        movePoint(index, [location.lat, location.lng]);
      }
    }}/>) }
    <ClickToDraw points={points} onChange={onChange}/>
  </MapContainer>;
}
