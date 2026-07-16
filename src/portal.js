import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { CspAsciiEffect } from './CspAsciiEffect.js';

const stage = document.querySelector('#ascii-stage');
const sceneHost = document.querySelector('#ascii-scene');
const surfaceSite = document.querySelector('#surface-site');
const surfaceReadout = document.querySelector('#surface-sample-readout');
const returnSignal = document.querySelector('#return-signal');
const status = document.querySelector('#scene-status');
const portalEnter = document.querySelector('#portal-enter');
const portalEnterLabel = portalEnter?.querySelector('.portal-enter-label');

if (!stage || !sceneHost || !surfaceSite || !surfaceReadout || !returnSignal || !status || !portalEnter || !portalEnterLabel) {
  throw new Error('Portal shell is incomplete.');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const frustumSize = 10;
const initialCameraPosition = new THREE.Vector3(0, 0, 20);
const initialTarget = new THREE.Vector3(0, 0, 0);
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 1000);
camera.position.copy(initialCameraPosition);
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
controls.maxZoom = 20;
controls.target.copy(initialTarget);
controls.enabled = false;

const normalMaterial = new THREE.MeshNormalMaterial({
  side: THREE.DoubleSide,
  flatShading: false,
});
const signalMaterial = new THREE.MeshBasicMaterial({
  color: 0xd8dce5,
  side: THREE.DoubleSide,
  depthTest: false,
  depthWrite: false,
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
  geometry.computeBoundingBox();
  return new THREE.Mesh(geometry, normalMaterial);
}

const mobius = createToroidalMobius();
const mobiusAxisLocal = new THREE.Vector3(1, 0, 0);
const mobiusSpinPivot = new THREE.Group();
const mobiusAxisFrame = new THREE.Group();

// The phi=0 and phi=PI ellipse centers lie on local X. Map that authored
// centerline to world Y, then rotate only around the unchanged local X axis.
mobiusAxisFrame.rotation.z = Math.PI / 2;
mobiusSpinPivot.add(mobius);
mobiusAxisFrame.add(mobiusSpinPivot);
scene.add(mobiusAxisFrame);
mobiusAxisFrame.updateMatrixWorld(true);
const initialMobiusBounds = new THREE.Box3().setFromObject(mobiusAxisFrame);
const mobiusBaseHeight = initialMobiusBounds.max.y - initialMobiusBounds.min.y;

const raycaster = new THREE.Raycaster();
let mode = 'intro';
let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let pausedBeforeDive = paused;
let rotationSpeed = 0.006;
let rotationPhase = 0;
let transition = null;
let pointerStart = null;
let lastTouchTap = 0;
let pendingTouchPause = 0;
let surfaceSample = null;
let returnTimer = 0;
let introMesh = null;
let signalTransition = null;
let signalHandoffPending = false;
let signalStartedInScene = false;
let signalHandoffCount = 0;
let signalGeometryDepth = null;

const themeClasses = [
  'surface-theme-ac-g',
  ...Array.from({ length: 12 }, (_, index) => `surface-theme-ac-${index}`),
];

const signalStartPosition = new THREE.Vector3(-0.22, 0.14, 0.35);
const signalEndPosition = new THREE.Vector3(0, 0, 0);
const signalStartQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0.38, -0.14));
const signalEndQuaternion = new THREE.Quaternion();

function revealFixedSignal() {
  if (introMesh) introMesh.visible = false;
  signalTransition = null;
  signalHandoffPending = false;
  signalHandoffCount += 1;
  controls.enabled = true;
  portalEnter.disabled = false;
  portalEnter.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-signal-ready', 'is-signal-settled');
}

function startSignalAlignment() {
  document.body.classList.remove('is-signal-ready', 'is-signal-settled');
  portalEnter.disabled = true;
  portalEnter.setAttribute('aria-hidden', 'true');
  controls.enabled = false;
  if (!introMesh) {
    revealFixedSignal();
    return;
  }
  introMesh.visible = true;
  introMesh.position.copy(signalStartPosition);
  introMesh.quaternion.copy(signalStartQuaternion);
  introMesh.scale.setScalar(0.92);
  signalStartedInScene = true;
  signalHandoffPending = false;
  signalTransition = {
    startedAt: performance.now(),
    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 1500,
  };
}

