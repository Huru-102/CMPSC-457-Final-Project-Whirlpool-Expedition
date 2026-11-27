// gameplay.js
// Game state: two planets, ship parts to collect, rocks (obstacles), the crashed ship,
// the volcano parkour climb + geyser launch to the second planet, and the repair + escape sequence.

import { surfaceFrame, frameAt, tangentFor, material } from './renderer.js';

// ---------------- planets ----------------
export const PLANETS = [
    // texRotX: rotates the planet mesh so the texture's pole "pinch" isn't where the player walks first
    { id: 0, name: 'Planet 1', center: vec3(0, 0, 0),     radius: 6.0, texture: 'planet',  tint: [0.75, 0.62, 0.8], texScale: [6, 3],   texRotX: 90 },
    { id: 1, name: 'Planet 2',  center: vec3(26, 7, -14),  radius: 4.5, texture: 'planet2', tint: [0.45, 0.8, 0.72], texScale: [5, 2.5], texRotX: 0 },
    { id: 2, name: 'Planet 3',  center: vec3(-12, 30, -122),  radius: 7.5, texture: 'planet3', tint: [0.95, 0.5, 0.62], texScale: [5, 2.5], texRotX: 45 }
];
const A = PLANETS[0], B = PLANETS[1], C = PLANETS[2];
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

//cave 1 on planet A
const CAVE1 = {
    dir: dirOf(0, -0.1, 0),
    height : 2.5,
    width: 1.7,
    depth: 0.8,
    baseR: 3.0,
}

const CAVE1Entrance= {
    dir: dirOf(0, -0.1, 0.024),
    height: 2.0,
    width: 1.0,
    depth: 0.7,
    baseR: 1.9,
}

 

const V_T1 = tangentFor(VOLCANO.dir);
const V_T2 = cross(VOLCANO.dir, V_T1);
const C_T1 = tangentFor(CAVE1.dir);
const CE_T1 = tangentFor(CAVE1Entrance.dir);

// Return vent on planet B (step on it to fly back), and where you land on each planet
// Yo oz, modified this so that there can be a vent from C to A as well -H
const TOWARD_A_FROM_B = normalize(subtract(A.center, B.center));
const TOWARD_A_FROM_C = normalize(subtract(A.center, C.center));


const B_LANDING = normalize(add(TOWARD_A_FROM_B, mult(0.35, tangentFor(TOWARD_A_FROM_B))));
const VENT_DIR = normalize(add(TOWARD_A_FROM_B, mult(-0.35, tangentFor(TOWARD_A_FROM_B))));


//Planet B to C stuff
const TOWARD_C = normalize(subtract(C.center, B.center))
const C_TOWARD_B = normalize(subtract(B.center, C.center)); // I was going through the planet when launching. So that was rough

const C_LANDING = normalize(add(C_TOWARD_B, mult(0.35, tangentFor(C_TOWARD_B))));

const temple = {
    dir: TOWARD_C,
    height: 1.5,
    width: 3.5,
    depth: 3.5,
    baseR: 3.5,
}

const castle = {
    dir: dirOf(11.5, -13.5, -4),
    height: 1.5,
    width: 3.5,
    depth: 3.5,
    baseR: 3.5,

}

// land ~2 units from the ship (inside its "press E" range, outside its collision radius)
const TO_SPAWN = normalize(subtract(vec3(0, 1, 0), mult(dot(vec3(0, 1, 0), SHIP_DIR), SHIP_DIR)));
const A_LANDING = normalize(add(mult(Math.cos(2.0 / A.radius), SHIP_DIR), mult(Math.sin(2.0 / A.radius), TO_SPAWN)));

