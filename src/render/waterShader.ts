/** Shared GLSL for the wave strip and the ambient ocean. WebGL2 / GLSL ES 3.00 via three.js ShaderMaterial. */

export const waterCommon = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform vec3 uGlowColor;
uniform float uTime;
uniform float uFogNear;
uniform float uFogFar;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return v;
}
/** Small-scale ripple normal perturbation from scrolling noise (tangent-space-ish, world XZ). */
vec3 rippleNormal(vec2 xz, float t, float strength) {
  float e = 0.25;
  vec2 p = xz * 0.55 + vec2(t * 0.3, -t * 0.2);
  vec2 q = xz * 3.4 + vec2(-t * 0.55, t * 0.45);
  float h = fbm(p) * 0.55 + fbm(q) * 0.45;
  float hx = fbm(p + vec2(e, 0.0)) * 0.55 + fbm(q + vec2(e * 4.0, 0.0)) * 0.45;
  float hz = fbm(p + vec2(0.0, e)) * 0.55 + fbm(q + vec2(0.0, e * 4.0)) * 0.45;
  return normalize(vec3(-(hx - h) * strength, 1.0, -(hz - h) * strength));
}
vec3 skyColorFor(vec3 dir) {
  float t = clamp(dir.y * 1.6 + 0.15, 0.0, 1.0);
  return mix(uSkyHorizon, uSkyZenith, pow(t, 0.6));
}
`;

export const waveVertex = /* glsl */ `
attribute float aFoam;
attribute float aHeight;
attribute float aFace;
attribute float aTube;
attribute float aV;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoam;
varying float vHeight;
varying float vFace;
varying float vTube;
varying float vV;
varying float vViewZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vFoam = aFoam;
  vHeight = aHeight;
  vFace = aFace;
  vTube = aTube;
  vV = aV;
  vec4 mv = viewMatrix * wp;
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const waveFragment = /* glsl */ `
precision highp float;
${waterCommon}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vFoam;
varying float vHeight;
varying float vFace;
varying float vTube;
varying float vV;
varying float vViewZ;
uniform float uFoamScroll;

void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  // detail ripples, weaker on foam and the overhanging lip
  vec3 rn = rippleNormal(vWorldPos.xz + vec2(0.0, vWorldPos.y * 0.7), uTime, 0.42);
  // blend ripple into the surface normal using a crude tangent frame
  vec3 T = normalize(cross(N, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
  vec3 B = cross(N, T);
  N = normalize(N * rn.y + T * rn.x * (1.0 - vFoam) + B * rn.z * (1.0 - vFoam));

  vec3 L = normalize(uSunDir);
  float ndl = max(dot(N, L), 0.0);
  float ndv = max(dot(N, V), 0.0);

  // the original's signature look: colour ramps from deep blue to teal with height up the face
  float h = clamp(vHeight, 0.0, 1.0);
  vec3 body = mix(uDeepColor, uShallowColor, smoothstep(0.0, 1.0, pow(h, 0.75)));
  // thin water near the lip lets sun through (cheap translucency)
  float thin = smoothstep(0.55, 1.0, h) * (1.0 - vFoam);
  float back = pow(max(dot(-L, V), 0.0), 1.8);
  body += uGlowColor * thin * (0.35 + 0.9 * back);
  // inside the barrel: darker, bluer, less sky
  float tubeDark = vTube * 0.55 + smoothstep(0.75, 1.0, vV) * vFace * 0.15;
  body *= 1.0 - tubeDark * 0.6;

  // lighting
  vec3 diffuse = body * (0.42 + 0.58 * ndl);
  vec3 R = reflect(-V, N);
  vec3 sky = skyColorFor(R) * (1.0 - tubeDark * 0.8);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  fres *= 1.0 - vFoam * 0.8;
  vec3 col = mix(diffuse, sky, fres * 0.85);
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  float spec = pow(ndh, 420.0) * 0.9 + pow(ndh, 60.0) * 0.14;
  col += uSunColor * spec * (1.0 - vFoam * 0.7) * (1.0 - tubeDark);

  // foam / whitewater: bright, rough, near-unlit
  float fn = fbm(vWorldPos.xz * 0.9 + vec2(uTime * 0.6, -uTime * 0.35)) * 0.8 + fbm(vWorldPos.xz * 3.1 - vec2(uTime * 0.4)) * 0.45;
  float foam = clamp(vFoam * (0.35 + 1.1 * fn), 0.0, 1.0);
  foam = smoothstep(0.18, 0.75, foam);
  vec3 foamCol = uFoamColor * (0.72 + 0.28 * ndl) * (1.0 - tubeDark * 0.5);
  col = mix(col, foamCol, foam);

  // spray haze at the lip crest (slight lightening)
  col += vec3(0.05) * smoothstep(0.9, 1.0, h) * (1.0 - vTube);

  // distance fog toward the horizon colour
  float fog = smoothstep(uFogNear, uFogFar, vViewZ);
  col = mix(col, uSkyHorizon, fog);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const oceanVertex = /* glsl */ `
