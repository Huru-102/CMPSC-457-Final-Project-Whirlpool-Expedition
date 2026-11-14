// player.js
// The astronaut: walking + jumping on a spherical planet, and a hierarchical model with a walk cycle.
//
// Position is stored relative to the planet the player is on:
//   world position = planet.center + up * (planet.radius + h)
// `up` is the unit direction from the planet center, `h` is the height above the ground.
// Gravity always pulls along -up (toward the planet center).

import { surfaceFrame, material } from './renderer.js';

const SUIT   = material({ diffuse: [0.92, 0.92, 0.95], specular: [0.4, 0.4, 0.4], shininess: 30 });
const ACCENT = material({ diffuse: [0.95, 0.55, 0.15] });
const VISOR  = material({ diffuse: [0.1, 0.15, 0.3], specular: [1, 1, 1], shininess: 80, emissive: [0.02, 0.05, 0.12] });
const PACK   = material({ diffuse: [0.45, 0.45, 0.55] });
const SHADOW = material({ diffuse: [0.04, 0.03, 0.06], ambient: [0, 0, 0], specular: [0, 0, 0] });

const GRAVITY = 14.0;        // units / s^2
const JUMP_SPEED = 6.5;      // initial upward speed -> max jump height = v^2 / 2g ~= 1.5 units
const COYOTE_TIME = 0.12;    // seconds after leaving an edge during which a jump still works

export class Player {
    constructor(planet) {
        this.speed = 3.5;               // surface units / second
        this.turnSpeed = 2.6;           // radians / second
        this.walkPhase = 0;
        this.swing = 0;                 // 0..1, how much the limbs swing
        this.visible = true;
        this.flightMatrix = null;       // when set, the player is drawn here instead (flying between planets)
        this.placeOn(planet, vec3(0, 1, 0), vec3(0, 0, 1));
    }

    placeOn(planet, up, forward) {
        this.planet = planet;
        this.up = normalize(up);
        this.forward = normalize(subtract(forward, mult(dot(forward, this.up), this.up)));
        this.h = 0;                 // height above ground
        this.vh = 0;                // vertical (radial) velocity
        this.onGround = true;
        this.shadowH = 0;           // height of whatever is under us (for the blob shadow)
        this.jumpHeld = false;
        this.coyote = 0;
        this.standingOn = null;     // platform we're standing on, if any
    }

    get position() { return add(this.planet.center, mult(this.planet.radius + this.h, this.up)); }

    // surface distance between two directions on this planet, measured at height h
    arcDist(dirA, dirB, h = 0) {
        const c = Math.max(-1, Math.min(1, dot(dirA, dirB)));
        return Math.acos(c) * (this.planet.radius + h);
    }

    // world = { obstacles: [...], platforms: [...] } for the planet we're on
    update(dt, keys, world) {
        const turn = (keys['a'] || keys['arrowleft'] ? 1 : 0) - (keys['d'] || keys['arrowright'] ? 1 : 0);
        const move = (keys['w'] || keys['arrowup'] ? 1 : 0) - (keys['s'] || keys['arrowdown'] ? 1 : 0);
        const R = this.planet.radius;

        // Turning: rotate `forward` around `up`
        if (turn !== 0) {
            const a = turn * this.turnSpeed * dt;
            const side = cross(this.up, this.forward);
            this.forward = normalize(add(mult(Math.cos(a), this.forward), mult(Math.sin(a), side)));
        }

        // Walking: rotate both `up` and `forward` around the side axis (moves us along a great circle)
        if (move !== 0) {
            const a = move * this.speed * dt / (R + this.h);
            const c = Math.cos(a), s = Math.sin(a);
            const newUp = normalize(add(mult(c, this.up), mult(s, this.forward)));
            const newFwd = normalize(subtract(mult(c, this.forward), mult(s, this.up)));

            // Collision: obstacles are upright shapes (rocks, ship, volcano). Each has a radius at the
            // bottom, a radius at the top, and a height. We only block moves that go deeper into one.
            const blocked = world.obstacles.some(o => {
                if (this.h >= o.height) return false;                    // we're above it
                const r = o.radius + (o.topRadius - o.radius) * (this.h / o.height) + 0.35;
                const dNew = this.arcDist(newUp, o.dir, this.h), dOld = this.arcDist(this.up, o.dir, this.h);
                return dNew < r && dNew < dOld;
            });
            if (!blocked) { this.up = newUp; this.forward = newFwd; }
            if (this.onGround) this.walkPhase += dt * 9 * move;
        }

        // keep forward exactly perpendicular to up (fix floating-point drift)
        this.forward = normalize(subtract(this.forward, mult(dot(this.forward, this.up), this.up)));

        // ---- jumping + gravity ----
        // "Coyote time": you can still jump for a moment after running off an edge (feels much fairer)
        this.coyote = this.onGround ? COYOTE_TIME : this.coyote - dt;
        const jump = !!keys[' '];
        if (jump && !this.jumpHeld && this.coyote > 0) { this.vh = JUMP_SPEED; this.onGround = false; this.coyote = 0; }
        this.jumpHeld = jump;

        const prevH = this.h;
        this.vh -= GRAVITY * dt;
        this.h += this.vh * dt;

        // What's under us? The ground (h = 0) or the highest platform whose top we were above.
        let support = 0, supportPlatform = null, shadowH = 0;
        for (const p of world.platforms) {
            if (this.arcDist(this.up, p.dir, p.top) > p.size) continue;     // not over this platform
            if (p.top <= prevH + 0.05 && p.top > support) { support = p.top; supportPlatform = p; }
            if (p.top <= this.h + 0.05 && p.top > shadowH) shadowH = p.top;
        }
        this.shadowH = Math.max(shadowH, support);

        if (this.h <= support) {          // landed (or still standing)
            this.h = support;
            this.vh = 0;
            this.onGround = true;
            this.standingOn = supportPlatform;
        } else {
            this.onGround = false;
            this.standingOn = null;
        }

        // ease limb swing in/out
        const target = (move !== 0 && this.onGround) ? 1 : 0;
        this.swing += (target - this.swing) * Math.min(1, dt * 10);
    }

