"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchGoogleOverview = fetchGoogleOverview;
exports.fetchTrailImages = fetchTrailImages;
const axios_1 = __importDefault(require("axios"));
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyBP0xp2bLJ8MRrlqav4FbfIc65SPuFhWn0';
const GOOGLE_CX = process.env.GOOGLE_CX || '017576662512468239146:omuauf_lfve'; // Replace with your Programmable Search Engine CX
async function fetchGoogleOverview(query) {
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}`;
        const response = await axios_1.default.get(url);
        const data = response.data;
        const items = data.items;
        if (items && items.length > 0) {
            // Return the snippet from the first result
            return items[0].snippet;
        }
        return null;
    }
    catch (error) {
        console.error('Error fetching Google overview:', error);
        return null;
    }
}
async function fetchTrailImages(query) {
    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}&searchType=image&num=6`;
        const response = await axios_1.default.get(url);
        const data = response.data;
        const items = data.items;
        if (items && items.length > 0) {
            // Return the image links
            return items.map((item) => item.link);
        }
        return [];
    }
    catch (error) {
        console.error('Error fetching trail images:', error);
        return [];
    }
}
