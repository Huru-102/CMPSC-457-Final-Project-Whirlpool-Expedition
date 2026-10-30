export function noraVerticesPusher() {
    let vertices = []

    vertices.push(vec2(-.4, 0))
    vertices.push(vec2(-.75, 1))
    vertices.push(vec2(.6, 0))


    return vertices
}

export function noraVerticesDraw(gl,totalVertices) {
    gl.drawArrays(gl.TRIANGLES, totalVertices, totalVertices + 3);
    totalVertices += 3

}