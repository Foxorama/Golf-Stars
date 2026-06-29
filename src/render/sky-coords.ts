/**
 * Real-sky coordinates per voyage THEME (GS-galaxy-map) — GENERATED from data/night-sky-cards.json
 * by scripts/gen-sky-coords.mjs. Equatorial J2000: `ra` in degrees (0–360), `dec` in degrees
 * (−90..+90). Keyed by the theme's name-slug. The travel starmap plots the cleared trail at these
 * positions so the journey reads as a real path through the sky. DO NOT EDIT BY HAND.
 */

export interface SkyCoord { ra: number; dec: number }

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const THEME_SKY: Record<string, SkyCoord> = {
  "crux": {
    "ra": 187.099,
    "dec": -59.81
  },
  "centaurus": {
    "ra": 202.294,
    "dec": -48.004
  },
  "orion": {
    "ra": 83.948,
    "dec": -0.393
  },
  "canis-major": {
    "ra": 102.47,
    "dec": -24.9
  },
  "scorpius": {
    "ra": 254.124,
    "dec": -34.118
  },
  "sagittarius": {
    "ra": 282.71,
    "dec": -29.43
  },
  "leo": {
    "ra": 158.011,
    "dec": 19.144
  },
  "taurus": {
    "ra": 69.953,
    "dec": 20.388
  },
  "gemini": {
    "ra": 104.675,
    "dec": 21.845
  },
  "carina": {
    "ra": 137.163,
    "dec": -62.957
  },
  "triangulum-australe": {
    "ra": 240.226,
    "dec": -67.046
  },
  "grus": {
    "ra": 336.133,
    "dec": -45.205
  },
  "vela": {
    "ra": 138.556,
    "dec": -49.982
  },
  "corvus": {
    "ra": 185.637,
    "dec": -20.019
  },
  "cygnus": {
    "ra": 303.278,
    "dec": 38.52
  },
  "lyra": {
    "ra": 282.262,
    "dec": 35.868
  },
  "aquila": {
    "ra": 294.315,
    "dec": 5.309
  },
  "virgo": {
    "ra": 198.116,
    "dec": -0.206
  },
  "musca": {
    "ra": 187.557,
    "dec": -69.269
  },
  "lupus": {
    "ra": 229.716,
    "dec": -43.932
  },
  "ara": {
    "ra": 258.628,
    "dec": -55.808
  },
  "tucana": {
    "ra": 355.372,
    "dec": -62.381
  },
  "phoenix": {
    "ra": 12.815,
    "dec": -45.14
  },
  "puppis": {
    "ra": 111.946,
    "dec": -37.625
  },
  "columba": {
    "ra": 88.361,
    "dec": -36.142
  },
  "pegasus": {
    "ra": 344.657,
    "dec": 18.086
  },
  "canis-minor": {
    "ra": 113.307,
    "dec": 6.757
  },
  "capricornus": {
    "ra": 315.523,
    "dec": -18.993
  },
  "triangulum": {
    "ra": 31.503,
    "dec": 32.807
  },
  "corona-borealis": {
    "ra": 235.073,
    "dec": 28.039
  },
  "sagitta": {
    "ra": 296.635,
    "dec": 18.378
  },
  "draco": {
    "ra": 260.605,
    "dec": 60.956
  },
  "lacerta": {
    "ra": 335.164,
    "dec": 49.242
  },
  "vulpecula": {
    "ra": 297.38,
    "dec": 25.238
  },
  "delphinus": {
    "ra": 309.206,
    "dec": 14.6
  },
  "eridanus": {
    "ra": 54.711,
    "dec": -21.523
  },
  "eta-carinae-nebula": {
    "ra": 161.265,
    "dec": -59.866
  },
  "omega-centauri": {
    "ra": 201.697,
    "dec": -47.479
  },
  "jewel-box-cluster": {
    "ra": 193.417,
    "dec": -60.367
  },
  "47-tucanae": {
    "ra": 6.024,
    "dec": -72.081
  },
  "tarantula-nebula": {
    "ra": 84.679,
    "dec": -69.1
  },
  "orion-nebula": {
    "ra": 83.822,
    "dec": -5.391
  },
  "the-pleiades": {
    "ra": 56.871,
    "dec": 24.105
  },
  "the-coalsack": {
    "ra": 190.5,
    "dec": -63
  },
  "centaurus-a": {
    "ra": 201.365,
    "dec": -43.019
  },
  "lagoon-nebula": {
    "ra": 270.924,
    "dec": -24.386
  },
  "sculptor-galaxy": {
    "ra": 11.888,
    "dec": -25.288
  },
  "southern-pinwheel": {
    "ra": 204.254,
    "dec": -29.866
  },
  "ptolemy-cluster": {
    "ra": 268.45,
    "dec": -34.79
  },
  "southern-pleiades": {
    "ra": 160.6,
    "dec": -64.4
  },
  "wishing-well-cluster": {
    "ra": 166.4,
    "dec": -58.75
  },
  "helix-nebula": {
    "ra": 337.41,
    "dec": -20.84
  },
  "sombrero-galaxy": {
    "ra": 189.998,
    "dec": -11.623
  },
  "milky-way-core": {
    "ra": 266.417,
    "dec": -29.008
  },
  "magellanic-clouds": {
    "ra": 80.894,
    "dec": -69.756
  }
};

/** Real-sky position for a theme, looked up by its display name (or slug). Undefined if unmapped. */
export function skyCoordForName(name: string | undefined): SkyCoord | undefined {
  if (!name) return undefined;
  return THEME_SKY[name] ?? THEME_SKY[slug(name)];
}
