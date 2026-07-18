'use client';

import {useEffect} from 'react';
import {MapContainer, Marker, TileLayer, useMap, useMapEvents} from 'react-leaflet';
import {divIcon, type LatLngExpression} from 'leaflet';

const pinIcon = divIcon({
  className: 'delivery-pin-shell',
  html: '<span class="delivery-pin" aria-hidden="true"></span>',
  iconAnchor: [18, 36],
  iconSize: [36, 36]
});

function Recenter({position}: {position: [number, number]}) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, Math.max(map.getZoom(), 15), {animate: true});
  }, [map, position]);
  return null;
}

function Pin({position, onChange}: {position: [number, number]; onChange: (position: [number, number]) => void}) {
  useMapEvents({click: (event) => onChange([event.latlng.lat, event.latlng.lng])});
  return <Marker icon={pinIcon} position={position as LatLngExpression} draggable eventHandlers={{dragend: (event) => {
    const point = event.target.getLatLng(); onChange([point.lat, point.lng]);
  }}}/>;
}

export default function AddressMap({position, onChange}: {position: [number, number]; onChange: (position: [number, number]) => void}) {
  return <MapContainer className="map" center={position} zoom={13} scrollWheelZoom>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"/>
    <Pin position={position} onChange={onChange}/>
    <Recenter position={position}/>
  </MapContainer>;
}
