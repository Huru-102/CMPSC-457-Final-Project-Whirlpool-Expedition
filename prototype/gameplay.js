// gameplay.js
// Game state: two planets, ship parts to collect, rocks (obstacles), the crashed ship,
// the volcano parkour climb + geyser launch to the second planet, and the repair + escape sequence.

import { surfaceFrame, frameAt, tangentFor, material } from './renderer.js';

// ---------------- planets ----------------
export const PLANETS = [
    // texRotX: rotates the planet mesh so the texture's pole "pinch" isn't where the player walks first
    { id: 0, name: 'Planet 1', center: vec3(0, 0, 0),     radius: 6.0, texture: 'planet',  tint: [0.75, 0.62, 0.8], texScale: [6, 3],   texRotX: 90 },
    { id: 1, name: 'Planet 2',  center: vec3(26, 7, -14),  radius: 4.5, texture: 'planet2', tint: [0.45, 0.8, 0.72], texScale: [5, 2.5], texRotX: 0 },
];
const A = PLANETS[0], B = PLANETS[1];
const dirOf = (x, y, z) => normalize(vec3(x, y, z));

// kept for older code that still expects a single radius
export const PLANET_RADIUS = A.radius;

// ---------------- layout ----------------
export const SHIP_DIR = dirOf(0.35, 1, 0.45);          // on planet A
const SHIP_FWD = tangentFor(SHIP_DIR);

// Volcano on planet A, on the side that faces planet B
const VOLCANO = {
    dir: dirOf(0.8, 0.45, -0.4),
    height: 4.6,          // crater rim height above the ground
    baseR: 1.7,           // radius at the bottom
    topR: 0.8,            // radius at the crater
};
const V_T1 = tangentFor(VOLCANO.dir);
const V_T2 = cross(VOLCANO.dir, V_T1);

// Return vent on planet B (step on it to fly back), and where you land on each planet
const TOWARD_A = normalize(subtract(A.center, B.center));
const B_LANDING = normalize(add(TOWARD_A, mult(0.35, tangentFor(TOWARD_A))));
const VENT_DIR = normalize(add(TOWARD_A, mult(-0.35, tangentFor(TOWARD_A))));
// land ~2 units from the ship (inside its "press E" range, outside its collision radius)
const TO_SPAWN = normalize(subtract(vec3(0, 1, 0), mult(dot(vec3(0, 1, 0), SHIP_DIR), SHIP_DIR)));
const A_LANDING = normalize(add(mult(Math.cos(2.0 / A.radius), SHIP_DIR), mult(Math.sin(2.0 / A.radius), TO_SPAWN)));

const PART_DEFS = [
    { id: 'wing',   name: 'Wing Panel',    planet: 0, dir: [-1.0, 0.2, -0.4], color: [0.3, 0.6, 1.0] },
    { id: 'fuel',   name: 'Fuel Cell',     planet: 0, dir: [-0.7, -0.2, 0.9], color: [0.3, 1.0, 0.4] },
    { id: 'engine', name: 'Thruster Core', planet: 1, dir: null,              color: [1.0, 0.55, 0.2] },  // far side of B
];

// Platform spiral around the volcano. Each step is a bit higher than the last one
// (max jump height is ~1.5, so steps of 0.8 are comfortable).
function makePlatforms() {
    // start the spiral on the side facing the spawn point
    const spawn = vec3(0, 1, 0);
    const s = subtract(spawn, mult(dot(spawn, VOLCANO.dir), VOLCANO.dir));
    const theta0 = Math.atan2(dot(s, V_T2), dot(s, V_T1));

    const ring = 2.5;                         // distance from the volcano's axis
    const tops = [0.9, 1.7, 2.5, 3.3, 4.1];
    const platforms = tops.map((top, i) => {
        const th = theta0 + i * radians(70);
        const offset = add(mult(Math.cos(th), V_T1), mult(Math.sin(th), V_T2));
        // tilt away from the volcano's axis by an ANGLE, chosen so the real distance at this
        // platform's height (R + top) is `ring` (higher up, the same angle covers more distance)
        const ang = ring / (A.radius + top);
        const dir = normalize(add(mult(Math.cos(ang), VOLCANO.dir), mult(Math.sin(ang), offset)));
        return { planet: 0, dir, top, size: 0.7, kind: 'step', index: i };
    });
    // the summit: a crust of rock over the crater. Standing on it triggers the geyser.
    platforms.push({ planet: 0, dir: VOLCANO.dir, top: VOLCANO.height + 0.2, size: 0.85, kind: 'summit' });
    return platforms;
}

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

// angle-based surface distance between two directions on a planet of radius R
const arc = (a, b, R) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * R;

