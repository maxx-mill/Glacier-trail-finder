"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllTrails = getAllTrails;
exports.searchTrails = searchTrails;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = new pg_1.Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'trail_finder',
    password: process.env.DB_PASSWORD || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
});
// Simple function to get all trails (for Glacier National Park)
async function getAllTrails() {
    try {
        const sql = `
      SELECT 
        id,
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
      FROM trail_segments
      ORDER BY name ASC
    `;
        const result = await pool.query(sql);
        return result.rows.map(row => ({
            id: row.id,
            osmWayId: row.osm_way_id,
            points: row.points,
            intersectionStartId: row.intersection_start_id,
            intersectionEndId: row.intersection_end_id,
            distanceTotal: row.distance_total,
            boundingBox: row.bounding_box,
            privateAccess: row.private_access,
            bicycleAccessible: row.bicycle_accessible,
            name: row.name,
            difficulty: row.difficulty,
            surface: row.surface,
            trailType: row.trail_type
        }));
    }
    catch (error) {
        console.error('Error getting trails:', error);
        throw error;
    }
}
// Optional: Search function for filtering
async function searchTrails(query) {
    try {
        let sql = `
      SELECT 
        id,
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
      FROM trail_segments
    `;
        const params = [];
        if (query) {
            sql += ` WHERE (name ILIKE $1 OR difficulty ILIKE $1)`;
            params.push(`%${query}%`);
        }
        sql += ` ORDER BY name ASC`;
        const result = await pool.query(sql, params);
        return result.rows.map(row => ({
            id: row.id,
            osmWayId: row.osm_way_id,
            points: row.points,
            intersectionStartId: row.intersection_start_id,
            intersectionEndId: row.intersection_end_id,
            distanceTotal: row.distance_total,
            boundingBox: row.bounding_box,
            privateAccess: row.private_access,
            bicycleAccessible: row.bicycle_accessible,
            name: row.name,
            difficulty: row.difficulty,
            surface: row.surface,
            trailType: row.trail_type
        }));
    }
    catch (error) {
        console.error('Error searching trails:', error);
        throw error;
    }
}
