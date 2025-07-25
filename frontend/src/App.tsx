import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Popup, useMap } from 'react-leaflet';
import L, { control } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import axios from 'axios';
import { createPortal } from 'react-dom';
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import { useState as useReactState } from 'react';

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
function getTrailStyle(trail: Trail): L.PathOptions {
  // Color by difficulty
  const color = getDifficultyColor(trail.difficulty);
  // Dashed for private
  const dashArray = trail.privateAccess ? '8 8' : undefined;
  // Thicker for longer trails
  const minWeight = 3;
  const maxWeight = 8;
  const maxDistance = 20000; // 20km+ trails get max thickness
  const weight = Math.min(maxWeight, minWeight + (trail.distanceTotal || 0) / maxDistance * (maxWeight - minWeight));
  // Lower opacity for private
  const opacity = trail.privateAccess ? 0.5 : 0.85;
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

const logoUrl = process.env.PUBLIC_URL + '/St_Mary_Lake.jpg';

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
  const [trails, setTrails] = useState<Trail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredTrailId, setHoveredTrailId] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTrailId, setSelectedTrailId] = useState<number | null>(null);
  const [zoomToTrail, setZoomToTrail] = useState<[number, number][]>([]);
  const [basemapIdx, setBasemapIdx] = useState(0);
  const [infoPanelOpen, setInfoPanelOpen] = useState(false);
  const [googleOverview, setGoogleOverview] = useState<string | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [trailImages, setTrailImages] = useState<string[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [currentImageIdx, setCurrentImageIdx] = useState(0);
  const [googleOverviewLink, setGoogleOverviewLink] = useState<string | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const navigate = useNavigate();
  const params = useParams();
  const [isOffline, setIsOffline] = useReactState(!navigator.onLine);
  const API_URL = process.env.REACT_APP_API_URL || '';

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

  // Load all trails on mount
  useEffect(() => {
    fetchAllTrails();
  }, []);

  const fetchAllTrails = async () => {
    setLoading(true);
    try {
      const response = await axios.get<Trail[]>(`${API_URL}/api/trails`);
      if (Array.isArray(response.data)) {
        setTrails(response.data);
      } else {
        setTrails([]);
        console.error('API response is not an array:', response.data);
      }
    } catch (error) {
      console.error('Failed to fetch trails:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    const sanitizedQuery = searchQuery.replace(/[^\w\s-]/g, '').trim();
    if (!sanitizedQuery) {
      fetchAllTrails();
      return;
    }
    setLoading(true);
    try {
      const response = await axios.get<Trail[]>(`${API_URL}/api/trails/search?query=${encodeURIComponent(sanitizedQuery)}`);
      if (Array.isArray(response.data)) {
        setTrails(response.data);
      } else {
        setTrails([]);
        console.error('API response is not an array:', response.data);
      }
    } catch (error) {
      console.error('Failed to search trails:', error);
    } finally {
      setLoading(false);
    }
  };

  // Find the selected trail object
  const selectedTrail = trails.find(t => t.id === selectedTrailId);

  // When a trail is selected, open the info panel and fetch Google overview
  useEffect(() => {
    if (selectedTrailId !== null) {
      setInfoPanelOpen(true);
      const trail = trails.find(t => t.id === selectedTrailId);
      if (trail && trail.name) {
        setOverviewLoading(true);
        setGoogleOverview(null);
        setGoogleOverviewLink(null);
        const queries = [
          trail.name + ' Glacier National Park',
          trail.name
        ];
        let found = false;
        (async () => {
          for (const q of queries) {
            console.log('Fetching Google overview for:', q);
            try {
              const res = await fetch(`${API_URL}/api/google-overview?query=${encodeURIComponent(q)}`);
              const data = await res.json();
              console.log('Google overview response:', data);
              if (data.snippet) {
                console.log('Full Google AI overview snippet:', data.snippet);
                setGoogleOverview(data.snippet);
                if (data.link) setGoogleOverviewLink(data.link);
                found = true;
                break;
              }
            } catch (err) {
              console.error('Error fetching Google overview:', err);
            }
          }
          if (!found) setGoogleOverview(null);
          setOverviewLoading(false);
        })();
        // Fetch trail images
        setImagesLoading(true);
        setTrailImages([]);
        setCurrentImageIdx(0);
        fetch(`${API_URL}/api/trail-images?query=${encodeURIComponent(trail.name + ' Glacier National Park')}`)
          .then(res => res.json())
          .then(data => setTrailImages(data.images || []))
          .catch(() => setTrailImages([]))
          .finally(() => setImagesLoading(false));
      } else {
        setGoogleOverview(null);
        setGoogleOverviewLink(null);
        setTrailImages([]);
        setCurrentImageIdx(0);
      }
    }
  }, [selectedTrailId, trails]);

  useEffect(() => {
    if (params.trailId && trails.length > 0) {
      const trail = trails.find(t => String(t.id) === params.trailId);
      if (trail) {
        setSelectedTrailId(trail.id);
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
            <h1 className="h1-main">Glacier National Park Trails</h1>
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
            <button onClick={handleSearch} className="btn-main" aria-label="Search for trails" tabIndex={0}>Search</button>
            <button onClick={fetchAllTrails} className="btn-secondary" aria-label="Show all trails" tabIndex={0}>Show All</button>
            <button onClick={() => setSidebarOpen(true)} className="btn-list" aria-label="Show trail list" tabIndex={0}>Show Trail List</button>
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
                  key={trail.id}
                  onClick={() => {
                    setSelectedTrailId(trail.id);
                    setSidebarOpen(false);
                    setZoomToTrail(trail.points);
                  }}
                  onMouseEnter={() => setHoveredTrailId(trail.id)}
                  onMouseLeave={() => setHoveredTrailId(null)}
                  style={{
                    padding: '12px 20px',
                    background: selectedTrailId === trail.id ? 'rgba(30,144,255,0.12)' : hoveredTrailId === trail.id ? 'rgba(30,144,255,0.07)' : 'transparent',
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
                    background: getDifficultyColor(trail.difficulty),
                    marginRight: 10
                  }} />
                  <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{safeDisplay(trail.name, `Trail ${idx + 1}`)}</span>
                  <span style={{ fontSize: 13, color: '#888', marginLeft: 8 }}>{formatDistance(trail.distanceTotal || 0)}</span>
                  <span style={{ fontSize: 13, color: '#888', marginLeft: 8 }}>{safeDisplay(trail.difficulty)}</span>
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
          {trails.map((trail, index) => {
            const isHovered = hoveredTrailId === trail.id || selectedTrailId === trail.id;
            const style = isHovered
              ? { ...getTrailStyle(trail), color: '#1976d2', weight: 10, opacity: 1 }
              : getTrailStyle(trail);
            return (
              <Polyline
                key={trail.id}
                positions={trail.points}
                pathOptions={style}
                eventHandlers={{
                  mouseover: () => setHoveredTrailId(trail.id),
                  mouseout: () => setHoveredTrailId(null),
                  click: () => {
                    setSelectedTrailId(trail.id);
                    setZoomToTrail(trail.points);
                    navigate(`/trail/${trail.id}`);
                  }
                }}
              />
            );
          })}
        </MapContainer>
          {infoPanelOpen && selectedTrail && (
            <div className="info-panel-overlay" style={{
              position: 'absolute',
              top: 0,
              right: 25,
              height: '100%',
              maxWidth: '625px',
              width: 'calc(40% + 25px)',
              minWidth: 365,
              boxSizing: 'border-box',
              background: 'rgba(0,0,0,0.8)',
              color: '#fff',
              boxShadow: '-2px 0 16px rgba(0,0,0,0.12)',
              zIndex: 2001,
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
            }}>
              {/* Solid header section matching navbar */}
              <div className="info-panel-header" style={{
                width: '100%',
                background: 'linear-gradient(90deg, #181818 0%, #232526 100%)',
                padding: '36px 36px 18px 36px',
                position: 'relative',
                boxSizing: 'border-box',
                borderTopRightRadius: 0,
                borderTopLeftRadius: 0,
                minHeight: 60,
                zIndex: 2002
              }}>
                <button
                  onClick={() => {
                    setInfoPanelOpen(false);
                    navigate('/');
                  }}
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
                    boxShadow: '0 2px 8px rgba(0,0,0,0.10)'
                  }}
                  aria-label="Close info panel"
                  tabIndex={0}
                >
                  ×
                </button>
                <h2 className="h2-panel">{safeDisplay(selectedTrail.name)}</h2>
              </div>
              {/* Rest of the info panel content, still semi-transparent */}
              <div className="info-panel-content" style={{
                flex: 1,
                padding: '0 36px 24px 36px',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
                color: '#fff',
                minHeight: 0,
                maxHeight: 'calc(100vh - 120px)',
              }}>
                <div style={{ marginBottom: 18 }}>
                  <span className="trail-tag" style={{ background: getDifficultyColor(selectedTrail.difficulty) }}>{safeDisplay(selectedTrail.difficulty)}</span>
                  <span className="trail-type">{safeDisplay(selectedTrail.trailType)}</span>
                </div>
                <div style={{ fontSize: 16, lineHeight: 1.7, marginBottom: 18 }}>
                  <div><strong>📏 Distance:</strong> {formatDistance(selectedTrail.distanceTotal || 0)}</div>
                  <div><strong>⏱️ Approx. duration:</strong> {getHikingDuration(selectedTrail.distanceTotal || 0)}</div>
                  <div><strong>🥾 Surface:</strong> {safeDisplay(selectedTrail.surface)}</div>
                  {selectedTrail.bicycleAccessible && (
                    <div style={{ color: '#27ae60' }}><strong>🚴 Bike Friendly</strong></div>
                  )}
                  {selectedTrail.privateAccess && (
                    <div style={{ color: '#e74c3c' }}><strong>🚫 Private Access</strong></div>
                  )}
                </div>
                <div style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <a
                    href={getAllTrailsUrl(selectedTrail.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#3498db',
                      textDecoration: 'underline',
                      fontWeight: 500,
                      fontSize: 17
                    }}
                  >
                    More info on AllTrails ↗
                  </a>
                  {selectedTrail.points.length > 0 && (
                    <a
                      href={getGoogleMapsDirectionsUrl(selectedTrail.points[0][0], selectedTrail.points[0][1])}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#388e3c',
                        textDecoration: 'underline',
                        fontWeight: 500,
                        fontSize: 17
                      }}
                    >
                      Get Directions to Start ↗
                    </a>
                  )}
                  {selectedTrail.points.length > 1 && (
                    <a
                      href={getGoogleMapsDirectionsUrl(selectedTrail.points[selectedTrail.points.length-1][0], selectedTrail.points[selectedTrail.points.length-1][1])}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#d32f2f',
                        textDecoration: 'underline',
                        fontWeight: 500,
                        fontSize: 17
                      }}
                    >
                      Get Directions to End ↗
                    </a>
                  )}
                </div>
                {/* Google AI Overview placeholder */}
                <div style={{
                  background: 'rgba(20,20,20,0.8)',
                  borderRadius: 12,
                  padding: '24px 24px 20px 24px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
                  fontSize: 17,
                  color: 'white',
                  minHeight: 180,
                  marginTop: 8,
                  overflow: 'visible',
                  lineHeight: 1.7,
                  whiteSpace: 'pre-line',
                  wordBreak: 'break-word',
                  maxHeight: 'none',
                  textOverflow: 'unset',
                  display: 'block',
                }}>
                  <strong style={{ color: '#fff', fontWeight: 600 }}>Google AI Overview</strong>
                  <div style={{
                    marginTop: 8,
                    color: '#e0e0e0',
                    fontSize: 15,
                    whiteSpace: 'pre-line',
                    wordBreak: 'break-word',
                    overflow: 'visible',
                    textOverflow: 'unset',
                    display: 'block',
                    maxHeight: 'none',
                  }}>
                    {overviewLoading && <Spinner />}
                    {!overviewLoading && googleOverview && <>
                      <span>{googleOverview}</span>
                      {googleOverviewLink && (
                        <div style={{ marginTop: 10 }}>
                          <a
                            href={googleOverviewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-main"
                          >
                            Read more ↗
                          </a>
                        </div>
                      )}
                    </>}
                    {!overviewLoading && !googleOverview && <em>No overview found.</em>}
                  </div>
                  {/* Trail Images Carousel Section */}
                  <div className="carousel-box" style={{
                    marginTop: 32,
                    marginBottom: 24,
                    background: 'rgba(30,30,30,0.92)',
                    borderRadius: 18,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                    color: '#fff',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: '90%',
                    maxWidth: 340,
                    minWidth: 180,
                    minHeight: 120,
                    padding: '16px 16px 16px 16px',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}>
                    <strong style={{ color: '#fff', fontWeight: 600, marginBottom: 16, fontSize: 20 }}>Trail Images</strong>
                    {imagesLoading && <Spinner />}
                    {!imagesLoading && trailImages.length === 0 && <div style={{ color: '#ccc', marginTop: 8 }}>No images found.</div>}
                    {!imagesLoading && trailImages.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'center', maxWidth: 320 }}>
                        {/* Left arrow */}
                        {trailImages.length > 1 && (
                          <button
                            onClick={() => setCurrentImageIdx((currentImageIdx - 1 + trailImages.length) % trailImages.length)}
                            className="btn-arrow"
                            aria-label="Previous image"
                            tabIndex={0}
                          >
                            &#8592;
                          </button>
                        )}
                        <img
                          src={trailImages[currentImageIdx]}
                          alt={`Trail ${currentImageIdx + 1}`}
                          loading="lazy"
                          style={{
                            width: '100%',
                            maxWidth: 320,
                            height: 180,
                            maxHeight: 180,
                            objectFit: 'cover',
                            borderRadius: 12,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                            background: '#222',
                            transition: 'box-shadow 0.2s',
                          }}
                        />
                        {/* Right arrow */}
                        {trailImages.length > 1 && (
                          <button
                            onClick={() => setCurrentImageIdx((currentImageIdx + 1) % trailImages.length)}
                            className="btn-arrow"
                            aria-label="Next image"
                            tabIndex={0}
                          >
                            &#8594;
                          </button>
                        )}
                      </div>
                    )}
                  </div>
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


export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<AppRoutes />} />
        <Route path="/trail/:trailId" element={<AppRoutes />} />
      </Routes>
    </Router>
  );
}