function updateSignalAlignment(now) {
  if (!signalTransition || !introMesh) return false;
  const raw = Math.min(1, (now - signalTransition.startedAt) / signalTransition.duration);
  const progress = ease(raw);
  introMesh.position.lerpVectors(signalStartPosition, signalEndPosition, progress);
  introMesh.quaternion.slerpQuaternions(signalStartQuaternion, signalEndQuaternion, progress);
  introMesh.scale.setScalar(THREE.MathUtils.lerp(0.92, 1, progress));
  return raw >= 1;
}

function ease(value) {
  return value ** 3 * (value * (value * 6 - 15) + 10);
}

function buildSignalMesh(font) {
  // Three.js 0.162 TextGeometry uses `height`; `depth` is ignored and falls
  // back to a 50-unit extrusion, which turns this phrase into a side-on slab.
  const geometry = new TextGeometry('We found you.', {
    font,
    size: 0.24,
    height: 0.03,
    curveSegments: 4,
    bevelEnabled: false,
  });
  geometry.center();
  geometry.computeBoundingBox();
  signalGeometryDepth = geometry.boundingBox.max.z - geometry.boundingBox.min.z;
  introMesh = new THREE.Mesh(geometry, signalMaterial);
  introMesh.renderOrder = 10;
  scene.add(introMesh);
}

function pickDiveTarget() {
  mobiusAxisFrame.updateMatrixWorld(true);
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(mobius.matrixWorld);
  const gridSize = 25;
  const extent = 0.92;
  const samples = [];

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const x = -extent + (column / (gridSize - 1)) * extent * 2;
      const y = extent - (row / (gridSize - 1)) * extent * 2;
      const screenPoint = new THREE.Vector2(x, y);
      raycaster.setFromCamera(screenPoint, camera);
      samples.push({
        row,
        column,
        screenPoint,
        hit: raycaster.intersectObject(mobius, false)[0] || null,
      });
    }
  }

  const misses = samples.filter((sample) => !sample.hit);
  let best = null;

  for (const sample of samples) {
    if (!sample.hit) continue;
    const edgeMargin = Math.min(
      sample.row + 1,
      sample.column + 1,
      gridSize - sample.row,
      gridSize - sample.column,
    );
    let marginSquared = edgeMargin ** 2;

    for (const miss of misses) {
      const rowDistance = sample.row - miss.row;
      const columnDistance = sample.column - miss.column;
      marginSquared = Math.min(marginSquared, rowDistance ** 2 + columnDistance ** 2);
    }

    const centerPenalty = (sample.screenPoint.x ** 2 + sample.screenPoint.y ** 2) * 0.08;
    const score = marginSquared - centerPenalty;
    if (!best || score > best.score) {
      const normal = sample.hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      const towardCamera = camera.position.clone().sub(sample.hit.point);
      if (normal.dot(towardCamera) < 0) normal.negate();
      best = { score, point: sample.hit.point.clone(), normal };
    }
  }

  if (best) return best;
  return {
    point: new THREE.Vector3(1.8, -0.25, 0),
    normal: camera.position.clone().sub(controls.target).normalize(),
  };
}

function startDive() {
  if (mode !== 'intro' || transition || signalTransition || !document.body.classList.contains('is-signal-settled')) return;
  pausedBeforeDive = paused;
  paused = true;
  const dive = pickDiveTarget();
  const startCamera = camera.position.clone();
  const startTarget = controls.target.clone();
  const startQuaternion = camera.quaternion.clone();
  const cameraDistance = Math.max(8, startCamera.distanceTo(startTarget));
  const destinationCamera = dive.point.clone().addScaledVector(dive.normal, cameraDistance);
  const travelDistance = startCamera.distanceTo(destinationCamera);
  const startForward = startTarget.clone().sub(startCamera).normalize();
  const approachLength = Math.min(4.5, Math.max(1.2, travelDistance * 0.28));
  const cameraCurve = new THREE.CubicBezierCurve3(
    startCamera,
    startCamera.clone().addScaledVector(startForward, approachLength),
    destinationCamera.clone().addScaledVector(dive.normal, approachLength),
    destinationCamera,
  );
  const destinationUp = Math.abs(dive.normal.dot(camera.up)) > 0.92
    ? new THREE.Vector3(0, 0, 1)
    : camera.up.clone();
  const destinationRotation = new THREE.Matrix4().lookAt(destinationCamera, dive.point, destinationUp);
  const destinationQuaternion = new THREE.Quaternion().setFromRotationMatrix(destinationRotation);
  const targetZoom = Math.min(42, Math.max(isMobile() ? 18 : 15, camera.zoom * 1.8));
  const zoomTravel = Math.abs(Math.log2(targetZoom / Math.max(0.01, camera.zoom)));
  transition = {
    startedAt: performance.now(),
    duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 900
      : THREE.MathUtils.clamp(3100 + zoomTravel * 260 + travelDistance * 28, 3400, 4800),
    startTarget,
    startZoom: camera.zoom,
    targetZoom,
    diveTarget: dive.point,
    cameraCurve,
    startQuaternion,
    destinationQuaternion,
  };
  mode = 'transition';
  controls.enabled = false;
  portalEnter.disabled = true;
  portalEnter.setAttribute('aria-hidden', 'true');
  document.body.classList.add('is-transitioning');
  status.textContent = 'Entering the Carbon Caste surface.';
}

