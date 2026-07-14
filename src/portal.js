import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { CspAsciiEffect } from './CspAsciiEffect.js';

const stage = document.querySelector('#ascii-stage');
const sceneHost = document.querySelector('#ascii-scene');
const status = document.querySelector('#scene-status');

if (!stage || !sceneHost || !status) throw new Error('Portal shell is incomplete.');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const frustumSize = 10;
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
camera.position.set(0, 0.35, 20);
camera.zoom = 1.25;

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
renderer.setPixelRatio(1);
renderer.setClearColor(0x000000, 1);

const effect = new CspAsciiEffect(renderer, ' .-:+*=%@#', {
  invert: false,
  resolution: 0.15,
});
effect.domElement.setAttribute('aria-hidden', 'true');
sceneHost.appendChild(effect.domElement);

const controls = new OrbitControls(camera, effect.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.minZoom = 0.65;
controls.maxZoom = 7;
controls.target.set(0, 0, 0);

const normalMaterial = new THREE.MeshNormalMaterial({
  side: THREE.DoubleSide,
  flatShading: false,
});

function createToroidalMobius() {
  const majorAxis = 1;
  const minorAxis = 0.125;
  const pathRadius = 2;
  const segments = 84;
  const positions = [];
  const indices = [];

  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    for (let j = 0; j <= segments; j += 1) {
      const phi = (j / segments) * Math.PI * 2;
      const twist = phi / 2;
      const ellipseX = majorAxis * Math.cos(theta);
      const ellipseY = minorAxis * Math.sin(theta);
      const twistedX = ellipseX * Math.cos(twist) - ellipseY * Math.sin(twist);
      const twistedY = ellipseX * Math.sin(twist) + ellipseY * Math.cos(twist);
      positions.push(
        (pathRadius + twistedX) * Math.cos(phi),
        (pathRadius + twistedX) * Math.sin(phi),
        twistedY,
      );
    }
  }

  for (let i = 0; i < segments; i += 1) {
    for (let j = 0; j < segments; j += 1) {
      const a = i * (segments + 1) + j;
      const b = (i + 1) * (segments + 1) + j;
      const c = (i + 1) * (segments + 1) + j + 1;
      const d = i * (segments + 1) + j + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, normalMaterial);
}

const mobius = createToroidalMobius();
mobius.rotation.set(-0.38, 0.18, -0.2);
scene.add(mobius);

const introGroup = new THREE.Group();
const directoryGroup = new THREE.Group();
const companyGroup = new THREE.Group();
directoryGroup.visible = false;
companyGroup.visible = false;
scene.add(introGroup, directoryGroup, companyGroup);

const interactiveMeshes = [];
let font;
let introMesh;
let mode = 'intro';
let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let rotationSpeed = 0.006;
let transition = null;
let hoveredMesh = null;
let keyboardIndex = -1;
let pointerStart = null;
let lastTouchTap = 0;
let pendingTouchPause = 0;

const directoryItems = [
  { text: 'rezonance', action: 'https://rezonance.carboncaste.io' },
  { text: 'company', action: 'company' },
  { text: 'support', action: 'https://rezonance.carboncaste.io/support.html' },
  { text: 'privacy', action: 'privacy.html' },
  { text: 'terms', action: 'terms.html' },
  { text: 'contact', action: 'contact.html' },
];

function makeText(text, size, action = null) {
  const geometry = new TextGeometry(text, {
    font,
    size,
    depth: 0.1,
    curveSegments: 8,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.014,
    bevelSegments: 3,
  });
  geometry.computeBoundingBox();
  const mesh = new THREE.Mesh(geometry, normalMaterial);
  mesh.userData.action = action;
  mesh.userData.baseScale = 1;
  if (action) interactiveMeshes.push(mesh);
  return mesh;
}

function centerText(mesh) {
  const box = mesh.geometry.boundingBox;
  mesh.position.x = -(box.max.x - box.min.x) / 2;
}

function buildTextWorld() {
  introMesh = makeText('We found you.', 0.62, 'enter');
  centerText(introMesh);
  introMesh.position.y = 3;
  introMesh.position.z = 2.8;
  introGroup.add(introMesh);

  directoryItems.forEach((item, index) => {
    const mesh = makeText(item.text, 0.7, item.action);
    mesh.position.set(-7.2, 3.2 - index * 1.28, 3.2);
    directoryGroup.add(mesh);
  });

  const companyLines = [
    { text: 'carbon caste inc.', size: 0.66 },
    { text: 'same substrate.', size: 0.5 },
    { text: 'shared value.', size: 0.5 },
    { text: 'tools for attention / agency', size: 0.34 },
    { text: 'guelph / ontario / canada', size: 0.34 },
    { text: '< directory', size: 0.42, action: 'directory' },
  ];
  companyLines.forEach((item, index) => {
    const mesh = makeText(item.text, item.size, item.action || null);
    mesh.position.set(-7.2, 3.2 - index * 1.2, 3.2);
    companyGroup.add(mesh);
  });

  applyResponsiveLayout();
  document.documentElement.classList.add('ascii-ready');
}

function activeLinks() {
  if (mode === 'intro') return introMesh ? [introMesh] : [];
  if (mode === 'company') return interactiveMeshes.filter((mesh) => mesh.userData.action === 'directory');
  if (mode === 'directory') return interactiveMeshes.filter((mesh) => directoryItems.some((item) => item.action === mesh.userData.action));
  return [];
}

function setHovered(mesh) {
  if (hoveredMesh === mesh) return;
  if (hoveredMesh) hoveredMesh.scale.setScalar(hoveredMesh.userData.baseScale || 1);
  hoveredMesh = mesh;
  if (hoveredMesh) hoveredMesh.scale.setScalar((hoveredMesh.userData.baseScale || 1) * 1.08);
  document.body.classList.toggle('is-link', Boolean(mesh));
}

function activate(action) {
  if (!action || transition) return;
  if (action === 'enter') {
    startTransition('enter');
    return;
  }
  if (action === 'company') {
    directoryGroup.visible = false;
    companyGroup.visible = true;
    mode = 'company';
    keyboardIndex = -1;
    setHovered(null);
    status.textContent = 'Carbon Caste Inc. Same substrate. Shared value. Press Escape to return to the directory.';
    return;
  }
  if (action === 'directory') {
    companyGroup.visible = false;
    directoryGroup.visible = true;
    mode = 'directory';
    keyboardIndex = -1;
    setHovered(null);
    status.textContent = 'Carbon Caste directory. Use Tab and Enter to choose a link. Press Escape to return to the Mobius.';
    return;
  }
  window.location.assign(action);
}

function ease(value) {
  return value < 0.5 ? 4 * value ** 3 : 1 - ((-2 * value + 2) ** 3) / 2;
}

function startTransition(kind) {
  transition = {
    kind,
    startedAt: performance.now(),
    startZoom: camera.zoom,
    startScale: mobius.scale.x,
  };
  mode = 'transition';
  controls.enabled = false;
  setHovered(null);
  status.textContent = kind === 'enter' ? 'Entering the Carbon Caste surface.' : 'Returning to the Mobius.';
}

function finishTransition(kind) {
  transition = null;
  controls.enabled = true;
  controls.target.set(0, 0, 0);
  camera.position.set(0, 0.35, 20);
  if (kind === 'enter') {
    mode = 'directory';
    status.textContent = 'Carbon Caste directory. Use Tab and Enter to choose a link. Press Escape to return to the Mobius.';
  } else {
    mode = 'intro';
    status.textContent = 'We found you. Press Enter to enter Carbon Caste.';
  }
  applyResponsiveLayout();
  controls.update();
}

function updateTransition(now) {
  if (!transition) return;
  const duration = 1800;
  const raw = Math.min(1, (now - transition.startedAt) / duration);
  const progress = ease(raw);
  const entering = transition.kind === 'enter';
  const switchPoint = 0.52;

  if (raw < switchPoint) {
    const local = ease(raw / switchPoint);
    camera.zoom = THREE.MathUtils.lerp(transition.startZoom, 6.4, local);
    mobius.scale.setScalar(THREE.MathUtils.lerp(transition.startScale, 2.65, local));
  } else {
    if (entering) {
      introGroup.visible = false;
      directoryGroup.visible = true;
    } else {
      directoryGroup.visible = false;
      companyGroup.visible = false;
      introGroup.visible = true;
    }
    const local = ease((raw - switchPoint) / (1 - switchPoint));
    const destinationZoom = 1.25;
    const destinationScale = entering ? surfaceScale() : introScale();
    camera.zoom = THREE.MathUtils.lerp(6.4, destinationZoom, local);
    mobius.scale.setScalar(THREE.MathUtils.lerp(2.65, destinationScale, local));
  }
  camera.updateProjectionMatrix();
  if (raw >= 1) finishTransition(transition.kind);
}

function isMobile() {
  return window.innerWidth < 700 || window.innerWidth / window.innerHeight < 0.8;
}

function introScale() {
  return isMobile() ? 0.68 : 1;
}

function surfaceScale() {
  return isMobile() ? 1.55 : 2.15;
}

function applyResponsiveLayout() {
  if (!font) return;
  const mobile = isMobile();
  introGroup.scale.setScalar(mobile ? 0.44 : 1);
  introGroup.position.y = mobile ? 0.55 : 0;
  directoryGroup.scale.setScalar(mobile ? 0.52 : 1);
  directoryGroup.position.set(mobile ? 1.72 : 0, mobile ? -0.05 : 0, 0);
  companyGroup.scale.setScalar(mobile ? 0.48 : 1);
  companyGroup.position.set(mobile ? 1.72 : 0, mobile ? -0.05 : 0, 0);

  if (mode === 'intro') {
    mobius.scale.setScalar(introScale());
    mobius.position.set(0, mobile ? -0.55 : -0.25, 0);
  } else if (mode !== 'transition') {
    mobius.scale.setScalar(surfaceScale());
    mobius.position.set(mobile ? 0 : 1.8, 0, 0);
  }
}

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const aspect = width / height;
  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
  effect.setSize(width * 2, height * 2);
  applyResponsiveLayout();
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function hitTest(event) {
  const rect = effect.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(activeLinks(), false)[0]?.object || null;
}

function resetView() {
  camera.position.set(0, 0.35, 20);
  camera.zoom = 1.25;
  controls.target.set(0, 0, 0);
  camera.updateProjectionMatrix();
  controls.update();
  status.textContent = 'View reset.';
}

effect.domElement.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
  document.body.classList.add('is-dragging');
});