const PART_DEFS = [
    { id: 'fuel',   name: 'Fuel Cell',     planet: 0, dir: [-0.7, -0.2, 0.9], color: [0.3, 1.0, 0.4] }, //We might have to configure for more parts? 
                                                                                        //One should Go at the end of nora's dungeon. 
                                                                                        //One on planet b or in that dungeon.
                                                                                        //Then one after completing the planet C dungeon. Right?
                                                                                        // But the issue is we need a default one so people know what to look for -H
    { id: 'engine', name: 'Thruster Core', planet: 1, dir: null,              color: [0.3, 0.6, 1.0] },  // far side of B
    { id: 'wing',   name: 'Wing Panel',    planet: 2, dir: [-1.0, 0.2, -0.4], color: [1.0, 0.55, 0.2 ]}, //I need to reposition this one once the final castle is organized

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
    //note
    //let pyramidXSizeConstant = 4.5
    //let pyramidZSizeConstant = 4.5
    //let pyramidYSizeConstant = 2.5

    // the part on planet B sits on the far side from where you land
    const parts = PART_DEFS.map(d => ({
        ...d,
        dir: d.dir ? dirOf(...d.dir) : normalize(add(negate(TOWARD_A_FROM_B), mult(0.5, tangentFor(TOWARD_A_FROM_B)))),
        collected: false,
        installed: false,
    }));

    const platforms = makePlatforms();
    
    //Platform for top of the temple
    platforms.push({ 
        planet: 1,               // Planet B
        dir: TOWARD_C,           // The direction you calculated
        top: temple.height,      // How high off the ground it is
        size: 1.5,               // How wide the trigger area is
        kind: 'templePeak'       // The custom name for your trigger!
    });

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
    const obstacles = [[], [], []]; //These obstacles are actually about creating the collision for the things you've draw. -H
                                //second note. I made these have top collision now. They didn't before, and I didn't know why. 
                                //THIRD AND MOST IMPORTANTLY. Each index represents a planet. 0 is A. 1 is B
    obstacles[0].push({ dir: SHIP_DIR, radius: 1.3, topRadius: 1.3, height: 1.4 });
    obstacles[0].push({ dir: VOLCANO.dir, radius: VOLCANO.baseR, topRadius: VOLCANO.topR, height: VOLCANO.height });

    obstacles[0].push({dir: CAVE1.dir, radius: CAVE1.baseR * .8, topRadius: CAVE1.baseR, height: CAVE1.height})
    obstacles[1].push({ dir: VENT_DIR, radius: 1, topRadius: 1, height: 0.5 });
    obstacles[1].push({ dir: TOWARD_C, radius: 1.5, topRadius: 1, height: 2.5}); 
    obstacles[2].push({ dir: TOWARD_A_FROM_C, radius: 1, topRadius: 1, height: 0.5 });

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
        nearCave: false,
        message: 'Your ship crashed! Find 3 missing parts (glowing stars) and bring them back.',
        messageTime: 5,
    };
}