function makeRocks(planet, count, keepOut, seed) {
    const rand = mulberry32(seed);
    const rocks = [];
    let tries = 0;
    while (rocks.length < count && tries++ < 2000) {
        const dir = randomDir(rand);
        if (keepOut.some(k => arc(k.dir, dir, planet.radius) < k.dist)) continue;
        const size = 0.3 + rand() * 0.45;
        rocks.push({ planet: planet.id, dir, size, fwd: tangentFor(dir), spin: rand() * 360 });
    }
    return rocks;
}

export function createGame() {
    // the part on planet B sits on the far side from where you land
    const parts = PART_DEFS.map(d => ({
        ...d,
        dir: d.dir ? dirOf(...d.dir) : normalize(add(negate(TOWARD_A), mult(0.5, tangentFor(TOWARD_A)))),
        collected: false,
        installed: false,
    }));

    const platforms = makePlatforms();

    const keepA = [
        { dir: vec3(0, 1, 0), dist: 2 }, { dir: SHIP_DIR, dist: 2.5 }, { dir: A_LANDING, dist: 1.5 },
        { dir: VOLCANO.dir, dist: 4.2 },
        ...parts.filter(p => p.planet === 0).map(p => ({ dir: p.dir, dist: 2 })),
    ];
    const keepB = [
        { dir: B_LANDING, dist: 2 }, { dir: VENT_DIR, dist: 2 },
        ...parts.filter(p => p.planet === 1).map(p => ({ dir: p.dir, dist: 2 })),
    ];
    const rocks = [...makeRocks(A, 14, keepA, 457), ...makeRocks(B, 9, keepB, 458)];

    // obstacles: upright shapes with a bottom radius, top radius and height
    const obstacles = [[], []];
    obstacles[0].push({ dir: SHIP_DIR, radius: 1.3, topRadius: 1.3, height: 1.4 });
    obstacles[0].push({ dir: VOLCANO.dir, radius: VOLCANO.baseR, topRadius: VOLCANO.topR, height: VOLCANO.height });
    for (const r of rocks) obstacles[r.planet].push({ dir: r.dir, radius: r.size, topRadius: r.size * 0.6, height: r.size * 0.9 });

    return {
        parts, rocks, platforms, obstacles,
        inventory: [],
        installed: 0,
        phase: 'explore',          // 'explore' | 'geyser' | 'flight' | 'escaping' | 'won'
        geyserTime: 0,
        flight: null,
        puffs: [],                 // steam particles
        puffTimer: 0,
        bestStep: -1,              // highest parkour step reached (for messages)
        escapeTime: 0,
        shipLift: 0,
        shipVel: 0,
        nearShip: false,
        nearVolcano: false,
        message: 'Your ship crashed! Find 3 missing parts (glowing stars) and bring them back.',
        messageTime: 5,
    };
}

// obstacles + platforms for the planet the player is on
export function planetWorld(game, planet) {
    return {
        obstacles: game.obstacles[planet.id],
        platforms: game.platforms.filter(p => p.planet === planet.id),
    };
}

function say(game, text, seconds = 3) { game.message = text; game.messageTime = seconds; }

const worldPos = (planet, dir, h) => add(planet.center, mult(planet.radius + h, dir));

// ---------------- steam particles (procedural) ----------------
function spawnPuff(game, pos, vel, size, life) {
    if (game.puffs.length > 120) return;
    game.puffs.push({ pos, vel, size, life, maxLife: life });
}

function geyserPuff(game, planet, dir, h, strength) {
    const jitter = vec3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    const side = subtract(jitter, mult(dot(jitter, dir), dir));
    const vel = add(mult(strength * (0.8 + 0.4 * Math.random()), dir), mult(0.8, side));
    spawnPuff(game, worldPos(planet, dir, h), vel, 0.15 + 0.15 * Math.random(), 0.8 + 0.6 * Math.random());
}

function updatePuffs(game, dt) {
    for (const p of game.puffs) {
        p.pos = add(p.pos, mult(dt, p.vel));
        p.vel = mult(1 - 1.5 * dt, p.vel);     // drag
        p.life -= dt;
    }
    game.puffs = game.puffs.filter(p => p.life > 0);
}

// ---------------- flight between planets ----------------
// A quadratic Bezier curve from the launch point to the landing point, lifted "up" in the middle.
function startFlight(game, player, toPlanet, toDir, duration) {
    const p0 = player.position;
    const p2 = worldPos(toPlanet, toDir, 0);
    const mid = mult(0.5, add(p0, p2));
    const p1 = add(mid, vec3(0, 9, 0));
    game.flight = { t: 0, duration, p0, p1, p2, toPlanet, toDir, spin: 0 };
    game.phase = 'flight';
}

