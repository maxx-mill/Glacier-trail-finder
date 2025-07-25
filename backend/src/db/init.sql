-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create trail_segments table
CREATE TABLE IF NOT EXISTS trail_segments (
  id SERIAL PRIMARY KEY,
  osm_way_id TEXT NOT NULL,
  points JSONB NOT NULL,
  intersection_start_id TEXT,
  intersection_end_id TEXT,
  distance_total FLOAT,
  bounding_box JSONB,
  private_access BOOLEAN DEFAULT false,
  bicycle_accessible BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create intersections table
CREATE TABLE IF NOT EXISTS intersections (
  id SERIAL PRIMARY KEY,
  latitude FLOAT NOT NULL,
  longitude FLOAT NOT NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_trail_segments_osm_way_id ON trail_segments(osm_way_id);
CREATE INDEX IF NOT EXISTS idx_trail_segments_bounding_box ON trail_segments USING GIN (bounding_box);
CREATE INDEX IF NOT EXISTS idx_intersections_coords ON intersections USING gist (
  ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
);

-- Create function to calculate distance between two points
CREATE OR REPLACE FUNCTION calculate_distance(
  lat1 float,
  lon1 float,
  lat2 float,
  lon2 float
) RETURNS float AS $$
DECLARE
  R float := 6371e3; -- Earth's radius in meters
  φ1 float;
  φ2 float;
  Δφ float;
  Δλ float;
  a float;
  c float;
BEGIN
  φ1 := radians(lat1);
  φ2 := radians(lat2);
  Δφ := radians(lat2 - lat1);
  Δλ := radians(lon2 - lon1);

  a := sin(Δφ/2) * sin(Δφ/2) +
       cos(φ1) * cos(φ2) *
       sin(Δλ/2) * sin(Δλ/2);
  c := 2 * atan2(sqrt(a), sqrt(1-a));

  RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE; 