${waterCommon}
uniform float uAmpMask0;
uniform float uAmpMask1;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vViewZ;
varying float vFoam;

// Gerstner sum (GPU Gems ch.1). Directions/wavelengths fixed; amplitude masked near the wave strip.
vec3 gerstner(vec2 xz, float t, out vec3 nrm, float mask) {
  vec3 p = vec3(xz.x, 0.0, xz.y);
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec2 D[4];
  D[0] = normalize(vec2(0.2, -1.0));
  D[1] = normalize(vec2(-0.6, -0.8));
  D[2] = normalize(vec2(0.9, -0.3));
  D[3] = normalize(vec2(-0.3, -1.0));
  float A[4]; A[0] = 0.28; A[1] = 0.16; A[2] = 0.09; A[3] = 0.05;
  float Lw[4]; Lw[0] = 26.0; Lw[1] = 14.0; Lw[2] = 7.5; Lw[3] = 3.6;
  for (int i = 0; i < 4; i++) {
    float k = 6.28318 / Lw[i];
    float c = sqrt(9.81 / k);
    float a = A[i] * mask;
    float q = 0.6 / (k * a * 4.0 + 1e-4) * mask;
    q = min(q, 1.0);
    float ph = k * dot(D[i], xz) - c * k * t;
    float s = sin(ph);
    float co = cos(ph);
    p.x += q * a * D[i].x * co;
    p.z += q * a * D[i].y * co;
    p.y += a * s;
    n.x -= D[i].x * k * a * co;
    n.z -= D[i].y * k * a * co;
    n.y -= q * k * a * s;
  }
  nrm = normalize(n);
  return p;
}

void main() {
  vec4 wp0 = modelMatrix * vec4(position, 1.0);
  // fade ambient waves to zero under the wave strip (centre uAmpMask0, half-extent uAmpMask1) so the seam is invisible
  float dz = wp0.z - uAmpMask0;
  float mask = smoothstep(uAmpMask1, uAmpMask1 + 25.0, abs(dz));
  vec3 n;
  vec3 p = gerstner(wp0.xz, uTime, n, mask);
  vWorldPos = vec3(p.x, wp0.y + p.y, p.z);
  vNormal = n;
  vFoam = 0.0;
  vec4 mv = viewMatrix * vec4(vWorldPos, 1.0);
  vViewZ = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

export const oceanFragment = /* glsl */ `
precision highp float;
${waterCommon}
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vViewZ;
varying float vFoam;
void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 N = normalize(vNormal);
  vec3 rn = rippleNormal(vWorldPos.xz, uTime, 0.42);
  N = normalize(vec3(N.x + rn.x, N.y, N.z + rn.z));
  vec3 L = normalize(uSunDir);
  float ndl = max(dot(N, L), 0.0);
  float ndv = max(dot(N, V), 0.0);
  // identical to the wave strip's flat rows (height 0, no foam) so the seam is invisible
  vec3 body = uDeepColor;
  vec3 diffuse = body * (0.42 + 0.58 * ndl);
  vec3 R = reflect(-V, N);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  vec3 col = mix(diffuse, skyColorFor(R), fres * 0.85);
  vec3 H = normalize(L + V);
  float ndh = max(dot(N, H), 0.0);
  col += uSunColor * (pow(ndh, 420.0) * 0.9 + pow(ndh, 60.0) * 0.14);
  float fog = smoothstep(uFogNear, uFogFar, vViewZ);
  col = mix(col, uSkyHorizon, fog);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // push to the far plane
}
`;

export const skyFragment = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyHorizon;
uniform vec3 uSkyZenith;
uniform vec3 uHaze;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float t = clamp(d.y * 1.6 + 0.15, 0.0, 1.0);
  vec3 col = mix(uSkyHorizon, uSkyZenith, pow(t, 0.6));
  float sun = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(sun, 900.0) * 6.0 + pow(sun, 24.0) * 0.35 + pow(sun, 3.0) * 0.08);
  col = mix(col, uHaze, smoothstep(0.08, -0.02, d.y));
  gl_FragColor = vec4(col, 1.0);
}
`;
