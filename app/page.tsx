"use client";
import React, { useRef, useState, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// FIREBASE IMPORTS
import { rtdb } from '../lib/firebase'; 
import { ref, push, onChildAdded } from 'firebase/database'; 

export default function GhumanteCommunityMap() {
  // --- TYPE FIXES HERE ---
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  
  const GRID_SIZE = 0.0002; 
  // Defined GeoJSON type to help TypeScript
  const capturedCells = useRef<GeoJSON.FeatureCollection>({ type: 'FeatureCollection', features: [] });
  const visitedCellIds = useRef(new Set<string>());

  // --- 1. INITIALIZE MAP ---
  useEffect(() => {
    // Only initialize the map if it doesn't exist and the container is ready
    if (mapInstance.current || !mapContainer.current) return;

    mapInstance.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty', 
      center: [85.3072, 27.7042],
      zoom: 17,
    });

    mapInstance.current.on('load', () => {
      if (!mapInstance.current) return;

      mapInstance.current.addSource('grid-source', {
        type: 'geojson',
        data: capturedCells.current
      });

      mapInstance.current.addLayer({
        id: 'grid-layer',
        type: 'fill',
        source: 'grid-source',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.6,
          'fill-outline-color': 'rgba(255,255,255,0.3)'
        }
      });
      setIsLoaded(true);
    });

    // Cleanup on unmount
    return () => {
      mapInstance.current?.remove();
      mapInstance.current = null;
    };
  }, []);

  // --- 2. LISTEN TO COMMUNITY DATA ---
  useEffect(() => {
    if (!isLoaded || !mapInstance.current) return;

    const communityRef = ref(rtdb, 'community_grid');

    return onChildAdded(communityRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const { lng, lat, color, cellId } = data;

      if (!visitedCellIds.current.has(cellId)) {
        visitedCellIds.current.add(cellId);
        
        const cellX = Math.floor(lng / GRID_SIZE);
        const cellY = Math.floor(lat / GRID_SIZE);
        const minLng = cellX * GRID_SIZE;
        const maxLng = (cellX + 1) * GRID_SIZE;
        const minLat = cellY * GRID_SIZE;
        const maxLat = (cellY + 1) * GRID_SIZE;

        capturedCells.current.features.push({
          type: 'Feature',
          properties: { color },
          geometry: {
            type: 'Polygon',
            coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]]
          }
        });

        const source = mapInstance.current?.getSource('grid-source') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData(capturedCells.current);
        }
        setCapturedCount(visitedCellIds.current.size);
      }
    });
  }, [isLoaded]);

  // --- 3. PLAYER MOVEMENT & WRITING ---
  useEffect(() => {
    if (!isLoaded) return;

    const watchId = navigator.geolocation.watchPosition((position) => {
      const { longitude, latitude } = position.coords;
      const cellId = `${Math.floor(longitude/GRID_SIZE)}_${Math.floor(latitude/GRID_SIZE)}`;

      if (!visitedCellIds.current.has(cellId)) {
        const communityRef = ref(rtdb, 'community_grid');
        const neonColors = ['#00f2ff', '#00ff9d', '#ff0055', '#ffee00', '#7a00ff'];
        
        push(communityRef, {
          lng: longitude,
          lat: latitude,
          cellId: cellId,
          color: neonColors[Math.floor(Math.random() * neonColors.length)],
          timestamp: Date.now()
        });
      }
      
      mapInstance.current?.easeTo({ center: [longitude, latitude] });
    }, (err) => console.error(err), { enableHighAccuracy: true });

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isLoaded]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      <div style={panelStyle}>
        <div style={{ color: '#00f2ff', fontWeight: 'bold' }}>COMMUNITY GRID</div>
        <div style={{ fontSize: '32px', color: '#fff' }}>{capturedCount}</div>
        <div style={{ fontSize: '10px', color: '#888' }}>TOTAL BLOCKS FILLED</div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = { 
  position: 'absolute', 
  top: '20px', 
  left: '20px', 
  backgroundColor: 'rgba(0,0,0,0.85)', 
  padding: '20px', 
  borderRadius: '12px', 
  textAlign: 'center', 
  zIndex: 10, 
  border: '1px solid #333' 
};
