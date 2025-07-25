"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const trailService_1 = require("./services/trailService");
const googleOverviewService_1 = require("./services/googleOverviewService");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
// Get all trails (for Glacier National Park)
app.get('/api/trails', async (req, res) => {
    try {
        const trails = await (0, trailService_1.getAllTrails)();
        res.json(trails);
    }
    catch (error) {
        console.error('Error getting trails:', error);
        res.status(500).json({ error: 'Failed to get trails' });
    }
});
// Search trails by query
app.get('/api/trails/search', async (req, res) => {
    try {
        const { query } = req.query;
        const trails = await (0, trailService_1.searchTrails)(query);
        res.json(trails);
    }
    catch (error) {
        console.error('Error searching trails:', error);
        res.status(500).json({ error: 'Failed to search trails' });
    }
});
// Google AI Overview endpoint
app.get('/api/google-overview', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Missing query parameter' });
        }
        const snippet = await (0, googleOverviewService_1.fetchGoogleOverview)(query);
        res.json({ snippet });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch Google overview' });
    }
});
// Trail Images endpoint
app.get('/api/trail-images', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Missing query parameter' });
        }
        const images = await (0, googleOverviewService_1.fetchTrailImages)(query);
        res.json({ images });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch trail images' });
    }
});
app.listen(port, () => {
    console.log(`🏔️ Glacier Trail Finder backend listening at http://localhost:${port}`);
});
