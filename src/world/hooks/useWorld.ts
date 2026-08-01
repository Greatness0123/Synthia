/**
 * React hook to initialize and manage the World Engine.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { WorldEngine } from "../engine/WorldEngine";
import { PhysicsEngine } from "../engine/PhysicsEngine";
import { AudioEngine } from "../engine/AudioEngine";
import { ObjectManager } from "../engine/ObjectManager";
import { HumanoidPhysicsBinder } from "../engine/HumanoidPhysicsBinder";
import { generateCombinedMultiAgentMJCF } from "../engine/MJCFHumanoidTemplate";
import { StateRehydrator } from "../engine/StateRehydrator";
import { AgentLoop } from "../agent/AgentLoop";
import { useWorldStore } from "../../store/worldStore";
import { useAgentStore } from "../../store/agentStore";
import { useConnectionStore } from "../../store/connectionStore";
import { useCoordinator } from "./useCoordinator";
import { useUIStore } from "../../store/uiStore";
import { synthiaToast } from "../../components/ui/Toast";
import { debouncedToast } from "../../utils/toastUtils";
import { STRINGS } from "../../constants/strings";
import { logger as Logger } from "../../utils/logger";
import * as THREE from "three";

export const useWorld = (containerRef: React.RefObject<HTMLDivElement>) => {
  const [isReady, setIsReady] = useState(false);
  const { sendMessage } = useCoordinator();
  const worldEngineRef = useRef<WorldEngine | null>(null);
  const physicsEngineRef = useRef<PhysicsEngine | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const objectManagerRef = useRef<ObjectManager | null>(null);
  const humanoidPhysicsBinderRef = useRef<HumanoidPhysicsBinder | null>(null);
  const humanoidPhysicsBindersRef = useRef<Map<string, HumanoidPhysicsBinder>>(new Map());
  const activeAgentLoopsRef = useRef<Map<string, AgentLoop>>(new Map());

  const worldStore = useWorldStore();
  const agentStore = useAgentStore();
  const pendingOutcomesRef = useRef<any[]>([]);
  const lastJointStateRef = useRef<Record<string, any>>({});
  const boundaryViolationCountRef = useRef(0);
  const BOUNDARY_RESET_FRAMES = 5;

  // ─── Fall diagnostics ring buffer ────────────────────
  const DIAG_RING_SIZE = 300; // ~5 seconds at 60fps (throttled from 500Hz physics)
  const diagRingRef = useRef<any[]>([]);
  const diagRingIdx = useRef(0);
  const diagRingFull = useRef(false);
  const diagRingFrameCount = useRef(0);
  const diagCaptureDone = useRef(false);
  const diagJointCacheRef = useRef<Map<string, { bodyId: number; qposAdr: number; dofAdr: number; dofCount: number; qposCount: number; name: string }> | null>(null);
  const diagGeomCacheRef = useRef<Map<string, { geomId: number; bodyName: string; type: number }> | null>(null);
  const diagBodyCacheRef = useRef<Map<string, { bodyId: number; mass: number; parentBodyId: number; geomIds: number[] }> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    const init = async () => {
      try {
        Logger.info("useWorld: Initializing MuJoCo physics...");
        const physicsEngine = new PhysicsEngine();
        physicsEngineRef.current = physicsEngine;
        await physicsEngine.init();
        if (cancelled) {
          physicsEngine.cleanup();
          return;
        }

        Logger.info("useWorld: Initializing audio...");
        const audioEngine = new AudioEngine();
        audioEngineRef.current = audioEngine;
        audioEngine
          .init()
          .catch((err) => Logger.error("Audio init failed", err));

        (window as any)._synthia_audio_engine = audioEngine;
        (window as any)._synthia_connection_store_metrics =
          useConnectionStore.getState().setMetrics;

        Logger.info("useWorld: Initializing world engine...");
        const worldEngine = new WorldEngine(
          containerRef.current!,
          physicsEngine,
        );
        worldEngineRef.current = worldEngine;

        const objectManager = new ObjectManager(
          physicsEngine,
          worldEngine.getScene(),
          audioEngine
        );
        objectManagerRef.current = objectManager;

        if (cancelled) {
          physicsEngine.cleanup();
          return;
        }

        objectManager.setEventCallback((type: string, data: any) => {
          if (type === "piano_note") {
            pendingOutcomesRef.current.push({
              type: "outcome",
              data: {
                success: true,
                reward: 1.0,
                description: `Played piano note: ${data.note}`,
              },
            });
          } else if (type === "button_press") {
            pendingOutcomesRef.current.push({
              type: "outcome",
              data: {
                success: true,
                reward: 0.5,
                description: `Pressed button: ${data.id}`,
              },
            });
          }
        });

        const cam = worldEngine.getCameraManager();
        cam.onDragChanged = (dragging, object) => {
          const activeObjManager = objectManagerRef.current;
          if (!activeObjManager) return;

          if (!object) {
            activeObjManager.setDraggingObject(null);
            return;
          }
          let target: THREE.Object3D | null = object;
          while (target && !target.userData.objectId && target.parent) {
            target = target.parent;
          }
          activeObjManager.setDraggingObject(
            dragging && target?.userData.objectId ? target.userData.objectId : null
          );
        };
        cam.onDragEnd = (object) => {
          const activeObjManager = objectManagerRef.current;
          if (!activeObjManager) return;

          let target: THREE.Object3D | null = object;
          while (target && !target.userData.objectId && target.parent) {
            target = target.parent;
          }
          if (target?.userData.objectId) {
            activeObjManager.setObjectPosition(
              target.userData.objectId,
              target.position,
              target.quaternion
            );
          } else {
            let draggedBinder: any = null;
            for (const binder of humanoidPhysicsBindersRef.current.values()) {
              if (object === binder.getModelRoot()) {
                draggedBinder = binder;
                break;
              }
            }
            if (draggedBinder) {
              draggedBinder.setCapsulePosition(
                object.position.x,
                object.position.y,
                object.position.z
              );
            }
          }
        };

        const humanoidPhysicsBinder = new HumanoidPhysicsBinder(
          physicsEngine,
          worldEngine.getScene(),
          'agent_0'
        );
        humanoidPhysicsBinderRef.current = humanoidPhysicsBinder;
        humanoidPhysicsBindersRef.current.set('agent_0', humanoidPhysicsBinder);

        // Expose humanoid binder to window for step-by-step testing
        (window as any).__SYNTHIA_HUMANOID_BINDERS__ = humanoidPhysicsBindersRef.current;
        (window as any).__SYNTHIA_HUMANOID_BINDER__ = humanoidPhysicsBinder;
        (window as any).__SYNTHIA_PHYSICS_ENGINE__ = physicsEngine;
        (window as any).__SYNTHIA_MUJOCO_MODULE__ = PhysicsEngine.getModule();
        (window as any).__SYNTHIA_CAMERA__ = worldEngineRef.current.getCamera();
        (window as any).__SYNTHIA_RENDERER__ = worldEngineRef.current.getRenderer();
        (window as any).__SYNTHIA_SCENE__ = worldEngineRef.current.getScene();
        (window as any).THREE = THREE;
        (window as any).__SYNTHIA_FLOOR_MESH__ = worldEngineRef.current.getFloorMesh();

        // Auto-load console highlight geoms (provides highlight_embed, check_floors, etc.)
        const hlScript = document.createElement('script');
        hlScript.src = '/console_highlight_geoms.js';
        document.head.appendChild(hlScript);

        // ── Fall diagnostics: expose to window ────────────
        const getDiagRingFrames = () => {
          return diagRingRef.current.slice();
        };

        (window as any).__SYNTHIA_DIAG_RING__ = getDiagRingFrames;
        (window as any).__SYNTHIA_DIAG_RING_INFO__ = () => {
          const ring = diagRingRef.current;
          console.log(`[DIAG RING] Buffer: ${ring.length}/${DIAG_RING_SIZE} frames, done: ${diagCaptureDone.current}`);
        };
        (window as any).diag_reset = () => {
          diagRingRef.current.length = 0;
          diagRingIdx.current = 0;
          diagRingFull.current = false;
          diagRingFrameCount.current = 0;
          diagCaptureDone.current = false;
          diagJointCacheRef.current = null;
          diagGeomCacheRef.current = null;
          diagBodyCacheRef.current = null;
          console.log('[DIAG] Ring buffer + caches reset. Capturing will restart on next frame.');
        };
        (window as any).diagnose_fall_quick = () => {
          const frames = getDiagRingFrames();
          if (frames.length === 0) {
            console.log('[DIAG] No frames captured yet');
            const pe = physicsEngineRef.current;
            const hb = humanoidPhysicsBinderRef.current;
            console.log('[DIAG DEBUG] physics:', !!pe, 'isReady:', pe?.isReady, 'isStepping:', pe?.isStepping, 'isMutating:', pe?.isMutating);
            console.log('[DIAG DEBUG] humanoidBinder:', !!hb);
            if (hb) {
              const capId = hb.getMultiBodyManager()?.getCapsuleBody();
              console.log('[DIAG DEBUG] capsuleBody:', capId);
            }
            console.log('[DIAG DEBUG] ringBuffer length:', diagRingRef.current.length);
            return;
          }
          console.log(`[DIAG] ${frames.length} frames captured. Analyzing...`);
          console.log('[DIAG] Reference frame: MuJoCo world = X-forward, Y-left, Z-up');
          console.log('[DIAG] xfrc = world-frame torque on root body');
          console.log('[DIAG] Spherical joint qpos = [qw,qx,qy,qz], qvel = [wx,wy,wz]');
          console.log('[DIAG] Revolute joint qpos = [angle], qvel = [angVel]');

          // Time series — sample every Nth frame
          const step = Math.max(1, Math.floor(frames.length / 30));
          console.log('\nFrame | RootH  | Tilt  | ComZ  | lFoot  | rFoot  | UpVel  | BkVel  | GRD | spine_p | lHip_p | rHip_p | lKnee | rKnee');
          console.log('------+--------+-------+-------+--------+--------+--------+--------+-----+---------+--------+--------+-------+------');
          for (let i = 0; i < frames.length; i += step) {
            const s = frames[i];
            const j = s.joints ?? {};
            const spineP = j.mixamorigspine?.qvel?.[1]?.toFixed(2) ?? '?';
            const lHipP = j.mixamorigleftupleg?.qvel?.[1]?.toFixed(2) ?? '?';
            const rHipP = j.mixamorigrightupleg?.qvel?.[1]?.toFixed(2) ?? '?';
            const lKnee = j.mixamorigleftleg?.qpos?.[0]?.toFixed(2) ?? '?';
            const rKnee = j.mixamorigrightleg?.qpos?.[0]?.toFixed(2) ?? '?';
            console.log(
              String(s.f).padStart(5) + ' | ' +
              (s.rootH ?? 0).toFixed(3).padStart(5) + ' | ' +
              (s.tilt ?? 0).toFixed(1).padStart(5) + ' | ' +
              (s.comZ ?? 0).toFixed(3).padStart(5) + ' | ' +
              (s.lFootH ?? 0).toFixed(3).padStart(5) + ' | ' +
              (s.rFootH ?? 0).toFixed(3).padStart(5) + ' | ' +
              (s.rootVy ?? 0).toFixed(2).padStart(6) + ' | ' +
              (s.rootLinVz ?? 0).toFixed(2).padStart(6) + ' | ' +
              String(s.grounded).padStart(3) + ' | ' +
              String(spineP).padStart(7) + ' | ' +
              String(lHipP).padStart(6) + ' | ' +
              String(rHipP).padStart(6) + ' | ' +
              String(lKnee).padStart(5) + ' | ' +
              String(rKnee).padStart(5)
            );
          }

          // Root cause
          const first = frames[0], last = frames[frames.length - 1];
          console.log('\n--- ROOT CAUSE ---');
          console.log('Height drop:', (first.rootH - last.rootH).toFixed(3), 'MuJoCo-Z');
          console.log('Tilt increase:', (last.tilt - first.tilt).toFixed(1), 'deg');
          console.log('Initial tilt:', first.tilt.toFixed(1), 'deg → Final tilt:', last.tilt.toFixed(1), 'deg');
          const avgFootZ = (first.lFootH + first.rFootH) / 2;
          const comOffset = first.comZ - avgFootZ;
          console.log('CoM vs avg foot (MuJoCo-Z):', comOffset.toFixed(3), comOffset < -0.05 ? '(BEHIND!)' : '(OK)');

          // Joint state at first and last frame
          console.log('\n--- JOINT STATE (first frame → last frame) ---');
          const jf = first.joints ?? {};
          const jl = last.joints ?? {};
          const jointNames = Object.keys(jf);
          console.log(`  Total joints: ${jointNames.length}`);
          for (const jname of jointNames) {
            const fq = jf[jname]?.qvel ?? [];
            const lq = jl[jname]?.qvel ?? [];
            const fqp = jf[jname]?.qpos ?? [];
            const lqp = jl[jname]?.qpos ?? [];
            if (fq.length > 0) {
              console.log(`  ${jname}: qpos [${fqp.map((v:number) => v.toFixed(3)).join(', ')}] → [${lqp.map((v:number) => v.toFixed(3)).join(', ')}]  qvel [${fq.map((v:number) => v.toFixed(3)).join(', ')}] → [${lq.map((v:number) => v.toFixed(3)).join(', ')}]`);
            }
          }

          // Body positions at first and last frame
          const bf = first.bodies ?? {};
          const bl = last.bodies ?? {};
          const bodyNames = Object.keys(bf);
          if (bodyNames.length > 0) {
            console.log(`\n--- BODY POSITIONS (first frame → last frame) [${bodyNames.length} bodies] ---`);
            console.log('  Body                 | First pos (x,y,z MuJoCo)      | Last pos (x,y,z MuJoCo)       | Delta pos');
            console.log('  ---------------------+-------------------------------+-------------------------------+----------');
            for (const bname of bodyNames) {
              const fp = bf[bname]?.pos ?? [0, 0, 0];
              const lp = bl[bname]?.pos ?? fp;
              const dx = lp[0] - fp[0], dy = lp[1] - fp[1], dz = lp[2] - fp[2];
              console.log(`  ${bname.padEnd(20)} | [${fp.map((v:number) => v.toFixed(3)).join(', ')}] | [${lp.map((v:number) => v.toFixed(3)).join(', ')}] | [${dx.toFixed(3)}, ${dy.toFixed(3)}, ${dz.toFixed(3)}]`);
            }
          }

          // Body velocities at first and last frame
          if (bodyNames.length > 0) {
            console.log(`\n--- BODY VELOCITIES (first frame → last frame) ---`);
            console.log('  Body                 | First linVel (x,y,z)          | First angVel (x,y,z)           | Last linVel');
            console.log('  ---------------------+-------------------------------+-------------------------------+------------');
            for (const bname of bodyNames) {
              const flv = bf[bname]?.linVel ?? [0, 0, 0];
              const fav = bf[bname]?.angVel ?? [0, 0, 0];
              const llv = bl[bname]?.linVel ?? flv;
              console.log(`  ${bname.padEnd(20)} | [${flv.map((v:number) => v.toFixed(3)).join(', ')}] | [${fav.map((v:number) => v.toFixed(3)).join(', ')}] | [${llv.map((v:number) => v.toFixed(3)).join(', ')}]`);
            }
          }

          // Body external forces (cfrc_ext)
          if (bodyNames.length > 0) {
            console.log(`\n--- BODY EXTERNAL FORCES (cfrc_ext) first → last ---`);
            for (const bname of bodyNames) {
              const fc = bf[bname]?.cfrc ?? [0,0,0,0,0,0];
              const lc = bl[bname]?.cfrc ?? fc;
              const fMag = Math.sqrt(fc[0]*fc[0]+fc[1]*fc[1]+fc[2]*fc[2]);
              const lMag = Math.sqrt(lc[0]*lc[0]+lc[1]*lc[1]+lc[2]*lc[2]);
              if (fMag > 0.01 || lMag > 0.01) {
                console.log(`  ${bname.padEnd(20)} | force [${fc.map((v:number) => v.toFixed(2)).join(', ')}] (${fMag.toFixed(2)}N) → [${lc.map((v:number) => v.toFixed(2)).join(', ')}] (${lMag.toFixed(2)}N)`);
              }
            }
          }

          // Geom positions
          const gf = first.geoms ?? {};
          const gl = last.geoms ?? {};
          const geomNames = Object.keys(gf);
          if (geomNames.length > 0) {
            console.log(`\n--- GEOM POSITIONS (first frame → last frame) [${geomNames.length} geoms] ---`);
            for (const gname of geomNames) {
              const fp = gf[gname]?.pos ?? [0, 0, 0];
              const lp = gl[gname]?.pos ?? fp;
              const body = gf[gname]?.bodyName ?? '?';
              console.log(`  ${gname.padEnd(24)} (${body.padEnd(20)}): [${fp.map((v:number) => v.toFixed(3)).join(', ')}] → [${lp.map((v:number) => v.toFixed(3)).join(', ')}]`);
            }
          }

          // Contact summary
          const cf = first.contacts ?? [];
          const cl = last.contacts ?? [];
          console.log(`\n--- CONTACTS (first frame: ${cf.length} contacts, last frame: ${cl.length} contacts) ---`);
          if (cf.length > 0) {
            console.log('  First frame contacts:');
            for (const c of cf) {
              console.log(`    ${c.geom1} ↔ ${c.geom2} | dist=${c.dist.toFixed(4)} | normal=[${c.normal.map((v:number)=>v.toFixed(3)).join(', ')}] | force=[${c.force.map((v:number)=>v.toFixed(2)).join(', ')}] N`);
            }
          }
          if (cl.length > 0) {
            console.log('  Last frame contacts:');
            for (const c of cl) {
              console.log(`    ${c.geom1} ↔ ${c.geom2} | dist=${c.dist.toFixed(4)} | normal=[${c.normal.map((v:number)=>v.toFixed(3)).join(', ')}] | force=[${c.force.map((v:number)=>v.toFixed(2)).join(', ')}] N`);
            }
          }

          // Contact count over time
          console.log('\n--- CONTACT COUNT OVER TIME ---');
          for (let i = 0; i < frames.length; i += step) {
            const s = frames[i];
            const nc = s.contacts?.length ?? 0;
            console.log(`  Frame ${String(s.f).padStart(3)}: ${nc} contacts`);
          }

          // xfrc summary
          console.log('\n--- ROOT xfrc (world-frame torque) ---');
          console.log('First:', first.xfrc?.map((v:number) => v.toFixed(2)).join(', '));
          console.log('Last: ', last.xfrc?.map((v:number) => v.toFixed(2)).join(', '));

          // Download
          const blob = new Blob([JSON.stringify(frames, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'fall_diagnosis.json'; a.click();
          URL.revokeObjectURL(url);
          console.log('[DIAG] JSON downloaded');
        };
        Logger.info('useWorld: Fall diagnostics ring buffer active (300 frames)');

        // ── Capture initial state BEFORE any physics step ──
        try {
          const physEng = physicsEngineRef.current;
          const humBinder = humanoidPhysicsBinderRef.current;
          if (physEng && physEng.isReady && humBinder) {
            const capId = humBinder.getMultiBodyManager().getCapsuleBody();
            if (capId !== null && capId >= 0) {
              const w = physEng.getWorld();
              const mdl = w.model;
              const d = w.data;

              // Build caches now so initial frame has data
              const mujocoModule = PhysicsEngine.getModule();
              if (mujocoModule) {
                if (!diagJointCacheRef.current) {
                  const cache = new Map<string, { bodyId: number; qposAdr: number; dofAdr: number; dofCount: number; qposCount: number; name: string }>();
                  for (let ji = 0; ji < mdl.njnt; ji++) {
                    const bodyId = mdl.jnt_bodyid[ji];
                    const bodyName = mujocoModule.mj_id2name(mdl, 1, bodyId);
                    if (!bodyName || bodyName === 'root_capsule') continue;
                    const jntType = mdl.jnt_type[ji];
                    if (jntType === 0) continue;
                    const qp = jntType === 1 ? 4 : 1;
                    const dc = jntType === 1 ? 3 : 1;
                    const jointName = mujocoModule.mj_id2name(mdl, 3, ji) || bodyName;
                    cache.set(jointName, {
                      bodyId,
                      qposAdr: mdl.jnt_qposadr[ji],
                      dofAdr: mdl.jnt_dofadr[ji],
                      dofCount: dc,
                      qposCount: qp,
                      name: jointName,
                    });
                  }
                  diagJointCacheRef.current = cache;
                }
                if (!diagGeomCacheRef.current) {
                  const geomCache = new Map<string, { geomId: number; bodyName: string; type: number }>();
                  for (let gi = 0; gi < mdl.ngeom; gi++) {
                    const geomName = mujocoModule.mj_id2name(mdl, 5, gi);
                    if (!geomName || geomName.startsWith('env_slot_') || geomName.startsWith('piano_') || geomName === 'floor') continue;
                    const bodyId = mdl.geom_bodyid[gi];
                    const bodyName = mujocoModule.mj_id2name(mdl, 1, bodyId) || '';
                    geomCache.set(geomName, { geomId: gi, bodyName, type: mdl.geom_type[gi] });
                  }
                  diagGeomCacheRef.current = geomCache;
                }
                if (!diagBodyCacheRef.current) {
                  const bodyCache = new Map<string, { bodyId: number; mass: number; parentBodyId: number; geomIds: number[] }>();
                  for (let bi = 0; bi < mdl.nbody; bi++) {
                    const bodyName = mujocoModule.mj_id2name(mdl, 1, bi);
                    if (!bodyName || bodyName.startsWith('env_slot_') || bodyName.startsWith('piano_') || bodyName === 'floor' || bodyName === 'world') continue;
                    const geomIds: number[] = [];
                    const gadr = mdl.body_geomadr[bi];
                    const gnum = mdl.body_geomnum[bi];
                    for (let gi = 0; gi < gnum; gi++) geomIds.push(gadr + gi);
                    bodyCache.set(bodyName, {
                      bodyId: bi,
                      mass: mdl.body_mass[bi],
                      parentBodyId: mdl.body_parentid[bi],
                      geomIds,
                    });
                  }
                  diagBodyCacheRef.current = bodyCache;
                }
              }

              let totalM = 0, comX = 0, comY = 0, comZ = 0;
              for (let bi = 0; bi < mdl.nbody; bi++) {
                const m = mdl.body_mass[bi];
                if (m <= 0) continue;
                const bname = mujocoModule ? mujocoModule.mj_id2name(mdl, 1, bi) : '';
                if (bname.startsWith('env_slot_') || bname.startsWith('piano_') || bname === 'floor' || bname === 'world') continue;
                comX += m * d.xpos[bi * 3];
                comY += m * d.xpos[bi * 3 + 1];
                comZ += m * d.xpos[bi * 3 + 2];
                totalM += m;
              }
              if (totalM > 0) { comX /= totalM; comY /= totalM; comZ /= totalM; }
              const qx = d.xquat[capId * 4 + 1], qy = d.xquat[capId * 4 + 2];
              const upZ = 1 - 2 * (qx * qx + qy * qy);
              const tiltDeg = Math.acos(Math.min(1, Math.max(-1, upZ))) * 180 / Math.PI;
              const feetMap = humBinder.getMultiBodyManager().getRigidBodiesMap();
              const lFootId = feetMap.get('mixamorigleftfoot');
              const rFootId = feetMap.get('mixamorigrightfoot');
              const lFootH = lFootId !== undefined ? d.xpos[lFootId * 3 + 2] : 0;
              const rFootH = rFootId !== undefined ? d.xpos[rFootId * 3 + 2] : 0;
              const rootDof = mdl.body_dofadr[capId];

              // Build joint data for initial frame
              const jointsInit: Record<string, { qpos: number[]; qvel: number[]; bodyId: number; bodyName: string }> = {};
              const jCache = diagJointCacheRef.current;
              if (jCache) {
                for (const [, info] of jCache) {
                  const qpos: number[] = [];
                  for (let k = 0; k < info.qposCount; k++) qpos.push(d.qpos[info.qposAdr + k]);
                  const qvel: number[] = [];
                  for (let k = 0; k < info.dofCount; k++) qvel.push(d.qvel[info.dofAdr + k]);
                  jointsInit[info.name] = { qpos, qvel, bodyId: info.bodyId, bodyName: info.name };
                }
              }

              // Build body data for initial frame
              const bodiesInit: Record<string, { pos: number[]; quat: number[]; linVel: number[]; angVel: number[]; cfrc: number[]; mass: number }> = {};
              const bCache = diagBodyCacheRef.current;
              if (bCache) {
                for (const [name, info] of bCache) {
                  const bi = info.bodyId;
                  const pos = [d.xpos[bi * 3], d.xpos[bi * 3 + 1], d.xpos[bi * 3 + 2]];
                  const quat = [d.xquat[bi * 4], d.xquat[bi * 4 + 1], d.xquat[bi * 4 + 2], d.xquat[bi * 4 + 3]];
                  const cv = bi * 6;
                  const linVel = [d.cvel[cv], d.cvel[cv + 1], d.cvel[cv + 2]];
                  const angVel = [d.cvel[cv + 3], d.cvel[cv + 4], d.cvel[cv + 5]];
                  const cfrc = [d.cfrc_ext[cv], d.cfrc_ext[cv + 1], d.cfrc_ext[cv + 2], d.cfrc_ext[cv + 3], d.cfrc_ext[cv + 4], d.cfrc_ext[cv + 5]];
                  bodiesInit[name] = { pos, quat, linVel, angVel, cfrc, mass: info.mass };
                }
              }

              // Build geom data for initial frame
              const geomsInit: Record<string, { pos: number[]; bodyName: string }> = {};
              const gCache = diagGeomCacheRef.current;
              if (gCache) {
                for (const [name, info] of gCache) {
                  const gi = info.geomId;
                  geomsInit[name] = {
                    pos: [d.geom_xpos[gi * 3], d.geom_xpos[gi * 3 + 1], d.geom_xpos[gi * 3 + 2]],
                    bodyName: info.bodyName,
                  };
                }
              }

              // Build contact data for initial frame
              const contactsInit: Array<{ geom1: string; geom2: string; pos: number[]; dist: number; normal: number[]; force: number[] }> = [];
              if (mujocoModule && d.ncon > 0 && d.ncon <= 200) {
                const forceBuffer = new mujocoModule.DoubleBuffer(6);
                try {
                  for (let ci = 0; ci < d.ncon; ci++) {
                    try {
                      const contact = d.contact.get(ci);
                      if (!contact) continue;
                      const g1 = mujocoModule.mj_id2name(mdl, 5, contact.geom1) || `geom_${contact.geom1}`;
                      const g2 = mujocoModule.mj_id2name(mdl, 5, contact.geom2) || `geom_${contact.geom2}`;
                      mujocoModule.mj_contactForce(mdl, d, ci, forceBuffer);
                      const fv = forceBuffer.GetView();
                      contactsInit.push({
                        geom1: g1, geom2: g2,
                        pos: [contact.pos[0], contact.pos[1], contact.pos[2]],
                        dist: contact.dist,
                        normal: [contact.frame[0], contact.frame[1], contact.frame[2]],
                        force: [fv[0], fv[1], fv[2]],
                      });
                    } catch { /* ignore */ }
                  }
                } finally {
                  forceBuffer.delete();
                }
              }

              diagRingRef.current.push({
                f: diagRingFrameCount.current++,
                t: Date.now(),
                rootH: d.xpos[capId * 3 + 2],
                rootX: d.xpos[capId * 3],
                rootY: d.xpos[capId * 3 + 1],
                tilt: tiltDeg,
                comZ, comX, comY,
                rootVy: d.qvel[rootDof + 1],
                rootLinVz: d.qvel[rootDof + 2],
                lFootH, rFootH,
                ncon: d.ncon,
                grounded: humBinder.getIsGrounded(),
                xfrc: [d.xfrc_applied[capId * 6 + 3], d.xfrc_applied[capId * 6 + 4], d.xfrc_applied[capId * 6 + 5]],
                joints: jointsInit,
                bodies: bodiesInit,
                geoms: geomsInit,
                contacts: contactsInit,
              });
              console.log(`[DIAG] Initial state captured: tilt=${tiltDeg.toFixed(1)}° rootH=${(d.xpos[capId * 3 + 2]).toFixed(3)} joints=${Object.keys(jointsInit).length} bodies=${Object.keys(bodiesInit).length} geoms=${Object.keys(geomsInit).length} contacts=${contactsInit.length}`);
            }
          }
        } catch { /* ignore */ }
        if (diagRingRef.current.length >= DIAG_RING_SIZE) diagCaptureDone.current = true;

        Logger.info("useWorld: Starting animation loop...");
        worldEngineRef.current.start(
          () => {
            // ── Per-step (500Hz): Diagnostics ring-buffer capture (throttled to 1/frame) ──
            const physics = physicsEngineRef.current;

            if (!physics || physics.isStepping || physics.isMutating) {
              return;
            }

            // Throttle: capture snapshot once per ~8 steps (= once per frame at 500Hz/60fps)
            const stepCount = physics.getStepCount();
            if (stepCount % 8 !== 0) return;

            try {
              const physEng = physicsEngineRef.current;
              const humBinder = humanoidPhysicsBinderRef.current;
              if (physEng && physEng.isReady && humBinder) {
                const capId = humBinder.getMultiBodyManager().getCapsuleBody();
                if (capId !== null && capId >= 0) {
                  const w = physEng.getWorld();
                  const mdl = w.model;
                  const d = w.data;

                  const mujocoModule = PhysicsEngine.getModule();
                  if (mujocoModule) {
                    if (!diagJointCacheRef.current) {
                      const cache = new Map<string, { bodyId: number; qposAdr: number; dofAdr: number; dofCount: number; qposCount: number; name: string }>();
                      for (let ji = 0; ji < mdl.njnt; ji++) {
                        const bodyId = mdl.jnt_bodyid[ji];
                        const bodyName = mujocoModule.mj_id2name(mdl, 1, bodyId);
                        if (!bodyName || bodyName === 'root_capsule') continue;
                        const jntType = mdl.jnt_type[ji];
                        if (jntType === 0) continue;
                        const qp = jntType === 1 ? 4 : 1;
                        const dc = jntType === 1 ? 3 : 1;
                        const jointName = mujocoModule.mj_id2name(mdl, 3, ji) || bodyName;
                        cache.set(jointName, {
                          bodyId,
                          qposAdr: mdl.jnt_qposadr[ji],
                          dofAdr: mdl.jnt_dofadr[ji],
                          dofCount: dc,
                          qposCount: qp,
                          name: jointName,
                        });
                      }
                      diagJointCacheRef.current = cache;
                      console.log(`[DIAG] Joint cache: ${cache.size} joints mapped`);
                    }

                    if (!diagGeomCacheRef.current) {
                      const geomCache = new Map<string, { geomId: number; bodyName: string; type: number }>();
                      for (let gi = 0; gi < mdl.ngeom; gi++) {
                        const geomName = mujocoModule.mj_id2name(mdl, 5, gi);
                        if (!geomName || geomName.startsWith('env_slot_') || geomName.startsWith('piano_') || geomName === 'floor') continue;
                        const bodyId = mdl.geom_bodyid[gi];
                        const bodyName = mujocoModule.mj_id2name(mdl, 1, bodyId) || '';
                        geomCache.set(geomName, { geomId: gi, bodyName, type: mdl.geom_type[gi] });
                      }
                      diagGeomCacheRef.current = geomCache;
                      console.log(`[DIAG] Geom cache: ${geomCache.size} geoms mapped`);
                    }

                    if (!diagBodyCacheRef.current) {
                      const bodyCache = new Map<string, { bodyId: number; mass: number; parentBodyId: number; geomIds: number[] }>();
                      for (let bi = 0; bi < mdl.nbody; bi++) {
                        const bodyName = mujocoModule.mj_id2name(mdl, 1, bi);
                        if (!bodyName || bodyName.startsWith('env_slot_') || bodyName.startsWith('piano_') || bodyName === 'floor' || bodyName === 'world') continue;
                        const geomIds: number[] = [];
                        const gadr = mdl.body_geomadr[bi];
                        const gnum = mdl.body_geomnum[bi];
                        for (let gi = 0; gi < gnum; gi++) geomIds.push(gadr + gi);
                        bodyCache.set(bodyName, {
                          bodyId: bi,
                          mass: mdl.body_mass[bi],
                          parentBodyId: mdl.body_parentid[bi],
                          geomIds,
                        });
                      }
                      diagBodyCacheRef.current = bodyCache;
                      console.log(`[DIAG] Body cache: ${bodyCache.size} bodies mapped`);
                    }
                  }

                  const rootDof = mdl.body_dofadr[capId];
                  let totalM = 0, comX = 0, comY = 0, comZ = 0;
                  for (let bi = 0; bi < mdl.nbody; bi++) {
                    const m = mdl.body_mass[bi];
                    if (m <= 0) continue;
                    const bname = mujocoModule ? mujocoModule.mj_id2name(mdl, 1, bi) : '';
                    if (bname.startsWith('env_slot_') || bname.startsWith('piano_') || bname === 'floor' || bname === 'world') continue;
                    comX += m * d.xpos[bi * 3];
                    comY += m * d.xpos[bi * 3 + 1];
                    comZ += m * d.xpos[bi * 3 + 2];
                    totalM += m;
                  }
                  if (totalM > 0) { comX /= totalM; comY /= totalM; comZ /= totalM; }
                  const qx = d.xquat[capId * 4 + 1], qy = d.xquat[capId * 4 + 2];
                  const upZ = 1 - 2 * (qx * qx + qy * qy);
                  const tiltDeg = Math.acos(Math.min(1, Math.max(-1, upZ))) * 180 / Math.PI;
                  const feetMap = humBinder.getMultiBodyManager().getRigidBodiesMap();
                  const lFootId = feetMap.get('mixamorigleftfoot');
                  const rFootId = feetMap.get('mixamorigrightfoot');
                  const lFootH = lFootId !== undefined ? d.xpos[lFootId * 3 + 2] : 0;
                  const rFootH = rFootId !== undefined ? d.xpos[rFootId * 3 + 2] : 0;

                  const jointCache = diagJointCacheRef.current;
                  const joints: Record<string, { qpos: number[]; qvel: number[]; bodyId: number; bodyName: string }> = {};
                  if (jointCache) {
                    for (const [, info] of jointCache) {
                      const qpos: number[] = [];
                      for (let k = 0; k < info.qposCount; k++) qpos.push(d.qpos[info.qposAdr + k]);
                      const qvel: number[] = [];
                      for (let k = 0; k < info.dofCount; k++) qvel.push(d.qvel[info.dofAdr + k]);
                      joints[info.name] = { qpos, qvel, bodyId: info.bodyId, bodyName: info.name };
                    }
                  }

                  const bodyCache = diagBodyCacheRef.current;
                  const bodies: Record<string, { pos: number[]; quat: number[]; linVel: number[]; angVel: number[]; cfrc: number[]; mass: number }> = {};
                  if (bodyCache) {
                    for (const [name, info] of bodyCache) {
                      const bi = info.bodyId;
                      const pos = [d.xpos[bi * 3], d.xpos[bi * 3 + 1], d.xpos[bi * 3 + 2]];
                      const quat = [d.xquat[bi * 4], d.xquat[bi * 4 + 1], d.xquat[bi * 4 + 2], d.xquat[bi * 4 + 3]];
                      const cv = bi * 6;
                      const linVel = [d.cvel[cv], d.cvel[cv + 1], d.cvel[cv + 2]];
                      const angVel = [d.cvel[cv + 3], d.cvel[cv + 4], d.cvel[cv + 5]];
                      const cfrc = [d.cfrc_ext[cv], d.cfrc_ext[cv + 1], d.cfrc_ext[cv + 2], d.cfrc_ext[cv + 3], d.cfrc_ext[cv + 4], d.cfrc_ext[cv + 5]];
                      bodies[name] = { pos, quat, linVel, angVel, cfrc, mass: info.mass };
                    }
                  }

                  const geomCache = diagGeomCacheRef.current;
                  const geoms: Record<string, { pos: number[]; bodyName: string }> = {};
                  if (geomCache) {
                    for (const [name, info] of geomCache) {
                      const gi = info.geomId;
                      geoms[name] = {
                        pos: [d.geom_xpos[gi * 3], d.geom_xpos[gi * 3 + 1], d.geom_xpos[gi * 3 + 2]],
                        bodyName: info.bodyName,
                      };
                    }
                  }

                  const contacts: Array<{ geom1: string; geom2: string; pos: number[]; dist: number; normal: number[]; force: number[] }> = [];
                  if (mujocoModule && geomCache && d.ncon > 0 && d.ncon <= 200) {
                    const forceBuffer = new mujocoModule.DoubleBuffer(6);
                    try {
                      for (let ci = 0; ci < d.ncon; ci++) {
                        try {
                          const contact = d.contact.get(ci);
                          if (!contact) continue;
                          const g1 = mujocoModule.mj_id2name(mdl, 5, contact.geom1) || `geom_${contact.geom1}`;
                          const g2 = mujocoModule.mj_id2name(mdl, 5, contact.geom2) || `geom_${contact.geom2}`;
                          mujocoModule.mj_contactForce(mdl, d, ci, forceBuffer);
                          const fv = forceBuffer.GetView();
                          contacts.push({
                            geom1: g1, geom2: g2,
                            pos: [contact.pos[0], contact.pos[1], contact.pos[2]],
                            dist: contact.dist,
                            normal: [contact.frame[0], contact.frame[1], contact.frame[2]],
                            force: [fv[0], fv[1], fv[2]],
                          });
                        } catch { /* ignore */ }
                      }
                    } finally {
                      forceBuffer.delete();
                    }
                  }

                  const snapshot = {
                    f: diagRingFrameCount.current++,
                    t: Date.now(),
                    rootH: d.xpos[capId * 3 + 2],
                    rootX: d.xpos[capId * 3],
                    rootY: d.xpos[capId * 3 + 1],
                    tilt: tiltDeg,
                    comZ, comX, comY,
                    rootVy: d.qvel[rootDof + 1],
                    rootLinVz: d.qvel[rootDof + 2],
                    lFootH, rFootH,
                    ncon: d.ncon,
                    grounded: humBinder.getIsGrounded(),
                    xfrc: [d.xfrc_applied[capId * 6 + 3], d.xfrc_applied[capId * 6 + 4], d.xfrc_applied[capId * 6 + 5]],
                    joints,
                    bodies,
                    geoms,
                    contacts,
                  };
                  if (!diagCaptureDone.current) {
                    const ring = diagRingRef.current;
                    ring.push(snapshot);
                    diagRingIdx.current = ring.length;
                    if (ring.length >= DIAG_RING_SIZE) {
                      diagCaptureDone.current = true;
                      console.log(`[DIAG] Captured ${DIAG_RING_SIZE} frames. Ring buffer full.`);
                    }
                  }
                }
              }
            } catch (diagErr) { if (diagRingFrameCount.current < 3) console.warn('[DIAG CAPTURE ERROR]', diagErr); }
          },
          () => {
            // ── Per-frame (60Hz): Object sync, motor updates, camera, boundary ──
            try {
              objectManagerRef.current?.update();
              objectManagerRef.current?.syncVisuals();
            } catch (error) {
              Logger.warn("ObjectManager update error caught safely", error);
            }

            if (worldStore.bodyType === 'humanoid') {
              for (const [id, binder] of humanoidPhysicsBindersRef.current.entries()) {
                try {
                  binder.updateMotorTargets();
                  binder.syncVisuals();

                  const activeId = useAgentStore.getState().activeAgentId || 'agent_0';
                  if (id === activeId) {
                    binder.renderAICameraHelper(
                      useWorldStore.getState().showAICameraHelper,
                      worldEngineRef.current?.getCameraManager().getCameraData()
                    );
                    const state = binder.getJointState();
                    lastJointStateRef.current = state;

                    const headTransform = binder.getHeadTransform();
                    if (headTransform) {
                      const headMatrix = new THREE.Matrix4().compose(
                        headTransform.position,
                        headTransform.quaternion,
                        new THREE.Vector3(1, 1, 1)
                      );

                      let capsuleQuat: THREE.Quaternion | undefined;
                      let capsulePos: THREE.Vector3 | undefined;
                      const capsuleBody = binder.getCapsuleBody();
                      if (capsuleBody?.isValid()) {
                        const t = capsuleBody.translation();
                        const r = capsuleBody.rotation();
                        capsulePos = new THREE.Vector3(t.x, t.y, t.z);
                        capsuleQuat = new THREE.Quaternion(r.x, r.y, r.z, r.w);
                      }

                      worldEngineRef.current?.getCameraManager().update(headMatrix, headTransform.position, capsuleQuat, capsulePos);
                    }
                  }

                  if (binder.isOutOfWorldBounds()) {
                    const offsetIndex = parseInt(id.replace('agent_', '')) || 0;
                    let spawnX = 0;
                    if (offsetIndex === 1) spawnX = 1.75;
                    else if (offsetIndex === 2) spawnX = -1.75;
                    else if (offsetIndex > 2) {
                      spawnX = offsetIndex % 2 === 1 ? 1.75 * Math.ceil(offsetIndex / 2) : -1.75 * (offsetIndex / 2);
                    }
                    const agentSpawn = new THREE.Vector3(spawnX, 0, 0);
                    binder.resetPose(agentSpawn);
                  }
                } catch (error) {
                  Logger.warn(`HumanoidPhysicsBinder (${id}) sync failed:`, error);
                }
              }
            }
          }
        );

        setIsReady(true);
        // Mark rehydration/loading as complete so the startup modal will close.
        agentStore.setHasRehydrated(true);
        Logger.info('useWorld: Initialization complete.');
      } catch (error) {
        Logger.error("useWorld: Initialization failed", error);
        debouncedToast("physics-init-fail", () => {
          synthiaToast.error(STRINGS.TOASTS.RAPIER_LOAD_FAIL);
        });
      }
    };

    init();

    return () => {
      cancelled = true;
      worldEngineRef.current?.stop();
      physicsEngineRef.current?.cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  useEffect(() => {
    if (physicsEngineRef.current) {
      physicsEngineRef.current.setGravity(worldStore.gravity);
    }
  }, [worldStore.gravity]);

  useEffect(() => {
    humanoidPhysicsBindersRef.current.forEach((binder) => {
      binder.friction = worldStore.globalFriction;
    });
    // Also update friction on all spawned objects
    if (objectManagerRef.current) {
      objectManagerRef.current.setGlobalFriction(worldStore.globalFriction);
    }
  }, [worldStore.globalFriction]);

  useEffect(() => {
    humanoidPhysicsBindersRef.current.forEach((binder) => {
      binder.setLerpSpeed(worldStore.movementSmoothing);
    });
  }, [worldStore.movementSmoothing]);

  useEffect(() => {
    humanoidPhysicsBindersRef.current.forEach((binder) => {
      binder.renderDebugSpheres(worldStore.showDebugJoints);
    });
  }, [worldStore.showDebugJoints]);

  useEffect(() => {
    if (worldStore.bodyType === 'humanoid') {
      humanoidPhysicsBindersRef.current.forEach((binder) => {
        binder.setMode(worldStore.bodyMode);
      });
    }
  }, [worldStore.bodyMode, worldStore.bodyType]);

  // Handle floor, grid, and sky state
  useEffect(() => {
    if (worldEngineRef.current) {
      worldEngineRef.current.updateFloor(worldStore.showFloor, worldStore.floorColor);
      worldEngineRef.current.updateGrid(worldStore.showGrid);
      worldEngineRef.current.updateSkyColor(worldStore.skyColor);
    }
  }, [worldStore.showFloor, worldStore.floorColor, worldStore.showGrid, worldStore.skyColor]);

  // Handle object renaming, physics update, and deletion
  useEffect(() => {
    const handleRename = (e: any) => {
      const { id, name } = e.detail;
      const activeObjManager = objectManagerRef.current;
      activeObjManager?.renameObject(id, name);
    };

    const handleUpdatePhysics = (e: any) => {
      const { id, updates } = e.detail;
      const activeObjManager = objectManagerRef.current;
      activeObjManager?.updateObjectPhysics(id, updates);
    };

    const handleDeleteObject = (e: any) => {
      const { id } = e.detail;
      const activeObjManager = objectManagerRef.current;
      // Detach TransformControls before removing the object to prevent
      // "not part of scene graph" errors from the gizmo tracking a removed object.
      worldEngineRef.current?.getCameraManager().attachTransform(null);
      activeObjManager?.deleteObject(id);
      if (useUIStore.getState().selectedEntityId === id) {
        useUIStore.getState().setSelectedEntityId(null);
      }
    };

    window.addEventListener('synthia:rename', handleRename);
    window.addEventListener('synthia:updatePhysics', handleUpdatePhysics);
    window.addEventListener('synthia:deleteObject', handleDeleteObject);
    return () => {
      window.removeEventListener('synthia:rename', handleRename);
      window.removeEventListener('synthia:updatePhysics', handleUpdatePhysics);
      window.removeEventListener('synthia:deleteObject', handleDeleteObject);
    };
  }, []);

  // Bug 4 Fix: Subscribe to camera mode and relay to CameraManager
  useEffect(() => {
    worldEngineRef.current?.getCameraManager().setMode(worldStore.cameraMode);
  }, [worldStore.cameraMode]);

  // Instant Camera target snap on active agent change
  const activeAgentId = useAgentStore((state) => state.activeAgentId);
  const lastActiveAgentIdRef = useRef<string>('agent_0');

  useEffect(() => {
    if (!isReady || !worldEngineRef.current) return;
    if (activeAgentId !== lastActiveAgentIdRef.current) {
      lastActiveAgentIdRef.current = activeAgentId;

      const binder = humanoidPhysicsBindersRef.current.get(activeAgentId);
      if (binder) {
        const headTransform = binder.getHeadTransform();
        if (headTransform && headTransform.position) {
          const camManager = worldEngineRef.current.getCameraManager();
          camManager.getTransformControls().detach();
          camManager.getMainCamera().lookAt(headTransform.position);
          (camManager as any).controls.target.copy(headTransform.position);
          (camManager as any).controls.update();
          console.log(`[useWorld] Instantly snapped camera focus to selected agent: ${activeAgentId}`);
        }
      }
    }
  }, [activeAgentId, isReady]);

  const findSpawnPosition = useCallback((skipHumanoidCheck = false): THREE.Vector3 => {
    const humanoidPos = new THREE.Vector3(0, 0, 5);
    const binder = humanoidPhysicsBinderRef.current;
    if (binder) {
      const headTransform = binder.getHeadTransform();
      if (headTransform) {
        humanoidPos.set(headTransform.position.x, 0, headTransform.position.z);
      }
    }

    const activeObjManager = objectManagerRef.current;
    const spawnRadius = 2.2;
    const spawnPos = new THREE.Vector3();
    let placed = false;

    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = (attempt / 8) * Math.PI * 2;
      const candidateX = humanoidPos.x + Math.sin(angle) * spawnRadius;
      const candidateZ = humanoidPos.z + Math.cos(angle) * spawnRadius;
      const candidateY = 0.6;

      let overlaps = false;
      activeObjManager?.getObjects().forEach((obj) => {
        if (overlaps) return;
        const dx = Math.abs(obj.mesh.position.x - candidateX);
        const dz = Math.abs(obj.mesh.position.z - candidateZ);
        if (dx < 1.2 && dz < 1.2) overlaps = true;
      });
      if (!skipHumanoidCheck) {
        const dhx = Math.abs(humanoidPos.x - candidateX);
        const dhz = Math.abs(humanoidPos.z - candidateZ);
        if (dhx < 0.8 && dhz < 0.8) overlaps = true;
      }

      if (!overlaps) {
        spawnPos.set(candidateX, candidateY, candidateZ);
        placed = true;
        break;
      }
    }

    if (!placed) {
      spawnPos.set(humanoidPos.x + 4, 0.6, humanoidPos.z);
    }
    return spawnPos;
  }, []);

  // Bug 3 Fix: Listen for object spawn events dispatched by ObjectSpawner UI
  useEffect(() => {
    const handleSpawnEvent = (e: Event) => {
      const { presetId } = (e as CustomEvent).detail;
      const activeObjManager = objectManagerRef.current;
      if (!activeObjManager) {
        Logger.warn('useWorld: spawnObject called but activeObjManager not ready');
        return;
      }

      const spawnPos = findSpawnPosition();
      const obj = activeObjManager.spawnObject(presetId, spawnPos);
      if (obj) {
        Logger.info(`useWorld: Object '${presetId}' spawned successfully (id=${obj.id}). Total objects: ${activeObjManager.getObjects().size}`);
      } else {
        Logger.error(`useWorld: spawnObject returned null for presetId='${presetId}'`);
      }
    };

    window.addEventListener('synthia:spawn', handleSpawnEvent);
    return () => window.removeEventListener('synthia:spawn', handleSpawnEvent);
  }, [findSpawnPosition]);

  useEffect(() => {
    const handleSpawnCustom = (e: Event) => {
      const { name, scene, isTerrain } = (e as CustomEvent).detail as {
        name: string;
        scene: THREE.Group;
        isTerrain: boolean;
      };
      const activeObjManager = objectManagerRef.current;
      if (!activeObjManager) return;

      const box = new THREE.Box3().setFromObject(scene);
      const size = box.getSize(new THREE.Vector3());
      const spawnPos = findSpawnPosition(isTerrain);
      if (isTerrain) {
        spawnPos.y = -box.min.y;
      } else {
        spawnPos.y = Math.max(0.1, size.y / 2 + 0.01);
      }

      const obj = activeObjManager.spawnCustomModel(scene, name, spawnPos, { isTerrain });
      if (obj) {
        Logger.info(`useWorld: Custom model '${name}' spawned (id=${obj.id})`);
      }
    };

    window.addEventListener('synthia:spawnCustom', handleSpawnCustom);
    return () => window.removeEventListener('synthia:spawnCustom', handleSpawnCustom);
  }, [findSpawnPosition]);

  // Helpers to capture and build state/loops per agent
  const captureWorldStateForAgent = useCallback(async (agentId: string) => {
    if (!worldEngineRef.current || !audioEngineRef.current) return null;

    const binder = humanoidPhysicsBindersRef.current.get(agentId);
    if (!binder) return null;

    const renderer = worldEngineRef.current.getRenderer();
    const scene = worldEngineRef.current.getScene();
    const camera = worldEngineRef.current.getCamera();

    // Render main view
    renderer.render(scene, camera);

    const rawFrame = worldEngineRef.current.getLastAIFrame();
    if (!rawFrame || rawFrame === '') {
      Logger.warn(`captureWorldState (${agentId}): frame not yet available, skipping cycle`);
      return null;
    }

    const frame = rawFrame;
    const fileSize = (frame.length * 0.75) / 1024;
    (window as any)._synthia_connection_store_metrics?.({
      frameSize: fileSize,
    });

    const joints = binder.getJointState();

    let proprioception: any = null;
    if (binder.mbActive) {
      const obsBuilder = binder.getObservationBuilder();
      const capsuleBody = binder.getCapsuleBody();
      if (capsuleBody?.isValid()) {
        proprioception = obsBuilder.buildVLMProprioception(capsuleBody);
      }
    }

    const audioBuffer = await audioEngineRef.current.getBuffer();
    const audioPcm = audioBuffer ? btoa(String.fromCharCode(...new Uint8Array(audioBuffer.buffer))) : "";

    let contact_forces: Record<string, any> = {};
    if (useWorldStore.getState().bodyType === 'humanoid') {
      contact_forces = binder.getContactForces();
    }

    const activeObjManager = objectManagerRef.current;
    const objects = activeObjManager
      ? Array.from(activeObjManager.getObjects().values()).map((obj: any) => ({
          id: obj.id,
          type: obj.type,
          name: obj.name || obj.type,
          position: {
            x: obj.mesh?.position.x ?? 0,
            y: obj.mesh?.position.y ?? 0,
            z: obj.mesh?.position.z ?? 0
          },
          dimensions: obj.dimensions || { w: 1, h: 1, d: 1 },
          isStatic: obj.isStatic ?? true,
          interactionZones: obj.interactionZones?.map((z: any) => ({
            zoneId: z.id || z.zoneId,
            note: z.note,
            onContact: z.onContact
          })) || []
        }))
      : [];

    const uprightPreset = binder.getUprightPreset();
    const isGrounded = binder.getIsGrounded();

    const agentState = useAgentStore.getState().agents[agentId] || { heartbeat: 0, currentRung: 0, currentGoal: '' };

    return {
      frame,
      joints,
      proprioception,
      audio_pcm: audioPcm,
      contact_forces,
      objects,
      uprightPreset,
      isGrounded,
      heartbeat: agentState.heartbeat,
      currentRung: agentState.currentRung,
      bodyType: useWorldStore.getState().bodyType,
      currentGoal: agentState.currentGoal,
      lightState: useWorldStore.getState().lightState,
      timestamp: Date.now(),
    };
  }, []);

  const generateCombinedMCF = useCallback(() => {
    const agentsList: any[] = [];
    for (const [id, binder] of humanoidPhysicsBindersRef.current.entries()) {
      agentsList.push({
        prefix: binder.prefix,
        boneInfoMap: binder.getBoneInfoMap(),
        capsuleCenterY: binder.getCapsuleCenterY(),
      });
    }

    const customSpecs = objectManagerRef.current ? (objectManagerRef.current as any).customMeshesSpec : [];
    return generateCombinedMultiAgentMJCF(agentsList, customSpecs);
  }, []);

  const startAgentClientLoop = useCallback((agentId: string) => {
    if (activeAgentLoopsRef.current.has(agentId)) {
      activeAgentLoopsRef.current.get(agentId)!.stop();
    }

    const connStore = useConnectionStore.getState();
    const loop = new AgentLoop({
      agentId,
      cycleMs: connStore.cycleMs || 2000,
      supabaseUrl: connStore.supabaseUrl,
      supabaseKey: connStore.supabaseKey,
      captureWorldState: async () => {
        return await captureWorldStateForAgent(agentId);
      }
    });

    loop.setProvider(connStore.providerType, connStore.endpoint, connStore.apiKey, connStore.model);
    loop.start().catch((err) => Logger.error(`[AgentLoop (${agentId})] Failed to start client loop`, err));

    activeAgentLoopsRef.current.set(agentId, loop);
    console.log(`[useWorld] Started client-side cognitive loop for ${agentId}`);
  }, [captureWorldStateForAgent]);

  const spawnAgent = useCallback(async () => {
    if (!worldEngineRef.current || !physicsEngineRef.current) return null;

    const physicsEngine = physicsEngineRef.current;
    const scene = worldEngineRef.current.getScene();

    const offsetIndex = humanoidPhysicsBindersRef.current.size;
    const agentId = `agent_${offsetIndex}`;

    // Linear offset spaced 1.75 meters apart
    let spawnX = 0;
    if (offsetIndex === 1) spawnX = 1.75;
    else if (offsetIndex === 2) spawnX = -1.75;
    else if (offsetIndex > 2) {
      spawnX = offsetIndex % 2 === 1 ? 1.75 * Math.ceil(offsetIndex / 2) : -1.75 * (offsetIndex / 2);
    }
    const spawnPoint = new THREE.Vector3(spawnX, 0, 0);

    const binder = new HumanoidPhysicsBinder(physicsEngine, scene, agentId);

    // STEP A: Load model bind pose
    const probePoint = new THREE.Vector3(0, 0, 0);
    const stepA = await binder.loadAndVisualizeBindPose(probePoint);
    if (!stepA) {
      Logger.error(`useWorld: spawnAgent - STEP A failed for ${agentId}`);
      return null;
    }

    binder.repositionModel(spawnPoint.x, spawnPoint.y, spawnPoint.z);

    binder.friction = worldStore.globalFriction;
    binder.setLerpSpeed(worldStore.movementSmoothing);
    binder.renderDebugSpheres(worldStore.showDebugJoints);
    binder.setMode(worldStore.bodyMode);

    humanoidPhysicsBindersRef.current.set(agentId, binder);
    (window as any).__SYNTHIA_HUMANOID_BINDER__ = binder; // keep active
    (window as any).__SYNTHIA_HUMANOID_BINDERS__ = humanoidPhysicsBindersRef.current;

    // Rebuild physics world
    physicsEngine.setMutating(true);
    physicsEngine.setReady(false);

    try {
      const existingAgentIds = Array.from(humanoidPhysicsBindersRef.current.keys()).filter(id => id !== agentId);
      const objectsList = objectManagerRef.current ? Array.from(objectManagerRef.current.getObjects().values()) : [];
      const capturedState = StateRehydrator.capture(physicsEngine, existingAgentIds, objectsList);

      const baseXml = generateCombinedMCF();
      physicsEngine.loadMJCFModel(baseXml);
      physicsEngine.setReady(true);

      for (const [id, activeBinder] of humanoidPhysicsBindersRef.current.entries()) {
        const bm = activeBinder.getMultiBodyManager();
        bm.remapIdsAgainstLoadedWorld(activeBinder.getBoneInfoMap());
        activeBinder.initMotorController();

        // Re-initialize and activate position motors
        await activeBinder.createJointsWithZeroMotors();
        await activeBinder.activateMotorsWithStiffnessAndDamping(80, 10);

        // Correctly reset and re-initialize multi-body to bind visual bone synchronizers and observations
        activeBinder.deactivateMultiBody();
        if (worldStore.useMultiBodyPD) {
          await activeBinder.activateMultiBody();
        }
        activeBinder.setMode(worldStore.bodyMode);
      }

      StateRehydrator.restore(physicsEngine, capturedState, objectsList);

      const newAgentCapsule = binder.getMultiBodyManager().getCapsuleBody();
      if (newAgentCapsule && newAgentCapsule.isValid()) {
        binder.setCapsulePosition(spawnPoint.x, spawnPoint.y, spawnPoint.z);
        binder.resetPose(spawnPoint);
      }
    } catch (err) {
      Logger.error(`useWorld: spawnAgent - physics rebuild failed:`, err);
    } finally {
      physicsEngine.setMutating(false);
    }

    // Add agent to Zustand state
    const { addAgent } = useAgentStore.getState() as any;
    if (addAgent) {
      addAgent(agentId);
    }

    startAgentClientLoop(agentId);
    Logger.info(`useWorld: Spawned agent ${agentId} at X=${spawnX}`);
    return binder;
  }, [worldStore, generateCombinedMCF, startAgentClientLoop]);

  // Sync window generators
  useEffect(() => {
    (window as any).__SYNTHIA_GENERATE_COMBINED_MJCF__ = generateCombinedMCF;
    (window as any).synthia = {
      spawnAgent: async () => {
        return await spawnAgent();
      },
      getActiveAgentId: () => {
        return useAgentStore.getState().activeAgentId;
      },
      setActiveAgent: (id: string) => {
        useAgentStore.getState().setActiveAgentId(id);
      }
    };
    return () => {
      delete (window as any).__SYNTHIA_GENERATE_COMBINED_MJCF__;
      delete (window as any).synthia;
    };
  }, [generateCombinedMCF, spawnAgent]);

  // Sync connection store changes with active loops
  const connStore = useConnectionStore();
  useEffect(() => {
    activeAgentLoopsRef.current.forEach((loop) => {
      loop.setProvider(
        connStore.providerType,
        connStore.endpoint,
        connStore.apiKey,
        connStore.model
      );
      loop.updateSupabase(
        connStore.supabaseUrl,
        connStore.supabaseKey
      );
      loop.setCycleMs(connStore.cycleMs);
    });
  }, [
    connStore.providerType,
    connStore.endpoint,
    connStore.apiKey,
    connStore.model,
    connStore.supabaseUrl,
    connStore.supabaseKey,
    connStore.cycleMs,
  ]);

  useEffect(() => {
    const handlePush = (e: any) => {
      const { partName, impulse, agentId = 'agent_0' } = e.detail;
      const binder = humanoidPhysicsBindersRef.current.get(agentId);
      if (worldStore.bodyType === 'humanoid' && binder) {
        binder.push(partName, new THREE.Vector3(impulse.x, impulse.y, impulse.z));
      }
    };

    window.addEventListener('synthia:push', handlePush);
    return () => window.removeEventListener('synthia:push', handlePush);
  }, [worldStore.bodyType]);

  useEffect(() => {
    const handleAction = (e: any) => {
      const { jointOverrides, programSequence, sequence, activeGaitPhase, agentId = 'agent_0' } = e.detail;
      const binder = humanoidPhysicsBindersRef.current.get(agentId) as any;
      if (!binder) return;

      binder['timelineQueue'] = [];
      binder['timelineSequenceStart'] = null;

      Logger.info(`[ACTION_PIPELINE] useWorld handling action for ${agentId}: jointOverrides=${Object.keys(jointOverrides || {}).length} keys, sequence=${Array.isArray(sequence) ? sequence.length : 0}`);

      if (worldStore.bodyType === 'humanoid') {
        try {
          const skeleton = binder['skeleton'];

          if (Array.isArray(sequence) && sequence.length > 0) {
            const validation = binder.validateAndApplyTimeline(skeleton, sequence, { activeGaitPhase: !!activeGaitPhase });
            for (const f of validation.appliedTimeline) {
              if (f.timeOffsetMs === 0) {
                binder.setMotorTargets(f.overrides as any);
              }
            }

            const loop = activeAgentLoopsRef.current.get(agentId);
            if (loop && validation.rejections.length > 0) {
              loop.recordActionFeedback(validation.rejections);
            }
          } else {
            const seq = [{ timeOffsetMs: 0, overrides: jointOverrides || {} }];
            const validation = binder.validateAndApplyTimeline(skeleton, seq, { activeGaitPhase: false });
            for (const f of validation.appliedTimeline) {
              if (f.timeOffsetMs === 0) binder.setMotorTargets(f.overrides as any);
            }

            const loop = activeAgentLoopsRef.current.get(agentId);
            if (loop && validation.rejections.length > 0) {
              loop.recordActionFeedback(validation.rejections);
            }
          }

          if (programSequence && Array.isArray(programSequence) && programSequence.length > 0) {
            binder.executeProgramSequence(programSequence);
          }
        } catch (err) {
          Logger.warn(`Action validation failed for ${agentId}`, err);
        }
      }
    };

    window.addEventListener('synthia:action', handleAction);
    return () => window.removeEventListener('synthia:action', handleAction);
  }, [worldStore.bodyType]);

  // ── Reset Pose Event Handler ─────────────────────────────────────────
  useEffect(() => {
    const handleResetPose = () => {
      humanoidPhysicsBindersRef.current.forEach((binder, id) => {
        const offsetIndex = parseInt(id.replace('agent_', '')) || 0;
        let spawnX = 0;
        if (offsetIndex === 1) spawnX = 1.75;
        else if (offsetIndex === 2) spawnX = -1.75;
        else if (offsetIndex > 2) {
          spawnX = offsetIndex % 2 === 1 ? 1.75 * Math.ceil(offsetIndex / 2) : -1.75 * (offsetIndex / 2);
        }
        binder.resetPose(new THREE.Vector3(spawnX, 0, 0));
      });
    };
    window.addEventListener('synthia:resetPose', handleResetPose);
    return () => window.removeEventListener('synthia:resetPose', handleResetPose);
  }, []);

  // ── Root Motion Event Handler ────────────────────────────────────────
  useEffect(() => {
    const handleRootMotion = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const { dx = 0, dz = 0, agentId = 'agent_0' } = detail;
      if (worldStore.bodyType !== 'humanoid') return;
      const binder = humanoidPhysicsBindersRef.current.get(agentId);
      if (!binder) return;
      const capsuleBody = binder.getCapsuleBody();
      if (!capsuleBody || !capsuleBody.isValid()) return;
      const t = capsuleBody.translation();
      capsuleBody.setTranslation({ x: t.x + dx, y: t.y, z: t.z + dz }, true);
    };
    window.addEventListener('synthia:rootMotion', handleRootMotion);
    return () => { window.removeEventListener('synthia:rootMotion', handleRootMotion); };
  }, [worldStore.bodyType]);

  useEffect(() => {
    if (!isReady) return;

    const build = async () => {
      worldEngineRef.current?.getCameraManager().attachTransform(null);

      if (worldStore.bodyType === 'humanoid' && humanoidPhysicsBinderRef.current) {
        const binder = humanoidPhysicsBinderRef.current;

        // STEP A: Load model at x=0, z=0, y=0 initially
        const probePoint = new THREE.Vector3(0, 0, 0);
        const stepA = await binder.loadAndVisualizeBindPose(probePoint);
        if (!stepA) { Logger.error('useWorld: STEP A failed'); return; }

        binder.repositionModel(
          worldStore.spawnPoint.x,
          worldStore.spawnPoint.y,
          worldStore.spawnPoint.z
        );

        binder.renderDebugSpheres(worldStore.showDebugJoints);

        // STEP B: Create single capsule rigid body
        const stepB = await binder.createRigidBodiesAndColliders();
        if (!stepB) { Logger.error('useWorld: STEP B failed'); return; }
        Logger.info('useWorld: STEP B complete — single capsule created');

        // STEP C & D: No-ops for single capsule
        await binder.createJointsWithZeroMotors();
        await binder.activateMotorsWithStiffnessAndDamping(80, 10);
        Logger.info('useWorld: STEP D complete — model is standing');

        if (worldStore.useMultiBodyPD) {
          const mbSuccess = await binder.activateMultiBody();
          if (mbSuccess) {
            Logger.info('useWorld: Multi-body PD motor control activated');
          } else {
            Logger.warn('useWorld: Multi-body activation failed, using single capsule');
          }
        }

        binder.setMode(worldStore.bodyMode);

        // Start client-side cognitive loop for agent_0
        startAgentClientLoop('agent_0');

        // Warm-up
        physicsEngineRef.current?.forward();
      }
    };

    build();
  }, [
    isReady,
    worldStore.bodyType,
    worldStore.spawnPoint,
    worldStore.useMultiBodyPD,
    worldStore.bodyMode,
    worldStore.showDebugJoints,
    startAgentClientLoop,
  ]);

  useEffect(() => {
    if (!isReady) return;

    const interval = setInterval(() => {
      const nextState = worldStore.lightState === "day" ? "night" : "day";
      worldStore.setLightState(nextState);
    }, worldStore.dayNightCycleMs);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, worldStore.dayNightCycleMs, worldStore.lightState, worldStore.setLightState]);

  useEffect(() => {
    if (!worldEngineRef.current) return;

    const startTime = Date.now();
    const duration = 30000;

    const update = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      worldEngineRef.current?.updateLighting(worldStore.lightState, progress);

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    };

    update();
  }, [worldStore.lightState]);

  // Escape to deselect + Delete to remove selected object
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        useUIStore.getState().setSelectedEntityId(null);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const selectedId = useUIStore.getState().selectedEntityId;
        if (selectedId) {
          window.dispatchEvent(new CustomEvent('synthia:deleteObject', { detail: { id: selectedId } }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const captureWorldState = useCallback(async () => {
    const activeId = useAgentStore.getState().activeAgentId || 'agent_0';
    return await captureWorldStateForAgent(activeId);
  }, [captureWorldStateForAgent]);

  const detectOutcomes = useCallback(() => {
    const outcomes = [...pendingOutcomesRef.current];
    pendingOutcomesRef.current = [];

    if (useAgentStore.getState().status === "falling") {
      outcomes.push({
        type: "outcome",
        data: { success: false, reward: -1.0, description: "Agent fell" },
      });
    }

    return outcomes;
  }, []);

  return {
    isReady,
    getRagdoll: () => null,
    spawnObject: (presetId: string, pos: THREE.Vector3) => {
      const activeObjManager = objectManagerRef.current;
      return activeObjManager?.spawnObject(presetId, pos) || null;
    },
    deleteObject: (id: string) => {
      const activeObjManager = objectManagerRef.current;
      activeObjManager?.deleteObject(id);
    },
    push: (partName: string, impulse: THREE.Vector3) => {
      const activeId = useAgentStore.getState().activeAgentId || 'agent_0';
      const binder = humanoidPhysicsBindersRef.current.get(activeId);
      if (worldStore.bodyType === 'humanoid' && binder) {
        binder.push(partName, impulse);
      }
    },
    captureWorldState,
    detectOutcomes,
  };
};