function bezier(f, t) {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    return add(add(mult(a, f.p0), mult(b, f.p1)), mult(c, f.p2));
}
function bezierTangent(f, t) {
    return normalize(add(mult(2 * (1 - t), subtract(f.p1, f.p0)), mult(2 * t, subtract(f.p2, f.p1))));
}

function updateFlight(game, player, dt) {
    const f = game.flight;
    f.t = Math.min(1, f.t + dt / f.duration);
    f.spin += dt * 540;
    const pos = bezier(f, f.t);
    const dir = bezierTangent(f, f.t);
    // fly head-first along the curve, spinning around the direction of travel
    let fwd = tangentFor(dir);
    const spun = mult(rotate(f.spin, dir), vec4(fwd[0], fwd[1], fwd[2], 0));
    fwd = normalize(vec3(spun[0], spun[1], spun[2]));
    player.flightMatrix = frameAt(pos, dir, fwd);
    f.pos = pos;
    if (Math.random() < 0.6) spawnPuff(game, pos, vec3(0, 0, 0), 0.12, 0.6);   // vapor trail

    if (f.t >= 1) {
        player.flightMatrix = null;
        player.placeOn(f.toPlanet, f.toDir, tangentFor(f.toDir));
        player.vh = 3;                        // little bounce on landing
        player.onGround = false;
        game.flight = null;
        game.phase = 'explore';
        say(game, `Welcome to ${f.toPlanet.name}!`, 3);
    }
}