// obstacles + platforms for the planet the player is on
export function planetWorld(game, planet) {
    const obstaclePlatforms = game.obstacles[planet.id].map(obs => ({
        planet: planet.id,
        dir: obs.dir,
        top: obs.height,
        size: obs.topRadius, // Use the top radius so sloped objects work correctly
        kind: 'obstacle_top'
    }));

    return {
        obstacles: game.obstacles[planet.id],
        // Combine the manual platforms with the auto-generated obstacle platforms
        platforms: [...game.platforms.filter(p => p.planet === planet.id), ...obstaclePlatforms],
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

// mark
function cavePhase(game, player, dt, input) {
    if (!game || !input) return;

    if (input.clickX !== null && input.clickY !== null) {
        const c = document.querySelector("canvas");
        const w = (c && c.clientWidth) || window.innerWidth;
        const h = (c && c.clientHeight) || window.innerHeight;

        const nx = input.clickX / w; // 0 (left) -> 1 (right)
        const ny = input.clickY / h; // 0 (top)  -> 1 (bottom)

        // Adjust spanX/spanY (size) and offsetX/offsetY (shift) to line up with your blocks
        const spanX = 4.5;
        const spanY = 8.5;
        const offsetX = 0;
        const offsetY = 0;

        const caveX = (nx * 2 - 1) * spanX + offsetX;
        const caveY = (1 - ny) * spanY + offsetY;

        const bounds = game.tileBounds || [];
        const hitIndex = bounds.findIndex(
            ([minX, maxX, minY, maxY]) =>
                caveX >= minX && caveX <= maxX && caveY >= minY && caveY <= maxY
        );

        if (hitIndex !== -1) {
            game.pathPuzzle = game.pathPuzzle || {};
            game.pathPuzzle.tileIndices = game.pathPuzzle.tileIndices || [];

            const nextTex = ((game.pathPuzzle.tileIndices[hitIndex] || 0) + 1) % 4;
            game.pathPuzzle.tileIndices[hitIndex] = nextTex;

            say(game, `Block ${hitIndex}`, 2);
        }

        input.clickX = null;
        input.clickY = null;
    }
}

//audio
let collectAudio = document.getElementById("collectItemAudio");
let standardMusic = document.getElementById("audiopapkin-ambient-soundscapes-003-space-atmosphere-303242")
let liftOFFAudio = document.getElementById("liftOffAudio");

let fade = document.getElementById("fadingScreen");


standardMusic.volume = 0.1;
collectAudio.volume = 0.8;

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
        if (standardMusic.paused) {
            standardMusic.play();
        }

    
    //////////// !!! mark
            if (game.nearCave){
                game.phase = "cave";
                say(game, 'You entered a cave! Solve the puzzle.', 4);
                fade.style.opacity = 1;

                setTimeout(function() {
                    if (fade)
                        fade.style.opacity = 0;
                    }, 1000);
                
            }
                
            
            ////////////////////////

        // pick up parts on this planet by walking into them
        for (const p of game.parts) {
            if (p.collected || p.planet !== planet.id) continue;
            if (length(subtract(pPos, worldPos(planet, p.dir, 0.6))) < 1.1) {
                collectAudio.play();
                p.collected = true;
                game.inventory.push(p);
                say(game, `Picked up: ${p.name}`);
                
            }
        }

        game.nearShip = planet === A && length(subtract(pPos, worldPos(A, SHIP_DIR, 0))) < 2.4;
        game.nearVolcano = planet === A && arc(player.up, VOLCANO.dir, A.radius) < 4.5;
        game.nearCave = planet === A && length(subtract(pPos, worldPos(A, CAVE1Entrance.dir, 0))) < 1.5;

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
            say(game, 'The temple whirrs to life', 2);
        }

        // stepped on the return vent on planet B -> fly back to the ship
        if (planet === B && player.onGround && arc(player.up, VENT_DIR, B.radius) < 0.6) {
            game.phase = 'ventHome'; 
            game.geyserTime = 0;
          
            
        } 
        if (planet === C && player.onGround && arc(player.up, TOWARD_A_FROM_C, C.radius) < 0.6) {
            game.phase = 'ventHome'; 
            game.geyserTime = 0;
          
        }
        

        if (planet === B && game.doorLightPos) {
            const doorPos = vec3(game.doorLightPos[0], game.doorLightPos[1], game.doorLightPos[2])
            
            if (length(subtract(pPos, doorPos)) < 1.5) { //number is the distance to the door
                transportToTempleRoof(game, player);
            }
        }

        if (on && on.kind === 'templePeak') {
            game.phase = 'ventToPlanet3';
            game.geyserTime = 0;
            say(game, 'The geyser is rumbling...', 2);
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
    } else if (game.phase == 'ventHome') {

        game.geyserTime += dt;
        say(game, 'WHOOSH!', 2); 
        if (game.geyserTime > 1.3) {

            startFlight(game, player, A, A_LANDING, 2.5);
        }
    } else if (game.phase == 'ventToPlanet3') {

        game.geyserTime += dt;
        say(game, 'WHOOSH!', 2); 
        if (game.geyserTime > 1.3) {
            startFlight(game, player, C, C_LANDING, 2.5);

        }
    } else if (game.phase === 'flight') {
        updateFlight(game, player, dt);
    } 
    else if (game.phase === "cave") {
        cavePhase(game, player, dt, input);
     

// mark
    }
        else if (game.phase === 'templeTransition') {
            //This needs to stay empty, else the transition might impact the final sequence.
            // Add other fade to black stuff here if there's an issue.

        }
    else {
        // escape sequence: rumble for a second, then accelerate away from the planet
        game.escapeTime += dt;
        if (game.escapeTime > 1.0) {
            game.shipVel += 7 * dt;
            game.shipLift += game.shipVel * dt;
        }
        if (game.phase === 'escaping' && game.escapeTime > 5) {
            liftOFFAudio.play();
            game.phase = 'won';
        }

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

    if (game.phase === 'cave') { //mark
        return {
            pos: vec3(0, 4, -1.5),
            up: vec3(0, 1.5, 0),
            forward: vec3(0, 0, -1),
            zoomScale: 0.8,
            upOffset: 1.5,
            backOffset: 12,
        };
           //
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
    if (game.phase === "cave") {
        drawCaveInterior(renderer, meshes, textures, stack, game, time);

        return;
    }


    // planets: translate to the center, scale to the radius, rotate the texture out of the way
    for (const p of PLANETS) {
        const model = mult(translate(p.center[0], p.center[1], p.center[2]),
                      mult(scale(p.radius, p.radius, p.radius), rotateX(p.texRotX)));
        renderer.draw(meshes.planet, model, planetMaterials[p.id]);


    }

    // rocks: translate + rotate + (non-uniform) scale
    for (const r of game.rocks) {
        const pl = PLANETS[r.planet];
        stack.load(surfaceFrame(r.dir, r.fwd, pl.radius, pl.center));
        stack.mul(rotateY(r.spin));
        stack.mul(scale(r.size, r.size * 0.7, r.size * 1.2));
        let rockMat;  
        if (r.planet === 0) {
            rockMat = ROCK(textures.rock);
        } else if (r.planet === 1) {
            rockMat = ROCK(textures.planet2Rocks); // Make sure PlanetB_rocks is in your textures object!
        }
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
    drawBtoAVent(renderer, meshes, textures, stack, time);
    drawCtoAVent(renderer, meshes, textures, stack, time)
    drawPyramid(renderer, meshes, textures, stack, time);
    drawCave1(renderer, meshes, textures, stack, game, time); 
    drawCaveEnterance(renderer, meshes, textures, stack, game, time);
    drawBuildingPyramid(renderer, meshes, textures, stack, time, game);
    drawCastle(renderer, meshes, textures, stack, time, game) ;

    // steam puffs: grow and shrink over their life
    for (const p of game.puffs) {
        const age = 1 - p.life / p.maxLife;
        const s = p.size * (0.6 + 1.4 * age) * Math.min(1, p.life * 3);
        renderer.draw(meshes.rock, mult(translate(p.pos[0], p.pos[1], p.pos[2]), scale(s, s, s)), STEAM);
    }

    drawShip(renderer, meshes, textures, stack, game, time);
}

function drawCave1 (renderer, meshes, textures, stack, game, time) {
    const R = A.radius;
    stack.load(surfaceFrame(CAVE1.dir, C_T1, R-0.3, A.center));
    stack.push();
    stack.mul(scale(CAVE1.baseR + 0.15, CAVE1.height +0.33, CAVE1.baseR + 0.15));
        renderer.draw(meshes.rock, stack.top, material({
            diffuse: [0.5, 0.33, 0.3], texture: textures.rock, texScale: [1, 1], specular: [0.1, 0.1, 0.1],
        }));
    stack.pop();   

}

//I believe this is the planet 1 cave.
function drawCaveEnterance(renderer, meshes, textures, stack, game, time) {
    const R = A.radius; 
    stack.load(surfaceFrame(CAVE1Entrance.dir, CE_T1, R-0.3, A.center));
    stack.push();
        stack.mul(scale(CAVE1Entrance.baseR + 0.15, CAVE1Entrance.height +0.33, CAVE1Entrance.baseR + 0.15));
        renderer.draw(meshes.rock, stack.top, material({
            diffuse: [0.2, 0.0, 0.0], texture: textures.rock, texScale: [1, 1], specular: [0.1, 0.1, 0.1],
        }));
    stack.pop();   
}

function drawCaveInterior(renderer, meshes, textures, stack, game, time) { //mark
    const puzzleTextures = [textures.pipe1, textures.pipe2, textures.pipe3, textures.pipe4];
    const tileIndices = (game && game.pathPuzzle && game.pathPuzzle.tileIndices) || [];

    const FloorMat = material({
        diffuse: [0.2, 0.24, 0.27],
        texture: textures.rock,
        texScale: [4, 4],
        specular: [0.05, 0.05, 0.05],
    });

    const WallMat = material({
        diffuse: [0.28, 0.24, 0.27],
        texture: textures.rock,
        texScale: [4, 4],
        specular: [0.05, 0.05, 0.05],
        emissive: [0.12, 0.1, 0.12],
    });

    const tileMats = puzzleTextures.map((tex) =>
        material({
            diffuse: [1, 1, 1],
            texture: tex,
            texScale: [1, 1],
            specular: [0.2, 0.2, 0.2],
            shininess: 16,
        })
    );

    stack.load(translate(0, 0, 0));

    // Floor
    stack.push();
        stack.mul(translate(0, -2, -1));
        stack.mul(scale(30, 4, 14));
        renderer.draw(meshes.cube, stack.top, FloorMat);
    stack.pop();

    // wall
    stack.push();
        stack.mul(translate(0, 4.25, -6.6));
        stack.mul(scale(30, 8.5, 1.2));
        renderer.draw(meshes.cube, stack.top, WallMat);
    stack.pop();

    // wall puzzle
    const cols = 4;
    const rows = 4;
    const tileSize = 1.6;
    const step = 1.8;
    const centerX = 0;
    const centerY = 4.25;
    const blockZ = -5.9;

    const startX = centerX - ((cols - 1) * step) / 2;
    const startY = centerY + ((rows - 1) * step) / 2;
    if (game) game.tileBounds = [ ];

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const x = startX + c * step;
            const y = startY - r * step;
            const half = tileSize /2;
            const minX = x- half;
            const minY = y - half;
            const maxX = x + half;
            const maxY = y + half;
            if (game) game.tileBounds.push([minX, maxX, minY, maxY]);

            const texIdx = (tileIndices[idx] || 0) % tileMats.length;

            stack.push();
                stack.mul(translate(x, y, blockZ));
                stack.mul(scale(tileSize, tileSize, 0.2));
                renderer.draw(meshes.cube, stack.top, tileMats[texIdx]);
            stack.pop();
        }
    }
}

function transportToTempleRoof(game, player) {

    game.phase = 'templeTransition'; 
    if (typeof fadingScreen !== 'undefined') fadingScreen.style.opacity = 1;

    setTimeout(function() {
        //temporary teleport. Make this transition to a different screen for gameplay purposes
        player.placeOn(B, TOWARD_C, tangentFor(TOWARD_C));
        
        // Put them slightly above the roof so they drop onto the invisible platform
        player.h = temple.height + 0.5; 
        player.vh = 0; 
        
        game.phase = 'explore'; 
        if (typeof fadingScreen !== 'undefined') fadingScreen.style.opacity = 0; 
        
    }, 1000); // 1 second fade
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
            renderer.draw(meshes.cube, stack.top, material({ diffuse: [0.25, 0.2, 0.2], texture: textures.rock, emissive: [0.35 * glow, 0.1 * glow, 0] }));
        } else {
            const t = p.index / 4;
            stack.mul(rotateY(p.index * 25));
            stack.mul(scale(2 * p.size, 0.24, 2 * p.size));
            renderer.draw(meshes.cube, stack.top, material({
                diffuse: [0.35 + 0.55 * t, 0.55 - 0.15 * t, 0.9 - 0.6 * t],
                texture: textures.cloud, specular: [0.4, 0.4, 0.4], shininess: 30,
                emissive: [0.05, 0.05, 0.08],
            }));
        }
    }
}

