<p align="center">
  <img src="logo.png" alt="Bloid-Sim logo" width="256" />
</p>

# 🧬 Bloid-Sim

*Blob-shaped blobs doing blob things.* Watch colorful bloids wobble, chase, munch, and evolve in a 2D arena—survival of the chunkiest, fastest, and wiggliest. Drop in, tweak the sliders, and see who thrives.

Under the hood: a browser-based predator–prey evolution simulation. Each bloid carries heritable genes (**size**, **agility**, **observation range**) plus a **behaviour policy** (NEAT neural network), moves around a bounded arena, consumes smaller bloids to gain health, reproduces with mutation, and dies when health hits zero. The population evolves over time—you just set the stage.

---

## 🎮 The simulation

- **🔄 Arena** – Bounded canvas (agents bounce at walls). Each timestep, in order:
  1. **🍽️ Eating** – For every pair, if agent A is close enough (distance &lt; A’s radius) and A is **compareCoefficient** times larger than B, A eats B: A gains `eatCoefficient × B’s HP`, B is removed.
  2. **👁️ Raycasts** – Each agent casts 8 rays uniformly (length = observation range gene × observationRangeCoefficient). Each ray detects Empty, Wall, or Agent.
  3. **🏃 Movement & metabolism** – Each agent's neural network takes raycast inputs and outputs movement controls. The agent moves accordingly, then loses HP from metabolic cost (size) and observation cost.
  4. **👶 Reproduction** – Each agent has a chance `reproductionRate × dt` to produce one offspring. The child gets a copy of the parent's DNA (genes mutate) and a mutated copy of the parent's neural network.
  5. **💀 Death** – Agents with HP ≤ 0 are removed. If the population ever hits zero, the sim restarts with **initialPopulation** new random agents.


**🖱️ Hover** over an individual on the canvas to highlight it (white border) and see its genes, HP, raycast detections, and behaviour network in the **Inspector** panel (right drawer, below Parameters). 

- **Raycast visualization:** Each of the 8 rays detected by the hovered agent is shown with a bar indicating detection type (empty/wall/agent) and raw distance. Detection bars with no nearby object appear greyed out with reduced opacity for clarity.
- **Behaviour network:** The hovered agent's NEAT neural network is visualized using professional graph layout, showing input nodes (left), hidden neurons (middle), and output nodes (right), color-coded by activation type.

The charts show population over time and the evolution of each gene (average, min, max).

---

## 🧪 Genes and behaviour policy

Each agent’s DNA is three numbers in **[0, 1]** (plus a neural network). They map to phenotype via global coefficients (sliders).

| Gene | Index | What it controls | Phenotype |
|------|--------|-------------------|-----------|
| **Size** | 0 | Body size, health pool, metabolic cost | `size = gene × sizeCoefficient`, `hp = gene × hpCoefficient`, cost per dt = `gene × costCoefficient × dt` |
| **Agility** | 1 | Movement speed and turn rate | `speed = gene × agilitySpeedCoefficient`, `angleSpeed = gene × agilityAngleCoefficient` |
| **Observation range** | 2 | Raycast length, energy cost | `raycastLength = gene × observationRangeCoefficient`, observation cost ∝ raycastLength |
| **Behaviour** | — | Movement policy | NEAT neural network: 16 inputs, 2 outputs. Evolves via mutation on reproduction. |

- **📏 Size** – Larger agents have more HP and a larger “bite” radius, and can eat smaller ones (size ratio &gt; **compareCoefficient**). They also pay more metabolic cost per timestep, so they must eat to survive. **Tradeoff:** big = tanky and able to eat more, but burns HP faster and can be outmaneuvered by small, fast agents.
- **⚡ Agility** – Codes for both linear speed and angular turn rate. No direct cost; higher speed helps chase prey or flee. **Tradeoff:** fast agents cover more ground and can catch or escape others; slow ones save no energy (cost is size-based) but are easier to catch or miss.
- **👁️ Observation range** – Raycast length. Longer range = more environmental info. **Tradeoff:** longer range costs more HP per timestep.

🎨 Color on the canvas is gene-based: red = size, green = agility, blue = observation range (RGB from the three genes), with opacity reflecting current HP.

---

## ⚙️ Hyperparameters and tradeoffs

### 🧬 Genetics & population

