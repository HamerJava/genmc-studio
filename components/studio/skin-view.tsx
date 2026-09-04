'use client';
import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { atlas, dimensions, parts, regionAt, type Part } from '@/lib/skin/atlas';
import { pixelCanvas, type Skin, type View } from '@/lib/skin/engine';
import {
  drawAgentFrame,
  visualDuration,
  agentScanPeriod,
  type AgentVisual,
} from '@/lib/skin/agent-visual';
import type { Selection } from '@/lib/skin/workspace';

type Props = {
  skin: Skin;
  agentVisual?: AgentVisual;
  view: View;
  paint?: boolean;
  markMethod?: string;
  grid?: boolean;
  mask?: number[];
  selected?: Selection;
  onPixel?: (x: number, y: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
};
type Runtime = {
  texture: T.CanvasTexture;
  hints: T.CanvasTexture;
  effect: T.CanvasTexture;
  root: T.Group;
  meshes: T.Mesh[];
  render: () => void;
  controls: OrbitControls;
  view: View;
};
function clear(root: T.Group) {
  for (const child of [...root.children]) {
    child.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.geometry.dispose();
        (o.material as T.Material).dispose();
      }
    });
    root.remove(child);
  }
}
function pose(part: Part, v: View, phase: number) {
  const arm = part.includes('arm'),
    leg = part.includes('leg'),
    left = part.startsWith('left');
  let x = 0,
    y = 0,
    z = 0;
  const swing = v.animated ? Math.sin(phase * 3) : 1;
  if (v.pose === 'walk') {
    if (arm) x = (left ? -1 : 1) * 0.65 * swing;
    if (leg) x = (left ? 1 : -1) * 0.65 * swing;
  }
  if (v.animated && part === 'head') y = Math.sin(phase * 1.2) * 0.08;
  if (v.animated && v.pose === 'stand' && arm)
    z = (left ? 1 : -1) * (0.04 + Math.sin(phase * 1.4) * 0.025);
  return [x, y, z] as const;
}
export default function SkinView(props: Props) {
  const { skin, view, grid = false, mask = [], selected } = props;
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const state = useRef<Runtime | null>(null);
  const scan = useRef({ height: { value: 36 }, reduced: { value: false } });
  const down = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [hoverPixel, setHoverPixel] = useState<number | null>(null);
  useEffect(() => {
    const el = host.current!;
    let disposed = false;
    const scene = new T.Scene();
    scene.add(new T.AmbientLight(0xffffff, 2.2));
    const light = new T.DirectionalLight(0xffffff, 1.5);
    light.position.set(-20, 50, 45);
    scene.add(light);
    const root = new T.Group();
    scene.add(root);
    const camera = new T.PerspectiveCamera(32, 1, 0.1, 1000);
    const renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = T.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 15, 0);
    controls.enablePan = false;
    controls.minDistance = 38;
    controls.maxDistance = 260;
    const texture = new T.CanvasTexture(pixelCanvas(skin.pixels));
    texture.magFilter = texture.minFilter = T.NearestFilter;
    texture.colorSpace = T.SRGBColorSpace;
    const hc = document.createElement('canvas');
    hc.width = hc.height = 768;
    const hints = new T.CanvasTexture(hc);
    hints.magFilter = hints.minFilter = T.NearestFilter;
    hints.colorSpace = T.SRGBColorSpace;
    const effectCanvas = document.createElement('canvas');
    effectCanvas.width = effectCanvas.height = 64;
    const effect = new T.CanvasTexture(effectCanvas);
    effect.magFilter = effect.minFilter = T.NearestFilter;
    effect.colorSpace = T.SRGBColorSpace;
    let hoverPointer: Pick<PointerEvent, 'clientX' | 'clientY'> | null = null;
    let hovering = false;
    let refreshHover = () => {};
    const render = () => {
      if (!disposed) {
        renderer.render(scene, camera);
        refreshHover();
      }
    };
    state.current = {
      texture,
      hints,
      effect,
      root,
      meshes: [],
      render,
      controls,
      view,
    };
    controls.addEventListener('change', render);
    const resize = () => {
      const { width, height } = el.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.position.copy(
        new T.Vector3(0.48, 0.22, 0.85)
          .normalize()
          .multiplyScalar(Math.max(78, 43 / camera.aspect))
          .add(controls.target),
      );
      camera.updateProjectionMatrix();
      controls.update();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let raf = 0,
      last = performance.now(),
      phase = 0;
    const tick = (time: number) => {
      const s = state.current;
      if (!s) return;
      const dt = Math.min((time - last) / 1000, 0.05);
      last = time;
      if (
        s.view.animated &&
        !down.current &&
        document.visibilityState !== 'hidden'
      ) {
        phase += dt;
        for (const p of s.root.children)
          p.rotation.set(...pose(p.userData.part, s.view, phase));
        render();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const pick = (e: Pick<PointerEvent, 'clientX' | 'clientY'>) => {
      const s = state.current;
      if (!s) return;
      const rect = renderer.domElement.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX >= rect.right ||
        e.clientY < rect.top ||
        e.clientY >= rect.bottom
      )
        return;
      const ray = new T.Raycaster();
      ray.setFromCamera(
        new T.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      return ray
        .intersectObjects(s.meshes, false)
        .find(
          (h) =>
            h.object.visible &&
            h.object.userData.layer === (latest.current.view.partLayers?.[h.object.userData.part as Part] ?? latest.current.view.layer),
        );
    };
    refreshHover = () => {
      const hit = hoverPointer ? pick(hoverPointer) : undefined;
      const next = !!hit;
      const index = hit?.uv ? Math.min(63, Math.floor((1 - hit.uv.y) * 64)) * 64 + Math.min(63, Math.floor(hit.uv.x * 64)) : null;
      setHoverPixel(previous => previous === index ? previous : index);
      if (next !== hovering) {
        hovering = next;
        setHovered(next);
      }
    };
    const trackHover = (e: PointerEvent) => {
      hoverPointer = { clientX: e.clientX, clientY: e.clientY };
      refreshHover();
    };
    const leave = () => {
      hoverPointer = null;
      refreshHover();
    };
    const paintAt = (hit: ReturnType<typeof pick>) => {
      if (hit?.uv)
        latest.current.onPixel?.(
          Math.min(63, Math.max(0, Math.floor(hit.uv.x * 64))),
          Math.min(63, Math.max(0, Math.floor((1 - hit.uv.y) * 64))),
        );
    };
    let activePointer: number | null = null;
    let painting = false;
    const start = (e: PointerEvent) => {
      if (e.button !== 0 || activePointer !== null) return;
      trackHover(e);
      const hit = latest.current.paint ? pick(e) : undefined;
      activePointer = e.pointerId;
      down.current = true;
      // Lock the gesture at its starting point before OrbitControls sees it.
      // Crossing the model during an outside drag must never start a stroke.
      painting = !!hit;
      controls.enabled = !painting;
      if (painting) {
        latest.current.onStart?.();
        renderer.domElement.setPointerCapture(e.pointerId);
        paintAt(hit);
      }
    };
    const move = (e: PointerEvent) => {
      trackHover(e);
      if (painting && e.pointerId === activePointer) paintAt(pick(e));
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== activePointer) return;
      if (painting) latest.current.onEnd?.();
      activePointer = null;
      painting = false;
      down.current = false;
      controls.enabled = true;
      if (e.pointerType === 'touch' || e.type !== 'pointerup') leave();
      else trackHover(e);
    };
    renderer.domElement.addEventListener('pointerdown', start, true);
    renderer.domElement.addEventListener('pointermove', move);
    renderer.domElement.addEventListener('pointerenter', trackHover);
    renderer.domElement.addEventListener('pointerleave', leave);
    renderer.domElement.addEventListener('pointerup', end);
    renderer.domElement.addEventListener('pointercancel', end);
    renderer.domElement.addEventListener('lostpointercapture', end);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', start, true);
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerenter', trackHover);
      renderer.domElement.removeEventListener('pointerleave', leave);
      renderer.domElement.removeEventListener('pointerup', end);
      renderer.domElement.removeEventListener('pointercancel', end);
      renderer.domElement.removeEventListener('lostpointercapture', end);
      down.current = false;
      controls.dispose();
      clear(root);
      texture.dispose();
      hints.dispose();
      effect.dispose();
      renderer.dispose();
      el.replaceChildren();
      state.current = null;
    };
  }, []);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    let raf = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const texture = pixelCanvas(skin.pixels);
    s.texture.image = texture;
    const frame = () => {
      cancelAnimationFrame(raf);
      const visual = props.agentVisual;
      scan.current.height.value = 36 - (((performance.now() - (visual?.startedAt ?? 0)) / agentScanPeriod) % 1) * 40;
      scan.current.reduced.value = reduced.matches;
      const done =
        !visual ||
        (['done', 'error'].includes(visual.phase) &&
          performance.now() - visual.startedAt >= visualDuration);
      drawAgentFrame(
        texture,
        s.effect.image,
        skin,
        done ? undefined : visual,
        performance.now(),
        reduced.matches,
        true,
      );
      s.texture.needsUpdate = s.effect.needsUpdate = true;
      s.render();
      if (!done && !reduced.matches) raf = requestAnimationFrame(frame);
    };
    frame();
    reduced.addEventListener('change', frame);
    return () => {
      cancelAnimationFrame(raf);
      reduced.removeEventListener('change', frame);
    };
  }, [skin.pixels, skin.revision, props.agentVisual]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    s.view = view;
    clear(s.root);
    s.meshes = [];
    const regs = atlas(skin.model);
    for (const part of parts) {
      const [w, h, d] = dimensions(part, skin.model);
      const pivot = new T.Group();
      pivot.userData.part = part;
      const arm = part.includes('arm'),
        left = part.startsWith('left');
      pivot.position.set(
        part === 'head' || part === 'body'
          ? 0
          : (left ? 1 : -1) * (arm ? 4 + w / 2 : 2),
        part === 'head' || part === 'body' || arm ? 24 : 12,
        0,
      );
      pivot.rotation.set(...pose(part, view, 0));
      for (const layer of ['base', 'overlay'] as const) {
        const e = layer === 'overlay' ? (part === 'head' ? 0.5 : 0.25) : 0;
        const g = new T.BoxGeometry(w + e * 2, h + e * 2, d + e * 2);
        const uv = g.attributes.uv;
        ['left', 'right', 'top', 'bottom', 'front', 'back'].forEach(
          (face, f) => {
            const r = regs.find(
              (r) => r.part === part && r.layer === layer && r.face === face,
            )!;
            [
              [r.x, r.y],
              [r.x + r.width, r.y],
              [r.x, r.y + r.height],
              [r.x + r.width, r.y + r.height],
            ].forEach(([x, y], j) => uv.setXY(f * 4 + j, x / 64, 1 - y / 64));
          },
        );
        const material = new T.MeshLambertMaterial({
          map: s.texture,
          transparent: layer === 'overlay',
          alphaTest: layer === 'base' ? 0 : 0.01,
        });
        const mesh = new T.Mesh(g, material);
        mesh.position.y = part === 'head' ? h / 2 : -h / 2;
        mesh.visible =
          view.visible[part] &&
          (layer === 'base' ? view.showBase : view.showOverlay) &&
          view.partLayers?.[part] !== 'hidden' &&
          (layer === 'base' || (view.partLayers?.[part] ?? view.layer) === 'overlay');
        mesh.userData = { part, layer };
        pivot.add(mesh);
        s.meshes.push(mesh);
        const hint = new T.Mesh(
          g.clone(),
          new T.MeshBasicMaterial({
            map: s.hints,
            transparent: true,
            depthWrite: false,
            alphaTest: 0.01,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
          }),
        );
        hint.position.copy(mesh.position);
        hint.scale.set(
          (w + 2 * e + 0.025) / (w + 2 * e),
          (h + 2 * e + 0.025) / (h + 2 * e),
          (d + 2 * e + 0.025) / (d + 2 * e),
        );
        hint.visible = mesh.visible;
        hint.renderOrder = 2;
        pivot.add(hint);
        const effectMesh = new T.Mesh(
          g.clone(),
          new T.MeshBasicMaterial({
            map: s.effect,
            transparent: true,
            depthWrite: false,
            blending: T.AdditiveBlending,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
          }),
        );
        effectMesh.position.copy(mesh.position);
        // One world-space wave for the entire posed character, not one per UV island.
        effectMesh.material.onBeforeCompile = shader => {
          shader.uniforms.scanHeight = scan.current.height;
          shader.uniforms.scanReduced = scan.current.reduced;
          shader.vertexShader = 'varying float skinWorldY;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nskinWorldY = (modelMatrix * vec4(position, 1.0)).y;');
          shader.fragmentShader = 'varying float skinWorldY;\nuniform float scanHeight;\nuniform bool scanReduced;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>', `
            vec2 texel = floor(vMapUv * 64.0);
            vec2 uvDx = dFdx(vMapUv), uvDy = dFdy(vMapUv);
            float determinant = uvDx.x * uvDy.y - uvDx.y * uvDy.x;
            vec2 heightGradient = vec2(0.0);
            if (abs(determinant) > 0.000000000001) {
              heightGradient = vec2(
                dFdx(skinWorldY) * uvDy.y - dFdy(skinWorldY) * uvDx.y,
                dFdy(skinWorldY) * uvDx.x - dFdx(skinWorldY) * uvDy.x
              ) / determinant;
            }
            float pixelHeight = skinWorldY + dot(heightGradient, (texel + 0.5) / 64.0 - vMapUv);
            float noise = fract(sin(dot(texel, vec2(12.9898, 78.233))) * 43758.5453);
            float offset = (noise - 0.5) * 2.8;
            float brightness = 0.45 + noise * 0.55;
            float wave = max(0.0, 1.0 - abs(pixelHeight + offset - scanHeight) / 2.5);
            gl_FragColor.a *= scanReduced ? 0.22 : wave * brightness;
            #include <dithering_fragment>
          `);
        };
        effectMesh.scale.copy(hint.scale).multiplyScalar(1.002);
        effectMesh.visible = mesh.visible;
        effectMesh.renderOrder = 3;
        pivot.add(effectMesh);
      }
      s.root.add(pivot);
    }
    s.render();
  }, [skin.model, view]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const c = s.hints.image as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, 768, 768);
    const regs = atlas(skin.model);
    if (grid && hovered) {
      for (const r of regs.filter((r) => view.visible[r.part] && r.layer === (view.partLayers?.[r.part] ?? view.layer))) {
        ctx.strokeStyle =
          view.layer === 'overlay'
            ? 'rgba(150,150,150,.30)'
            : 'rgba(125,125,125,.23)';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        for (let x = 0; x <= r.width; x++) {
          ctx.moveTo((r.x + x) * 12 + 0.5, r.y * 12);
          ctx.lineTo((r.x + x) * 12 + 0.5, (r.y + r.height) * 12);
        }
        for (let y = 0; y <= r.height; y++) {
          ctx.moveTo(r.x * 12, (r.y + y) * 12 + 0.5);
          ctx.lineTo((r.x + r.width) * 12, (r.y + y) * 12 + 0.5);
        }
        ctx.stroke();
      }
    }
    if (props.markMethod && hoverPixel !== null && !down.current) {
      const x = hoverPixel % 64, y = Math.floor(hoverPixel / 64);
      const r = regionAt(skin.model, x, y);
      const q = props.markMethod === 'face' && r ? r : { x, y, width: 1, height: 1 };
      ctx.fillStyle = 'rgba(125,211,252,.22)';
      ctx.fillRect(q.x * 12, q.y * 12, q.width * 12, q.height * 12);
      ctx.strokeStyle = 'rgba(125,211,252,.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(q.x * 12 + .5, q.y * 12 + .5, q.width * 12 - 1, q.height * 12 - 1);
    }
    if (selected) {
      ctx.fillStyle = 'rgba(125,211,252,.65)';
      ctx.fillRect(
        selected.x * 12,
        selected.y * 12,
        selected.width * 12,
        selected.height * 12,
      );
      ctx.strokeStyle = 'rgba(125,211,252,.85)';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        selected.x * 12 + 1,
        selected.y * 12 + 1,
        selected.width * 12 - 2,
        selected.height * 12 - 2,
      );
    }
    ctx.fillStyle = 'rgba(125,211,252,.65)';
    for (const i of mask)
      ctx.fillRect((i % 64) * 12, Math.floor(i / 64) * 12, 12, 12);
    s.hints.needsUpdate = true;
    s.render();
  }, [skin.model, view, grid, hovered, hoverPixel, props.markMethod, mask, selected]);
  return (
    <div
      ref={host}
      className="skin-view"
      data-layer={view.layer}
      data-animated={!!view.animated}
      aria-label={`3D skin preview, ${view.pose} pose${view.animated ? ', animated' : ''}`}
    />
  );
}
