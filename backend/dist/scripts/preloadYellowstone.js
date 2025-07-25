"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const osmService_1 = require("../services/osmService");
const pg_1 = require("pg");
// Test database connection before starting
async function testDatabaseConnection() {
    const pool = new pg_1.Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'trail_finder',
        password: process.env.DB_PASSWORD || 'postgres',
        port: parseInt(process.env.DB_PORT || '5432'),
    });
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Database connection successful');
        await pool.end();
        return true;
    }
    catch (error) {
        console.error('❌ Database connection failed:', error instanceof Error ? error.message : 'Unknown error');
        console.log('💡 Make sure your database is running and credentials are correct');
        return false;
    }
}
// Yellowstone National Park boundaries (approximate)
const YELLOWSTONE_BOUNDS = {
    minLat: 44.13, // Southern boundary
    maxLat: 45.12, // Northern boundary  
    minLng: -111.15, // Western boundary
    maxLng: -109.93 // Eastern boundary
};
// Function to generate grid of smaller bounding boxes
function generateBoundingBoxGrid(bounds, chunkSize = 0.02) {
    const chunks = [];
    for (let lat = bounds.minLat; lat < bounds.maxLat; lat += chunkSize) {
        for (let lng = bounds.minLng; lng < bounds.maxLng; lng += chunkSize) {
            chunks.push({
                minLat: lat,
                maxLat: Math.min(lat + chunkSize, bounds.maxLat),
                minLng: lng,
                maxLng: Math.min(lng + chunkSize, bounds.maxLng)
            });
        }
    }
    return chunks;
}
async function preloadYellowstoneTrails() {
    console.log('🏔️  Starting Yellowstone trail data preload...');
    // Test database connection first
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
        console.error('❌ Cannot proceed without database connection');
        process.exit(1);
    }
    const chunks = generateBoundingBoxGrid(YELLOWSTONE_BOUNDS, 0.02); // 0.02 degree chunks (~2km)
    console.log(`Generated ${chunks.length} chunks to process`);
    let processed = 0;
    let errors = 0;
    for (const chunk of chunks) {
        try {
            console.log(`Processing chunk ${processed + 1}/${chunks.length}:`, `${chunk.minLat.toFixed(3)},${chunk.minLng.toFixed(3)} to ${chunk.maxLat.toFixed(3)},${chunk.maxLng.toFixed(3)}`);
            await (0, osmService_1.fetchOSMDataForBounds)(chunk);
            processed++;
            // Small delay between requests to be nice to the API
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        catch (error) {
            errors++;
            console.error(`Error processing chunk ${processed + 1}:`, error instanceof Error ? error.message : 'Unknown error');
            // Wait longer on errors before continuing
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    console.log(`✅ Yellowstone preload complete!`);
    console.log(`📊 Processed: ${processed}/${chunks.length} chunks`);
    console.log(`❌ Errors: ${errors}`);
    process.exit(0);
}
// Run the preload
preloadYellowstoneTrails().catch(error => {
    console.error('❌ Preload failed:', error);
    process.exit(1);
});