function updateTransition(now) {
  if (!transition) return false;
  const raw = Math.min(1, (now - transition.startedAt) / transition.duration);
  const progress = ease(raw);
  camera.position.copy(transition.cameraCurve.getPoint(progress));
  camera.quaternion.slerpQuaternions(
    transition.startQuaternion,
    transition.destinationQuaternion,
    progress,
  );
  controls.target.lerpVectors(transition.startTarget, transition.diveTarget, progress);
  camera.zoom = transition.startZoom * ((transition.targetZoom / transition.startZoom) ** progress);
  camera.updateProjectionMatrix();
  return raw >= 1;
}

function applySurfaceTheme(sample) {
  const safeClass = sample.className === 'ac-g' || /^ac-(?:[0-9]|1[01])$/.test(sample.className)
    ? sample.className
    : 'ac-6';
  document.body.classList.remove(...themeClasses);
  document.body.classList.add(`surface-theme-${safeClass}`);
  surfaceReadout.textContent = `${sample.character} / ${safeClass.toUpperCase()}`;
}

function finishDive() {
  surfaceSample = effect.sampleAt(0.5, 0.5);
  applySurfaceTheme(surfaceSample);
  surfaceSite.hidden = false;
  surfaceSite.setAttribute('aria-hidden', 'false');
  stage.setAttribute('aria-hidden', 'true');
  transition = null;
  mode = 'site';
  document.body.classList.remove('is-transitioning');
  window.scrollTo(0, 0);
  requestAnimationFrame(() => document.body.classList.add('is-surface-site'));
  status.textContent = `Surface held at ${surfaceSample.character}, ${surfaceSample.className}. Corporate site ready.`;
}

function restoreIntro() {
  if (mode !== 'site') return;
  window.clearTimeout(returnTimer);
  document.body.classList.remove('is-surface-site');
  surfaceSite.setAttribute('aria-hidden', 'true');
  status.textContent = 'Returning to the Mobius.';
  mode = 'returning';
  returnTimer = window.setTimeout(() => {
    surfaceSite.hidden = true;
    stage.setAttribute('aria-hidden', 'false');
    document.body.classList.remove(...themeClasses);
    camera.position.copy(initialCameraPosition);
    camera.zoom = 1.25;
    controls.target.copy(initialTarget);
    controls.enabled = true;
    mobiusSpinPivot.rotation.set(0, 0, 0);
    rotationPhase = 0;
    paused = pausedBeforeDive;
    surfaceSample = null;
    mode = 'intro';
    applyResponsiveLayout();
    camera.updateProjectionMatrix();
    controls.update();
    window.scrollTo(0, 0);
    startSignalAlignment();
    status.textContent = 'We found you. Press Enter to enter Carbon Caste.';
  }, 460);
}

function isMobile() {
  return window.innerWidth < 700 || window.innerWidth / window.innerHeight < 0.8;
}

function introScale() {
  const baseViewHeight = frustumSize / 1.25;
  return (baseViewHeight / mobiusBaseHeight) * 1.1;
}

