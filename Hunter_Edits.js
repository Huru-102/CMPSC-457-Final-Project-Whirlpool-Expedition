export function hunterVerticesPusher() {
    let vertices = []

    vertices.push(vec2(-.8, 0))
    vertices.push(vec2(-.75, .6))
    vertices.push(vec2(.6, 0))


    return vertices
}

export function hunterVerticesDraw(gl,totalVertices) {
    gl.drawArrays(gl.TRIANGLES, totalVertices, totalVertices + 3);
    totalVertices += 3

}