function drawBtoAVent(renderer, meshes, textures, stack, time) {
    // a low ring of rocks on planet B with a glowing center
    stack.load(surfaceFrame(VENT_DIR, tangentFor(VENT_DIR), B.radius, B.center)); 
    for (let i = 0; i < 8; i++) {
        stack.push();
            stack.mul(rotateY(i * 45));
            stack.mul(translate(0.55, 0.60, 0));
            stack.mul(scale(0.22, 0.18, 0.22));
            renderer.draw(meshes.rock, stack.top, material({ diffuse: [0.35, 0.5, 0.5] }));
        stack.pop();
    }
    
    const g = 0.4 + 0.2 * Math.sin(time * 5); //This is a lighting control variable btw nora. I had no clue for a bit -H
    stack.mul(scale(0.45, 0.04, 0.45));
    
    renderer.draw(meshes.sphere, stack.top, material({ diffuse: [0.6, 1, 1], emissive: [0.3 * g, g, g] }));
    
    stack.load(surfaceFrame(VENT_DIR, tangentFor(VENT_DIR), B.radius, B.center));
    stack.push();
        stack.mul(translate(0, 0.20, 0));
        stack.mul(scale(2, 0.50, 2.05));
        renderer.draw(meshes.ventBase, stack.top, material({ diffuse: [1, 1, 1], texture: textures.planet2Pedestal }));
    stack.pop();
    
    //renderer.draw(meshes.cube, stack.top, material({ diffuse: [0.3, 1, 1], emissive: [0.3 * g, g, g] }));


}