| Parameter (CONFIG key) | Range | Effect | Tradeoff |
|------------------------|--------|--------|----------|
| **Mutation rate** (`mutationRate`) | 0–0.5 | Per-gene chance that an offspring gets a new random value in [min, 1]. | Higher = more exploration and diversity, faster evolution, but more disruption of good genomes. |
| **Reproduction rate** (`reproductionRate`) | 0–0.5 | Per-timestep probability (× dt) that an individual spawns one child. | Higher = population grows and evolves faster; too high can cause boom–bust or overcrowding. |
| **Initial population** (`initialPopulation`) | 75–250 | Number of agents at start or after Restart. | Larger = more diversity and interactions; smaller = easier to watch single lineages. |

### 🔢 Coefficients (map genes to world)

| Parameter (CONFIG key) | Range | Effect | Tradeoff |
|------------------------|--------|--------|----------|
| **Size** (`sizeCoefficient`) | 25–75 | Multiplier for the size gene → display size and (with HP/cost) effective “mass”. | Higher = bigger bodies and more impact of the size gene; shifts balance toward size-based predation. |
| **HP** (`hpCoefficient`) | 75–150 | Multiplier for the size gene → starting HP. | Higher = agents live longer without eating; lower = faster turnover and stronger pressure to eat. |
| **Eat** (`eatCoefficient`) | 1–2 | Fraction of prey’s HP transferred to the eater. | &gt; 1 = eating is very rewarding; 1 = one-to-one transfer. |
| **Compare** (`compareCoefficient`) | 1–2 | Size ratio required to eat: eater must be at least **compareCoefficient** × prey’s size. | Higher = only much larger agents can eat smaller ones (stricter hierarchy); lower = more similar-sized predation. |
| **Cost** (`costCoefficient`) | 10–25 | Metabolic drain per timestep = size_gene × costCoefficient × dt. | Higher = big agents die faster without food; lower = size is less penalized. |
| **Agility (speed)** (`agilitySpeedCoefficient`) | 450–550 | Multiplier for the agility gene → movement speed. | Higher = agility has more impact on linear speed. |
| **Agility (angle)** (`agilityAngleCoefficient`) | 1–8 | Multiplier for the agility gene → turn rate (radians per step). | Higher = quicker turning. |
| **Observation range coef.** (`observationRangeCoefficient`) | 50–500 | Multiplier for the observation range gene → raycast length in pixels. | Higher = agents see farther; higher observation cost. |
| **Observation cost** (`observationCostCoefficient`) | 0.1–2 | Energy drain per timestep for observation = obsCost × (raycastLength/150) × dt. | Higher = longer range costs more HP. |

### 🖥️ Display & run control

| Parameter (CONFIG key) | Effect |
|------------------------|--------|
| **FPS** (`fps`) | Simulation frame rate (1–240). Affects temporal resolution and performance. |
| **Speed** (`simulationSpeed`) | Global time multiplier (1–10×). Same run, faster wall-clock time. |
| **Play/Pause** | Pauses the simulation (effective speed 0) and chart data collection. Use **Spacebar** or the header button. |
| **Restart** | Resets the population to **initialPopulation** new random agents; coefficients and rates are unchanged. |

---

## 🏗️ System architecture

### Overview

The app runs simulation and rendering in parallel using a **main thread** (UI, rendering, input) and a **Web Worker** (simulation). State is passed from worker to main via **SharedArrayBuffer** (zero-copy) when COOP/COEP headers are present, or via **postMessage** (structured clone) otherwise.

```mermaid
flowchart TB
  subgraph main [Main thread]
    Pixi[PixiJS WebGL render loop]
    Hover[Mouse hover / inspector]
    Charts[Chart.js population and gene stats]
    Sliders[Sliders to CONFIG]
    ReadState[Read state each frame: SAB or onmessage]
  end
  subgraph worker [Web Worker]
    Eat[eat]
    Update[update]
    Reproduce[reproduce]
    Death[death]
    Eat --> Update --> Reproduce --> Death
  end
  main -->|"postMessage: tick, init, restart"| worker
  worker -->|"SharedArrayBuffer or postMessage: state"| main
```

### Optimizations