effect.domElement.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'mouse' && !transition) setHovered(hitTest(event));
});

effect.domElement.addEventListener('pointerleave', () => setHovered(null));

effect.domElement.addEventListener('pointerup', (event) => {
  document.body.classList.remove('is-dragging');
  if (!pointerStart || transition) return;
  const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  const elapsed = performance.now() - pointerStart.time;
  pointerStart = null;
  if (distance > 9 || elapsed > 600) return;
  const mesh = hitTest(event);
  if (mesh) activate(mesh.userData.action);
  else if (event.pointerType === 'touch') {
    const now = performance.now();
    if (now - lastTouchTap < 320) {
      window.clearTimeout(pendingTouchPause);
      pendingTouchPause = 0;
      lastTouchTap = 0;
      resetView();
    } else {
      lastTouchTap = now;
      pendingTouchPause = window.setTimeout(() => {
        paused = !paused;
        pendingTouchPause = 0;
      }, 330);
    }
  } else {
    paused = !paused;
  }
});

effect.domElement.addEventListener('dblclick', (event) => {
  event.preventDefault();
  resetView();
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    paused = !paused;
    status.textContent = paused ? 'Motion paused.' : 'Motion resumed.';
  } else if (event.key === '[' || event.key === '-') {
    rotationSpeed = Math.max(0.001, rotationSpeed - 0.0015);
    status.textContent = `Motion speed ${rotationSpeed.toFixed(4)}.`;
  } else if (event.key === ']' || event.key === '=') {
    rotationSpeed = Math.min(0.03, rotationSpeed + 0.0015);
    status.textContent = `Motion speed ${rotationSpeed.toFixed(4)}.`;
  } else if (event.key === 'Escape') {
    if (mode === 'company') activate('directory');
    else if (mode === 'directory') startTransition('exit');
  } else if (event.key === 'Tab') {
    const links = activeLinks();
    if (!links.length) return;
    event.preventDefault();
    keyboardIndex = (keyboardIndex + (event.shiftKey ? -1 : 1) + links.length) % links.length;
    setHovered(links[keyboardIndex]);
    status.textContent = `Selected ${links[keyboardIndex].userData.action}. Press Enter to activate.`;
  } else if (event.key === 'Enter') {
    const links = activeLinks();
    const selected = links[keyboardIndex] || (mode === 'intro' ? introMesh : null);
    if (selected) activate(selected.userData.action);
  }
});

