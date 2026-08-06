/**
 * Mini Three.js preview for uploaded GLTF/GLB models.
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ModelPreviewProps {
  scene: THREE.Object3D | null;
  className?: string;
  showCollision?: boolean;
  hulls?: Array<{ positions: number[]; indices: number[] }> | null;
}

export const ModelPreview: React.FC<ModelPreviewProps> = ({ scene, className, showCollision, hulls }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewObjectsRef = useRef<{
    clone: THREE.Object3D;
    collisionGroup: THREE.Group;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !scene) return;

    const width = container.clientWidth || 200;
    const height = container.clientHeight || 120;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const previewScene = new THREE.Scene();
    previewScene.background = new THREE.Color(0x111318);

    const clone = scene.clone(true);
    previewScene.add(clone);

    const box = new THREE.Box3().setFromObject(clone);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    clone.position.sub(center);

    // Group to hold our collision wireframes
    const collisionGroup = new THREE.Group();
    previewScene.add(collisionGroup);

    previewObjectsRef.current = { clone, collisionGroup };

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(maxDim * 1.8, maxDim * 1.2, maxDim * 2);
    camera.lookAt(0, 0, 0);

    previewScene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(2, 4, 3);
    previewScene.add(dir);

    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      clone.rotation.y += 0.008;
      collisionGroup.rotation.y = clone.rotation.y;
      renderer.render(previewScene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      previewScene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    };
  }, [scene]);

  // Update collision mesh wireframes when showCollision or hulls change
  useEffect(() => {
    const refs = previewObjectsRef.current;
    if (!refs) return;

    // Clear existing wireframes
    while (refs.collisionGroup.children.length > 0) {
      const child = refs.collisionGroup.children[0];
      refs.collisionGroup.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          (child.material as THREE.Material).dispose();
        }
      }
    }

    if (!showCollision) {
      // Restore full opacity to model
      refs.clone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => { m.opacity = 1.0; m.transparent = false; });
          } else {
            child.material.opacity = 1.0;
            child.material.transparent = false;
          }
        }
      });
      return;
    }

    // Semi-transparent model when showing collision overlay
    refs.clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => { m.opacity = 0.25; m.transparent = true; });
        } else {
          child.material.opacity = 0.25;
          child.material.transparent = true;
        }
      }
    });

    if (hulls && hulls.length > 0) {
      // Render decomposed hulls wireframes in green
      hulls.forEach((hull) => {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(hull.positions, 3));
        geom.setIndex(hull.indices);
        geom.computeVertexNormals();

        const edges = new THREE.EdgesGeometry(geom, 15);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2 }); // emerald green
        const lineSegments = new THREE.LineSegments(edges, lineMat);
        refs.collisionGroup.add(lineSegments);
      });
    } else {
      // Fallback: render model edges wireframe in orange
      refs.clone.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry) {
          const edges = new THREE.EdgesGeometry(child.geometry, 15);
          const lineMat = new THREE.LineBasicMaterial({ color: 0xf59e0b, linewidth: 1.5 }); // amber orange
          const lineSegments = new THREE.LineSegments(edges, lineMat);
          // Match the individual child's local transform
          lineSegments.position.copy(child.position);
          lineSegments.quaternion.copy(child.quaternion);
          lineSegments.scale.copy(child.scale);
          refs.collisionGroup.add(lineSegments);
        }
      });
    }
  }, [showCollision, hulls]);

  return (
    <div
      ref={containerRef}
      className={className ?? 'w-full h-[120px] rounded-btn overflow-hidden border border-border bg-bg-elevated'}
    />
  );
};
