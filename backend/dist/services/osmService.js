"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchOSMDataForBounds = fetchOSMDataForBounds;
const node_fetch_1 = __importDefault(require("node-fetch"));
const pg_1 = require("pg");
const OVERPASS_API = 'https://overpass-api.de/api/interpreter';
const BATCH_SIZE = 1000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;
const RATE_LIMIT_DELAY = 1000;
const pool = new pg_1.Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'trail_finder',
    password: process.env.DB_PASSWORD || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
});
function isWay(element) {
    return 'tags' in element;
}
function isNode(element) {
    return 'lat' in element && 'lon' in element;
}
function classifyTrail(tags) {
    const access = tags.access?.toLowerCase();
    const bicycle = tags.bicycle?.toLowerCase();
    // Extract trail name
    const name = tags.name || `Trail ${Math.random().toString(36).substr(2, 6)}`;
    // Determine difficulty based on SAC scale and other tags
    let difficulty = 'Unknown';
    if (tags.sac_scale) {
        const sacScale = tags.sac_scale;
        if (sacScale === 'hiking')
            difficulty = 'Easy';
        else if (sacScale === 'mountain_hiking')
            difficulty = 'Moderate';
        else if (sacScale === 'demanding_mountain_hiking')
            difficulty = 'Hard';
        else if (sacScale === 'alpine_hiking')
            difficulty = 'Very Hard';
    }
    else if (tags.difficulty) {
        difficulty = tags.difficulty;
    }
    else {
        // Guess based on highway type
        const highway = tags.highway;
        if (highway === 'path' || highway === 'footway')
            difficulty = 'Easy';
        else if (highway === 'track')
            difficulty = 'Moderate';
        else if (highway === 'bridleway')
            difficulty = 'Easy';
    }
    // Extract surface
    const surface = tags.surface || 'Unknown';
    // Determine trail type
    let trailType = 'Hiking';
    if (tags.highway === 'cycleway' || bicycle === 'yes')
        trailType = 'Cycling';
    else if (tags.highway === 'bridleway')
        trailType = 'Horseback';
    else if (tags.route === 'hiking')
        trailType = 'Hiking';
    return {
        privateAccess: access === 'private' || access === 'no',
        bicycleAccessible: bicycle === 'yes' || bicycle === 'designated',
        name,
        difficulty,
        surface,
        trailType
    };
}
function calculateDistance(points) {
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
        const [lat1, lon1] = points[i - 1];
        const [lat2, lon2] = points[i];
        // Haversine formula
        const R = 6371e3; // Earth's radius in meters
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        distance += R * c;
    }
    return distance;
}
class RateLimiter {
    constructor() {
        this.queue = [];
        this.processing = false;
    }
    async add(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await fn();
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            });
            this.process();
        });
    }
    async process() {
        if (this.processing || this.queue.length === 0)
            return;
        this.processing = true;
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                await task();
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
            }
        }
        this.processing = false;
    }
}
const rateLimiter = new RateLimiter();
async function fetchTileWithRetry(query, retryCount = 0) {
    try {
        const response = await rateLimiter.add(() => (0, node_fetch_1.default)(OVERPASS_API, {
            method: 'POST',
            body: query,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }));
        if (!response.ok) {
            if (response.status === 429 && retryCount < MAX_RETRIES) {
                console.log(`Rate limited, retrying in ${RETRY_DELAY}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                return fetchTileWithRetry(query, retryCount + 1);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }
    catch (error) {
        if (retryCount < MAX_RETRIES) {
            console.log(`Error fetching tile, retrying... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            return fetchTileWithRetry(query, retryCount + 1);
        }
        throw error;
    }
}
async function fetchOSMDataForBounds(bounds) {
    const { minLat, maxLat, minLng, maxLng } = bounds;
    // Check if we already have data for this area
    const existingData = await pool.query(`SELECT COUNT(*) FROM trail_segments 
     WHERE bounding_box @> $1::jsonb`, [JSON.stringify(bounds)]);
    if (existingData.rows[0].count > 0) {
        console.log('Trail data already exists for this area');
        return;
    }
    // Limit the area to prevent massive downloads (max ~0.05 degree area)
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    if (latDiff > 0.05 || lngDiff > 0.05) {
        console.log('Area too large, splitting into smaller chunks');
        // Split into smaller chunks
        const midLat = (minLat + maxLat) / 2;
        const midLng = (minLng + maxLng) / 2;
        const chunks = [
            { minLat, maxLat: midLat, minLng, maxLng: midLng },
            { minLat, maxLat: midLat, minLng: midLng, maxLng },
            { minLat: midLat, maxLat, minLng, maxLng: midLng },
            { minLat: midLat, maxLat, minLng: midLng, maxLng }
        ];
        for (const chunk of chunks) {
            await fetchOSMDataForBounds(chunk);
        }
        return;
    }
    // Construct optimized Overpass API query (trails only, shorter timeout)
    const query = `
    [out:json][timeout:30];
    (
      way["highway"~"^(path|footway|track|bridleway|cycleway)$"](${minLat},${minLng},${maxLat},${maxLng});
    );
    out body;
    >;
    out skel qt;
  `;
    let retryCount = 0;
    const maxRetries = 3; // Reduced retries
    while (retryCount < maxRetries) {
        try {
            console.log(`Fetching OSM data for bounds (attempt ${retryCount + 1}):`, bounds);
            const response = await (0, node_fetch_1.default)(OVERPASS_API, {
                method: 'POST',
                body: query,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'TrailFinder/1.0'
                },
                timeout: 90000 // 90 second timeout
            });
            if (!response.ok) {
                if (response.status === 429) {
                    const delay = Math.pow(2, retryCount) * 5000; // Exponential backoff
                    console.log(`Rate limited, waiting ${delay}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    retryCount++;
                    continue;
                }
                throw new Error(`Overpass API request failed: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            if (!data || !Array.isArray(data.elements)) {
                console.error('OSM response missing elements array:', data);
                return;
            }
            console.log(`Received ${data.elements.length} elements from OSM`);
            // If we got too many elements, it might be overwhelming
            if (data.elements.length > 50000) {
                console.log('Too many elements, splitting area further');
                const midLat = (minLat + maxLat) / 2;
                const midLng = (minLng + maxLng) / 2;
                const chunks = [
                    { minLat, maxLat: midLat, minLng, maxLng: midLng },
                    { minLat, maxLat: midLat, minLng: midLng, maxLng },
                    { minLat: midLat, maxLat, minLng, maxLng: midLng },
                    { minLat: midLat, maxLat, minLng: midLng, maxLng }
                ];
                for (const chunk of chunks) {
                    await fetchOSMDataForBounds(chunk);
                }
                return;
            }
            // Process nodes and ways
            const nodes = new Map();
            const ways = [];
            data.elements.forEach(element => {
                if (isNode(element)) {
                    nodes.set(element.id, element);
                }
                else if (isWay(element)) {
                    ways.push(element);
                }
            });
            // Process ways into trails
            const trails = ways.map(way => {
                const points = Array.isArray(way.nodes)
                    ? way.nodes
                        .map(nodeId => nodes.get(nodeId))
                        .filter((node) => node !== undefined)
                        .map(node => [node.lat, node.lon])
                    : [];
                if (points.length < 2) {
                    return null;
                }
                const { privateAccess, bicycleAccessible, name, difficulty, surface, trailType } = classifyTrail(way.tags);
                const distanceTotal = calculateDistance(points);
                return {
                    osmWayId: String(way.id),
                    points,
                    intersectionStartId: String(way.nodes[0]),
                    intersectionEndId: String(way.nodes[way.nodes.length - 1]),
                    distanceTotal,
                    boundingBox: {
                        minLat: Math.min(...points.map(p => p[0])),
                        maxLat: Math.max(...points.map(p => p[0])),
                        minLng: Math.min(...points.map(p => p[1])),
                        maxLng: Math.max(...points.map(p => p[1]))
                    },
                    privateAccess,
                    bicycleAccessible,
                    name,
                    difficulty,
                    surface,
                    trailType
                };
            }).filter((trail) => trail !== null);
            // Insert trails into database
            if (trails.length > 0) {
                for (const trail of trails) {
                    try {
                        await pool.query(`
              INSERT INTO trail_segments (
                osm_way_id,
                points,
                intersection_start_id,
                intersection_end_id,
                distance_total,
                bounding_box,
                private_access,
                bicycle_accessible,
                name,
                difficulty,
                surface,
                trail_type
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              ON CONFLICT (osm_way_id) DO UPDATE SET
                points = EXCLUDED.points,
                intersection_start_id = EXCLUDED.intersection_start_id,
                intersection_end_id = EXCLUDED.intersection_end_id,
                distance_total = EXCLUDED.distance_total,
                bounding_box = EXCLUDED.bounding_box,
                private_access = EXCLUDED.private_access,
                bicycle_accessible = EXCLUDED.bicycle_accessible,
                name = EXCLUDED.name,
                difficulty = EXCLUDED.difficulty,
                surface = EXCLUDED.surface,
                trail_type = EXCLUDED.trail_type,
                updated_at = CURRENT_TIMESTAMP
            `, [
                            trail.osmWayId,
                            JSON.stringify(trail.points),
                            trail.intersectionStartId,
                            trail.intersectionEndId,
                            trail.distanceTotal,
                            JSON.stringify(trail.boundingBox),
                            trail.privateAccess,
                            trail.bicycleAccessible,
                            trail.name,
                            trail.difficulty,
                            trail.surface,
                            trail.trailType
                        ]);
                    }
                    catch (error) {
                        console.error('Error inserting trail:', trail.osmWayId, error);
                    }
                }
                console.log(`Inserted/updated ${trails.length} trails`);
            }
            // Success, break out of retry loop
            break;
        }
        catch (error) {
            retryCount++;
            const isNetworkError = error.code === 'ECONNRESET' || error.type === 'system' || error.message.includes('socket hang up');
            if (retryCount >= maxRetries) {
                console.error('Max retries reached, giving up on OSM data fetch');
                throw error;
            }
            if (isNetworkError) {
                const delay = Math.pow(2, retryCount) * 2000; // Exponential backoff for network errors
                console.log(`Network error (attempt ${retryCount}/${maxRetries}), retrying in ${delay}ms:`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
            else {
                console.error('Non-recoverable error fetching OSM data:', error);
                throw error;
            }
        }
    }
}
