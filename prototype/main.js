// main.js
// Setup, input, game loop (requestAnimationFrame), and drawing order.
//import {noraVerticesPusher, noraVerticesDraw} from '../Nora_Edits.js';
import { createRenderer, MatrixStack, material } from './renderer.js';
import * as G from './geometry.js';
import { Player } from './player.js';
import { Camera } from './camera.js';
import { PLANETS, createGame, updateGame, cameraTarget, drawWorld, scanParts, planetWorld } from './gameplay.js';
import { initUI, updateUI, setCameraLabel, setZoomSlider } from './ui.js';

// ---- Custom texture images ----
// Put image files in prototype/textures/ and set the path here (relative to index.html).
// Leave a value as null to use the procedurally generated texture instead.
const TEXTURE_FILES = {
    planet: 'textures/Planet_1_Rough.png',   // e.g. 'textures/planet.jpg'  (one image wrapped around the whole planet)
    planet2: 'textures/Planet_2_Rough.png',  // second planet (Kelpra)
    rock:   null,   // e.g. 'textures/rock.png'
    hull:   null,   // e.g. 'textures/hull.png'    (applied to each face of the ship's boxes)
};

function textureFor(name, makeGenerated) {
    const generated = makeGenerated();
    return TEXTURE_FILES[name] ? G.loadImageTexture(gl, TEXTURE_FILES[name], generated) : generated;
}

let gl, canvas, renderer, meshes, textures;
let player, camera, game;
const stack = new MatrixStack();
const keys = {};
const input = { interact: false };
let lastTime = null;
let time = 0;

window.onload = function init() {
    canvas = document.getElementById('gl-canvas');
    gl = canvas.getContext('webgl2');
    if (!gl) { alert("WebGL 2.0 isn't available"); return; }

    renderer = createRenderer(gl);
  

    meshes = {
        sphere: G.createMesh(gl, renderer, G.sphereData(3)),
        planet: G.createMesh(gl, renderer, G.sphereData(5)),
        rock:   G.createMesh(gl, renderer, G.sphereData(1)),     // low-poly = faceted rocks
        cube:   G.createMesh(gl, renderer, G.cubeData()),
        star:   G.createMesh(gl, renderer, G.starData()),
        volcano: G.createMesh(gl, renderer, G.frustumData(0.47)),   // top radius 0.8 / base 1.7
        stars:  G.createMesh(gl, renderer, G.starfieldData(2500, 80), gl.POINTS),
    };
    // Each texture uses the image from TEXTURE_FILES if one is set, otherwise the generated one.
    textures = {
        planet: textureFor('planet', () => G.makeRockTexture(gl)),
        planet2: textureFor('planet2', () => G.makeRockTexture(gl)),
        rock:   textureFor('rock',   () => G.makeRockTexture(gl)),
        hull:   textureFor('hull',   () => G.makeHullTexture(gl)),
    };

    camera = new Camera();
    resetGame();
    setupInput();

    initUI({
        onInteract: () => { input.interact = true; },
        onToggleCamera: toggleCamera,
        onReset: resetGame,
        onZoom: (z) => { camera.zoom = z; },
    });

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.01, 0.0, 0.04, 1.0);

    window.addEventListener('resize', resize);
    resize();
    // handy for debugging in the browser console: whirlpool.game, whirlpool.player
    window.whirlpool = { get game() { return game; }, get player() { return player; }, get camera() { return camera; } };

    requestAnimationFrame(render);
};

function syncInventoryToUI(game) {
    const slots = document.querySelectorAll('.inv-slot');
    
    slots.forEach(slot => {slot.querySelector('.item-name').textContent = ''});

    game.inventory.forEach((item, index) => {
        if (index < slots.length) {
            slots[index].querySelector('.item-name').textContent = item.name;
        }
    });
}
function resetGame() {
    game = createGame();
    player = new Player(PLANETS[0]);
    camera.snapNext = true;
}

function toggleCamera() {
    camera.useOrtho = !camera.useOrtho;
    setCameraLabel(camera.useOrtho);
}

function setupInput() {
    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
        if (!e.repeat) {
            if (k === 'e') input.interact = true;
            if (k === 'p') toggleCamera();
            if (k === 'r') resetGame();
        }
        keys[k] = true;
    });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    // mouse: click the scene to interact, wheel to zoom
    canvas.addEventListener('click', () => { input.interact = true; });
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.zoom = Math.min(14, Math.max(3, camera.zoom + Math.sign(e.deltaY) * 0.5));
        setZoomSlider(camera.zoom);
    }, { passive: false });
}

function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
}

// The diffuse color MULTIPLIES the texture. The generated texture is gray so we tint it per planet
// and repeat it; a custom image is shown in its true colors, wrapped once around the planet.
function planetMaterial(p) {
    return TEXTURE_FILES[p.texture]
        ? material({ diffuse: [1, 1, 1], texture: textures[p.texture], texScale: [1, 1], specular: [0.15, 0.15, 0.15], shininess: 10 })
        : material({ diffuse: p.tint, texture: textures[p.texture], texScale: p.texScale, specular: [0.15, 0.15, 0.15], shininess: 10 });
}
const SUN = material({ diffuse: [0, 0, 0], ambient: [0, 0, 0], specular: [0, 0, 0], emissive: [1.0, 0.85, 0.4] });

function render(now) {
    const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    time += dt;

    // ---------- update ----------
    if (game.phase === 'explore') player.update(dt, keys, planetWorld(game, player.planet));
    updateGame(game, player, dt, input);
    input.interact = false;
    camera.update(dt, cameraTarget(game, player));

    // ---------- draw ----------
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const aspect = canvas.width / canvas.height;
    const view = camera.viewMatrix();
    renderer.setView(view);
    renderer.setProjection(camera.projectionMatrix(aspect));

    // starfield: rotation-only view + perspective so it surrounds us like a skybox
    const skyView = mat4();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) skyView[i][j] = view[i][j];
    gl.depthMask(false);
    renderer.drawPoints(meshes.stars, skyView, perspective(60, aspect, 0.1, 200), 2.0 * (window.devicePixelRatio || 1), [0.9, 0.9, 1.0]);
    gl.depthMask(true);

    // the sun orbits both planets and is the point light
    const sunAngle = time * 0.1;
    const sunPos = vec3(13 + 50 * Math.cos(sunAngle), 22, -7 + 50 * Math.sin(sunAngle));
    renderer.setLight(sunPos);
    renderer.draw(meshes.sphere, mult(translate(sunPos[0], sunPos[1], sunPos[2]), scale(4, 4, 4)), SUN);

    drawWorld(renderer, meshes, textures, stack, game, time, PLANETS.map(planetMaterial));
    player.draw(renderer, meshes, stack);

    updateUI(game, scanParts(game, player), player.planet.name);

    syncInventoryToUI(game); 
    requestAnimationFrame(render);
}
