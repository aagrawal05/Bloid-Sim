/**
 * Single source of truth for simulation parameters.
 * Updated by controls.js from the UI; read by simulation and charts.
 */
const CONFIG = {
  // Display / loop
  fps: 60,
  simulationSpeed: 1.0,

  // Genetics & population
  mutationRate: 0.1,
  reproductionRate: 0.2,
  initialPopulation: 75,

  // World (large map, no wrapping)
  mapWidth: 3200,
  mapHeight: 2400,

  // Performance: spatial index for eat detection ('none' | 'quadtree' | 'spatialhash')
  spatialIndex: 'quadtree',

  // Coefficients (map genes to world)
  sizeCoefficient: 50,
  speedCoefficient: 500,
  hpCoefficient: 100,
  eatCoefficient: 1,
  compareCoefficient: 1.25,
  costCoefficient: 18.5,
};

// Constants (not changed by UI) – viewport size; map is CONFIG.mapWidth × CONFIG.mapHeight
const CONSTANTS = {
  minSize: 0.1,
  minSpeed: 0.1,
  minAngleSpeed: 0.0,
  canvasWidth: 640,
  canvasHeight: 480,
};
