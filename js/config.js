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
  initialPopulation: 100,

  // Coefficients (map genes to world)
  sizeCoefficient: 50,
  speedCoefficient: 500,
  hpCoefficient: 100,
  eatCoefficient: 1,
  compareCoefficient: 1.25,
  costCoefficient: 18.5,
};

// Constants (not changed by UI) – sized to fit one laptop viewport
const CONSTANTS = {
  minSize: 0.1,
  minSpeed: 0.1,
  minAngleSpeed: 0.0,
  canvasWidth: 640,
  canvasHeight: 480,
};
