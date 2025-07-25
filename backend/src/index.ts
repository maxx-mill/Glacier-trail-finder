import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { getAllTrails, searchTrails } from './services/trailService';
import { fetchGoogleOverview, fetchTrailImages } from './services/googleOverviewService';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// Get all trails (for Glacier National Park)
app.get('/api/trails', async (req, res) => {
  try {
    const trails = await getAllTrails();
    res.json(trails);
  } catch (error) {
    console.error('Error getting trails:', error);
    res.status(500).json({ error: 'Failed to get trails' });
  }
});

// Search trails by query
app.get('/api/trails/search', async (req, res) => {
  try {
    const { query } = req.query;
    const trails = await searchTrails(query as string);
    res.json(trails);
  } catch (error) {
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
    const snippet = await fetchGoogleOverview(query);
    res.json({ snippet });
  } catch (error) {
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
    const images = await fetchTrailImages(query);
    res.json({ images });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trail images' });
  }
});

app.listen(port, () => {
  console.log(`🏔️ Glacier Trail Finder backend listening at http://localhost:${port}`);
}); 