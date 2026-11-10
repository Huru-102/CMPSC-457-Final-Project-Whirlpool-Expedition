// gameplay.js
// Game state: ship parts to collect, rocks (obstacles), the crashed ship, repair + escape sequence.

import { surfaceFrame, tangentFor, material } from './renderer.js';

export const PLANET_RADIUS = 6;
export const SHIP_DIR = normalize(vec3(0.35, 1, 0.45));
const SHIP_FWD = tangentFor(SHIP_DIR);

const PART_DEFS = [
    { id: 'wing',   name: 'Wing Panel',    dir: [1.0, 0.25, -0.3],  color: [0.3, 0.6, 1.0] },
    { id: 'fuel',   name: 'Fuel Cell',     dir: [-0.7, -0.2, 0.9],  color: [0.3, 1.0, 0.4] },
    { id: 'engine', name: 'Thruster Core', dir: [0.1, -1.0, -0.4],  color: [1.0, 0.55, 0.2] },
];

// small seeded RNG so the rock layout is the same every run
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function randomDir(rand) {
    const z = rand() * 2 - 1, t = rand() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    return vec3(s * Math.cos(t), z, s * Math.sin(t));
}

export function createGame() {
    const R = PLANET_RADIUS;
    const parts = PART_DEFS.map(d => ({
        ...d,
        dir: normalize(vec3(d.dir[0], d.dir[1], d.dir[2])),
        collected: false,
        installed: false,
    }));

    // keep-out zones so rocks don't land on the spawn, ship, or parts
    const keepOut = [vec3(0, 1, 0), SHIP_DIR, ...parts.map(p => p.dir)];
    const rand = mulberry32(457);
    const rocks = [];
    while (rocks.length < 16) {
        const dir = randomDir(rand);
        if (keepOut.some(k => dot(k, dir) > 0.93)) continue;
        const size = 0.3 + rand() * 0.45;
        rocks.push({ dir, size, fwd: tangentFor(dir), spin: rand() * 360, pos: mult(R + size * 0.2, dir) });
    }

    const shipPos = mult(R, SHIP_DIR);
    const obstacles = [
        { pos: shipPos, radius: 1.3 },
        ...rocks.map(r => ({ pos: r.pos, radius: r.size })),
    ];

    return {
        parts, rocks, obstacles, shipPos,
        inventory: [],
        installed: 0,
        phase: 'explore',          // 'explore' | 'escaping' | 'won'
        escapeTime: 0,
        shipLift: 0,
        shipVel: 0,
        nearShip: false,
        message: 'Your ship crashed! Find 3 missing parts (glowing stars) and bring them back.',
        messageTime: 5,
    };
}

function say(game, text, seconds = 3) { game.message = text; game.messageTime = seconds; }

export function updateGame(game, player, dt, input) {
    const R = PLANET_RADIUS;
    game.messageTime = Math.max(0, game.messageTime - dt);

    if (game.phase === 'explore') {
        const pPos = player.position;

        // pick up parts by walking into them
        for (const p of game.parts) {
            if (p.collected) continue;
            const itemPos = mult(R + 0.6, p.dir);
            if (length(subtract(pPos, itemPos)) < 1.1) {
                p.collected = true;
                game.inventory.push(p);
                say(game, `Picked up: ${p.name}`);
            }
        }

        game.nearShip = length(subtract(pPos, game.shipPos)) < 2.4;

        if (input.interact) {
            if (!game.nearShip) {
                say(game, 'Nothing to interact with here. Head back to the ship.');
            } else if (game.inventory.length > 0) {
                const names = game.inventory.map(p => p.name).join(', ');
                for (const p of game.inventory) { p.installed = true; game.installed++; }
                game.inventory = [];
                say(game, `Installed: ${names}`);
            } else if (game.installed === game.parts.length) {
                game.phase = 'escaping';
                player.visible = false;
                say(game, 'Engines online... LIFT OFF!', 4);
            } else {
                say(game, `The ship still needs ${game.parts.length - game.installed} more part(s).`);
            }
        }
    } else {
        // escape sequence: rumble for a second, then accelerate away from the planet
        game.escapeTime += dt;
        if (game.escapeTime > 1.0) {
            game.shipVel += 7 * dt;
            game.shipLift += game.shipVel * dt;
        }
        if (game.phase === 'escaping' && game.escapeTime > 5) game.phase = 'won';
    }
}

// what the camera should follow
export function cameraTarget(game, player) {
    if (game.phase === 'explore') {
        return { pos: player.position, up: player.up, forward: player.forward, zoomScale: 1 };
    }
    const pos = mult(PLANET_RADIUS + game.shipLift, SHIP_DIR);
    return { pos, up: SHIP_DIR, forward: SHIP_FWD, zoomScale: 1 + game.escapeTime * 0.4 };
}

// ---------------- drawing ----------------
const ROCK  = (tex) => material({ diffuse: [0.55, 0.45, 0.5], texture: tex, texScale: [2, 2], specular: [0.1, 0.1, 0.1] });
const GLASS = material({ diffuse: [0.3, 0.7, 0.9], specular: [1, 1, 1], shininess: 90, emissive: [0.05, 0.12, 0.18] });
const DARK  = material({ diffuse: [0.25, 0.25, 0.3] });

