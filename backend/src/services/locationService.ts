interface LocationData {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
}

export async function searchLocation(query: string): Promise<LocationData> {
  console.log('=== Location Search Started ===');
  console.log('Searching for query:', query);

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
  console.log('Nominatim URL:', url);
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TrailFinder/1.0 (https://github.com/yourusername/trail-finder)'
      }
    });

    console.log('Nominatim response:', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Nominatim request failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Geocoding failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('Nominatim response data:', data);
    
    if (!Array.isArray(data) || data.length === 0) {
      console.log('No results found for query:', query);
      throw new Error('Location not found');
    }

    const location = data[0];
    const result = {
      display_name: location.display_name,
      lat: location.lat,
      lon: location.lon,
      boundingbox: location.boundingbox
    };
    
    console.log('Processed location data:', result);
    console.log('=== Location Search Completed ===');
    
    return result;
  } catch (error) {
    console.error('Location search failed:', error);
    throw error;
  }
} 