function drawCtoAVent(renderer, meshes, textures, stack, time) {
    // a low ring of rocks on planet B with a glowing center
    const g = 0.4 + 0.2 * Math.sin(time * 5); //This is a lighting control variable btw nora. I had no clue for a bit -H
    stack.mul(scale(0.45, 0.04, 0.45));
    
    renderer.draw(meshes.sphere, stack.top, material({ diffuse: [0.6, 1, 1], emissive: [0.3 * g, g, g] }));
    
    stack.load(surfaceFrame(TOWARD_A_FROM_C, tangentFor(TOWARD_A_FROM_C), C.radius, C.center));
    stack.push();
        stack.mul(translate(0, 0.20, 0));
        stack.mul(scale(2, 0.50, 2.05));
        renderer.draw(meshes.ventBase, stack.top, material({ diffuse: [1, 1, 1], texture: textures.planet2Pedestal }));
    stack.pop();
    
    //renderer.draw(meshes.cube, stack.top, material({ diffuse: [0.3, 1, 1], emissive: [0.3 * g, g, g] }));


}

function drawPyramid(renderer, meshes, textures, stack, time) {    
    const g = 0.4 + 0.2 * Math.sin(time * 5); //This is a lighting control variable btw nora. I had no clue for a bit -H
    stack.mul(scale(0.45, 0.04, 0.45));
    
    renderer.draw(meshes.sphere, stack.top, material({ diffuse: [0.6, 1, 1], emissive: [0.3 * g, g, g] }));
    
    stack.load(surfaceFrame(VENT_DIR, tangentFor(VENT_DIR), A.radius, A.center));
    stack.push();
        stack.mul(translate(0, 0.20, 0));
        stack.mul(scale(2, 0.50, 2.05));
        renderer.draw(meshes.pyramid, stack.top, material({ diffuse: [1, 1, 1], texture: textures.planet2Pedestal }));
    stack.pop();

}

