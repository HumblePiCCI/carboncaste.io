import * as THREE from './3jsReqs/three.module.js';
import { ParametricGeometry } from './3jsReqs/ParametricGeometry.js';
import { AsciiEffect } from './3jsReqs/AsciiEffect.js';

const host = document.querySelector('#ascii-scene');

if (host) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 100);
  camera.position.z = 3.4;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const effect = new AsciiEffect(renderer, ' .,:;=+*#%@', { invert: true });
  effect.domElement.id = 'ascii';
  effect.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(effect.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.32));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
  keyLight.position.set(1.8, 2.4, 3);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xc9ff45, 0.65);
  rimLight.position.set(-2, -1, -1);
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

  const geometry = new ParametricGeometry(mobius, 74, 28);
  const material = new THREE.MeshPhongMaterial({
    color: 0xf4f4ee,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const strip = new THREE.Mesh(geometry, material);
  strip.rotation.set(-0.35, 0.15, -0.2);
  scene.add(strip);

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let frameId = 0;
  let visible = true;

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    const renderWidth = Math.max(1, Math.round(width));
    const renderHeight = Math.max(1, Math.round(height));
    renderer.setSize(renderWidth, renderHeight, false);
    effect.setSize(Math.ceil(renderWidth / 2), Math.ceil(renderHeight / 2));
    camera.aspect = renderWidth / renderHeight;
    camera.position.z = renderWidth < 760 ? 4.2 : 3.4;
    camera.updateProjectionMatrix();
  }

  function render() {
    if (!reduceMotion.matches) {
      strip.rotation.x += 0.0007;
      strip.rotation.y += 0.0016;
      strip.rotation.z += 0.0004;
    }
    effect.render(scene, camera);
    frameId = visible ? requestAnimationFrame(render) : 0;
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !frameId) render();
  });
  observer.observe(host);

  window.addEventListener('resize', resize, { passive: true });
  reduceMotion.addEventListener('change', () => {
    if (visible && !frameId) render();
  });

  resize();
  render();
}