| Optimization | Description |
|--------------|-------------|
| **GPU rendering** | PixiJS uses WebGL. Agent circles and hover highlights are drawn with hardware-accelerated batched geometry instead of 2D canvas. |
| **Simulation on worker** | Simulation runs in a separate thread so it doesn’t block rendering or input. |
| **SharedArrayBuffer (zero-copy)** | When the page is served with COOP/COEP headers, state is shared in a `SharedArrayBuffer`. The worker writes and the main thread reads directly, avoiding structured-clone copies each tick. |
| **Double buffering** | Two SAB regions alternate: worker writes to the non-active buffer, then flips `readIndex` with `Atomics.store`. The main thread always reads from the active buffer, avoiding tearing. |
| **Fixed-timestep simulation** | Simulation ticks run on `setInterval` at `CONFIG.fps`, with `dt = simulationSpeed / fps`, independent of render frame rate. |

### SharedArrayBuffer layout

When SAB is used (`node server.js`):

- **Max agents:** 512  
- **Bytes per agent:** 44 (11 × Float32)
- **Layout:** `[readIndex: Int32] [count0: Int32] [data0: 5632 floats] [count1: Int32] [data1: 5632 floats]`
- **Fields per agent (11 floats):** `x, y, size, r, g, b, a, gene0, gene1, gene2, hp`
- **Total size:** ~45 KB

The main thread uses `Atomics.load(i32, 0)` to get the active buffer index, reads count and data from that region, and converts to drawable objects for the renderer and charts.

### Fallback

Without COOP/COEP (e.g. generic static server), `SharedArrayBuffer` is not available. The app uses `postMessage` for state instead: the worker posts `{ type: 'state', individuals: [...] }` each tick and the main thread updates render state via `onmessage`.

---

## 🚀 How to run

1. **Recommended (SharedArrayBuffer):** Run `node server.js` and open `http://localhost:8765`. The custom server sets COOP/COEP headers for zero-copy worker–main state transfer.
2. Otherwise, serve the folder with a static server (e.g. `npx serve .`) and open the URL. The app falls back to `postMessage` when SharedArrayBuffer is unavailable.

✅ No build step. Scripts: PixiJS (WebGL), Chart.js, Luxon adapters, chartjs-plugin-streaming, then the app modules. Simulation runs in a Web Worker; rendering and UI on the main thread.

---

## 📁 Project structure

- **index.html** – Page structure, script order, link to `styles.css`. Right drawer: Parameters (sliders) and Inspector (hovered individual’s genes).
- **styles.css** – Layout and dark theme (CSS variables). Game canvas fills its container; charts and details drawer on the right.
- **main.js** – Init (PixiJS renderer, simulation worker, charts), restart, hover detection, inspector. No p5; canvas is created in `js/renderer.js`.
- **js/math-utils.js** – Shared math (TWO_PI, random, vec2, dist) for main and worker.
- **js/renderer.js** – PixiJS Application, resize, draw loop; draws agents from state and hover highlight.
- **js/simulation-worker.js** – Web Worker: runs eat/update/reproduce/death; writes to SharedArrayBuffer (or posts state via postMessage).
- **js/sab-layout.js** – SharedArrayBuffer layout constants.
- **server.js** – Static server with COOP/COEP headers for SharedArrayBuffer.
- **js/config.js** – Single `CONFIG` object (e.g. `fps`, `simulationSpeed`, `initialPopulation`, `sizeCoefficient`, `hpCoefficient`, `eatCoefficient`, `compareCoefficient`, `costCoefficient`, `speedCoefficient`, `mutationRate`, `reproductionRate`) and `CONSTANTS` (`minSize`, `minSpeed`, `minAngleSpeed`, `canvasWidth`, `canvasHeight`). Sliders write to CONFIG.
- **js/controls.js** – Binds sliders and Restart button to CONFIG and display.
- **js/dna.js** – `DNA(inheritedGenes)` (genes, `mutate()`).
- **js/individual.js** – `Individual(initialPosition, dna)` (movement, eating, reproduction, `toDrawable()`, `run(dt)`). No drawing; renderer uses drawable state.
- **js/population.js** – `Population(populationSize)` (individuals list, `run(dt)`, `eat(individuals)`).
- **js/charts.js** – Population and gene charts (size, agility, observation range). Gene charts use data-driven y-axis scaling.
- **js/raycast.js** – Raycast system: 8 rays, Empty/Wall/Agent detection, optimized with spatial index.
- **js/behaviour-network.js** – NEAT behaviour policy: create network, inherit+mutation, raycast-to-input, activate for movement.
- **js/spatial-hash.js** – Spatial hash for broad-phase collision and raycast queries.
- **js/graph-renderer.js** – Custom neural network visualization renderer using D3.js v7 force layout with Longest Path Layering (Sugiyama algorithm). Displays network structure with professional hierarchical layer assignment: input nodes (left vertical layer), hidden nodes (middle dynamic "soup" with intelligent positioning), and output nodes (right vertical layer). Uses 20+ distinct, vibrant colors for different activation function types.

