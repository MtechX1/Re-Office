import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  OctahedronGeometry,
  OrthographicCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
  CapsuleGeometry,
  type BufferGeometry as Geo,
} from "three";
import type { FloorId } from "@/lib/office/allowlist";
import type { DeskActivity } from "@/lib/office/activity";
import type { OccupantId } from "@/lib/office/assignments";
import { figureForOccupant, type FigureSpec } from "@/lib/office/figures";
import { bounceOffset, bubbleLift, motionForDesk, type MotionSpec } from "@/lib/office/motion";
import {
  STACK_PITCH,
  deskPoints,
  floorBaseY,
  stackedFloors,
  type FloorProp,
  type StackedFloor,
} from "@/lib/office/scene-layout";
import type { SlotId } from "@/lib/office/definitions";
import type { IsoHooks } from "@/components/office/iso-types";

const FLOOR_W = 12;
const FLOOR_D = 2.7;
const SLAB_H = 0.14;
const ROOM_H = STACK_PITCH - SLAB_H - 0.06;
const PAD_R = 0.7;
const BOT_H = 0.5;
const VIEW = 19.5;
const OFFSET = new Vector3(24, 24, 24);
const FLOOR_STACK = stackedFloors();
const NIGHT_LAMP = new Color("#ffd27a");

const FLOOR_TINT: Record<FloorId, string> = {
  hq: "#f3f0e8",
  leads: "#e3edf6",
  listings: "#e5f0e6",
  marketing: "#f6e6ee",
  transactions: "#f6f0e3",
  research: "#e4eef3",
  media: "#f3ebdf",
};

interface Spark {
  mesh: Mesh;
  life: number;
  vel: Vector3;
}

interface Desk {
  slotId: SlotId;
  group: Group;
  root: Group;
  figure: Group | null;
  eyes: Mesh | null;
  eyeBaseY: number;
  bubble: Mesh;
  bubbleY: number;
  glow: Mesh;
  screen: Mesh;
  sparks: Spark[];
  anchor: Object3D;
  occupantId: OccupantId | null;
  blinkAt: number;
  blinkUntil: number;
}

