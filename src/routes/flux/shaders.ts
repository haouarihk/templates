/**
 * The displacement pair for the lookbook planes.
 *
 * Everything is driven by one number: `uVelocity`, the signed px-per-frame gap
 * the scroll engine reports. The vertex stage bows the plane with it; the
 * fragment stage smears and splits the sample with it. Nothing here animates on
 * its own, which is why the renderer can sleep the instant scrolling settles.
 */

export const LOOK_VERTEX = /* glsl */ `
  uniform float uVelocity;
  uniform vec2  uSize;

  varying vec2  vUv;
  varying float vBend;

  void main() {
    vUv = uv;
    vec3 pos = position;

    // Deflection peaks at the centre of the plane and is pinned at both edges,
    // so the plane bows like a sheet held at the sides rather than shearing.
    float arch = sin(uv.x * 3.14159265);
    float bendPx = uVelocity * 0.95 * arch;

    // The geometry is a unit plane scaled to pixel size by the model matrix, so
    // a Y offset has to be divided back through that scale to mean pixels.
    pos.y += bendPx / max(uSize.y, 1.0);
    // Z is left unscaled, so this is already in pixels — the bowed middle
    // retreats from the camera and the bend reads as depth, not just offset.
    pos.z -= abs(bendPx) * 0.55;

    vBend = arch * clamp(abs(uVelocity) / 55.0, 0.0, 1.0);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const LOOK_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D uTexture;
  uniform float uVelocity;
  uniform float uOpacity;
  uniform float uPlaneAspect;
  uniform float uTexAspect;

  varying vec2  vUv;
  varying float vBend;

  /** Object-fit: cover, in UV space. */
  vec2 coverUv(vec2 uv) {
    vec2 s = vec2(1.0);
    if (uPlaneAspect > uTexAspect) {
      s.y = uTexAspect / uPlaneAspect;
    } else {
      s.x = uPlaneAspect / uTexAspect;
    }
    return (uv - 0.5) * s + 0.5;
  }

  void main() {
    vec2 uv = coverUv(vUv);

    /**
     * Smear along the axis of travel, splitting the channels as it goes.
     * These numbers are in UV units, so the on-screen spread is
     * (channel spread) x amt x (plane height / uv coverage). Sized to land
     * around 9px at full tilt: enough to fringe an edge, not enough to ghost
     * a second copy of any type baked into the texture.
     */
    float amt = clamp(uVelocity / 4000.0, -0.012, 0.012);
    vec2 off = vec2(0.0, amt);

    float r = texture2D(uTexture, uv + off * 1.55).r;
    float g = texture2D(uTexture, uv + off * 1.00).g;
    float b = texture2D(uTexture, uv + off * 0.50).b;

    vec3 col = vec3(r, g, b);
    col += vBend * 0.10;

    gl_FragColor = vec4(col, uOpacity);
  }
`;
