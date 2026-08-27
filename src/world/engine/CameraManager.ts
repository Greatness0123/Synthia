import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { logger as Logger } from '../../utils/logger';

export type CameraMode = 'third_person' | 'first_person' | 'model_input';

export class CameraManager {
  private thirdPersonCamera: THREE.PerspectiveCamera;

  private chaseCam: THREE.PerspectiveCamera;

  private aiPerceptionCamera: THREE.PerspectiveCamera;
  private renderTarget: THREE.WebGLRenderTarget;
  private aiRenderTarget: THREE.WebGLRenderTarget;
  private mode: CameraMode = 'third_person';
  private controls: OrbitControls;
  private transformControls: TransformControls;
  private renderer: THREE.WebGLRenderer;

  private static readonly DEFAULT_AI_VIEW_SIZE = 448;
  private static readonly DEFAULT_AI_VIEW_FOV = 110;

  private aiViewSize: number = CameraManager.DEFAULT_AI_VIEW_SIZE;

  private lastActiveAgentId: string = '';
  private snapNextFrame: boolean = false;
  private lastUpdateTime: number = 0;
  private initializeThirdPersonTarget: boolean = false;

  // Arrow key axial motion
  private keysPressed = new Set<string>();
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private static readonly CAMERA_MOVE_SPEED = 5.0;

  // ── Cached per-frame objects (avoid allocation churn) ──────────────────
  private _headPos = new THREE.Vector3();
  private _headQuat = new THREE.Quaternion();
  private _headScale = new THREE.Vector3();
  private _localOffset = new THREE.Vector3();
  private _targetCamPos = new THREE.Vector3();
  private _forward = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _moveDelta = new THREE.Vector3();

