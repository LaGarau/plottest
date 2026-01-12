"use client";
import React, { useRef, useState, useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// FIREBASE IMPORTS
import { rtdb } from '../lib/firebase'; 
import { ref, push, onChildAdded } from 'firebase/database'; 

export default function GhumanteCommunityMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<maplibregl.Map | null>(null);
  const playerMarker = useRef<maplibregl.Marker | null>(null);
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [capturedCount, setCapturedCount] = useState(0);
  
  const GRID_SIZE = 0.0002; 
  const capturedCells = useRef({ type: 'FeatureCollection', features: [] });
  const visitedCellIds = useRef(new Set());

  // --- 1. INITIALIZE MAP & MARKER ---
  useEffect(() => {
    if (!mapContainer.current) return;

    mapInstance.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty', 
      center: [85.3072, 27.7042], // Default Kathmandu
      zoom: 17,
      pitch: 45, // Slight tilt for a better "game" feel
    });

    // Create a custom neon element for the player marker
    const el = document.createElement('div');
    el.className = 'player-marker';
    el.style.width = '20px';
    el.style.height = '20px';
    el.style.backgroundColor = '#fff';
    el.style.border = '3px solid #00f2ff';
    el.style.borderRadius = '50%';
    el.style.boxShadow = '0 0 15px #00f2ff, 0 0 5px #fff';

    playerMarker.current = new maplibregl.Marker({ element: el })
      .setLngLat([85.3072, 27.7042])
      .addTo(mapInstance.current);

    mapInstance.current.on('load', () => {
      // Initialize the grid source
      mapInstance.current?.addSource('grid-source', {
        type: 'geojson',
        data: capturedCells.current
      });

      // Add the grid layer
      mapInstance.current?.addLayer({
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

    return () => mapInstance.current?.remove();
  }, []);

  // --- 2. LISTEN TO COMMUNITY DATA ---
  useEffect(() => {
    if (!isLoaded) return;

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

        (capturedCells.current.features as any[]).push({
          type: 'Feature',
          properties: { color },
          geometry: {
            type: 'Polygon',
            coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]]
          }
        });

        // Update the map visuals
        const source = mapInstance.current?.getSource('grid-source') as maplibregl.GeoJSONSource;
        if (source) source.setData(capturedCells.current);
        setCapturedCount(visitedCellIds.current.size);
      }
    });
  }, [isLoaded]);

  // --- 3. PLAYER MOVEMENT, MARKER & CENTERING ---
  useEffect(() => {
    if (!isLoaded) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { longitude, latitude } = position.coords;
        const cellId = `${Math.floor(longitude / GRID_SIZE)}_${Math.floor(latitude / GRID_SIZE)}`;

        // A. Move Marker
        playerMarker.current?.setLngLat([longitude, latitude]);

        // B. Center Map on Player
        mapInstance.current?.easeTo({
          center: [longitude, latitude],
          duration: 1000, // Smooth slide
          essential: true
        });

        // C. Record Grid Visit
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
      }, 
      (err) => {
        console.error("Geolocation Error:", err.code, err.message);
      }, 
      { 
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000 
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isLoaded]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      
      {/* HUD UI */}
      <div style={panelStyle}>
        <div style={{ color: '#00f2ff', fontWeight: 'bold', letterSpacing: '1px' }}>COMMUNITY GRID</div>
        <div style={{ fontSize: '36px', color: '#fff', margin: '5px 0' }}>{capturedCount}</div>
        <div style={{ fontSize: '11px', color: '#aaa' }}>BLOCKS VISITED</div>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = { 
  position: 'absolute', 
  top: '20px', 
  left: '20px', 
  backgroundColor: 'rgba(10, 10, 15, 0.9)', 
  padding: '20px', 
  borderRadius: '16px', 
  textAlign: 'center', 
  zIndex: 10, 
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
  backdropFilter: 'blur(8px)',
  minWidth: '160px'
};
