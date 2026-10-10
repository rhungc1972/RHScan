// src/types.ts
// Tipos para RHDocScan - Escáner Móvil Privado Zero-Knowledge

export interface Point {
  x: number;
  y: number;
}

// 4 vértices del documento: [Superior Izquierda, Superior Derecha, Inferior Derecha, Inferior Izquierda]
export type Quad = [Point, Point, Point, Point];

export type ScanFilter = 'color' | 'grayscale' | 'binary';

export type ScanMode = 'auto' | 'manual';

export type ExportFormat = 'pdf' | 'jpg';

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

export interface RegisteredUserRecord {
  id: string;
  name: string;
  email: string;
  registeredAt: string;
}

export interface ScanTrackerState {
  date: string; // YYYY-MM-DD
  count: number;
  isRegistered: boolean;
  userEmail: string;
  userName: string;
  registeredAt?: string;
  unlimitedUntilMonth?: number; // Ej: 10 para Octubre
  registeredUsersList?: RegisteredUserRecord[];
}

export interface DetectionResult {
  detected: boolean;
  quad: Quad | null;
  confidence: number;
  isStable: boolean;
  stabilityProgress: number; // 0 a 1
}

export interface DocumentMetadata {
  timestampLocal: string;
  timestampUtc: string;
  sha256Hash: string;
  pageCount: number;
  format: ExportFormat;
  deviceInfo: string;
  screenResolution: string;
  publicIp?: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    mapsUrl: string;
  };
}