window.addEventListener('resize', resize, { passive: true });

const loader = new FontLoader();
loader.load(
  'fonts/helvetiker_regular.typeface.json',
  (loadedFont) => {
    font = loadedFont;
    buildTextWorld();
  },
  undefined,
  () => {
    status.textContent = 'The text signal could not be decoded. Company links remain available to assistive technology.';
  },
);

function animate(now) {
  requestAnimationFrame(animate);
  updateTransition(now);
  if (!paused) {
    mobius.rotation.x -= rotationSpeed;
    mobius.rotation.y += rotationSpeed * 0.24;
  }
  controls.update();
  effect.render(scene, camera);
}

window.__carbonPortal = {
  snapshot() {
    return {
      mode,
      paused,
      rotationSpeed,
      zoom: camera.zoom,
      mobiusRotation: [mobius.rotation.x, mobius.rotation.y, mobius.rotation.z],
      activeActions: activeLinks().map((mesh) => mesh.userData.action),
    };
  },
  targets() {
    return Object.fromEntries(activeLinks().map((mesh) => {
      mesh.geometry.computeBoundingBox();
      const center = mesh.geometry.boundingBox.getCenter(new THREE.Vector3());
      center.applyMatrix4(mesh.matrixWorld).project(camera);
      return [mesh.userData.action, {
        x: ((center.x + 1) / 2) * window.innerWidth,
        y: ((1 - center.y) / 2) * window.innerHeight,
      }];
    }));
  },
};

resize();
animate(performance.now());