export function mountIsoOffice(canvas: HTMLCanvasElement, hooks: IsoHooks): () => void {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch {
    hooks.onContext(false);
    return () => undefined;
  }
  if (!renderer.getContext()) {
    hooks.onContext(false);
    renderer.dispose();
    return () => undefined;
  }
  hooks.onContext(true);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.setPixelRatio(pixelRatio());

  const scene = new Scene();
  const sky = new Color("#e4f0e2");
  scene.background = sky;
  const camera = new OrthographicCamera(-VIEW / 2, VIEW / 2, VIEW / 2, -VIEW / 2, 0.1, 400);
  const bin = {
    geos: [] as BufferGeometry[],
    mats: [] as Material[],
    textures: [] as CanvasTexture[],
  };
  const daySky = new Color("#e4f0e2");
  const nightSky = new Color("#1b2633");
  const dayLawn = new Color("#d5e6c8");
  const nightLawn = new Color("#24352c");
  const dayKey = new Color("#fffaf2");
  const nightKey = new Color("#ffd2a8");
  const dimColor = new Color("#b7b4ac");

  function sharedGeo<T extends Geo>(geometry: T): T {
    bin.geos.push(geometry);
    return geometry;
  }
  function sharedLambert(hex: string, transparent = false, opacity = 1): MeshLambertMaterial {
    const mat = new MeshLambertMaterial({ color: hex, transparent, opacity });
    if (transparent) mat.depthWrite = false;
    mat.userData.base = new Color(hex);
    bin.mats.push(mat);
    return mat;
  }
  function sharedBasic(hex: string, transparent = false, opacity = 1): MeshBasicMaterial {
    const mat = new MeshBasicMaterial({ color: hex, transparent, opacity, side: DoubleSide });
    if (transparent) mat.depthWrite = false;
    bin.mats.push(mat);
    return mat;
  }
  function localLambert(hex: string): MeshBasicMaterial {
    const base = new Color(hex).lerp(new Color("#ffffff"), 0.2);
    const mat = new MeshBasicMaterial({ color: base.clone() });
    mat.userData.base = base.clone();
    mat.userData.local = true;
    return mat;
  }
  function markLocal(geometry: BufferGeometry): BufferGeometry {
    geometry.userData.local = true;
    return geometry;
  }
  function canvasTexture(source: HTMLCanvasElement): CanvasTexture {
    const tex = new CanvasTexture(source);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;
    bin.textures.push(tex);
    return tex;
  }
  function put(
    parent: Object3D,
    geometry: BufferGeometry,
    material: Material,
    x: number,
    y: number,
    z: number,
  ): Mesh {
    const item = new Mesh(geometry, material);
    item.position.set(x, y, z);
    parent.add(item);
    return item;
  }

  const eyeMat = sharedBasic("#ffffff", true, 1);
  eyeMat.map = canvasTexture(eyeCanvas());
  eyeMat.alphaTest = 0.45;
  const eyeGeo = sharedGeo(new PlaneGeometry(0.34, 0.16));
  const bubbleWaiting = bubbleMaterial(canvasTexture(bubbleCanvas("waiting")));
  const bubbleError = bubbleMaterial(canvasTexture(bubbleCanvas("error")));
  const bubbleDone = bubbleMaterial(canvasTexture(bubbleCanvas("done")));
  bin.mats.push(bubbleWaiting, bubbleError, bubbleDone);
  const bubbleGeo = sharedGeo(new PlaneGeometry(0.42, 0.42));
  const screenMat = sharedBasic("#d9ffe8");
  const screenGeo = sharedGeo(new PlaneGeometry(0.32, 0.18));
  const sparkMat = sharedBasic("#f7f7f7");
  const sparkGeo = sharedGeo(new BoxGeometry(0.055, 0.055, 0.055));
  const padGeo = sharedGeo(new CylinderGeometry(PAD_R, PAD_R, 0.1, 28));
  const padMat = sharedLambert("#fbfbfb");
  const laptopMat = sharedLambert("#1c1c1c");
  const laptopBase = sharedGeo(new BoxGeometry(0.4, 0.03, 0.26));
  const laptopLid = sharedGeo(new BoxGeometry(0.4, 0.24, 0.02));
  const windowMat = sharedBasic("#ffb15a", true, 1);
  const windowGeo = sharedGeo(new PlaneGeometry(0.7, 0.85));
  const frameMat = sharedLambert("#fbfbfb");
  const lawnMat = sharedLambert("#d5e6c8");
  const windows: Mesh[] = [];
  const lampGlows: MeshBasicMaterial[] = [];

  const hemi = new HemisphereLight("#f7fbf4", "#d5e0cc", 1.25);
  const key = new DirectionalLight("#fffaf2", 1.15);
  key.position.set(14, 24, 10);
  const fill = new DirectionalLight("#d9e6f5", 0.38);
  fill.position.set(-12, 10, -8);
  const warm = new PointLight("#ffb15a", 0, 48, 2);
  warm.position.set(0, 14, 0);
  scene.add(hemi, key, fill, warm);

  const lawn = new Mesh(sharedGeo(new PlaneGeometry(140, 140)), lawnMat);
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = 0;
  scene.add(lawn);
  const path = new Mesh(sharedGeo(new BoxGeometry(2.6, 0.04, 16)), sharedLambert("#e3eedb"));
  path.position.set(0, 0.02, 14);
  scene.add(path);
  placeTrees(scene);
  placeLamps(scene);

  const building = new Group();
  building.rotation.y = Math.PI / 4;
  scene.add(building);
  const floorGroups = new Map<FloorId, Group>();
  for (const floor of FLOOR_STACK) {
    const group = buildFloor(floor);
    floorGroups.set(floor.id, group);
    building.add(group);
  }
  const roof = buildRoof();
  building.add(roof);

  const desks = new Map<SlotId, Desk>();
  let deskSig = "";
  const pickRoots: Object3D[] = [];
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const projected = new Vector3();
  const right = new Vector3();
  const up = new Vector3();

  const home = new Vector3(0, floorBaseY(3, 0) + 1.2, 0);
  const goal = home.clone();
  const target = home.clone();
  let goalZoom = 1;
  let zoom = 1;
  let explodeT = 0;
  let nightT = 0;
  let gliding = false;
  let lastFocus: FloorId | null | undefined;
  let reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reduceMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onReduce = () => {
    reduce = reduceMedia.matches;
  };
  reduceMedia.addEventListener("change", onReduce);

  function placeTrees(root: Scene) {
    const trunkGeo = sharedGeo(new CylinderGeometry(0.16, 0.2, 1.55, 8));
    const leafGeo = sharedGeo(new SphereGeometry(1.15, 16, 12));
    const trunkMat = sharedLambert("#f7f5f1");
    const leafA = sharedLambert("#b7d4a8");
    const leafB = sharedLambert("#c6dfb8");
    const spots: [number, number, number][] = [
      [-18, -8, 1.05],
      [-14, 10, 0.85],
      [-20, 3, 0.7],
      [17, -9, 1.1],
      [20, 4, 0.82],
      [9, 20, 0.9],
      [-9, -18, 0.95],
      [16, 16, 0.75],
    ];
    for (const [x, z, scale] of spots) {
      const tree = new Group();
      const trunk = new Mesh(trunkGeo, trunkMat);
      trunk.position.y = 0.78;
      const leaf = new Mesh(leafGeo, scale > 0.9 ? leafA : leafB);
      leaf.position.y = 2.15;
      leaf.scale.setScalar(scale);
      trunk.scale.set(1, scale, 1);
      tree.add(trunk, leaf);
      tree.position.set(x, 0, z);
      root.add(tree);
    }
  }

  function placeLamps(root: Scene) {
    const poleGeo = sharedGeo(new CylinderGeometry(0.05, 0.06, 3.1, 8));
    const armGeo = sharedGeo(new BoxGeometry(0.7, 0.06, 0.06));
    const headGeo = sharedGeo(new BoxGeometry(0.46, 0.1, 0.22));
    const glowGeo = sharedGeo(new BoxGeometry(0.32, 0.04, 0.14));
    const poleMat = sharedLambert("#f7f5f1");
    for (const [x, z] of [
      [-2.4, 9],
      [2.4, 9],
      [-2.4, 16],
      [2.4, 16],
    ] as const) {
      const lamp = new Group();
      const pole = new Mesh(poleGeo, poleMat);
      pole.position.y = 1.55;
      const arm = new Mesh(armGeo, poleMat);
      arm.position.set(0.28, 3.05, 0);
      const head = new Mesh(headGeo, poleMat);
      head.position.set(0.52, 2.95, 0);
      const glowMat = sharedBasic("#f4efe4");
      lampGlows.push(glowMat);
      const glow = new Mesh(glowGeo, glowMat);
      glow.position.set(0.52, 2.88, 0);
      lamp.add(pole, arm, head, glow);
      lamp.position.set(x, 0, z);
      root.add(lamp);
    }
  }

  function buildFloor(floor: StackedFloor): Group {
    const group = new Group();
    group.name = floor.label;
    const slab = new Mesh(sharedGeo(new BoxGeometry(FLOOR_W, SLAB_H, FLOOR_D)), sharedLambert(FLOOR_TINT[floor.id]));
    slab.position.y = SLAB_H / 2;
    group.add(slab);
    const hx = FLOOR_W / 2 - 0.08;
    const hz = FLOOR_D / 2 - 0.08;
    const postGeo = sharedGeo(new BoxGeometry(0.2, ROOM_H, 0.2));
    for (const [x, z] of [
      [-hx, -hz],
      [hx, -hz],
      [-hx, hz],
      [hx, hz],
    ] as const) {
      const post = new Mesh(postGeo, frameMat);
      post.position.set(x, SLAB_H + ROOM_H / 2, z);
      group.add(post);
    }
    const beamX = sharedGeo(new BoxGeometry(FLOOR_W, 0.1, 0.12));
    const beamZ = sharedGeo(new BoxGeometry(0.12, 0.1, FLOOR_D));
    const top = SLAB_H + ROOM_H;
    for (const z of [-hz, hz]) {
      const beam = new Mesh(beamX, frameMat);
      beam.position.set(0, top, z);
      group.add(beam);
    }
    for (const x of [-hx, hx]) {
      const beam = new Mesh(beamZ, frameMat);
      beam.position.set(x, top, 0);
      group.add(beam);
    }
    for (let i = 0; i < 4; i += 1) {
      const win = new Mesh(windowGeo, windowMat);
      win.position.set(-3.2 + i * 2.1, SLAB_H + 1.35, -hz + 0.02);
      win.visible = false;
      windows.push(win);
      group.add(win);
    }
    const prop = buildProp(floor.prop);
    prop.scale.setScalar(0.5);
    prop.position.set(2.15, SLAB_H, -0.42);
    group.add(prop);
    const label = labelMesh(floor.label);
    label.position.set(-FLOOR_W / 2 + 1.7, SLAB_H + 0.42, FLOOR_D / 2 + 0.02);
    group.add(label);
    return group;
  }

  function buildRoof(): Group {
    const group = new Group();
    const slab = new Mesh(sharedGeo(new BoxGeometry(FLOOR_W, SLAB_H, FLOOR_D)), sharedLambert("#f7f6f2"));
    slab.position.y = SLAB_H / 2;
    group.add(slab);
    const glass = sharedLambert("#d5ebe6", true, 0.62);
    const railH = 0.7;
    const railT = 0.06;
    const inset = 0.55;
    const rw = FLOOR_W - inset * 2;
    const rd = FLOOR_D - inset * 2;
    const y = SLAB_H + railH / 2;
    const north = new Mesh(sharedGeo(new BoxGeometry(rw, railH, railT)), glass);
    north.position.set(0, y, rd / 2);
    const south = new Mesh(sharedGeo(new BoxGeometry(rw, railH, railT)), glass);
    south.position.set(0, y, -rd / 2);
    const east = new Mesh(sharedGeo(new BoxGeometry(railT, railH, rd)), glass);
    east.position.set(rw / 2, y, 0);
    const west = new Mesh(sharedGeo(new BoxGeometry(railT, railH, rd)), glass);
    west.position.set(-rw / 2, y, 0);
    group.add(north, south, east, west);
    for (const [x, z] of [
      [-2.4, 0.45],
      [-0.6, 0.55],
      [1.4, 0.35],
      [-1.6, -0.45],
      [0.5, -0.5],
      [2.4, -0.2],
    ] as const) {
      const plant = buildPlant();
      plant.scale.setScalar(0.55);
      plant.position.set(x, SLAB_H, z);
      group.add(plant);
    }
    return group;
  }

  function buildPlant(): Group {
    const plant = new Group();
    const pot = new Mesh(sharedGeo(new CylinderGeometry(0.28, 0.22, 0.28, 12)), sharedLambert("#f7f4ee"));
    pot.position.y = 0.14;
    const leaf = new Mesh(sharedGeo(new SphereGeometry(0.42, 14, 12)), sharedLambert("#b7d3a4"));
    leaf.position.y = 0.62;
    const sprout = new Mesh(sharedGeo(new SphereGeometry(0.26, 12, 10)), sharedLambert("#c5dcb4"));
    sprout.position.set(0.2, 0.84, 0.08);
    plant.add(pot, leaf, sprout);
    return plant;
  }

  function buildProp(kind: FloorProp): Group {
    switch (kind) {
      case "meeting-table":
        return meetingTable();
      case "phones":
        return phones();
      case "file-cabinets":
        return fileCabinets();
      case "board":
        return board();
      case "cabinet":
        return cabinet();
      case "bookshelves":
        return bookshelves();
      case "camera-light":
        return cameraLight();
      default:
        return new Group();
    }
  }

  function meetingTable(): Group {
    const group = new Group();
    const top = new Mesh(sharedGeo(new CylinderGeometry(1.7, 1.7, 0.1, 28)), sharedLambert("#f7f4ee"));
    top.position.y = 0.92;
    const leg = new Mesh(sharedGeo(new CylinderGeometry(0.12, 0.16, 0.86, 10)), sharedLambert("#f4f1ea"));
    leg.position.y = 0.43;
    group.add(top, leg);
    const seat = sharedGeo(new CylinderGeometry(0.28, 0.28, 0.46, 12));
    const seatMat = sharedLambert("#e7e2d8");
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + 0.4;
      const chair = new Mesh(seat, seatMat);
      chair.position.set(Math.cos(angle) * 2.25, 0.23, Math.sin(angle) * 2.25);
      group.add(chair);
    }
    return group;
  }

  function phones(): Group {
    const group = new Group();
    const base = new Mesh(sharedGeo(new BoxGeometry(3.4, 0.85, 0.9)), sharedLambert("#efeae0"));
    base.position.y = 0.42;
    const top = new Mesh(sharedGeo(new BoxGeometry(3.5, 0.08, 0.98)), sharedLambert("#f7f4ee"));
    top.position.y = 0.88;
    group.add(base, top);
    const ear = sharedGeo(new BoxGeometry(0.28, 0.1, 0.16));
    const grip = sharedGeo(new BoxGeometry(0.12, 0.36, 0.12));
    const black = sharedLambert("#2c2c2c");
    for (let i = 0; i < 3; i += 1) {
      const hand = new Group();
      put(hand, ear, black, 0, 0.16, 0);
      put(hand, grip, black, 0, -0.08, 0);
      hand.rotation.z = -0.55;
      hand.position.set(-1.05 + i * 1.05, 1.02, 0.08);
      group.add(hand);
    }
    return group;
  }

  function fileCabinets(): Group {
    const group = new Group();
    const body = sharedGeo(new BoxGeometry(0.85, 1.45, 0.62));
    const line = sharedGeo(new BoxGeometry(0.68, 0.03, 0.02));
    const shell = sharedLambert("#f3efe6");
    const ink = sharedLambert("#c9c3b6");
    for (let i = 0; i < 3; i += 1) {
      const x = (i - 1) * 0.98;
      put(group, body, shell, x, 0.72, 0);
      for (let d = 0; d < 4; d += 1) put(group, line, ink, x, 0.28 + d * 0.32, 0.32);
    }
    return group;
  }

  function board(): Group {
    const group = new Group();
    put(group, sharedGeo(new BoxGeometry(2.7, 1.7, 0.08)), sharedLambert("#ece7dc"), 0, 1.35, -0.05);
    put(group, sharedGeo(new BoxGeometry(2.45, 1.45, 0.06)), sharedLambert("#f7f7f4"), 0, 1.35, 0);
    const notes = ["#f3d6d6", "#d7e4c8", "#d5e0f2", "#f3e6c4"];
    const noteGeo = sharedGeo(new BoxGeometry(0.42, 0.32, 0.02));
    notes.forEach((hex, index) => {
      put(group, noteGeo, sharedLambert(hex), -0.7 + (index % 2) * 0.9, 1.55 - Math.floor(index / 2) * 0.5, 0.05);
    });
    return group;
  }

  function cabinet(): Group {
    const group = new Group();
    put(group, sharedGeo(new BoxGeometry(1.7, 1.65, 0.7)), sharedLambert("#f4efe4"), 0, 0.82, 0);
    const seam = sharedGeo(new BoxGeometry(0.03, 1.4, 0.02));
    put(group, seam, sharedLambert("#d5cfc2"), 0, 0.82, 0.36);
    const handle = sharedGeo(new BoxGeometry(0.16, 0.06, 0.04));
    const metal = sharedLambert("#cfc8ba");
    put(group, handle, metal, -0.28, 0.9, 0.38);
    put(group, handle, metal, 0.28, 0.9, 0.38);
    return group;
  }

  function bookshelves(): Group {
    const group = new Group();
    const wood = sharedLambert("#f6f3ec");
    const colors = ["#d7e3c8", "#f0d9c8", "#d5deee", "#f0d5e0", "#e6e2c8"];
    const bookGeo = sharedGeo(new BoxGeometry(0.18, 0.36, 0.28));
    const bookMats = colors.map((hex) => sharedLambert(hex));
    for (let shelf = 0; shelf < 2; shelf += 1) {
      const x = (shelf - 0.5) * 1.45;
      put(group, sharedGeo(new BoxGeometry(0.08, 2.15, 0.42)), wood, x - 0.55, 1.08, 0);
      put(group, sharedGeo(new BoxGeometry(0.08, 2.15, 0.42)), wood, x + 0.55, 1.08, 0);
      for (let row = 0; row < 4; row += 1) {
        put(group, sharedGeo(new BoxGeometry(1.18, 0.06, 0.42)), wood, x, 0.22 + row * 0.5, 0);
        for (let b = 0; b < 5; b += 1) {
          put(group, bookGeo, bookMats[(b + row + shelf) % bookMats.length], x - 0.4 + b * 0.2, 0.44 + row * 0.5, 0);
        }
      }
    }
    return group;
  }

  function cameraLight(): Group {
    const group = new Group();
    const body = put(group, sharedGeo(new BoxGeometry(0.7, 0.48, 0.42)), sharedLambert("#3d3a36"), 0, 1.15, 0);
    body.rotation.y = 0.4;
    const lens = new Mesh(sharedGeo(new CylinderGeometry(0.16, 0.18, 0.28, 16)), sharedLambert("#2a2a28"));
    lens.rotation.x = Math.PI / 2;
    lens.rotation.y = Math.PI / 4;
    lens.position.set(0.16, 1.15, 0.16);
    group.add(lens);
    put(group, sharedGeo(new CylinderGeometry(0.04, 0.05, 1.05, 8)), sharedLambert("#f4f1ea"), 0, 0.52, 0);
    put(group, sharedGeo(new CylinderGeometry(0.045, 0.05, 1.7, 8)), sharedLambert("#f7f5f1"), 1.15, 0.85, 0);
    const shade = new Mesh(sharedGeo(new ConeGeometry(0.34, 0.4, 14)), sharedLambert("#f7f4ee"));
    shade.position.set(1.15, 1.85, 0);
    group.add(shade);
    const bulb = new Mesh(sharedGeo(new SphereGeometry(0.1, 12, 10)), sharedBasic("#ffe1b0"));
    bulb.position.set(1.15, 1.62, 0.12);
    group.add(bulb);
    return group;
  }

  function labelMesh(text: string): Mesh {
    const plate = document.createElement("canvas");
    plate.width = 512;
    plate.height = 96;
    const ctx = plate.getContext("2d");
    if (!ctx) return new Mesh(sharedGeo(new PlaneGeometry(4.2, 0.8)), sharedBasic("#ffffff"));
    ctx.clearRect(0, 0, 512, 96);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundRect(ctx, 8, 14, 496, 68, 14);
    ctx.fill();
    ctx.fillStyle = "#3a3a3a";
    ctx.font = "600 40px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 50);
    const mat = sharedBasic("#ffffff", true, 1);
    mat.map = canvasTexture(plate);
    mat.alphaTest = 0.15;
    const meshLabel = new Mesh(sharedGeo(new PlaneGeometry(3.1, 0.58)), mat);
    return meshLabel;
  }

  function syncDesks() {
    const snapshot = hooks.getSnapshot();
    const sig = snapshot.seats.map((seat) => `${seat.slotId}:${seat.occupantId ?? ""}`).join("|");
    if (sig === deskSig) return;
    deskSig = sig;
    for (const desk of desks.values()) {
      desk.group.parent?.remove(desk.group);
      discard(desk.group);
    }
    desks.clear();
    pickRoots.length = 0;
    for (const floor of FLOOR_STACK) {
      const parent = floorGroups.get(floor.id);
      if (!parent) continue;
      for (const point of deskPoints(floor.id)) {
        const seat = snapshot.seats.find((item) => item.slotId === point.slotId);
        if (!seat) continue;
        const desk = buildDesk(seat.slotId, seat.occupantId);
        desk.group.position.set(point.x, SLAB_H, point.z);
        parent.add(desk.group);
        desks.set(point.slotId, desk);
        pickRoots.push(desk.group);
      }
    }
  }

  function buildDesk(slotId: SlotId, occupantId: OccupantId | null): Desk {
    const group = new Group();
    group.userData.slotId = slotId;
    put(group, padGeo, padMat, 0, 0.05, 0);
    const laptop = new Group();
    laptop.position.set(0.02, 0, 0.28);
    put(laptop, laptopBase, laptopMat, 0, 0.12, 0.02);
    put(laptop, laptopLid, laptopMat, 0, 0.25, -0.1);
    const screen = put(laptop, screenGeo, screenMat, 0, 0.25, -0.085);
    screen.visible = false;
    group.add(laptop);

    const root = new Group();
    root.position.set(0, 0.1, -0.12);
    group.add(root);
    const spec = figureForOccupant(occupantId);
    const built = spec ? buildFigure(spec) : null;
    if (built) root.add(built.group);

    const bubbleY = spec?.silhouette === "human" ? 0.72 : BOT_H + 0.16;
    const bubble = new Mesh(bubbleGeo, bubbleWaiting);
    bubble.visible = false;
    bubble.position.y = bubbleY;
    bubble.renderOrder = 3;
    root.add(bubble);

    const glowMat = new MeshBasicMaterial({
      color: spec && spec.shape === "bot" ? spec.body : "#f4f1ea",
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    glowMat.userData.local = true;
    const glow = new Mesh(markLocal(new CircleGeometry(0.55, 20)), glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.11;
    glow.visible = false;
    group.add(glow);

    const anchor = new Object3D();
    anchor.position.y = bubbleY;
    root.add(anchor);

    const sparks: Spark[] = [];
    for (let i = 0; i < 6; i += 1) {
      const spark = new Mesh(sparkGeo, sparkMat);
      spark.visible = false;
      group.add(spark);
      sparks.push({ mesh: spark, life: 0, vel: new Vector3() });
    }

    tag(group, slotId);
    return {
      slotId,
      group,
      root,
      figure: built?.group ?? null,
      eyes: built?.eyes ?? null,
      eyeBaseY: built?.eyeBaseY ?? 1,
      bubble,
      bubbleY,
      glow,
      screen,
      sparks,
      anchor,
      occupantId,
      blinkAt: 1 + Math.random() * 3,
      blinkUntil: 0,
    };
  }

  function buildFigure(spec: FigureSpec): { group: Group; eyes: Mesh; eyeBaseY: number } {
    const group = new Group();
    const rig = new Group();
    if (spec.silhouette === "human") buildHuman(rig, spec);
    else buildBot(rig, spec);
    const eyes = new Mesh(eyeGeo, eyeMat);
    const eyeScale = spec.silhouette === "human" ? 0.7 : 1;
    eyes.scale.setScalar(eyeScale);
    eyes.position.set(0, eyeHeight(spec.silhouette), eyeDepth(spec.silhouette));
    eyes.renderOrder = 2;
    rig.add(eyes);
    if (spec.silhouette === "human") rig.scale.setScalar(0.5);
    group.add(rig);
    return { group, eyes, eyeBaseY: eyeScale };
  }

  function buildBot(group: Group, spec: FigureSpec) {
    const mat = localLambert(spec.body);
    switch (spec.silhouette) {
      case "blob": {
        const blob = new Mesh(markLocal(new SphereGeometry(BOT_H * 0.48, 22, 16)), mat);
        blob.scale.set(1.16, 0.86, 1.04);
        blob.position.y = BOT_H * 0.48 * 0.86;
        group.add(blob);
        break;
      }
      case "teardrop": {
        const bulb = new Mesh(markLocal(new SphereGeometry(BOT_H * 0.34, 18, 14)), mat);
        bulb.position.y = BOT_H * 0.34;
        const tip = new Mesh(markLocal(new ConeGeometry(BOT_H * 0.34, BOT_H * 0.48, 16)), mat);
        tip.position.y = BOT_H * 0.72;
        group.add(bulb, tip);
        break;
      }
      case "sphere": {
        const ball = new Mesh(markLocal(new SphereGeometry(BOT_H * 0.48, 22, 16)), mat);
        ball.position.y = BOT_H * 0.48;
        group.add(ball);
        break;
      }
      case "star": {
        group.add(new Mesh(markLocal(starGeometry(BOT_H)), mat));
        break;
      }
      case "capsule": {
        const capsule = new Mesh(markLocal(new CapsuleGeometry(BOT_H * 0.24, BOT_H * 0.42, 6, 12)), mat);
        capsule.position.y = BOT_H * 0.5;
        group.add(capsule);
        break;
      }
      case "diamond": {
        group.add(new Mesh(markLocal(sitGeometry(new OctahedronGeometry(BOT_H * 0.48), BOT_H)), mat));
        break;
      }
      case "cube": {
        const cube = new Mesh(markLocal(new BoxGeometry(BOT_H * 0.78, BOT_H * 0.78, BOT_H * 0.78)), mat);
        cube.position.y = BOT_H * 0.39;
        group.add(cube);
        break;
      }
      default:
        break;
    }
  }

  function buildHuman(group: Group, spec: FigureSpec) {
    const shirt = localLambert(spec.body);
    const skin = localLambert(spec.head);
    const pants = localLambert("#4a3728");
    const hair = localLambert("#3b271c");
    const phoneMat = localLambert("#161616");
    put(group, markLocal(new BoxGeometry(0.12, 0.34, 0.12)), pants, -0.1, 0.17, 0);
    put(group, markLocal(new BoxGeometry(0.12, 0.34, 0.12)), pants, 0.1, 0.17, 0);
    put(group, markLocal(new BoxGeometry(0.38, 0.42, 0.22)), shirt, 0, 0.52, 0);
    const arm = put(group, markLocal(new BoxGeometry(0.1, 0.36, 0.1)), shirt, 0.26, 0.62, 0.06);
    arm.rotation.z = -0.7;
    const head = new Mesh(markLocal(new SphereGeometry(0.2, 18, 14)), skin);
    head.position.y = 0.92;
    group.add(head);
    const cap = new Mesh(markLocal(new SphereGeometry(0.2, 16, 12)), hair);
    cap.scale.set(1.02, 0.62, 1.02);
    cap.position.set(0, 1.04, -0.02);
    group.add(cap);
    const phone = put(group, markLocal(new BoxGeometry(0.18, 0.42, 0.06)), phoneMat, 0.28, 1.02, 0.16);
    phone.rotation.z = -0.25;
  }

  function eyeHeight(silhouette: FigureSpec["silhouette"]): number {
    switch (silhouette) {
      case "human":
        return 0.96;
      case "teardrop":
        return BOT_H * 0.42;
      case "cube":
        return BOT_H * 0.48;
      case "capsule":
        return BOT_H * 0.62;
      case "diamond":
        return BOT_H * 0.58;
      case "star":
        return BOT_H * 0.52;
      default:
        return BOT_H * 0.58;
    }
  }

  function eyeDepth(silhouette: FigureSpec["silhouette"]): number {
    switch (silhouette) {
      case "human":
        return 0.2;
      case "star":
        return 0.22;
      case "diamond":
        return BOT_H * 0.52;
      case "cube":
        return BOT_H * 0.42;
      case "capsule":
        return BOT_H * 0.28;
      case "teardrop":
        return BOT_H * 0.36;
      case "blob":
        return BOT_H * 0.54;
      default:
        return BOT_H * 0.5;
    }
  }

  function stepDesk(desk: Desk, spec: MotionSpec, elapsed: number, dt: number) {
    const motion = reduce ? { ...spec, bounceHz: 0, amplitude: 0 } : spec;
    const pose = bounceOffset(motion, elapsed);
    desk.root.position.y = 0.1 + pose.y;
    if (desk.figure) {
      const squashY = pose.scaleY;
      const squashXZ = pose.scaleXZ;
      desk.figure.scale.set(squashXZ, squashY, squashXZ);
      tint(desk.figure, spec.dim);
    }
    desk.bubble.visible = spec.bubble !== "none";
    desk.bubble.position.y = desk.bubbleY + (reduce ? 0 : bubbleLift(spec, elapsed));
    if (spec.bubble === "waiting") desk.bubble.material = bubbleWaiting;
    else if (spec.bubble === "error") desk.bubble.material = bubbleError;
    else if (spec.bubble === "done") desk.bubble.material = bubbleDone;
    desk.screen.visible = spec.particles;
    const glowMat = desk.glow.material as MeshBasicMaterial;
    const glowOn = nightT > 0.08 && spec.kind === "working";
    desk.glow.visible = glowOn;
    glowMat.opacity = glowOn ? 0.45 + nightT * 0.4 : 0;
    stepSparks(desk, spec.particles && !reduce, dt);
    stepBlink(desk, spec, elapsed);
  }

  function stepBlink(desk: Desk, spec: MotionSpec, elapsed: number) {
    if (!desk.eyes) return;
    if (spec.dim || spec.kind === "empty" || reduce) {
      desk.eyes.scale.y = desk.eyeBaseY;
      return;
    }
    if (elapsed >= desk.blinkAt) {
      desk.blinkUntil = elapsed + 0.12;
      desk.blinkAt = elapsed + 2.3 + Math.random() * 3.2;
    }
    desk.eyes.scale.y = elapsed < desk.blinkUntil ? desk.eyeBaseY * 0.08 : desk.eyeBaseY;
  }

  function stepSparks(desk: Desk, working: boolean, dt: number) {
    for (const spark of desk.sparks) {
      if (!working) {
        spark.life = 0;
        spark.mesh.visible = false;
        continue;
      }
      if (spark.life <= 0) {
        if (Math.random() > 0.4) continue;
        spark.life = 0.55 + Math.random() * 0.4;
        spark.mesh.position.set((Math.random() - 0.5) * 0.1, 0.16, 0.22 + (Math.random() - 0.5) * 0.08);
        spark.vel.set((Math.random() - 0.5) * 0.35, 0.7 + Math.random() * 0.35, (Math.random() - 0.5) * 0.35);
        spark.mesh.visible = true;
      }
      spark.life -= dt;
      spark.vel.y -= 1.4 * dt;
      spark.mesh.position.addScaledVector(spark.vel, dt);
      if (spark.life <= 0) spark.mesh.visible = false;
    }
  }

  function tint(root: Object3D, dim: boolean) {
    root.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const mat = mesh.material as MeshLambertMaterial;
      const base = mat.userData?.base as Color | undefined;
      if (!base || !mat.color) return;
      mat.color.copy(base);
      if (dim) mat.color.lerp(dimColor, 0.7);
    });
  }

  function projectSelection() {
    const selected = hooks.getSnapshot().selectedSlotId;
    const desk = selected ? desks.get(selected) : undefined;
    if (!desk) {
      hooks.onProject(null);
      return;
    }
    desk.anchor.getWorldPosition(projected);
    projected.project(camera);
    if (projected.z < -1 || projected.z > 1) {
      hooks.onProject(null);
      return;
    }
    hooks.onProject({
      x: (projected.x * 0.5 + 0.5) * canvas.clientWidth,
      y: (-projected.y * 0.5 + 0.5) * canvas.clientHeight,
    });
  }

  function applyView(dt: number) {
    const view = hooks.getSnapshot();
    const focus = view.focusFloor;
    if (focus !== lastFocus) {
      lastFocus = focus;
      gliding = true;
      if (focus) {
        const level = FLOOR_STACK.find((floor) => floor.id === focus)?.level ?? 3;
        goal.set(0, floorBaseY(level, explodeT) + 1.2, 0);
        goalZoom = 1.85;
      } else {
        goal.set(0, homeY(explodeT), 0);
        goalZoom = 1;
      }
    } else if (focus) {
      const level = FLOOR_STACK.find((floor) => floor.id === focus)?.level ?? 3;
      goal.y = floorBaseY(level, explodeT) + 1.2;
    }
    explodeT += ((view.explode ? 1 : 0) - explodeT) * (1 - Math.exp(-dt * 2.6));
    nightT += ((view.night ? 1 : 0) - nightT) * (1 - Math.exp(-dt * 2.2));
    const glide = 1 - Math.exp(-dt * 4.2);
    if (gliding) {
      target.lerp(goal, glide);
      if (target.distanceToSquared(goal) < 0.0008) gliding = false;
    } else {
      target.copy(goal);
    }
    zoom += (goalZoom - zoom) * glide;
    for (const floor of FLOOR_STACK) {
      const group = floorGroups.get(floor.id);
      if (group) group.position.y = floorBaseY(floor.level, explodeT) + 0.02;
    }
    roof.position.y = floorBaseY(7, explodeT) + 0.02;
    const fit = 1 / (1 + explodeT * 0.5);
    camera.zoom = zoom * fit;
    camera.position.copy(target).add(OFFSET);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    sky.copy(daySky).lerp(nightSky, nightT);
    lawnMat.color.copy(dayLawn).lerp(nightLawn, nightT);
    hemi.intensity = 1.25 + (0.32 - 1.25) * nightT;
    key.intensity = 1.15 + (0.28 - 1.15) * nightT;
    key.color.copy(dayKey).lerp(nightKey, nightT);
    fill.intensity = 0.38 + (0.06 - 0.38) * nightT;
    warm.intensity = nightT * 7;
    const showWindows = nightT > 0.05;
    for (const win of windows) win.visible = showWindows;
    windowMat.opacity = 0.35 + nightT * 0.65;
    for (const glow of lampGlows) glow.color.copy(dayKey).lerp(NIGHT_LAMP, nightT);
  }

  function panBy(dx: number, dy: number) {
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    const visibleH = (camera.top - camera.bottom) / camera.zoom;
    const worldPerPx = visibleH / Math.max(1, canvas.clientHeight);
    goal.addScaledVector(right, -dx * worldPerPx);
    goal.addScaledVector(up, dy * worldPerPx);
    goal.x = clamp(goal.x, -28, 28);
    goal.z = clamp(goal.z, -28, 28);
    goal.y = clamp(goal.y, -4, floorBaseY(7, 1) + 8);
    gliding = false;
    target.copy(goal);
  }

  function pick(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickRoots, true);
    hooks.onSelect(hits.length ? slotOf(hits[0].object) : null);
  }

  const pointers = new Map<number, { x: number; y: number }>();
  let pinchDist = 0;
  let dragId: number | null = null;
  let dragX = 0;
  let dragY = 0;
  let dragMoved = false;

  function pointerSpan(): number {
    const pts = [...pointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function onDown(event: PointerEvent) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (canvas.setPointerCapture) canvas.setPointerCapture(event.pointerId);
    if (pointers.size >= 2) {
      pinchDist = pointerSpan();
      dragId = null;
      return;
    }
    if (event.button !== 0) return;
    dragId = event.pointerId;
    dragX = event.clientX;
    dragY = event.clientY;
    dragMoved = false;
  }
  function onMove(event: PointerEvent) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2 && pinchDist > 0) {
      const dist = pointerSpan();
      if (dist > 0) {
        goalZoom = clamp(goalZoom * (dist / pinchDist), 0.55, 4);
        pinchDist = dist;
      }
      return;
    }
    if (dragId !== event.pointerId) return;
    const dx = event.clientX - dragX;
    const dy = event.clientY - dragY;
    dragX = event.clientX;
    dragY = event.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 3) dragMoved = true;
    if (dragMoved) panBy(dx, dy);
  }
  function onUp(event: PointerEvent) {
    const wasDrag = dragId === event.pointerId;
    const moved = dragMoved;
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (wasDrag) {
      dragId = null;
      if (!moved) pick(event);
    }
  }
  function onWheel(event: WheelEvent) {
    event.preventDefault();
    const dy = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    goalZoom = clamp(goalZoom * Math.exp(-dy * 0.0011), 0.55, 4);
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    const aspect = w / h;
    const halfH = aspect < 1 ? VIEW / 2 / aspect : VIEW / 2;
    const halfW = aspect < 1 ? VIEW / 2 : (VIEW / 2) * aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(w, h, false);
  }
  const observer = new ResizeObserver(() => resize());
  observer.observe(canvas);
  resize();
  camera.position.copy(target).add(OFFSET);
  camera.lookAt(target);

  let raf = 0;
  let dead = false;
  let last = performance.now();
  const started = performance.now();

  function frame(now: number) {
    if (dead) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!document.hidden) {
      syncDesks();
      applyView(dt);
      const snapshot = hooks.getSnapshot();
      const elapsed = (now - started) / 1000;
      for (const desk of desks.values()) stepDesk(desk, specFor(desk, snapshot.rows), elapsed, dt);
      projectSelection();
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    dead = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    reduceMedia.removeEventListener("change", onReduce);
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    canvas.removeEventListener("wheel", onWheel);
    for (const desk of desks.values()) discard(desk.group);
    for (const geometry of bin.geos) geometry.dispose();
    for (const mat of bin.mats) mat.dispose();
    for (const tex of bin.textures) tex.dispose();
    renderer.dispose();
  };
}