    // Hierarchical model: torso is the root; head, arms, legs, backpack are children.
    draw(renderer, meshes, stack) {
        if (!this.visible) return;
        const limb = 35 * this.swing * Math.sin(this.walkPhase);     // degrees
        const bob = 0.04 * this.swing * Math.abs(Math.sin(this.walkPhase));
        const air = (this.onGround && !this.flightMatrix) ? 0 : 1;   // jump / flight pose
        const center = this.planet.center, R = this.planet.radius;

        // blob shadow on whatever is under us (helps judge jumps)
        if (!this.flightMatrix) {
            stack.load(surfaceFrame(this.up, this.forward, R + this.shadowH + 0.03, center));
            const s = 0.42 / (1 + 0.25 * (this.h - this.shadowH));   // smaller when higher up
            stack.mul(scale(s, 0.02, s));
            renderer.draw(meshes.sphere, stack.top, SHADOW);
        }

        stack.load(this.flightMatrix || surfaceFrame(this.up, this.forward, R + this.h, center));

        // --- torso (root) ---
        stack.mul(translate(0, 0.75 + bob, 0));
        stack.push();
            stack.mul(scale(0.5, 0.6, 0.3));
            renderer.draw(meshes.cube, stack.top, SUIT);
        stack.pop();

        // chest stripe
        stack.push();
            stack.mul(translate(0, 0.1, 0.155));
            stack.mul(scale(0.3, 0.08, 0.02));
            renderer.draw(meshes.cube, stack.top, ACCENT);
        stack.pop();

        // --- head (child of torso) ---
        stack.push();
            stack.mul(translate(0, 0.48, 0));
            stack.push();
                stack.mul(scale(0.24, 0.24, 0.24));
                renderer.draw(meshes.sphere, stack.top, SUIT);
            stack.pop();
            stack.mul(translate(0, 0.02, 0.17));
            stack.mul(scale(0.3, 0.14, 0.12));
            renderer.draw(meshes.cube, stack.top, VISOR);
        stack.pop();

        // --- backpack ---
        stack.push();
            stack.mul(translate(0, 0.05, -0.22));
            stack.mul(scale(0.36, 0.42, 0.16));
            renderer.draw(meshes.cube, stack.top, PACK);
        stack.pop();

        // --- arms: pivot at shoulder, rotate, then hang the limb below the pivot ---
        // in the air the arms go up (-150 degrees around x)
        for (const side of [1, -1]) {
            stack.push();
                stack.mul(translate(0.33 * side, 0.25, 0));
                stack.mul(rotateX(air ? -150 + 15 * side : limb * side));
                stack.mul(translate(0, -0.24, 0));
                stack.mul(scale(0.14, 0.48, 0.14));
                renderer.draw(meshes.cube, stack.top, SUIT);
            stack.pop();
        }

        // --- legs: pivot at hip, opposite phase to arms ---
        for (const side of [1, -1]) {
            stack.push();
                stack.mul(translate(0.13 * side, -0.3, 0));
                stack.mul(rotateX(air ? -25 * side : -limb * side));
                stack.mul(translate(0, -0.22, 0));
                stack.push();
                    stack.mul(scale(0.18, 0.45, 0.18));
                    renderer.draw(meshes.cube, stack.top, SUIT);
                stack.pop();
                stack.mul(translate(0, -0.2, 0.04));      // boot (grandchild)
                stack.mul(scale(0.2, 0.08, 0.26));
                renderer.draw(meshes.cube, stack.top, ACCENT);
            stack.pop();
        }
    }
}
