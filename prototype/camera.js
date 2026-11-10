// camera.js
// Smoothed follow camera built with lookAt(). Toggles between ortho() and perspective().

export class Camera {
    constructor() {
        this.useOrtho = true;
        this.zoom = 6;             // ortho half-height (and distance scale)
        this.currentZoom = 6;
        this.eye = vec3(0, 20, -10);
        this.at = vec3(0, 6, 0);
        this.upv = vec3(0, 1, 0);
        this.snapNext = true;      // jump straight to the target on the first frame / reset
    }

    // target = { pos, up, forward, zoomScale }
    update(dt, target) {
        const z = this.zoom * (target.zoomScale || 1);
        const d = z / 6;
        // sit above the player (along their "up") and a bit behind them
        const desiredEye = add(target.pos, add(mult(10 * d, target.up), mult(-7 * d, target.forward)));

        const k = this.snapNext ? 1 : 1 - Math.exp(-6 * dt);   // frame-rate independent smoothing
        this.snapNext = false;
        this.eye = mix(this.eye, desiredEye, k);
        this.at = mix(this.at, target.pos, k);
        this.upv = normalize(mix(this.upv, target.up, k));
        this.currentZoom += (z - this.currentZoom) * k;
    }

    viewMatrix() {
        return lookAt(this.eye, this.at, this.upv);
    }

    projectionMatrix(aspect) {
        const z = this.currentZoom;
        return this.useOrtho
            ? ortho(-z * aspect, z * aspect, -z, z, 0.1, 200)
            : perspective(50, aspect, 0.1, 200);
    }
}
