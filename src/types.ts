// src/types.ts
// Tipos para PocketScan Zero

export interface Point {
  x: number;
  y: number;
}

// 4 vértices del documento: [Superior Izquierda, Superior Derecha, Inferior Derecha, Inferior Izquierda]
export type Quad = [Point, Point, Point, Point];

export type ScanFilter = 'color' | 'grayscale' | 'binary';

export type ScanMode = 'auto' | 'manual';

export interface ScannedPage {
  id: string;
  originalDataUrl: string;
  warpedDataUrl: string;
  corners: Quad;
  filter: ScanFilter;
  timestamp: number;
  width: number;
  height: number;
  rotation?: number; // 0, 90, 180, 270
}

export interface ScanTrackerState {
  date: string; // YYYY-MM-DD
  count: number;
  isRegistered: boolean;
  userEmail: string;
  userName: string;
}

export interface DetectionResult {
  detected: boolean;
  quad: Quad | null;
  confidence: number;
  isStable: boolean;
  stabilityProgress: number; // 0 a 1
}