  public onDragEnd?: (object: THREE.Object3D) => void;
  public onDragChanged?: (dragging: boolean, object: THREE.Object3D | null) => void;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, canvas: HTMLCanvasElement) {
    this.renderer = renderer;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    this.thirdPersonCamera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    this.thirdPersonCamera.position.set(5, 2, 5);

    this.chaseCam = new THREE.PerspectiveCamera(90, width / height, 0.01, 100);
    this.chaseCam.position.set(0, 5, -6);
    this.chaseCam.lookAt(0, 1.5, 0);

    this.aiPerceptionCamera = new THREE.PerspectiveCamera(CameraManager.DEFAULT_AI_VIEW_FOV, 480 / 270, 0.01, 200);

    this.aiPerceptionCamera.position.set(0, 1.8, 0.5);
    this.aiPerceptionCamera.lookAt(0, 1.0, 10);

    this.renderTarget = new THREE.WebGLRenderTarget(480, 270);

    const size = this.aiViewSize;
    this.aiRenderTarget = new THREE.WebGLRenderTarget(size, size, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });

    this.controls = new OrbitControls(this.thirdPersonCamera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.target.set(0, 1, 0);

    this.transformControls = new TransformControls(this.thirdPersonCamera, canvas);
    scene.add(this.transformControls.getHelper());

    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.controls.enabled = !event.value;
      const obj = this.transformControls.object;
      if (this.onDragChanged) {
        this.onDragChanged(!!event.value, obj ?? null);
      }
      if (!event.value && obj && this.onDragEnd) {
        this.onDragEnd(obj);
      }
    });

    // Arrow key listeners for axial camera motion
    this.boundKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        this.keysPressed.add(e.key);
      }
    };
    this.boundKeyUp = (e: KeyboardEvent) => {
      this.keysPressed.delete(e.key);
    };
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);
  }

  /**
   * Rebuilds the AI perception camera FOV and render target size at runtime.
   * Higher sizes increase per-frame cost (and API payload size) — used by the
   * Agent Settings "Vision" section.
   */
  public setAIVisionConfig(fov: number, size: number): void {
    const clampedFov = Math.max(60, Math.min(180, fov));
    const clampedSize = Math.max(224, Math.min(896, size));

    this.aiPerceptionCamera.fov = clampedFov;
    this.aiPerceptionCamera.updateProjectionMatrix();

    if (clampedSize !== this.aiViewSize) {
      this.aiViewSize = clampedSize;
      this.aiRenderTarget.dispose();
      this.aiRenderTarget = new THREE.WebGLRenderTarget(clampedSize, clampedSize, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      });
    }
  }

  public update(
    headMatrix?: THREE.Matrix4,
    targetPos?: THREE.Vector3,
    capsuleQuat?: THREE.Quaternion,
    capsulePos?: THREE.Vector3,
    agentId?: string
  ): void {
    const isValidVector = (v: THREE.Vector3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

    if (headMatrix) {
      headMatrix.decompose(this._headPos, this._headQuat, this._headScale);

      if (isValidVector(this._headPos)) {
        this.aiPerceptionCamera.position.copy(this._headPos);
        this.aiPerceptionCamera.quaternion.copy(this._headQuat);
        this.aiPerceptionCamera.up.set(0, 1, 0);
      }

      let effectiveLookTarget = capsulePos;
      if (!effectiveLookTarget || !isValidVector(effectiveLookTarget)) {
        if (headMatrix) {
          headMatrix.decompose(this._headPos, this._headQuat, this._headScale);
          effectiveLookTarget = this._headPos;
        }
      }

      if (effectiveLookTarget && isValidVector(effectiveLookTarget)) {
        // Compute delta time for frame-time-adjusted exponential smoothing
        const now = performance.now();
        if (this.lastUpdateTime === 0) {
          this.lastUpdateTime = now;
        }
        const rawDeltaTime = (now - this.lastUpdateTime) / 1000;
        this.lastUpdateTime = now;
        const deltaTime = Math.min(0.1, Math.max(0.001, rawDeltaTime));

        // Detect active agent selection changes to snap instantly
        if (agentId && agentId !== this.lastActiveAgentId) {
          this.lastActiveAgentId = agentId;
          this.snapNextFrame = true;
        }

        // Camera trails behind and above the selected agent
        // Facing direction forward is -Z (0, 0, -1), so "behind" is +Z (0, 0, 1)
        const heightAbove = 1.8;
        const distanceBehind = 3.5;
        this._localOffset.set(0, heightAbove, distanceBehind);

        if (capsuleQuat) {
          this._localOffset.applyQuaternion(capsuleQuat);
        }

        this._targetCamPos.copy(effectiveLookTarget).add(this._localOffset);

        if (this.snapNextFrame) {
          this.chaseCam.position.copy(this._targetCamPos);
          this.snapNextFrame = false;
        } else {
          const speed = 5.0; // Follow speed factor
          const factor = 1 - Math.exp(-speed * deltaTime);
          this.chaseCam.position.lerp(this._targetCamPos, factor);
        }

        this.chaseCam.up.set(0, 1, 0);
        this.chaseCam.lookAt(effectiveLookTarget.x, effectiveLookTarget.y, effectiveLookTarget.z);
      }

    } else if (targetPos) {
      this.aiPerceptionCamera.position.set(targetPos.x, targetPos.y + 0.8, targetPos.z + 1.5);
      this.aiPerceptionCamera.lookAt(targetPos);
    } else {
      if (this.aiPerceptionCamera.position.length() < 0.1) {
        this.aiPerceptionCamera.position.set(0, 1.8, 0.5);
        this.aiPerceptionCamera.lookAt(0, 1.0, 10);
      }
    }

    if (this.mode === 'third_person') {
      if (this.initializeThirdPersonTarget && targetPos) {
        if (Number.isFinite(targetPos.x) && Number.isFinite(targetPos.y) && Number.isFinite(targetPos.z)) {
          this.controls.target.copy(targetPos);
          this.initializeThirdPersonTarget = false;
        }
      }

      // Arrow key axial motion
      if (this.keysPressed.size > 0) {
        const now = performance.now();
        const dt = this.lastUpdateTime > 0 ? Math.min(0.1, (now - this.lastUpdateTime) / 1000) : 0.016;
        const moveSpeed = CameraManager.CAMERA_MOVE_SPEED * dt;

        this.thirdPersonCamera.getWorldDirection(this._forward);
        this._forward.y = 0;
        this._forward.normalize();

        this._right.crossVectors(this._forward, new THREE.Vector3(0, 1, 0)).normalize();

        this._moveDelta.set(0, 0, 0);

        if (this.keysPressed.has('ArrowUp')) this._moveDelta.add(this._forward.clone().multiplyScalar(moveSpeed));
        if (this.keysPressed.has('ArrowDown')) this._moveDelta.add(this._forward.clone().multiplyScalar(-moveSpeed));
        if (this.keysPressed.has('ArrowLeft')) this._moveDelta.add(this._right.clone().multiplyScalar(-moveSpeed));
        if (this.keysPressed.has('ArrowRight')) this._moveDelta.add(this._right.clone().multiplyScalar(moveSpeed));

        this.thirdPersonCamera.position.add(this._moveDelta);
        this.controls.target.add(this._moveDelta);
      }

      this.controls.update();
    }
  }

  public renderHeadCamera(scene: THREE.Scene): void {
    const currentRenderTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.renderTarget);
    this.renderer.render(scene, this.aiPerceptionCamera);
    this.renderer.setRenderTarget(currentRenderTarget);
  }

  private captureCanvas: HTMLCanvasElement | null = null;
  private capturePixelBuffer: Uint8Array | null = null;
  private captureFlippedBuffer: Uint8ClampedArray | null = null;

  /**
   * Render the scene from an arbitrary camera into the configurable AI render
   * target and encode as a base64 webp string. Used for per-agent first-person
   * vision.
   */
  public captureFrameFromCamera(scene: THREE.Scene, camera: THREE.PerspectiveCamera): string {
    const size = this.aiViewSize;
    const previousTarget = this.renderer.getRenderTarget();
    const previousAspect = camera.aspect;

    try {
      camera.aspect = 1;
      camera.updateProjectionMatrix();

      this.renderer.setRenderTarget(this.aiRenderTarget);
      this.renderer.render(scene, camera);

      const bufferSize = size * size * 4;
      if (!this.capturePixelBuffer || this.capturePixelBuffer.length !== bufferSize) {
        this.capturePixelBuffer = new Uint8Array(bufferSize);
      }
      if (!this.captureFlippedBuffer || this.captureFlippedBuffer.length !== bufferSize) {
        this.captureFlippedBuffer = new Uint8ClampedArray(bufferSize);
      }
      if (!this.captureCanvas) {
        this.captureCanvas = document.createElement('canvas');
      }
      if (this.captureCanvas.width !== size || this.captureCanvas.height !== size) {
        this.captureCanvas.width = size;
        this.captureCanvas.height = size;
      }

      const pixelBuffer = this.capturePixelBuffer;
      const flippedBuffer = this.captureFlippedBuffer;
      const canvas = this.captureCanvas;

      this.renderer.readRenderTargetPixels(this.aiRenderTarget, 0, 0, size, size, pixelBuffer);

      const bytesPerRow = size * 4;
      for (let y = 0; y < size; y++) {
        const srcOffset = y * bytesPerRow;
        const destOffset = (size - 1 - y) * bytesPerRow;
        flippedBuffer.set(pixelBuffer.subarray(srcOffset, srcOffset + bytesPerRow), destOffset);
      }

      const ctx = canvas.getContext('2d')!;
      const imageData = new ImageData(flippedBuffer as any, size, size);
      ctx.putImageData(imageData, 0, 0);

      const dataURL = canvas.toDataURL('image/webp', 0.7);
      return dataURL.split(',')[1];
    } finally {
      this.renderer.setRenderTarget(previousTarget);
      camera.aspect = previousAspect;
      camera.updateProjectionMatrix();
    }
  }

  public captureAIFrame(scene: THREE.Scene): string {
    return this.captureFrameFromCamera(scene, this.aiPerceptionCamera);
  }

  public getAIRenderTarget(): THREE.WebGLRenderTarget {
    return this.aiRenderTarget;
  }

  public setMode(mode: CameraMode): void {
    const prevMode = this.mode;
    this.mode = mode;
    this.controls.enabled = mode === 'third_person';
    this.transformControls.camera = this.getMainCamera();
    Logger.info(`CameraManager: Switched to ${mode}`);

    if (mode === 'third_person' && prevMode !== 'third_person') {
      this.initializeThirdPersonTarget = true;
    }
  }

  public handleResize(width: number, height: number): void {
    const aspect = width / height;
    this.thirdPersonCamera.aspect = aspect;
    this.thirdPersonCamera.updateProjectionMatrix();
    this.chaseCam.aspect = aspect;
    this.chaseCam.updateProjectionMatrix();
  }

  public attachTransform(object: THREE.Object3D | null): void {
    if (object) {

      if (object.parent === null) {
        this.transformControls.detach();
        return;
      }
      this.transformControls.attach(object);
    } else {
      this.transformControls.detach();
    }
  }

  public getMainCamera(): THREE.PerspectiveCamera {
    switch (this.mode) {

      case 'first_person': return this.aiPerceptionCamera;

      case 'model_input': return this.chaseCam;
      default: return this.thirdPersonCamera;
    }
  }

  public getChaseCam(): THREE.PerspectiveCamera {
    return this.chaseCam;
  }

  public getHeadCamera(): THREE.PerspectiveCamera {
    return this.aiPerceptionCamera;
  }

  public getCameraData(): Array<{ label: string; position: THREE.Vector3; quaternion: THREE.Quaternion; color: number }> {
    return [
      { label: 'EYE', position: this.aiPerceptionCamera.position, quaternion: this.aiPerceptionCamera.quaternion, color: 0xff4444 },
      { label: 'CHASE', position: this.chaseCam.position, quaternion: this.chaseCam.quaternion, color: 0x44aaff },
      { label: '3RD', position: this.thirdPersonCamera.position, quaternion: this.thirdPersonCamera.quaternion, color: 0x44ff88 },
    ];
  }

  public getRenderTarget(): THREE.WebGLRenderTarget {
    return this.renderTarget;
  }

  public updateTransformControls(): void {
    // three.js r168+ handles TransformControls matrix updates automatically
    // during scene.updateMatrixWorld() — no manual call needed.
  }

  public getTransformControls(): TransformControls {
    return this.transformControls;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    this.keysPressed.clear();
    this.controls.dispose();
    this.transformControls.dispose();
    // Dispose GPU render targets to free framebuffer memory
    this.renderTarget?.dispose();
    this.aiRenderTarget?.dispose();
  }
}
