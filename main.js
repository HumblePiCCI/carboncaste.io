import * as THREE from './3jsReqs/three.module.js';
import { ParametricGeometry } from './3jsReqs/ParametricGeometry.js';
import { AsciiEffect } from './3jsReqs/AsciiEffect.js';
import { FontLoader } from './3jsReqs/FontLoader.js';
import { TextGeometry } from './3jsReqs/TextGeometry.js';

console.log(THREE.REVISION);

// Create the scene and camera
var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;

// Create the renderer
var renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setSize(window.innerWidth, window.innerHeight);

// Create the ASCII effect and set its size
var effect = new AsciiEffect(renderer);
effect.domElement.id = "ascii";
effect.setSize(window.innerWidth * 2, window.innerHeight * 2);
document.body.appendChild(effect.domElement);

// Create a directional light (the sun, for example)
var directionalLight = new THREE.DirectionalLight(0xffffff, 0.78);
directionalLight.position.set(0, 1, 1); // Position the light
scene.add(directionalLight);

// Load a font
var loader = new FontLoader();
loader.load( './fonts/helvetiker_regular.typeface.json', function ( font ) {

    var size = window.innerHeight * 0.00007;

    // Create the text geometries
    var topTextGeometry = new TextGeometry( 'We found you.', {
        font: font,
        size: size, // Adjust the size here
        height: 0.001, // Adjust the height here
        curveSegments: 12,
        bevelEnabled: true,
        bevelThickness: 0.01, // Adjust the bevel thickness here
        bevelSize: 0.01, // Adjust the bevel size here
        bevelOffset: 0,
        bevelSegments: 5
    } );
    /*var bottomTextGeometry = new TextGeometry( 'Soon, you will know why.', {
        font: font,
        size: .4, // Adjust the size here
        height: 0.01, // Adjust the height here
        curveSegments: 12,
        bevelEnabled: true,
        bevelThickness: 0.01, // Adjust the bevel thickness here
        bevelSize: 0.01, // Adjust the bevel size here
        bevelOffset: 0,
        bevelSegments: 5
    } );*/

    // Create the text materials
    var textMaterial = new THREE.MeshPhongMaterial( { color: 0xffffff, transparent: true, opacity: 0.8 } );

    // Create the text meshes
    var topText = new THREE.Mesh( topTextGeometry, textMaterial );
    //var bottomText = new THREE.Mesh( bottomTextGeometry, textMaterial );

    // Compute the bounding box of the top text geometry
    topTextGeometry.computeBoundingBox();
    //bottomTextGeometry.computeBoundingBox();

    // Compute the center of the bounding box
    var center = topTextGeometry.boundingBox.getCenter(new THREE.Vector3());

    // Position the text meshes
    topText.position.set(-center.x, 0.05, 2); // Adjust the position here
    //bottomText.position.set(-2, -0.2, 1); // Adjust the position here

    // Add the text meshes to the scene
    scene.add( topText );
    //scene.add( bottomText );

} );

function mobius3d(u, t, target) {
    u = u * 2 * Math.PI; // u ranges from 0 to 2π
    t = t * 2 - 1; // t ranges from -1 to 1
    var x = (1 + t/2 * Math.cos(u/2)) * Math.cos(u);
    var y = (1 + t/2 * Math.cos(u/2)) * Math.sin(u);
    var z = t/2 * Math.sin(u/2);
    target.set(x, y, z);
}

// Create the geometry for the Mobius strip
var geometry = new ParametricGeometry(mobius3d, 50, 50);

// Create the material for the Mobius strip
var material = new THREE.MeshPhongMaterial({color: 0xFFFFFF, side: THREE.DoubleSide});

// Create the Mobius strip and add it to the scene
var mobiusStrip = new THREE.Mesh(geometry, material);
scene.add(mobiusStrip);

// Scale the Mobius strip to fill the screen
var boundingBox = new THREE.Box3().setFromObject(mobiusStrip);
var size = boundingBox.getSize(new THREE.Vector3()).length();
var distance = size / (2 * Math.tan((camera.fov / 2) * (Math.PI / 180)));
camera.position.z = distance;
var aspectRatio = window.innerWidth / window.innerHeight;
var verticalFOV = 2 * Math.atan(size / (2 * distance));
var horizontalFOV = 2 * Math.atan(aspectRatio * Math.tan(verticalFOV / 2));
camera.fov = Math.max(verticalFOV, horizontalFOV) * (180 / Math.PI);
camera.updateProjectionMatrix();

// Create a vector to represent the custom rotation axis
var rotationAxis = new THREE.Vector3(1, 1, 0).normalize();

// Function to animate the Mobius strip
function animate() {
    requestAnimationFrame(animate);

    // Rotate the Mobius strip around the custom rotation axis
    mobiusStrip.rotateOnAxis(rotationAxis, 0.01);

    effect.render(scene, camera); // Use the ASCII effect for rendering
}

animate();

// Event listener for window resize
window.addEventListener('resize', function() {
    var width = window.innerWidth;
    var height = window.innerHeight;
    renderer.setSize(width, height);
    effect.setSize(width * 2, height * 2);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    // Calculate a scale factor based on the smaller of the window's width and height
    var scaleFactor = Math.min(width, height) / 1000; // Adjust the denominator as needed

    // Adjust the text size based on the scale factor
    var size = scaleFactor * 0.25; // Adjust the multiplier as needed
    topTextGeometry.parameters.options.size = size;
    topTextGeometry.needsUpdate = true;

    // Adjust the position of the text
    topTextGeometry.computeBoundingBox();
    var center = topTextGeometry.boundingBox.getCenter(new THREE.Vector3());
    topText.position.set(-center.x, 0.2 * scaleFactor, 1); // Adjust the multiplier as needed

    // Adjust the Mobius strip to fill the screen
    var boundingBox = new THREE.Box3().setFromObject(mobiusStrip);
    var size = boundingBox.getSize(new THREE.Vector3()).length();
    var distance = size / (2 * Math.tan((camera.fov / 2) * (Math.PI / 180)));
    camera.position.z = distance * scaleFactor; // Adjust the position based on the scale factor
    var aspectRatio = width / height;
    var verticalFOV = 2 * Math.atan(size / (2 * distance));
    var horizontalFOV = 2 * Math.atan(aspectRatio * Math.tan(verticalFOV / 2));
    camera.fov = Math.max(verticalFOV, horizontalFOV) * (180 / Math.PI);
    camera.updateProjectionMatrix();
});