📦 Dependencies (CDN): PixiJS, Chart.js, Luxon, chartjs-adapter-luxon, chartjs-plugin-streaming, neataptic, D3.js v7. Simulation worker uses `js/math-utils.js`, `js/raycast.js`, `js/behaviour-network.js` via `importScripts`. When run via `node server.js`, SharedArrayBuffer is used for zero-copy state transfer between worker and main thread. **Note:** When using SharedArrayBuffer mode, the Inspector does not show raycast detections or full network visualization (fixed SAB layout); use postMessage mode (e.g. `npx serve .`) to see full Inspector data with detailed network graphs.

### Neural Network Visualization

The Inspector panel displays the behaviour network using a **professional graph layout algorithm** (Longest Path Layering / Sugiyama method):

- **Layer Assignment:** Nodes are automatically organized into layers based on longest path distance from input nodes. This creates a clean hierarchical representation of the network structure.
- **Three-Zone Layout:**
  - **Input layer (left, 15%):** All INPUT neurons fixed as a vertical line
  - **Hidden layer (middle, 15-85%):** Hidden neurons positioned by force-directed layout within layer constraints
  - **Output layer (right, 85%):** OUTPUT neurons fixed as a vertical line
- **Visual Encoding:**
  - Node colors: Distinct colors per activation function type (RELU, TANH, LOGISTIC, SIGMOID, etc.)
  - Node labels: Neuron type displayed below each node
  - Edge strength: Link stroke width and opacity scaled by connection weight magnitude
  - Edge direction: Blue for positive weights, red for negative weights
  - Node indices: Display IDs inside circles for reference
- **Interactivity:** Hover tooltips show activation value, bias, layer assignment, and connection details
- **Force Layout:** D3 v7 uses adaptive forces based on layer topology, avoiding edge crossings while maintaining readability

#### Network Color Palette

Neuron activation types are color-coded for quick visual identification:

| Type | Color | Type | Color |
|------|-------|------|-------|
| INPUT | Bright blue | LOGISTIC | Vibrant orange |
| OUTPUT | Bright red | TANH | Bright yellow |
| RELU | Bright green | IDENTITY | Vibrant purple |
| SOFTSIGN | Vibrant teal | SINUSOID | Light purple |
| GAUSSIAN | Mint green | STEP | Bright lime green |
| BIPOLAR | Bright cyan | BIPOLAR_SIGMOID | Magenta |
| HARD_TANH | Hot pink | ABSOLUTE | Deep orange |
| BENT_IDENTITY | Peach | GATE | Lime yellow-green |
| CONSTANT | Sky blue | INVERSE | Coral pink |
| SELU | Indigo blue | DEFAULT | Neutral gray |

---

## 💡 Ideas (future enhancements)

- **Agent gene inspection** – When a raycast detects "Agent", consider allowing the network to receive information about that agent's genes (e.g. size, agility). This could enable richer behaviour (e.g. chase smaller, flee larger).
- **Raycast distribution and count** – Genes controlling the number of raycasts and their angular distribution, with energy tradeoffs: more rays or wider spread = higher observation cost.
- **Sexual reproduction** – Combine two parents' neural networks via `Network.crossOver()` for offspring, rather than asexual clone-and-mutate. Would require mate selection and crossover logic.
- **Network graph analytics** – Add statistics panel showing network metrics: node count per layer, average weight magnitudes, connectivity density, feedback loops (if any).
- **Edge crossing reduction** – Implement advanced node reordering (e.g. barycenter heuristic) within layers to minimize edge crossings and improve visual clarity.
- **Zoom and pan** – Add interactive zoom/pan to the network visualization for large networks.