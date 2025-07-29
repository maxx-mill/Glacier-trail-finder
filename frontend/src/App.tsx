import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Popup, useMap, Rectangle } from 'react-leaflet';
import L, { control } from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Remove: import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { useState as useReactState } from 'react';
import { FaRoad, FaRegClock, FaTree, FaBicycle, FaLock, FaExternalLinkAlt, FaDirections } from 'react-icons/fa';

// Fix leaflet default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Custom CSS to position zoom controls below navbar
const mapStyles = `
  .leaflet-control-zoom {
    margin-top: 100px !important;
  }
`;

interface Trail {
  id: number;
  osmWayId: string;
  points: [number, number][];
  intersectionStartId: string;
  intersectionEndId: string;
  distanceTotal: number;
  boundingBox: any;
  privateAccess: boolean;
  bicycleAccessible: boolean;
  name: string | null;
  difficulty: string | null;
  surface: string | null;
  trailType: string | null;
}

// Glacier National Park center (Lake McDonald area)
const GLACIER_CENTER: [number, number] = [48.7, -113.8];

// Function to get the center point of a trail for marker placement
function getTrailCenter(points: [number, number][]): [number, number] {
  if (points.length === 0) return GLACIER_CENTER;
  if (points.length === 1) return points[0];
  
  const midIndex = Math.floor(points.length / 2);
  return points[midIndex];
}

// Function to format distance
function formatDistance(meters: number): string {
  const miles = meters * 0.000621371;
  if (miles < 1) {
    return `${(miles * 5280).toFixed(0)} ft`;
  }
  return `${miles.toFixed(1)} mi`;
}

// Function to get difficulty color
function getDifficultyColor(difficulty: string | null): string {
  if (!difficulty) return '#757575';
  
  switch (difficulty.toLowerCase()) {
    case 'easy': return '#4CAF50';
    case 'moderate': return '#FF9800';
    case 'hard': return '#F44336';
    case 'very hard': return '#9C27B0';
    default: return '#757575';
  }
}

// Safe display function
function safeDisplay(value: string | null, fallback: string = 'Unknown'): string {
  return value || fallback;
}

// Function to get AllTrails search URL for a trail
function getAllTrailsUrl(trailName: string | null): string {
  if (!trailName) return 'https://www.alltrails.com/parks/us/montana/glacier-national-park';
  // Generate slug: lowercase, remove non-alphanum except spaces/dashes, replace spaces with dashes, remove trailing dashes
  const slug = trailName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `https://www.alltrails.com/trail/us/montana/${slug}`;
}

// Function to get polyline style based on trail metadata
function getTrailStyle(trail: any): L.PathOptions {
  // Color by difficulty
  const color = getDifficultyColor(trail.properties.difficulty);
  // Dashed for private
  const dashArray = trail.properties.privateAccess ? '8 8' : undefined;
  // Thicker for longer trails
  const minWeight = 3;
  const maxWeight = 8;
  const maxDistance = 20000; // 20km+ trails get max thickness
  const weight = Math.min(maxWeight, minWeight + (trail.properties.distanceTotal || 0) / maxDistance * (maxWeight - minWeight));
  // Lower opacity for private
  const opacity = trail.properties.privateAccess ? 0.5 : 0.85;
  return { color, weight, opacity, dashArray };
}

// Function to calculate hiking duration at 1 mph
function getHikingDuration(meters: number): string {
  const miles = meters * 0.000621371;
  const hours = miles / 2; // 2 mph pace
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) {
    return `${h} hr${h > 1 ? 's' : ''} ${m} min`;
  }
  return `${m} min`;
}

// Function to get Google Maps directions URL for a lat/lng
function getGoogleMapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

// Helper to zoom to a trail
function ZoomToTrail({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) {
      map.fitBounds(points);
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }
  }, [points, map]);
  return null;
}

const logoUrl = process.env.PUBLIC_URL + './St_Mary_Lake.jpg';

const BASEMAPS = [
  {
    name: 'Default',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://osm.org/copyright">OpenStreetMap</a> contributors'
  },
  {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
  },
  {
    name: 'Terrain',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USGS, NOAA'
  }
];