function drawBuildingPyramid(renderer, meshes, textures, stack, time, game) {    
    let pyramidXSizeConstant = 2.5
    let pyramidZSizeConstant = 2.5
    let pyramidYSizeConstant = 1.5
    stack.load(surfaceFrame(TOWARD_C, tangentFor(TOWARD_C), B.radius, B.center));  //Replace the A with B
    for (let i = 0; i < 4; i++) {
        stack.push();
            stack.mul(rotateY(i * 90));
            stack.mul(translate(pyramidXSizeConstant/1.7, 0.55, pyramidZSizeConstant/1.7));
            stack.mul(scale(pyramidXSizeConstant/3, pyramidYSizeConstant * 3, pyramidZSizeConstant/3));
            renderer.draw(meshes.cube, stack.top, material({ diffuse: [0.35, 0.5, 0.5], texture: textures.planet2Pedestal }));
        stack.pop();
    }

    
    const g = 0.4 + 0.2 * Math.sin(time * 5); //This is a lighting control variable btw nora. I had no clue for a bit -H
    stack.mul(scale(0.45, 0.04, 0.45));
    
    renderer.draw(meshes.sphere, stack.top, material({ diffuse: [0.6, 1, 1], emissive: [0.3 * g, g, g] }));
    
    stack.load(surfaceFrame(TOWARD_C, tangentFor(TOWARD_C), B.radius, B.center));
    stack.push();
        stack.mul(translate(0, 0.20, 0));
        stack.mul(scale(pyramidXSizeConstant, pyramidYSizeConstant, pyramidZSizeConstant));
        renderer.draw(meshes.buildingPyramid, stack.top, material({ diffuse: [1, 1, 1], texture: textures.TempleWall , texScale: [4, 3]}));
    stack.pop();

    stack.load(surfaceFrame(TOWARD_C, tangentFor(TOWARD_C), B.radius, B.center));  //Replace the A with B
    stack.push();
        stack.mul(rotateY(90))
        stack.mul(translate(-.79, 0, -0.1));
        stack.mul(scale(pyramidXSizeConstant/2, pyramidYSizeConstant/2, pyramidZSizeConstant/2));
        renderer.draw(meshes.buildingPyramid, stack.top, material({ diffuse: [1, 1, 0], emissive: [1, 1, 0]}));
        let doorWorldPos = mult(stack.top, vec4(0, 0, 0.5, 1)); 
        
        game.doorLightPos = [doorWorldPos[0], doorWorldPos[1], doorWorldPos[2]];


    stack.pop();

}

function drawCastle(renderer, meshes, textures, stack, time, game) {    //Depending on time I'd like a change this to a different more fitting shape and do some stuff with it. 
                                                                        //Thinking an interior that then leads to a courtyard where you can collect the part
                                                                        //For now though it's a copy of the pyramid with a different texture -H
    let pyramidXSizeConstant = 2.5
    let pyramidZSizeConstant = 2.5
    let pyramidYSizeConstant = 1.5
    const g = 0.4 + 0.2 * Math.sin(time * 5); //This is a lighting control variable btw nora. I had no clue for a bit -H
    stack.mul(scale(0.45, 0.04, 0.45));
    
    renderer.draw(meshes.sphere, stack.top, material({ diffuse: [0.6, 1, 1], emissive: [0.3 * g, g, g] }));
    
    stack.load(surfaceFrame(castle.dir, tangentFor(castle.dir), C.radius, C.center));
    stack.push();
        stack.mul(translate(0, 0.20, 0));
        stack.mul(scale(pyramidXSizeConstant, pyramidYSizeConstant, pyramidZSizeConstant));
        renderer.draw(meshes.buildingPyramid, stack.top, material({ diffuse: [1, 1, 1], texture: textures.CastleWall }));
    stack.pop();

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
