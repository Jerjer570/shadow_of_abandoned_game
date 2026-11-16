# Shadows of the Abandoned

A browser-based first-person horror game built with Babylon.js and Vite. Explore an abandoned asylum, uncover dark secrets, and survive encounters with an otherworldly entity.

## Story

You wake inside a closed asylum abandoned since the 1970s after a mass disappearance. Through scattered documents and clues, you discover a failed mind-warping experiment that unleashed something that should have remained hidden.

## Features

### Core gameplay

- First-person exploration with WASD movement and mouse look
- Flashlight system with limited battery
- Physics-based collision and gravity
- Interactive doors, documents, keys, batteries, and switches
- Key-based progression through locked gates
- Objective tracker, area map, and saved checkpoints
- Three possible endings and an entity that hunts the player

### Atmosphere

- Dynamic lighting and flickering emergency lighting
- Ambient audio, footsteps, interaction sounds, and entity encounters
- Particle effects for environmental atmosphere
- Cold horror color palette

### Tahap B props

The `horror_scene` uses GLB props from `public/assets/models/props/`:

- `key_ward.glb`
- `key_restricted.glb`
- `battery.glb`
- `document.glb`
- `desk.glb`
- `iron_gate.glb`
- `old_rusty_wheelchair.glb`
- `rusty_filing_cabinet.glb`
- `asylum_bed.glb`

`src/systems/PropLibrary.js` loads each model once, fits instances through code, and applies tinting. Interactable props keep primitive anchors as their interaction and collision meshes. Static furniture is placed in the infirmary; the detailed asylum bed falls back to the original procedural bed if its model cannot load. Asset attribution is in [the props credit file](public/assets/models/props/README.md).

The corridor environment is loaded from:

```text
public/assets/models/corridor_baru.glb
```

If the corridor file is unavailable, the game falls back to the procedural corridor.

## Getting started

### Prerequisites

- Node.js 16 or newer
- A modern browser with WebGL support
- npm or pnpm

### Installation

```bash
git clone https://github.com/daffazub/shadow_of_abandoned.git
cd shadow_of_abandoned
npm install
```

### Development server

```bash
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`.

### Production build

```bash
npm run build
```

The production files are generated in `dist/`.

## Controls

- **WASD** — Move
- **Mouse** — Look around
- **F** — Toggle flashlight
- **E** — Interact with objects
- **P** — Print the player position to the browser console
- **G** — Print gate, pivot, visual bounds, material, and camera diagnostics
- **Click** — Lock the mouse cursor for mouse look; **Esc** releases it
- **M** — Toggle area map
- **J** — Toggle objectives
- **X** — Close a document
- **Space** — Skip the intro after the first 3 seconds

## Project structure

```text
src/
├── main.js
└── systems/
    ├── AssetManager.js
    ├── AudioManager.js
    ├── EnvironmentManager.js
    ├── EventSystem.js
    ├── InteractionManager.js
    ├── LevelBuilder.js
    ├── OpeningSequence.js
    ├── PlayerController.js
    ├── PropLibrary.js
    └── SceneManager.js

public/assets/
├── models/
│   ├── corridor_baru.glb
│   └── props/
└── audio/
```

## Adding assets

### 3D models

Place GLB or GLTF files in `public/assets/models/`. Prop configuration and fitting parameters belong in `src/systems/PropLibrary.js`.

### Audio

Supported formats include MP3, WAV, and OGG. Place files in the appropriate subdirectory under `public/assets/audio/`:

- `ambient/`
- `footsteps/`
- `interactions/`
- `stingers/`
- `entity/`
- `ui/`

## Customization

### Adding a scene

1. Define the scene data in `SceneManager.js`.
2. Add its environment, interactables, and triggers.
3. Load it with `sceneManager.loadScene('scene_name')`.

### Registering an interactable

```javascript
interactionManager.registerInteractable(mesh, 'note', {
    title: 'Document Title',
    content: 'Document content...'
});
```

### Story events

```javascript
eventSystem.on('custom_event', (data) => {
    // Handle the event.
});

eventSystem.emit('custom_event', { data: 'value' });
```

## Debugging

Use the browser developer console while running the game:

- Press `P` to print the player position.
- Press `G` to inspect both gate anchors and their GLB visual children.
- Prop loading prints triangle counts, original dimensions, fitted dimensions, and fallback warnings.

## Browser compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

WebGL 2.0 support is recommended.

## Development notes

- Do not rename existing interaction methods or gameplay events without updating their callers.
- Keep primitive anchors for interactable props; visual GLB meshes are non-pickable and do not participate in collisions.
- The browser game currently includes the Experiment Chamber, entity pursuit, and three endings. The experiment chamber is built from textured geometry rather than a dedicated room model; entity navigation uses collision-aware raycasts, not a full navmesh.
- `npm test` runs the deterministic layout/clearance checks in `tools/check_layout.mjs`; it does not replace a visual browser playthrough.

## Credits

Built with:

- [Babylon.js](https://babylonjs.com/) — 3D engine
- [Vite](https://vitejs.dev/) — Build tool
- Web Audio API — Spatial audio processing

The wheelchair, filing cabinet, and asylum bed model credits and licenses are listed in [public/assets/models/props/README.md](public/assets/models/props/README.md).