function specFor(desk: Desk, rows: readonly DeskActivity[]): MotionSpec {
  if (desk.occupantId === "stavros") return motionForDesk({ kind: "human", quiet: false, status: null });
  if (!desk.occupantId) return motionForDesk({ kind: "empty", quiet: false, status: null });
  const occupantId = desk.occupantId;
  const row = rows.find((item) => item.botId === occupantId);
  return motionForDesk({
    kind: "bot",
    quiet: row?.quiet ?? true,
    status: row?.currentStatus ?? null,
  });
}

function bubbleMaterial(map: CanvasTexture): MeshBasicMaterial {
  return new MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: DoubleSide });
}

function eyeCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, 128, 64);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(32, 32, 22, 26, 0, 0, Math.PI * 2);
  ctx.ellipse(96, 32, 22, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(36, 34, 8, 0, Math.PI * 2);
  ctx.arc(100, 34, 8, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

function bubbleCanvas(kind: "waiting" | "error" | "done"): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, 128, 128);
  if (kind === "waiting") {
    ctx.fillStyle = "#e23d4a";
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 72px ui-monospace, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 64, 70);
  } else if (kind === "error") {
    ctx.fillStyle = "#e23d4a";
    ctx.beginPath();
    ctx.moveTo(64, 14);
    ctx.lineTo(116, 112);
    ctx.lineTo(12, 112);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 64px ui-monospace, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 64, 86);
  } else {
    ctx.fillStyle = "#1f9d55";
    roundRect(ctx, 18, 18, 92, 92, 16);
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(38, 66);
    ctx.lineTo(56, 86);
    ctx.lineTo(92, 44);
    ctx.stroke();
  }
  return canvas;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function starGeometry(height: number): BufferGeometry {
  const shape = new Shape();
  const outer = 1;
  const inner = 0.42;
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return sitGeometry(new ExtrudeGeometry(shape, { depth: 0.55, bevelEnabled: false }), height);
}

