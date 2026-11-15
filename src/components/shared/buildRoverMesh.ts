import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface DetailedRoverRig {
  roverGroup: THREE.Group;
  dishGroup: THREE.Group;
  roverWheels: THREE.Object3D[];
  roverBeaconMat: THREE.MeshBasicMaterial;
  mastHeadRef: { current: THREE.Object3D | null };
  usingNasaGlbRef: { current: boolean };
}

interface BuildRoverOptions {
  scale?: number;
  bumpMap?: THREE.Texture | null;
  detailed?: boolean;
}

const NASA_PERSEVERANCE_GLB_URL = '/models/perseverance-rover.glb';

interface NormalizedPerseveranceTemplate {
  scene: THREE.Group;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

let cachedGlbTemplatePromise: Promise<NormalizedPerseveranceTemplate | null> | null = null;

/**
 * Loads and normalizes the official NASA Mars 2020 Perseverance GLB once per session,
 * sharing parsed BufferGeometries/textures across both Pre-EVA and EVA 3D viewports.
 */
function loadPerseveranceTemplate(): Promise<NormalizedPerseveranceTemplate | null> {
  if (!cachedGlbTemplatePromise) {
    const loader = new GLTFLoader();
    cachedGlbTemplatePromise = loader
      .loadAsync(NASA_PERSEVERANCE_GLB_URL)
      .then((gltf) => {
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Calibrate NASA PBR materials for direct + hemisphere Mars lighting (zero black-metal clip)
        root.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const mat of mats) {
              if (mat && 'metalness' in mat) {
                const stdMat = mat as THREE.MeshStandardMaterial;
                if (typeof stdMat.metalness === 'number') {
                  stdMat.metalness = Math.min(stdMat.metalness, 0.56);
                }
                if (typeof stdMat.roughness === 'number') {
                  stdMat.roughness = Math.max(0.28, stdMat.roughness);
                }
                stdMat.envMapIntensity = 1.25;
                stdMat.needsUpdate = true;
              }
            }
          }
        });

        return {
          scene: root,
          offsetX: -center.x,
          offsetY: -box.min.y,
          offsetZ: -center.z,
        };
      })
      .catch((err) => {
        console.warn('[ARES Rover] Could not load Perseverance GLB, keeping procedural fallback:', err);
        return null;
      });
  }
  return cachedGlbTemplatePromise;
}

/**
 * Mounts the real NASA Perseverance (Mars 2020) 3D GLB model (`ModeloRover.glb` ->
 * `/models/perseverance-rover.glb`) with instant synchronous procedural fallback on frame 1
 * so both Pre-EVA terrain and EVA visor render cleanly without popup delay.
 */
export function buildDetailedRoverMesh(options: BuildRoverOptions = {}): DetailedRoverRig {
  const { scale = 1.22, bumpMap = null, detailed = true } = options;

  const roverGroup = new THREE.Group();
  roverGroup.scale.set(scale, scale, scale);

  // Fast synchronous procedural silhouette (hidden automatically as soon as NASA GLB swaps in)
  const proceduralGroup = new THREE.Group();
  roverGroup.add(proceduralGroup);

  const matTitanium = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.36,
    metalness: 0.58,
  });
  const matDarkFrame = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.48,
    metalness: 0.52,
  });
  const matKaptonGold = new THREE.MeshStandardMaterial({
    map: bumpMap ?? undefined,
    bumpMap: bumpMap ?? undefined,
    bumpScale: bumpMap ? 0.025 : 0,
    color: 0xd49b27,
    roughness: 0.38,
    metalness: 0.56,
  });
  const matBetaWhite = new THREE.MeshStandardMaterial({
    color: 0xe2ded6,
    roughness: 0.62,
    metalness: 0.14,
  });
  const matTire = new THREE.MeshStandardMaterial({
    color: 0x242830,
    roughness: 0.85,
    metalness: 0.25,
  });

  const lowerTub = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.24, 2.95), matDarkFrame);
  lowerTub.position.set(0, 0.56, -0.02);
  lowerTub.castShadow = true;
  proceduralGroup.add(lowerTub);

  const coreHull = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.68, 2.48), matKaptonGold);
  coreHull.position.set(0, 1.0, -0.04);
  coreHull.castShadow = true;
  proceduralGroup.add(coreHull);

  const upperDeck = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.36, 1.85), matBetaWhite);
  upperDeck.position.set(0, 1.48, 0.08);
  upperDeck.castShadow = true;
  proceduralGroup.add(upperDeck);

  const baseTireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 18);
  baseTireGeo.rotateZ(Math.PI / 2);
  const roverWheels: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    for (const wz of [1.18, 0.0, -1.16]) {
      const wheel = new THREE.Mesh(baseTireGeo, matTire);
      wheel.position.set(side * 1.28, 0.42, wz);
      wheel.castShadow = true;
      proceduralGroup.add(wheel);
      roverWheels.push(wheel);
    }
  }

  // Fallback procedural MastCam + dish placeholders
  const mastBase = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.62, 8), matTitanium);
  mastBase.position.set(-0.52, 1.82, 0.71);
  proceduralGroup.add(mastBase);

  const dishGroup = new THREE.Group();
  dishGroup.position.set(0.42, 1.65, -0.4);
  const fallbackDish = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.08, 0.14, 14),
    matTitanium
  );
  fallbackDish.rotation.x = Math.PI / 2;
  dishGroup.add(fallbackDish);
  proceduralGroup.add(dishGroup);

  // Persistent ARES tactical status beacon + LED deck rim mounted cleanly over NASA rear avionics deck
  const roverBeaconMat = new THREE.MeshBasicMaterial({ color: 0x38e8ff });
  const beaconPedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.11, 0.1, 12),
    matDarkFrame
  );
  beaconPedestal.position.set(0.42, 1.55, -0.78);
  roverGroup.add(beaconPedestal);

  const roverBeaconDome = new THREE.Mesh(
    new THREE.SphereGeometry(0.115, 14, 10),
    roverBeaconMat
  );
  roverBeaconDome.position.set(0.42, 1.63, -0.78);
  roverGroup.add(roverBeaconDome);

  if (detailed) {
    // Subtle overhead local deck light so NASA gold Kapton foil, MastCam lenses & rocker-bogie stay bright in craters
    const deckFill = new THREE.PointLight(0xffe6cc, 0.85, 7.5, 1.5);
    deckFill.position.set(0, 2.75, 0.85);
    roverGroup.add(deckFill);
  }

  const mastHeadRef: { current: THREE.Object3D | null } = { current: null };
  const usingNasaGlbRef = { current: false };

  // Swap in the official NASA Mars 2020 Perseverance GLB asynchronously once cached
  loadPerseveranceTemplate().then((template) => {
    if (!template || roverGroup.userData.cancelled) return;

    const nasaModel = template.scene.clone(true);
    nasaModel.position.set(template.offsetX, template.offsetY, template.offsetZ);

    const headNode = nasaModel.getObjectByName('head') ?? null;
    if (headNode) {
      mastHeadRef.current = headNode;
    }

    proceduralGroup.visible = false;
    roverWheels.length = 0; // NASA GLB uses unified Wheels_objs geometry + authentic chassis heave instead
    usingNasaGlbRef.current = true;
    roverGroup.add(nasaModel);
  });

  return {
    roverGroup,
    dishGroup,
    roverWheels,
    roverBeaconMat,
    mastHeadRef,
    usingNasaGlbRef,
  };
}
