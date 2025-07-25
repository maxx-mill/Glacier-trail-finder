export interface TrailSegment {
  id: string;
  osmWayId: string;
  points: [number, number][];
  intersectionStartId: string | null;
  intersectionEndId: string | null;
  distanceTotal: number;
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  privateAccess: boolean;
  bicycleAccessible: boolean;
}

export interface Trail {
  osmWayId: string;
  points: [number, number][];
  intersectionStartId: string;
  intersectionEndId: string;
  distanceTotal: number;
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
  privateAccess: boolean;
  bicycleAccessible: boolean;
  name: string;
  difficulty: string;
  surface: string;
  trailType: string;
}

export interface SearchParams {
  query?: string;
  location?: string;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
} 