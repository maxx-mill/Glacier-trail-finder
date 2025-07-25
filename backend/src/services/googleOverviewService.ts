import axios from 'axios';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyBP0xp2bLJ8MRrlqav4FbfIc65SPuFhWn0';
const GOOGLE_CX = process.env.GOOGLE_CX || '017576662512468239146:omuauf_lfve'; // Replace with your Programmable Search Engine CX

export async function fetchGoogleOverview(query: string): Promise<string | null> {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}`;
    const response = await axios.get(url);
    const items = response.data.items;
    if (items && items.length > 0) {
      // Return the snippet from the first result
      return items[0].snippet;
    }
    return null;
  } catch (error) {
    console.error('Error fetching Google overview:', error);
    return null;
  }
}

export async function fetchTrailImages(query: string): Promise<string[]> {
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(query)}&searchType=image&num=6`;
    const response = await axios.get(url);
    const items = response.data.items;
    if (items && items.length > 0) {
      // Return the image links
      return items.map((item: any) => item.link);
    }
    return [];
  } catch (error) {
    console.error('Error fetching trail images:', error);
    return [];
  }
} 