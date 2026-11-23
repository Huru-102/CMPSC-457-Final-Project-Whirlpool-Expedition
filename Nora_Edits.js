/**

export function noraVerticesPusher() {
    let Vertices = [

    ];

    return { positions: flatten(Vertices)};
}

export function noraVerticesDraw(gl, totalVertices) {
    gl.drawArrays(gl.TRIANGLE_STRIP, totalVertices, 4);

}

}
    */