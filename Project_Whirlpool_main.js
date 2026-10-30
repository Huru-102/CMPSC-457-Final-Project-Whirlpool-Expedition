//Place any imported functions from your files up here in a similar working format.
import { hunterVerticesPusher } from './Hunter_Edits.js';
import { hunterVerticesDraw } from './Hunter_Edits.js';
import { ozVerticesPusher } from './Oz_Edits.js';
import { ozVerticesDraw } from './Oz_Edits.js';
import { noraVerticesPusher } from './Nora_Edits.js';
import { noraVerticesDraw } from './Nora_Edits.js';

let gl
let canvas
let colorLoc
let vertices = []
let hArray = []
let hTotalVert
let oArray = []
let oTotalVert
let nArray = []
let nTotalVert


window.onload = function init()
{

    canvas = document.getElementById( "canvas" );
    gl = canvas.getContext('webgl2');
    if (!gl) alert( "WebGL 2.0 isn't available" );
    
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);

    //  Load shaders and initialize attribute buffers
    let program = initShaders(gl, "vertex-shader", "fragment-shader");
        gl.useProgram(program);

    colorLoc = gl.getUniformLocation(program, "uColor");


    //Turns out ... spreads out an array so push works. Cool
    //So here's the vertex pusher part. Each one pushes each person's stuff
    hArray = hunterVerticesPusher()
    hTotalVert = hArray.length
    vertices.push(...hArray)

    oArray = ozVerticesPusher()
    oTotalVert = oArray.length
    vertices.push(...oArray)

    nArray = noraVerticesPusher()
    nTotalVert = nArray.length
    vertices.push(...nArray)

    let bufferId = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(vertices), gl.STATIC_DRAW);

    let aPosition = gl.getAttribLocation(program, "aPosition");
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(aPosition);

    //thetaLoc = gl.getUniformLocation(program, "uTheta");
    colorLoc = gl.getUniformLocation(program, "uColor");

    render()

}

function render() {
    let totalVertices = 0
    gl.clear(gl.COLOR_BUFFER_BIT)
    //Make sure your total vertices are equivalent in number to how many you draw in your function
    //ALWAYS before you push. That way there's never any weird drawing behavior


    //Drawing for hunter
    gl.uniform4f(colorLoc, 1.0, 0, .6, 1.0); // Blue base
    hunterVerticesDraw(gl, totalVertices)
    totalVertices += hTotalVert

    //drawing for Oz
    gl.uniform4f(colorLoc, 0.5, .3, .6, 1.0)
    ozVerticesDraw(gl, totalVertices)
    totalVertices += oTotalVert

    //Drawing for Nora
    gl.uniform4f(colorLoc, 0, 1, 1, 1.0)
    noraVerticesDraw(gl, totalVertices)
    totalVertices += nTotalVert


    requestAnimationFrame(render)
}
