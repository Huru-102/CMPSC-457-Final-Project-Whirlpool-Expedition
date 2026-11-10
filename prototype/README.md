# Whirlpool Expedition: crude prototype

A rough playable version of the game: walk around a small planet, collect 3 ship parts, repair the crashed ship and launch.

## How to run
ES modules don't load from `file://`, so serve the **repo root** with a local server and open `prototype/index.html`:
- VS Code: right-click `prototype/index.html` → *Open with Live Server*, or
- `python -m http.server` in the repo root → http://localhost:8000/prototype/index.html

It uses the shared `../initShaders.js.download` and `../MVnew.js.download` from the repo root.

## Controls
| Input | Action |
|---|---|
| W / S | walk forward / back |
| A / D | turn |
| E, click on canvas, or *Interact* button | install parts / launch (near the ship) |
| P or *Camera* button | toggle ortho / perspective |
| Mouse wheel or Zoom slider | zoom |
| R or *Reset* button | restart |

Parts are picked up automatically when you walk into them. The Scanner in the HUD shows the distance to the nearest part.

## Files
| File | What it does |
|---|---|
| `index.html` | GLSL ES 3.0 shaders (per-pixel Blinn-Phong, texture, emissive, point mode) + HUD |
| `main.js` | setup, input key map, `requestAnimationFrame` loop, draw order |
| `renderer.js` | uniforms, materials, `draw()`, `MatrixStack`, `surfaceFrame()` (places objects on the sphere) |
| `geometry.js` | our own vertex data: tetrahedron-subdivision sphere, cube, 3D star, starfield points, procedural textures |
| `player.js` | movement on the sphere (direction vector from planet center) + hierarchical astronaut with walk cycle |
| `camera.js` | smoothed `lookAt` follow camera, `ortho` / `perspective` |
| `gameplay.js` | game state, parts, rocks, collision, ship repair + escape sequence, drawing the world |
| `ui.js` | HTML overlay |

## Where each requirement shows up
1. **Own 3D vertex data**: `geometry.js` (sphere, cube, star, starfield)
2. **Translate / rotate / scale**: everywhere; e.g. rocks, spinning stars, the ship's crash tilt and lift-off
3. **lookAt + ortho/perspective**: `camera.js`
4. **Interaction**: keyboard, mouse click/wheel, buttons, slider
5. **Animation with requestAnimationFrame**: `main.js` loop; walk cycle, bobbing items, orbiting sun, launch
6. **Lighting**: orbiting sun is a point light; per-fragment Blinn-Phong with materials + emissive

Advanced features already in, at a basic level:
- **Hierarchical modeling**: astronaut (torso → head/arms/legs → boots) and ship (hull → wings/engine → flame) using `MatrixStack`
- **Texture mapping**: procedural rock texture on the planet/rocks and a panel texture on the ship hull (`gl.texImage2D`)
- Bonus: simple **collision detection** (bounding spheres on rocks and the ship) and **procedural content** (starfield, rock placement, textures)

## Debugging
Open the browser console: `whirlpool.game`, `whirlpool.player`, `whirlpool.camera` show live state.


## Custom texture images
1. Put the image in `prototype/textures/` (png or jpg, any size; e.g. 512x256 or 1024x512 for the planet).
2. In `main.js`, set its path in `TEXTURE_FILES`, e.g. `planet: 'textures/planet.jpg'`.
3. Reload. Leave a value as `null` to keep the generated texture.

Notes:
- The image loads asynchronously (`loadImageTexture` in `geometry.js`). The generated texture shows until it arrives, and stays if the file is missing (a warning appears in the console).
- Run through a local server (Live Server); browsers block images loaded from `file://` into WebGL.
- The planet image wraps around once horizontally (like a world map). Make the left and right edges match to hide the seam.
- The hull image is applied to every face of the ship's boxes and is tinted by the repair color (scorched → gray). The rock image repeats 2x2 and is tinted slightly purple-gray.
- The material's `diffuse` color multiplies the texture: use `[1, 1, 1]` to show an image in its true colors.

AI USAGE
-----------------
AI was used in the creation of the readme as well as comments.