function BasemapControl({ basemapIdx, setBasemapIdx, onResetView }: { basemapIdx: number, setBasemapIdx: (idx: number) => void, onResetView: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="custom-map-controls" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', top: 120, right: 18, zIndex: 1200 }}>
      {/* Reset View Button (above basemap widget) */}
      <button
        className="btn-main"
        style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          marginBottom: 8,
          fontSize: 15,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
          padding: 0,
        }}
        onClick={onResetView}
        aria-label="Reset map view to Glacier National Park"
        tabIndex={0}
      >
        <span role="img" aria-label="reset" style={{ fontSize: 22 }}>⟳</span>
      </button>
      <div
        className="leaflet-control leaflet-bar"
        style={{
          background: 'white',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          width: 54,
          height: 54,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 22,
          color: '#333',
          transition: 'box-shadow 0.2s',
          position: 'relative',
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        tabIndex={0}
        aria-label="Basemap selector"
      >
        <span role="img" aria-label="layers" style={{ fontSize: 22 }}>🗺️</span>
        {open && (
          <div
            style={{
              position: 'absolute',
              top: 54,
              right: 0,
              background: 'white',
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
              minWidth: 180,
              padding: '16px 0',
              zIndex: 2000,
              display: 'flex',
              flexDirection: 'column',
              gap: 0
            }}
          >
            {BASEMAPS.map((bm, idx) => (
              <button
                key={bm.name}
                onClick={() => { setBasemapIdx(idx); setOpen(false); }}
                style={{
                  background: idx === basemapIdx ? 'linear-gradient(90deg, #1976d2 0%, #21a1ff 100%)' : 'none',
                  color: idx === basemapIdx ? 'white' : '#222',
                  border: 'none',
                  borderRadius: 0,
                  padding: '14px 22px',
                  fontSize: 16,
                  fontWeight: 600,
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                  outline: 'none',
                  transition: 'background 0.2s',
                }}
              >
                {bm.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="spinner" role="status" aria-label="Loading" />;
}

function ErrorBox({ message }: { message: string }) {
  return <div className="error-box" role="alert">{message}</div>;
}

function AppRoutes() {
  const [trails, setTrails] = useState<any[]>([]); // Use any[] for GeoJSON features
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredTrailId, setHoveredTrailId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTrailId, setSelectedTrailId] = useState<number | null>(null);
  const [zoomToTrail, setZoomToTrail] = useState<[number, number][]>([]);
  const [basemapIdx, setBasemapIdx] = useState(0);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const navigate = useNavigate();
  const params = useParams();
  const [isOffline, setIsOffline] = useReactState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Helper component to set mapRef after mount
  function SetMapRef() {
    const map = useMap();
    useEffect(() => {
      mapRef.current = map;
    }, [map]);
    return null;
  }

  // Utility to merge trails with the same name
  function mergeTrailsByName(features: any[]) {
    const merged: { [name: string]: any } = {};
    features.forEach(feature => {
      const name = feature.properties.name || 'Unnamed';
      if (!merged[name]) {
        merged[name] = {
          ...feature,
          geometry: {
            type: 'MultiLineString',
            coordinates: [feature.geometry.coordinates]
          }
        };
      } else {
        merged[name].geometry.coordinates.push(feature.geometry.coordinates);
        // Sum distance_total
        merged[name].properties.distance_total =
          (merged[name].properties.distance_total || 0) + (feature.properties.distance_total || 0);
        // If you have a duration property, sum it as well (otherwise, duration is derived from distance)
        if (merged[name].properties.duration && feature.properties.duration) {
          merged[name].properties.duration += feature.properties.duration;
        }
      }
    });
    return Object.values(merged);
  }

  // Load all trails on mount
  useEffect(() => {
    fetch(`${process.env.PUBLIC_URL}/trails.geojson`)
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.features)) {
          const mergedFeatures = mergeTrailsByName(data.features);
          setTrails(mergedFeatures);
          console.log('First trail:', mergedFeatures[0]);
          console.log('First trail coordinates:', mergedFeatures[0]?.geometry?.coordinates);
        } else {
          setTrails([]);
          console.error('GeoJSON missing features array:', data);
        }
        setLoading(false); // <-- Ensure this is here
      })
      .catch(error => {
        console.error('Failed to load trails.geojson:', error);
        setLoading(false); // <-- And here
      });
  }, []);

  const handleSearch = () => {
    const sanitizedQuery = searchQuery.replace(/[^\w\s-]/g, '').trim().toLowerCase();
    if (!sanitizedQuery) {
      fetch(`${process.env.PUBLIC_URL}/trails.geojson`)
        .then(res => res.json())
        .then(data => {
          if (data && Array.isArray(data.features)) {
            setTrails(data.features);
          } else {
            setTrails([]);
          }
        });
      return;
    }
    setTrails(prev => prev.filter(f => (f.properties.name || '').toLowerCase().includes(sanitizedQuery)));
  };

  // Find the selected trail object
  const selectedTrail = trails.find(f => f.properties.id === selectedTrailId);

  // When a trail is selected, open the info panel
  useEffect(() => {
    if (selectedTrailId !== null) {
      setInfoPanelOpen(true);
    }
  }, [selectedTrailId, trails]);

  useEffect(() => {
    if (params.trailId && trails.length > 0) {
      const trail = trails.find(f => String(f.properties.id) === params.trailId);
      if (trail) {
        setSelectedTrailId(trail.properties.id);
        setInfoPanelOpen(true);
      }
    }
  }, [params.trailId, trails]);

  if (loading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#181818' }}><Spinner /></div>;
  }
  if (error) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#181818' }}><ErrorBox message={error} /></div>;
  }

  // Compute bounding box for all trails
  const getTrailsBoundingBox = (trails: any[]) => {
    let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity;
    trails.forEach(trail => {
      if (trail.geometry) {
        if (trail.geometry.type === 'MultiLineString') {
          trail.geometry.coordinates.forEach((line: [number, number][]) => {
            line.forEach(([lat, lng]) => {
              if (lat < minLat) minLat = lat;
              if (lat > maxLat) maxLat = lat;
              if (lng < minLng) minLng = lng;
              if (lng > maxLng) maxLng = lng;
            });
          });
        } else if (trail.geometry.type === 'LineString') {
          trail.geometry.coordinates.forEach(([lat, lng]: [number, number]) => {
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
          });
        }
      }
    });
    if (
      minLat === Infinity || minLng === Infinity ||
      maxLat === -Infinity || maxLng === -Infinity
    ) return null;
    return [
      [minLat, minLng],
      [maxLat, maxLng]
    ];
  };
  const trailsBoundingBox = getTrailsBoundingBox(trails);

  return (
    <div style={{ height: '100vh', width: '100vw', fontFamily: 'Arial, sans-serif', position: 'relative' }}>
        {isOffline && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            background: '#c82333',
            color: '#fff',
            textAlign: 'center',
            padding: '14px 0',
            zIndex: 9999,
            fontWeight: 700,
            fontSize: 17,
            letterSpacing: '0.5px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.10)'
          }}>
            You are offline. Some features may not work.
          </div>
        )}
        {/* Map section (full width, info panel overlays) */}
        <div style={{
          height: '100vh',
          width: '100vw',
          position: 'relative',
          zIndex: 1
        }}>
          <style dangerouslySetInnerHTML={{ __html: mapStyles }} />
        
        {/* Simple header */}
        <div style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          right: 0, 
          zIndex: 1000, 
          background: 'linear-gradient(90deg, #181818 0%, #232526 100%)',
          padding: '15px 20px', 
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src={logoUrl}
              alt="Glacier National Park"
              style={{
                width: 60,
                height: 60,
                objectFit: 'cover',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
              }}
            />
            <h1 className="h1-main" style={{ fontFamily: 'Dancing Script, Quicksand, Arial, sans-serif', fontSize: 36, fontWeight: 700, letterSpacing: 1 }}>{'Glacier National Park Trails'}</h1>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="text"
              placeholder="Search trails..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              style={{
                padding: '10px 16px',
                border: 'none',
                borderRadius: '999px',
                fontSize: '15px',
                width: '220px',
                background: 'rgba(40,40,40,0.95)',
                color: 'white',
                outline: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                transition: 'box-shadow 0.2s, background 0.2s',
              }}
              onFocus={e => e.currentTarget.style.background = '#232526'}
              onBlur={e => e.currentTarget.style.background = 'rgba(40,40,40,0.95)'}
            />
            <button onClick={handleSearch} className="btn-main" aria-label="Search for trails" tabIndex={0} style={{ fontFamily: 'Quicksand, Arial, sans-serif', fontWeight: 600, letterSpacing: 0.5 }}>Search</button>
            <button onClick={() => setSidebarOpen(true)} className="btn-secondary" aria-label="Show all trails" tabIndex={0} style={{ fontFamily: 'Quicksand, Arial, sans-serif', fontWeight: 600, letterSpacing: 0.5 }}>Show All</button>
            <button onClick={() => setSidebarOpen(true)} className="btn-list" aria-label="Show trail list" tabIndex={0} style={{ fontFamily: 'Quicksand, Arial, sans-serif', fontWeight: 600, letterSpacing: 0.5 }}>Show Trail List</button>
          </div>
        </div>

        {/* Sidebar Modal */}
        {sidebarOpen && (
          <div style={{
            position: 'fixed',
            top: 70,
            right: 0,
            height: 'calc(100vh - 70px)',
            width: 350,
            background: 'rgba(255,255,255,0.7)',
            zIndex: 2000,
            boxShadow: '-2px 0 16px rgba(0,0,0,0.12)',
            display: 'flex',
            flexDirection: 'column',
            transition: 'transform 0.3s',
            backdropFilter: 'blur(2px',
          }}>
            <div style={{
              padding: '18px 20px 10px 20px',
              borderBottom: '1px solid #eee',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'transparent',
            }}>
              <span style={{ fontWeight: 700, fontSize: 18 }}>Trails ({trails.length})</span>
              <button
                onClick={() => setSidebarOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 22,
                  cursor: 'pointer',
                  color: '#888',
                  fontWeight: 700
                }}
                aria-label="Close trail list"
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0', background: 'transparent' }}>
              {trails.map((trail, idx) => (
                <div
                  key={trail.properties.id}
                  onClick={() => {
                    setSelectedTrailId(trail.properties.id);
                    setSidebarOpen(false);
                    setZoomToTrail(trail.geometry.coordinates);
                  }}
                  onMouseEnter={() => setHoveredTrailId(trail.properties.id)}
                  onMouseLeave={() => setHoveredTrailId(null)}
                  style={{
                    padding: '12px 20px',
                    background: selectedTrailId === trail.properties.id ? 'rgba(30,144,255,0.12)' : hoveredTrailId === trail.properties.id ? 'rgba(30,144,255,0.07)' : 'transparent',
                    borderBottom: '1px solid #f0f0f0',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <span style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    background: getDifficultyColor(trail.properties.difficulty),
                    marginRight: 10
                  }} />
                  <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{safeDisplay(trail.properties.name, `Trail ${idx + 1}`)}</span>
                  <span style={{ fontSize: 13, color: '#888', marginLeft: 8 }}>{formatDistance(trail.properties.distanceTotal || 0)}</span>
                  <span style={{ fontSize: 13, color: '#888', marginLeft: 8 }}>{safeDisplay(trail.properties.difficulty)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Map */}
        <MapContainer
          center={GLACIER_CENTER}
          zoom={11}
          style={{ height: '100vh', width: '100%' }}
        >
          <SetMapRef />
          <TileLayer
            attribution={BASEMAPS[basemapIdx].attribution}
            url={BASEMAPS[basemapIdx].url}
          />
          {/* Always render the basemap control to avoid removeChild errors */}
          <BasemapControl basemapIdx={basemapIdx} setBasemapIdx={setBasemapIdx} onResetView={() => mapRef.current?.setView(GLACIER_CENTER, 11, { animate: true })} />
          {zoomToTrail.length > 0 && <ZoomToTrail points={zoomToTrail} />}
          {trailsBoundingBox && (
            <Rectangle
              bounds={trailsBoundingBox as [[number, number], [number, number]]}
              pathOptions={{ color: '#1976d2', weight: 3, fillOpacity: 0.08, fillColor: '#1976d2', dashArray: '8 8' }}
            />
          )}
          {trails.map((trail, index) => {
            const isMulti = trail.geometry.type === 'MultiLineString';
            const lines = isMulti ? trail.geometry.coordinates : [trail.geometry.coordinates];
            const isHovered = hoveredTrailId === trail.properties.id || selectedTrailId === trail.properties.id;
            const style = isHovered
              ? { ...getTrailStyle(trail), color: '#1976d2', weight: 10, opacity: 1 }
              : getTrailStyle(trail);
            return lines.map((coords: [number, number][], i: number) => (
              <Polyline
                key={trail.properties.id + '-' + i}
                positions={coords}
                pathOptions={style}
                eventHandlers={{
                  mouseover: () => setHoveredTrailId(trail.properties.id),
                  mouseout: () => setHoveredTrailId(null),
                  click: () => {
                    setSelectedTrailId(trail.properties.id);
                    setZoomToTrail(coords);
                    navigate(`/trail/${trail.properties.id}`);
                  }
                }}
              />
            ));
          })}
        </MapContainer>
        <MapLegend />
          {infoPanelOpen && selectedTrail && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(0,0,0,0.45)',
              zIndex: 2000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'fadeIn 0.25s',
            }}>
              <div style={{
                background: 'rgba(30,30,30,0.98)',
                borderRadius: 20,
                boxShadow: '0 8px 40px rgba(0,0,0,0.35)',
                padding: '36px 32px 28px 32px',
                maxWidth: 440,
                width: '95vw',
                color: '#fff',
                position: 'relative',
                overflowY: 'auto',
                maxHeight: '92vh',
                fontFamily: 'Quicksand, Arial, sans-serif',
                fontSize: 18,
                letterSpacing: 0.1,
                border: '1.5px solid #2d3a4a',
                animation: 'scaleIn 0.25s',
              }}>
                <button
                  onClick={() => setInfoPanelOpen(false)}
                  style={{
                    position: 'absolute',
                    top: 18,
                    right: 24,
                    background: 'rgba(30,30,30,0.85)',
                    border: 'none',
                    borderRadius: 20,
                    width: 40,
                    height: 40,
                    fontSize: 28,
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 700,
                    zIndex: 3000,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                    transition: 'background 0.2s',
                  }}
                  aria-label="Close info panel"
                  tabIndex={0}
                  onMouseOver={e => e.currentTarget.style.background = '#1976d2'}
                  onMouseOut={e => e.currentTarget.style.background = 'rgba(30,30,30,0.85)'}
                >
                  ×
                </button>
                <h2 className="h2-panel" style={{ marginBottom: 18, fontSize: 28, fontWeight: 700, letterSpacing: 0.5, fontFamily: 'Dancing Script, Quicksand, Arial, sans-serif' }}>{safeDisplay(selectedTrail.properties.name)}</h2>
                <div style={{ marginBottom: 18 }}>
                  <span className="trail-tag" style={{ background: getDifficultyColor(selectedTrail.properties.difficulty), color: '#fff', borderRadius: 8, padding: '4px 14px', fontWeight: 600, fontSize: 16, marginRight: 10 }}>{safeDisplay(selectedTrail.properties.difficulty)}</span>
                  <span className="trail-type" style={{ color: '#90caf9', fontWeight: 500, fontSize: 15 }}>{safeDisplay(selectedTrail.properties.trail_type)}</span>
                </div>
                <div style={{ fontSize: 17, lineHeight: 1.7, marginBottom: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>{FaRoad({ style: { color: '#1976d2', marginRight: 8, verticalAlign: 'middle' } })}<strong>Distance:</strong> {selectedTrail.properties.distance_total ? formatDistance(selectedTrail.properties.distance_total) : 'Unknown'}</div>
                  <div>{FaRegClock({ style: { color: '#43a047', marginRight: 8, verticalAlign: 'middle' } })}<strong>Approx. duration:</strong> {selectedTrail.properties.distance_total ? getHikingDuration(selectedTrail.properties.distance_total) : 'Unknown'}</div>
                  <div>{FaTree({ style: { color: '#bdbdbd', marginRight: 8, verticalAlign: 'middle' } })}<strong>Surface:</strong> {safeDisplay(selectedTrail.properties.surface, 'Unknown')}</div>
                  {selectedTrail.properties.bicycleAccessible && (
                    <div style={{ color: '#27ae60' }}>{FaBicycle({ style: { marginRight: 8, verticalAlign: 'middle' } })}<strong>Bike Friendly</strong></div>
                  )}
                  {selectedTrail.properties.privateAccess && (
                    <div style={{ color: '#e74c3c' }}>{FaLock({ style: { marginRight: 8, verticalAlign: 'middle' } })}<strong>Private Access</strong></div>
                  )}
                </div>
                <div style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <a
                    href={getAllTrailsUrl(selectedTrail.properties.name || '')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-main"
                    style={{
                      background: '#1976d2',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '10px 18px',
                      fontWeight: 600,
                      fontSize: 16,
                      textDecoration: 'none',
                      marginBottom: 6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      transition: 'background 0.2s',
                    }}
                    onMouseOver={e => e.currentTarget.style.background = '#1565c0'}
                    onMouseOut={e => e.currentTarget.style.background = '#1976d2'}
                  >
                    More info on AllTrails {FaExternalLinkAlt({ style: { fontSize: 15 } })}
                  </a>
                  {selectedTrail.geometry.coordinates.length > 0 && (
                    <a
                      href={getGoogleMapsDirectionsUrl(selectedTrail.geometry.coordinates[0][1], selectedTrail.geometry.coordinates[0][0])}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-main"
                      style={{
                        background: '#43a047',
                        color: '#fff',
                        borderRadius: 8,
                        padding: '10px 18px',
                        fontWeight: 600,
                        fontSize: 16,
                        textDecoration: 'none',
                        marginBottom: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'background 0.2s',
                      }}
                      onMouseOver={e => e.currentTarget.style.background = '#2e7d32'}
                      onMouseOut={e => e.currentTarget.style.background = '#43a047'}
                    >
                      Get Directions to Start {FaDirections({ style: { fontSize: 17 } })}
                    </a>
                  )}
                  {selectedTrail.geometry.coordinates.length > 1 && (
                    <a
                      href={getGoogleMapsDirectionsUrl(
                        selectedTrail.geometry.coordinates[selectedTrail.geometry.coordinates.length-1][1],
                        selectedTrail.geometry.coordinates[selectedTrail.geometry.coordinates.length-1][0]
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-main"
                      style={{
                        background: '#e74c3c',
                        color: '#fff',
                        borderRadius: 8,
                        padding: '10px 18px',
                        fontWeight: 600,
                        fontSize: 16,
                        textDecoration: 'none',
                        marginBottom: 6,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        transition: 'background 0.2s',
                      }}
                      onMouseOver={e => e.currentTarget.style.background = '#b71c1c'}
                      onMouseOut={e => e.currentTarget.style.background = '#e74c3c'}
                    >
                      Get Directions to End {FaDirections({ style: { fontSize: 17 } })}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        <footer style={{
          width: '100%',
          background: 'linear-gradient(90deg, #181818 0%, #232526 100%)',
          color: '#fff',
          textAlign: 'center',
          padding: '18px 0 12px 0',
          fontSize: 15,
          fontWeight: 400,
          letterSpacing: '0.2px',
          position: 'fixed',
          left: 0,
          bottom: 0,
          zIndex: 5000,
          boxShadow: '0 -2px 10px rgba(0,0,0,0.10)'
        }}>
          Glacier National Park Trail Finder &copy; {new Date().getFullYear()}<br />
          Data: OpenStreetMap, AllTrails, Google Custom Search<br />
          <a href="mailto:your@email.com" style={{ color: '#4fc3f7', textDecoration: 'underline' }}>Contact</a>
        </footer>
    </div>
  </div>
  );
}

// Add legend component after MapContainer
function MapLegend() {
  return (
    <div style={{
      position: 'fixed',
      bottom: 32,
      right: 32,
      background: 'rgba(30,30,30,0.92)',
      color: '#fff',
      borderRadius: 14,
      boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
      padding: '20px 26px 18px 22px',
      fontFamily: 'Quicksand, Arial, sans-serif',
      fontSize: 16,
      zIndex: 3000,
      minWidth: 210,
      maxWidth: 320,
      lineHeight: 1.7,
      letterSpacing: 0.1,
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 6, letterSpacing: 0.5 }}>Legend</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 32, height: 0, borderTop: '4px solid #1976d2', display: 'inline-block', marginRight: 6 }} />
        <span>Trail</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 32, height: 18, border: '3px dashed #1976d2', background: 'rgba(25,118,210,0.08)', borderRadius: 4, display: 'inline-block', marginRight: 6 }} />
        <span>Bounding Box</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 18, height: 18, background: getDifficultyColor('Easy'), borderRadius: 6, display: 'inline-block', marginRight: 6 }} />
        <span>Easy</span>
        <span style={{ width: 18, height: 18, background: getDifficultyColor('Medium'), borderRadius: 6, display: 'inline-block', margin: '0 6px' }} />
        <span>Medium</span>
        <span style={{ width: 18, height: 18, background: getDifficultyColor('Hard'), borderRadius: 6, display: 'inline-block', margin: '0 6px' }} />
        <span>Hard</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {FaBicycle({ style: { color: '#27ae60', fontSize: 18, marginRight: 6, verticalAlign: 'middle' } })}
        <span>Bike Friendly</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {FaLock({ style: { color: '#e74c3c', fontSize: 18, marginRight: 6, verticalAlign: 'middle' } })}
        <span>Private Access</span>
      </div>
    </div>
  );
}


export default function App() {
  return (
    <Router basename="/glacier-trail-finder">
      <div className="App">
        <Routes>
          <Route path="/" element={<AppRoutes />} />
          <Route path="/trail/:trailId" element={<AppRoutes />} />
        </Routes>
      </div>
    </Router>
  );
}

// Add global styles for animation and font
const styleSheet = document.createElement('style');
styleSheet.innerHTML = `
@import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;600;700&family=Dancing+Script:wght@600&display=swap');
@keyframes scaleIn {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
`;
document.head.appendChild(styleSheet);