// ---------------- main update ----------------
export function updateGame(game, player, dt, input) {
    game.messageTime = Math.max(0, game.messageTime - dt);
    updatePuffs(game, dt);

    // idle steam from the volcano crater and the return vent
    game.puffTimer -= dt;
    if (game.puffTimer <= 0) {
        game.puffTimer = 0.25;
        geyserPuff(game, A, VOLCANO.dir, VOLCANO.height + 0.3, 2.5);
        geyserPuff(game, B, VENT_DIR, 0.1, 2.0);
    }

    if (game.phase === 'explore') {
        const planet = player.planet;
        const pPos = player.position;

        // pick up parts on this planet by walking into them
        for (const p of game.parts) {
            if (p.collected || p.planet !== planet.id) continue;
            if (length(subtract(pPos, worldPos(planet, p.dir, 0.6))) < 1.1) {
                p.collected = true;
                game.inventory.push(p);
                say(game, `Picked up: ${p.name}`);
            }
        }

        game.nearShip = planet === A && length(subtract(pPos, worldPos(A, SHIP_DIR, 0))) < 2.4;
        game.nearVolcano = planet === A && arc(player.up, VOLCANO.dir, A.radius) < 4.5;

        // parkour progress messages
        const on = player.standingOn;
        if (on && on.kind === 'step' && on.index > game.bestStep) {
            game.bestStep = on.index;
            if (on.index > 0) say(game, `Platform ${on.index + 1} / 5`, 1.5);
        }

        // reached the summit -> geyser erupts
        if (on && on.kind === 'summit') {
            game.phase = 'geyser';
            game.geyserTime = 0;
            say(game, 'The geyser is rumbling...', 2);
        }

        // stepped on the return vent on planet B -> fly back to the ship
        if (planet === B && player.onGround && arc(player.up, VENT_DIR, B.radius) < 0.6) {
            say(game, 'WHOOSH!', 2);
            startFlight(game, player, A, A_LANDING, 2.5);
        }

        if (input.interact) {
            if (!game.nearShip) {
                say(game, planet === A ? 'Nothing to interact with here. Head back to the ship.'
                                       : 'Nothing to interact with here. Find the steam vent to fly back.');
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
    } else if (game.phase === 'geyser') {
        // build-up: steam gets stronger, then launch toward planet B
        game.geyserTime += dt;
        for (let i = 0; i < 3; i++) geyserPuff(game, A, VOLCANO.dir, VOLCANO.height + 0.3, 3 + 5 * game.geyserTime);
        player.h = VOLCANO.height + 0.2 + 0.05 * Math.abs(Math.sin(game.geyserTime * 40));   // rattle
        if (game.geyserTime > 1.3) {
            for (let i = 0; i < 25; i++) geyserPuff(game, A, VOLCANO.dir, VOLCANO.height + 0.3, 10);
            say(game, 'LAUNCH!', 2);
            startFlight(game, player, B, B_LANDING, 3.0);
        }
    } else if (game.phase === 'flight') {
        updateFlight(game, player, dt);
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
    if (game.phase === 'flight') {
        const up = vec3(0, 1, 0);
        const d = subtract(game.flight.p2, game.flight.p0);
        const fwd = normalize(subtract(d, mult(dot(d, up), up)));
        return { pos: game.flight.pos || player.position, up, forward: fwd, zoomScale: 2.0 };
    }
    if (game.phase === 'escaping' || game.phase === 'won') {
        const pos = worldPos(A, SHIP_DIR, game.shipLift);
        return { pos, up: SHIP_DIR, forward: SHIP_FWD, zoomScale: 1 + game.escapeTime * 0.4 };
    }
    // lower, more side-on camera near the volcano / in the air so jump heights are readable
    const parkour = game.nearVolcano || player.h > 0.3 || game.phase === 'geyser';
    return {
        pos: player.position, up: player.up, forward: player.forward,
        zoomScale: parkour ? 1.15 : 1,
        upOffset: parkour ? 4.5 : 10,
        backOffset: parkour ? 9 : 7,
    };
}

// ---------------- drawing ----------------
const ROCK  = (tex) => material({ diffuse: [0.55, 0.45, 0.5], texture: tex, texScale: [2, 2], specular: [0.1, 0.1, 0.1] });
const GLASS = material({ diffuse: [0.3, 0.7, 0.9], specular: [1, 1, 1], shininess: 90, emissive: [0.05, 0.12, 0.18] });
const DARK  = material({ diffuse: [0.25, 0.25, 0.3] });
const STEAM = material({ diffuse: [0.8, 0.8, 0.85], emissive: [0.35, 0.35, 0.4], specular: [0, 0, 0] });

// planetMaterials[i] = material for PLANETS[i] (built in main.js so it can use custom texture images)
export function drawWorld(renderer, meshes, textures, stack, game, time, planetMaterials) {
    // planets: translate to the center, scale to the radius, rotate the texture out of the way
    for (const p of PLANETS) {
        const model = mult(translate(p.center[0], p.center[1], p.center[2]),
                      mult(scale(p.radius, p.radius, p.radius), rotateX(p.texRotX)));
        renderer.draw(meshes.planet, model, planetMaterials[p.id]);
    }

    // rocks: translate + rotate + (non-uniform) scale
    const rockMat = ROCK(textures.rock);
    for (const r of game.rocks) {
        const pl = PLANETS[r.planet];
        stack.load(surfaceFrame(r.dir, r.fwd, pl.radius, pl.center));
        stack.mul(rotateY(r.spin));
        stack.mul(scale(r.size, r.size * 0.7, r.size * 1.2));
        renderer.draw(meshes.rock, stack.top, rockMat);
    }

    // collectible parts: spinning, bobbing stars
    for (const p of game.parts) {
        if (p.collected) continue;
        const pl = PLANETS[p.planet];
        stack.load(surfaceFrame(p.dir, tangentFor(p.dir), pl.radius, pl.center));
        stack.mul(translate(0, 0.7 + 0.15 * Math.sin(time * 2.5), 0));
        stack.mul(rotateY(time * 120));
        stack.mul(scale(1.1, 1.1, 1.1));
        renderer.draw(meshes.star, stack.top, material({
            diffuse: p.color, specular: [1, 1, 1], shininess: 60,
            emissive: p.color.map(c => c * (0.35 + 0.15 * Math.sin(time * 4))),
        }));
    }

    drawVolcano(renderer, meshes, textures, stack, game, time);
    drawVent(renderer, meshes, stack, time);

    // steam puffs: grow and shrink over their life
    for (const p of game.puffs) {
        const age = 1 - p.life / p.maxLife;
        const s = p.size * (0.6 + 1.4 * age) * Math.min(1, p.life * 3);
        renderer.draw(meshes.rock, mult(translate(p.pos[0], p.pos[1], p.pos[2]), scale(s, s, s)), STEAM);
    }

    drawShip(renderer, meshes, textures, stack, game, time);
}

function drawVolcano(renderer, meshes, textures, stack, game, time) {
    const R = A.radius;
    const glow = 0.5 + 0.2 * Math.sin(time * 3) + (game.phase === 'geyser' ? game.geyserTime : 0);

    // cone: frustum mesh scaled to the volcano's size (it starts a bit below ground)
    stack.load(surfaceFrame(VOLCANO.dir, V_T1, R - 0.3, A.center));
    stack.push();
        stack.mul(scale(VOLCANO.baseR + 0.15, VOLCANO.height + 0.3, VOLCANO.baseR + 0.15));
        renderer.draw(meshes.volcano, stack.top, material({
            diffuse: [0.5, 0.33, 0.3], texture: textures.rock, texScale: [1, 1], specular: [0.1, 0.1, 0.1],
        }));
    stack.pop();
    // lava pool inside the crater
    stack.push();
        stack.mul(translate(0, VOLCANO.height + 0.2, 0));
        stack.mul(scale(VOLCANO.topR * 0.95, 0.15, VOLCANO.topR * 0.95));
        renderer.draw(meshes.sphere, stack.top, material({ diffuse: [1, 0.4, 0.1], emissive: [glow, 0.3 * glow, 0.05] }));
    stack.pop();

    // platforms: color shifts from blue (low) to orange (high) so it's easy to see the path
    for (const p of game.platforms) {
        const pl = PLANETS[p.planet];
        stack.load(surfaceFrame(p.dir, tangentFor(p.dir), pl.radius + p.top - 0.12, pl.center));
        if (p.kind === 'summit') {
            stack.mul(scale(2 * p.size * 0.9, 0.24, 2 * p.size * 0.9));
            renderer.draw(meshes.cube, stack.top, material({ diffuse: [0.25, 0.2, 0.2], emissive: [0.35 * glow, 0.1 * glow, 0] }));
        } else {
            const t = p.index / 4;
            stack.mul(rotateY(p.index * 25));
            stack.mul(scale(2 * p.size, 0.24, 2 * p.size));
            renderer.draw(meshes.cube, stack.top, material({
                diffuse: [0.35 + 0.55 * t, 0.55 - 0.15 * t, 0.9 - 0.6 * t],
                texture: textures.hull, specular: [0.4, 0.4, 0.4], shininess: 30,
                emissive: [0.05, 0.05, 0.08],
            }));
        }
    }
}

function drawVent(renderer, meshes, stack, time) {
    // a low ring of rocks on planet B with a glowing center
    stack.load(surfaceFrame(VENT_DIR, tangentFor(VENT_DIR), B.radius, B.center));
    for (let i = 0; i < 8; i++) {
        stack.push();
            stack.mul(rotateY(i * 45));
            stack.mul(translate(0.55, 0.05, 0));
            stack.mul(scale(0.22, 0.18, 0.22));
            renderer.draw(meshes.rock, stack.top, material({ diffuse: [0.35, 0.5, 0.5] }));
        stack.pop();
    }
    const g = 0.4 + 0.2 * Math.sin(time * 5);
    stack.mul(scale(0.45, 0.04, 0.45));
    renderer.draw(meshes.sphere, stack.top, material({ diffuse: [0.6, 1, 1], emissive: [0.3 * g, g, g] }));
}

function drawShip(renderer, meshes, textures, stack, game, time) {
    const R = A.radius;
    const repaired = game.installed / game.parts.length;
    const crashTilt = 1 - repaired;
    const has = (id) => game.parts.find(p => p.id === id).installed;

    // hull color goes from scorched red-brown to clean gray as it gets repaired
    const hullColor = [0.6 + 0.25 * repaired, 0.35 + 0.5 * repaired, 0.3 + 0.55 * repaired];
    const HULL = material({ diffuse: hullColor, texture: textures.hull, specular: [0.6, 0.6, 0.6], shininess: 40 });

    let shake = 0;
    if ((game.phase === 'escaping' || game.phase === 'won') && game.escapeTime < 1.2) shake = 0.05 * Math.sin(time * 80);

    // root: the ship body frame
    stack.load(surfaceFrame(SHIP_DIR, SHIP_FWD, R + game.shipLift, A.center));
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
            const launching = game.phase === 'escaping' || game.phase === 'won';
            const flame = launching ? 0.7 + 0.3 * Math.sin(time * 40) : 0.25;
            stack.mul(translate(0, 0, -0.3 - flame * 0.3));
            stack.mul(scale(0.35, 0.3, 0.2 + flame * 0.6));
            renderer.draw(meshes.sphere, stack.top, material({ diffuse: [1, 0.6, 0.2], emissive: [1.0 * flame, 0.5 * flame, 0.1] }));
        }
    stack.pop();
}

// Scanner info: distance to the nearest part on the player's planet, or which planet has the rest.
export function scanParts(game, player) {
    let best = Infinity, elsewhere = null;
    for (const p of game.parts) {
        if (p.collected) continue;
        if (p.planet === player.planet.id) {
            best = Math.min(best, length(subtract(player.position, worldPos(player.planet, p.dir, 0))));
        } else {
            elsewhere = PLANETS[p.planet].name;
        }
    }
    return { dist: best, elsewhere };
}

// older name, kept so existing code doesn't break
export function nearestPartDistance(game, player) { return scanParts(game, player).dist; }