export function drawWorld(renderer, meshes, textures, stack, game, time) {
    const R = PLANET_RADIUS;

    // rocks: translate + rotate + (non-uniform) scale
    const rockMat = ROCK(textures.rock);
    for (const r of game.rocks) {
        stack.load(surfaceFrame(r.dir, r.fwd, R));
        stack.mul(rotateY(r.spin));
        stack.mul(scale(r.size, r.size * 0.7, r.size * 1.2));
        renderer.draw(meshes.rock, stack.top, rockMat);
    }

    // collectible parts: spinning, bobbing stars
    for (const p of game.parts) {
        if (p.collected) continue;
        stack.load(surfaceFrame(p.dir, tangentFor(p.dir), R));
        stack.mul(translate(0, 0.7 + 0.15 * Math.sin(time * 2.5), 0));
        stack.mul(rotateY(time * 120));
        stack.mul(scale(1.1, 1.1, 1.1));
        renderer.draw(meshes.star, stack.top, material({
            diffuse: p.color, specular: [1, 1, 1], shininess: 60,
            emissive: p.color.map(c => c * (0.35 + 0.15 * Math.sin(time * 4))),
        }));
    }

    drawShip(renderer, meshes, textures, stack, game, time);
}

function drawShip(renderer, meshes, textures, stack, game, time) {
    const R = PLANET_RADIUS;
    const repaired = game.installed / game.parts.length;
    const crashTilt = 1 - repaired;
    const has = (id) => game.parts.find(p => p.id === id).installed;

    // hull color goes from scorched red-brown to clean gray as it gets repaired
    const hullColor = [0.6 + 0.25 * repaired, 0.35 + 0.5 * repaired, 0.3 + 0.55 * repaired];
    const HULL = material({ diffuse: hullColor, texture: textures.hull, specular: [0.6, 0.6, 0.6], shininess: 40 });

    let shake = 0;
    if (game.phase !== 'explore' && game.escapeTime < 1.2) shake = 0.05 * Math.sin(time * 80);

    // root: the ship body frame
    stack.load(surfaceFrame(SHIP_DIR, SHIP_FWD, R + game.shipLift));
    stack.mul(translate(shake, 0.45, 0));
    stack.mul(rotateZ(14 * crashTilt));
    stack.mul(rotateX(-8 * crashTilt));

    // hull
    stack.push();
        stack.mul(scale(1.0, 0.7, 2.4));
        renderer.draw(meshes.cube, stack.top, HULL);
    stack.pop();

    // nose
    stack.push();
        stack.mul(translate(0, -0.05, 1.3));
        stack.mul(scale(0.75, 0.5, 0.6));
        renderer.draw(meshes.sphere, stack.top, HULL);
    stack.pop();

    // cockpit
    stack.push();
        stack.mul(translate(0, 0.4, 0.55));
        stack.mul(scale(0.42, 0.32, 0.6));
        renderer.draw(meshes.sphere, stack.top, GLASS);
    stack.pop();

    // wings (missing until installed; a broken stub shows before that)
    for (const side of [1, -1]) {
        stack.push();
            stack.mul(translate(0.55 * side, -0.1, -0.2));
            if (has('wing')) {
                stack.mul(rotateZ(-6 * side));
                stack.mul(translate(0.6 * side, 0, 0));
                stack.mul(scale(1.2, 0.1, 1.1));
            } else {
                stack.mul(translate(0.15 * side, 0, 0));
                stack.mul(scale(0.3, 0.1, 0.6));
            }
            renderer.draw(meshes.cube, stack.top, HULL);
        stack.pop();
    }

    // fuel cell on top
    if (has('fuel')) {
        stack.push();
            stack.mul(translate(0, 0.45, -0.7));
            stack.mul(scale(0.35, 0.25, 0.6));
            renderer.draw(meshes.cube, stack.top, material({ diffuse: [0.3, 1, 0.4], emissive: [0.1, 0.4, 0.15] }));
        stack.pop();
    }

    // engine at the back
    stack.push();
        stack.mul(translate(0, 0, -1.35));
        stack.push();
            stack.mul(scale(0.6, 0.5, 0.35));
            renderer.draw(meshes.cube, stack.top, has('engine') ? DARK : material({ diffuse: [0.15, 0.1, 0.1] }));
        stack.pop();
        if (has('engine')) {
            const flame = game.phase === 'explore' ? 0.25 : 0.7 + 0.3 * Math.sin(time * 40);
            stack.mul(translate(0, 0, -0.3 - flame * 0.3));
            stack.mul(scale(0.35, 0.3, 0.2 + flame * 0.6));
            renderer.draw(meshes.sphere, stack.top, material({ diffuse: [1, 0.6, 0.2], emissive: [1.0 * flame, 0.5 * flame, 0.1] }));
        }
    stack.pop();
}

export function nearestPartDistance(game, player) {
    let best = Infinity;
    for (const p of game.parts) {
        if (p.collected) continue;
        best = Math.min(best, length(subtract(player.position, mult(PLANET_RADIUS, p.dir))));
    }
    return best;
}
