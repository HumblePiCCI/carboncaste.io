import * as THREE from './3jsReqs/three.module.js';
import { ParametricGeometry } from './3jsReqs/ParametricGeometry.js';
import { AsciiEffect } from './3jsReqs/AsciiEffect.js';

const host = document.querySelector('#ascii-scene');

if (host) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(54, 1, 0.1, 100);
  camera.position.z = 3.05;

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x050505, 1);

  const effect = new AsciiEffect(renderer, ' .:-=+*#%@', {
    invert: true,
    resolution: 0.13,
  });
  effect.domElement.id = 'ascii';
  effect.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(effect.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.25));

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
  keyLight.position.set(2.4, 3.2, 4.2);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc8ff3d, 0.7);
  fillLight.position.set(-3.4, -1.5, 1.2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x76e6dc, 0.55);
  rimLight.position.set(1.2, -2.8, -2.4);
  scene.add(rimLight);

  function mobius(u, t, target) {
    const angle = u * Math.PI * 2;
    const width = t * 2 - 1;
    target.set(
      (1 + (width / 2) * Math.cos(angle / 2)) * Math.cos(angle),
      (1 + (width / 2) * Math.cos(angle / 2)) * Math.sin(angle),
      (width / 2) * Math.sin(angle / 2),
    );
  }

  const geometry = new ParametricGeometry(mobius, 96, 36);
  const material = new THREE.MeshPhongMaterial({
    color: 0xf1f1e8,
    emissive: 0x080a05,
    shininess: 48,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const strip = new THREE.Mesh(geometry, material);
  strip.rotation.set(-0.46, 0.2, -0.16);
  strip.scale.setScalar(1.16);
  scene.add(strip);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = { x: 0, y: 0 };
  let frameId = 0;
  let firstFrame = true;
  let visible = true;

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    const renderWidth = Math.max(1, Math.round(width));
    const renderHeight = Math.max(1, Math.round(height));
    effect.setSize(renderWidth, renderHeight);
    camera.aspect = renderWidth / renderHeight;
    camera.position.z = renderWidth < 820 ? 3.75 : 3.05;
    strip.scale.setScalar(renderWidth < 820 ? 1 : 1.16);
    camera.updateProjectionMatrix();
  }

  function draw() {
    if (!reduceMotion.matches) {
      strip.rotation.x += 0.00055 + (pointer.y - strip.rotation.x * 0.04) * 0.00008;
      strip.rotation.y += 0.00135 + pointer.x * 0.00012;
      strip.rotation.z += 0.00034;
    }

    effect.render(scene, camera);

    if (firstFrame) {
      firstFrame = false;
      document.documentElement.classList.add('ascii-ready');
    }

    frameId = visible && !reduceMotion.matches ? requestAnimationFrame(draw) : 0;
  }

  function requestDraw() {
    if (!frameId && visible) draw();
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && !document.hidden;
    if (visible) requestDraw();
    if (!visible && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  });
  observer.observe(host);

  const resizeObserver = new ResizeObserver(() => {
    resize();
    requestDraw();
  });
  resizeObserver.observe(host);

  window.addEventListener('pointermove', (event) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    visible = !document.hidden && host.getBoundingClientRect().bottom > 0;
    if (visible) requestDraw();
  });

  reduceMotion.addEventListener('change', requestDraw);
  resize();
  draw();
}
