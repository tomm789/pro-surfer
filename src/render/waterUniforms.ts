import * as THREE from 'three';
import type { Beach } from '@/world/beach';

export interface WaterUniforms {
  uSunDir: { value: THREE.Vector3 };
  uSunColor: { value: THREE.Color };
  uDeepColor: { value: THREE.Color };
  uShallowColor: { value: THREE.Color };
  uFoamColor: { value: THREE.Color };
  uSkyHorizon: { value: THREE.Color };
  uSkyZenith: { value: THREE.Color };
  uGlowColor: { value: THREE.Color };
  uHaze: { value: THREE.Color };
  uTime: { value: number };
  uFogNear: { value: number };
  uFogFar: { value: number };
  uAmpMask0: { value: number };
  uAmpMask1: { value: number };
  [key: string]: THREE.IUniform;
}

export interface SkyPreset {
  horizon: string;
  zenith: string;
  sun: string;
  haze: string;
  sunIntensity: number;
  ambient: string;
}

export const SKY_PRESETS: Record<Beach['look']['sky'], SkyPreset> = {
  day: { horizon: '#bfe3f5', zenith: '#2f7fd6', sun: '#fff3d6', haze: '#d9ecf5', sunIntensity: 2.4, ambient: '#9fc9e6' },
  evening: { horizon: '#f6c08a', zenith: '#5b6fb0', sun: '#ffd28a', haze: '#f2c9a3', sunIntensity: 2.0, ambient: '#c9a58a' },
  dusk: { horizon: '#f08a7a', zenith: '#3a3f7a', sun: '#ffb070', haze: '#e6a08e', sunIntensity: 1.5, ambient: '#a08aa0' },
  night: { horizon: '#1b2a4a', zenith: '#050a1c', sun: '#cfe1ff', haze: '#20304f', sunIntensity: 0.55, ambient: '#3a4a70' },
  cloudy: { horizon: '#c9d3da', zenith: '#8091a0', sun: '#f0f2f4', haze: '#ccd5dc', sunIntensity: 1.3, ambient: '#aeb9c2' },
};

export function sunDirection(azimuthDeg: number, elevationDeg: number): THREE.Vector3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
}

export function createWaterUniforms(beach: Beach): WaterUniforms {
  const sky = SKY_PRESETS[beach.look.sky];
  return {
    uSunDir: { value: sunDirection(beach.look.sunAzimuthDeg, beach.look.sunElevationDeg) },
    uSunColor: { value: new THREE.Color(sky.sun) },
    uDeepColor: { value: new THREE.Color(beach.look.waterDeep) },
    uShallowColor: { value: new THREE.Color(beach.look.waterShallow) },
    uFoamColor: { value: new THREE.Color('#f4fbff') },
    uSkyHorizon: { value: new THREE.Color(sky.horizon) },
    uSkyZenith: { value: new THREE.Color(sky.zenith) },
    uGlowColor: { value: new THREE.Color('#5fe3c8') },
    uHaze: { value: new THREE.Color(sky.haze) },
    uTime: { value: 0 },
    uFogNear: { value: 120 },
    uFogFar: { value: 420 },
    uAmpMask0: { value: 0 },
    uAmpMask1: { value: 40 },
  };
}