function applyResponsiveLayout() {
  if (mode === 'transition') return;
  mobiusAxisFrame.scale.setScalar(introScale());
  mobiusAxisFrame.position.set(0, 0, 0);
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

function resetView() {
  if (mode !== 'intro') return;
  camera.position.copy(initialCameraPosition);
  camera.zoom = 1.25;
  controls.target.copy(initialTarget);
  camera.updateProjectionMatrix();
  controls.update();
  status.textContent = 'View reset.';
}

effect.domElement.addEventListener('pointerdown', (event) => {
  if (mode !== 'intro') return;
  pointerStart = { x: event.clientX, y: event.clientY, time: performance.now() };
  document.body.classList.add('is-dragging');
});

effect.domElement.addEventListener('pointerup', (event) => {
  document.body.classList.remove('is-dragging');
  if (!pointerStart || mode !== 'intro') return;
  const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  const elapsed = performance.now() - pointerStart.time;
  pointerStart = null;
  if (distance > 9 || elapsed > 600) return;
  if (event.pointerType === 'touch') {
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

portalEnter.addEventListener('click', startDive);
returnSignal.addEventListener('click', restoreIntro);

window.addEventListener('keydown', (event) => {
  if (mode === 'site' && event.key === 'Escape') {
    restoreIntro();
    return;
  }
  if (mode !== 'intro') return;

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
  } else if (event.key === 'Enter') {
    startDive();
  }
});

window.addEventListener('resize', resize, { passive: true });

const loader = new FontLoader();
loader.load(
  'fonts/helvetiker_regular.typeface.json',
  (font) => {
    buildSignalMesh(font);
    document.documentElement.classList.add('ascii-ready');
    startSignalAlignment();
  },
  undefined,
  () => {
    document.documentElement.classList.add('ascii-ready');
    revealFixedSignal();
    status.textContent = 'The dimensional signal could not be decoded. The fixed entrance remains available.';
  },
);

function animate(now) {
  requestAnimationFrame(animate);
  if (mode === 'site' || mode === 'returning') return;

  const handoffNow = signalHandoffPending;
  if (handoffNow && introMesh) introMesh.visible = false;
  const signalComplete = handoffNow ? false : updateSignalAlignment(now);
  const diveComplete = updateTransition(now);
  if (!paused && mode === 'intro') {
    rotationPhase += rotationSpeed;
    mobiusSpinPivot.rotation.x = rotationPhase;
  }
  if (mode === 'intro') controls.update();
  effect.render(scene, camera);
  if (handoffNow) revealFixedSignal();
  else if (signalComplete) signalHandoffPending = true;
  if (diveComplete) finishDive();
}

window.__carbonPortal = {
  snapshot() {
    return {
      mode,
      paused,
      rotationSpeed,
      zoom: camera.zoom,
      mobiusRotation: [mobiusSpinPivot.rotation.x, mobiusSpinPivot.rotation.y, mobiusSpinPivot.rotation.z],
      mobiusGeometryRotation: [mobius.rotation.x, mobius.rotation.y, mobius.rotation.z],
      spinAxisLocal: [mobiusAxisLocal.x, mobiusAxisLocal.y, mobiusAxisLocal.z],
      spinAxisWorld: mobiusAxisLocal.clone().applyQuaternion(mobiusAxisFrame.quaternion).toArray(),
      axisFrameRotation: [mobiusAxisFrame.rotation.x, mobiusAxisFrame.rotation.y, mobiusAxisFrame.rotation.z],
      mobiusScale: mobiusAxisFrame.scale.x,
      mobiusBaseHeight,
      mobiusPosition: [mobiusAxisFrame.position.x, mobiusAxisFrame.position.y, mobiusAxisFrame.position.z],
      cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
      transitionDuration: transition?.duration || null,
      signalSettled: document.body.classList.contains('is-signal-settled'),
      signalStartedInScene,
      signalMeshVisible: Boolean(introMesh?.visible),
      signalHandoffCount,
      signalGeometryDepth,
      textMode: signalTransition ? 'ascii-3d-aligning' : 'viewport-fixed',
      activeActions: mode === 'intro' && !portalEnter.disabled ? ['enter'] : [],
      surface: surfaceSample ? {
        character: surfaceSample.character,
        className: surfaceSample.className,
        brightness: surfaceSample.brightness,
      } : null,
    };
  },
  targets() {
    if (mode !== 'intro' || portalEnter.disabled) return {};
    const rect = portalEnter.getBoundingClientRect();
    return {
      enter: {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      },
    };
  },
};

resize();
effect.render(scene, camera);
animate(performance.now());
