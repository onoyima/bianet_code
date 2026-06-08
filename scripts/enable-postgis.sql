-- Enable PostGIS extension (requires superuser)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create a GiST index on the geography-cast of seed_listings lat/lng
-- This makes ST_DWithin and ST_Distance queries use the index
CREATE INDEX IF NOT EXISTS idx_seed_listings_geog
  ON seed_listings
  USING GIST (geography(ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)));
