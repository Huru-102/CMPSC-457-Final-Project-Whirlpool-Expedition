// renderer.js
// Shader setup, uniform locations, materials, drawing helpers, and the matrix stack.
// Uses the global MV.js functions (mat4, mult, flatten, normalMatrix, ...) loaded in index.html.

export function createRenderer(gl) {
    const program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    const u = (name) => gl.getUniformLocation(program, name);

    const r = {
        gl,
        program,
        attribs: {
            position: gl.getAttribLocation(program, "aPosition"),
            normal:   gl.getAttribLocation(program, "aNormal"),
            texCoord: gl.getAttribLocation(program, "aTexCoord"),
        },
        loc: {
            modelView:    u("uModelView"),
            projection:   u("uProjection"),
            normalMatrix: u("uNormalMatrix"),
            pointSize:    u("uPointSize"),
            lightPos:     u("uLightPos"),
            lightColor:   u("uLightColor"),
            ambient:      u("uAmbient"),
            diffuse:      u("uDiffuse"),
            specular:     u("uSpecular"),
            shininess:    u("uShininess"),
            emissive:     u("uEmissive"),
            useTexture:   u("uUseTexture"),
            texture:      u("uTexture"),
            texScale:     u("uTexScale"),
            pointMode:    u("uPointMode"),
        },
        view: mat4(),
        projection: mat4(),
    };

    gl.uniform1i(r.loc.texture, 0);
    gl.uniform3f(r.loc.lightColor, 1.0, 0.95, 0.85);
    gl.uniform1f(r.loc.pointSize, 1.0);
    gl.uniform1i(r.loc.pointMode, 0);

    // ---- per-frame state ----
    r.setView = (v) => { r.view = v; };

    r.setProjection = (p) => {
        r.projection = p;
        gl.uniformMatrix4fv(r.loc.projection, false, flatten(p));
    };

    // Light position is given in WORLD space; we convert it to EYE space with the view matrix.
    r.setLight = (worldPos) => {
        const e = mult(r.view, vec4(worldPos[0], worldPos[1], worldPos[2], 1.0));
        gl.uniform3f(r.loc.lightPos, e[0], e[1], e[2]);
    };

    r.setMaterial = (m) => {
        gl.uniform3fv(r.loc.ambient, m.ambient);
        gl.uniform3fv(r.loc.diffuse, m.diffuse);
        gl.uniform3fv(r.loc.specular, m.specular);
        gl.uniform1f(r.loc.shininess, m.shininess);
        gl.uniform3fv(r.loc.emissive, m.emissive);
        gl.uniform2fv(r.loc.texScale, m.texScale);
        if (m.texture) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, m.texture);
            gl.uniform1i(r.loc.useTexture, 1);
        } else {
            gl.uniform1i(r.loc.useTexture, 0);
        }
    };

    // Draw a mesh with a MODEL matrix. ModelView = View * Model.
    r.draw = (mesh, model, material) => {
        const mv = mult(r.view, model);
        gl.uniformMatrix4fv(r.loc.modelView, false, flatten(mv));
        gl.uniformMatrix3fv(r.loc.normalMatrix, false, flatten(normalMatrix(mv, true)));
        r.setMaterial(material);
        gl.bindVertexArray(mesh.vao);
        gl.drawArrays(mesh.mode, 0, mesh.count);
    };

    // Draw gl.POINTS (starfield) with an explicit model-view and projection.
    r.drawPoints = (mesh, modelView, projection, size, color) => {
        gl.uniformMatrix4fv(r.loc.modelView, false, flatten(modelView));
        gl.uniformMatrix4fv(r.loc.projection, false, flatten(projection));
        gl.uniform1i(r.loc.pointMode, 1);
        gl.uniform1f(r.loc.pointSize, size);
        gl.uniform3fv(r.loc.emissive, color);
        gl.bindVertexArray(mesh.vao);
        gl.drawArrays(gl.POINTS, 0, mesh.count);
        gl.uniform1i(r.loc.pointMode, 0);
        gl.uniformMatrix4fv(r.loc.projection, false, flatten(r.projection)); // restore
    };

    return r;
}

// ---- Materials ----
export function material(opts = {}) {
    return Object.assign({
        ambient:   [0.3, 0.3, 0.38],
        diffuse:   [0.8, 0.8, 0.8],
        specular:  [0.3, 0.3, 0.3],
        shininess: 20.0,
        emissive:  [0, 0, 0],
        texture:   null,
        texScale:  [1, 1],
    }, opts);
}

// ---- Matrix stack for hierarchical modeling ----
// top is the current model matrix. push() saves it, pop() restores it.
export class MatrixStack {
    constructor(m = mat4()) { this.stack = []; this.top = m; }
    load(m) { this.top = m; }
    push()  { this.stack.push(this.top); }
    pop()   { this.top = this.stack.pop(); }
    mul(m)  { this.top = mult(this.top, m); }   // post-multiply: new transform is applied in LOCAL space
}

// ---- Placing things on a sphere ----
// Builds a model matrix whose local axes are:
//   x = cross(up, forward), y = up (away from planet center), z = forward
// and whose origin sits at distance `radius` from the planet center along `up`.
export function surfaceFrame(up, forward, radius) {
    const side = cross(up, forward);
    const p = mult(radius, up);
    return mat4(
        side[0], up[0], forward[0], p[0],
        side[1], up[1], forward[1], p[1],
        side[2], up[2], forward[2], p[2],
        0.0,     0.0,   0.0,        1.0
    );
}

// Any unit vector perpendicular to `up` (used for objects that don't care which way they face).
export function tangentFor(up) {
    const ref = Math.abs(up[1]) < 0.95 ? vec3(0, 1, 0) : vec3(1, 0, 0);
    return normalize(cross(ref, up));
}