function sitGeometry(geometry: BufferGeometry, height: number): BufferGeometry {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) return geometry;
  geometry.translate(-(box.max.x + box.min.x) / 2, -box.min.y, -(box.max.z + box.min.z) / 2);
  geometry.computeBoundingBox();
  const fitted = geometry.boundingBox;
  const current = fitted ? fitted.max.y - fitted.min.y : 1;
  const scale = height / (current || 1);
  geometry.scale(scale, scale, scale);
  return geometry;
}

function tag(obj: Object3D, slotId: SlotId) {
  obj.traverse((child) => {
    child.userData.slotId = slotId;
  });
}

function slotOf(obj: Object3D): SlotId | null {
  let current: Object3D | null = obj;
  while (current) {
    const slotId = current.userData.slotId;
    if (typeof slotId === "string") return slotId as SlotId;
    current = current.parent;
  }
  return null;
}

function discard(obj: Object3D) {
  obj.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry?.userData?.local) mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (mat?.userData?.local) mat.dispose();
    }
  });
}

function pixelRatio(): number {
  const narrow = window.innerWidth < 800;
  return Math.min(window.devicePixelRatio || 1, narrow ? 1.25 : 1.6);
}

function homeY(explode: number): number {
  const mid = (floorBaseY(0, explode) + floorBaseY(6, explode) + STACK_PITCH) / 2;
  return mid - 1.6;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
