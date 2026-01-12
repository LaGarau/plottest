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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const GRID_SIZE = 0.0002; 

  // Fixed GeoJSON typing for Build
  const capturedCells = useRef<GeoJSON.FeatureCollection>({ 
    type: 'FeatureCollection' as const, 
    features: [] 
  });
  const visitedCellIds = useRef(new Set<string>());

  // --- 1. INITIALIZE MAP ---
  useEffect(() => {
    if (!mapContainer.current) return;

    mapInstance.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty', 
      center: [85.3072, 27.7042], 
      zoom: 17,
      pitch: 45,
    });

    const el = document.createElement('div');
    el.className = 'player-marker';
    el.style.cssText = `
      width: 20px; height: 20px; background: #fff; 
      border: 3px solid #00f2ff; border-radius: 50%; 
      box-shadow: 0 0 15px #00f2ff; transition: all 0.2s ease;
    `;

    playerMarker.current = new maplibregl.Marker({ element: el })
      .setLngLat([85.3072, 27.7042])
      .addTo(mapInstance.current);

    mapInstance.current.on('load', () => {
      mapInstance.current?.addSource('grid-source', {
        type: 'geojson',
        data: capturedCells.current
      });

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

    // MOCK MODE: Click to move (Helps with "Position Unavailable" error)
    mapInstance.current.on('click', (e) => {
      handleMovement(e.lngLat.lng, e.lngLat.lat);
    });

    return () => mapInstance.current?.remove();
  }, []);

  // --- 2. MOVEMENT LOGIC (SHARED BY GPS & CLICK) ---
  const handleMovement = (lng: number, lat: number) => {
    const cellId = `${Math.floor(lng / GRID_SIZE)}_${Math.floor(lat / GRID_SIZE)}`;

    // A. Update Visuals
    playerMarker.current?.setLngLat([lng, lat]);
    mapInstance.current?.easeTo({ center: [lng, lat], essential: true });

    // B. Firebase Logic
    if (!visitedCellIds.current.has(cellId)) {
      const communityRef = ref(rtdb, 'community_grid');
      const neonColors = ['#00f2ff', '#00ff9d', '#ff0055', '#ffee00', '#7a00ff'];
      
      push(communityRef, {
        lng, lat, cellId,
        color: neonColors[Math.floor(Math.random() * neonColors.length)],
        timestamp: Date.now()
      });
    }
  };

  // --- 3. LISTEN TO COMMUNITY DATA ---
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
        
        const newFeat: GeoJSON.Feature = {
          type: 'Feature',
          properties: { color },
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [cellX * GRID_SIZE, cellY * GRID_SIZE],
              [(cellX + 1) * GRID_SIZE, cellY * GRID_SIZE],
              [(cellX + 1) * GRID_SIZE, (cellY + 1) * GRID_SIZE],
              [cellX * GRID_SIZE, (cellY + 1) * GRID_SIZE],
              [cellX * GRID_SIZE, cellY * GRID_SIZE]
            ]]
          }
        };

        capturedCells.current.features.push(newFeat);
        const src = mapInstance.current?.getSource('grid-source') as maplibregl.GeoJSONSource;
        if (src) src.setData(capturedCells.current);
        setCapturedCount(visitedCellIds.current.size);
      }
    });
  }, [isLoaded]);

  // --- 4. GPS TRACKER ---
  useEffect(() => {
    if (!isLoaded) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setErrorMsg(null);
        handleMovement(pos.coords.longitude, pos.coords.latitude);
      }, 
      (err) => {
        const msgs: Record<number, string> = {
          1: "Permission Denied",
          2: "GPS Signal Unavailable (Try clicking map to move)",
          3: "Timeout"
        };
        setErrorMsg(msgs[err.code] || "GPS Error");
      }, 
      { enableHighAccuracy: true, timeout: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isLoaded]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#000' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      
      {/* UI PANEL */}
      <div style={panelStyle}>
        <div style={{ color: '#00f2ff', fontWeight: 'bold', fontSize: '12px' }}>GHUMANTE NETWORK</div>
        <div style={{ fontSize: '32px', color: '#fff', margin: '4px 0' }}>{capturedCount}</div>
        <div style={{ fontSize: '10px', color: '#888' }}>BLOCKS VISITED</div>
      </div>

      {/* ERROR TOAST */}
      {errorMsg && (
        <div style={errorStyle}>
          ⚠️ {errorMsg}
        </div>
      )}
    </div>
  );
}

// STYLES
const panelStyle: React.CSSProperties = { 
  position: 'absolute', top: '20px', left: '20px', 
  backgroundColor: 'rgba(10, 10, 15, 0.9)', padding: '20px', 
  borderRadius: '16px', textAlign: 'center', zIndex: 10, 
  border: '1px solid rgba(0, 242, 255, 0.3)', backdropFilter: 'blur(10px)'
};

const errorStyle: React.CSSProperties = {
  position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
  backgroundColor: 'rgba(255, 0, 85, 0.9)', color: 'white', padding: '10px 20px',
  borderRadius: '30px', fontSize: '14px', zIndex: 20, fontWeight: 'bold'
};
