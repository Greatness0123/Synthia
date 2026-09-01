/**
 * Library of spawnable object presets with physics properties and UI icons.
 */

export interface ObjectPreset {
  id: string;
  name: string;
  category: 'Primitives' | 'Terrain';
  icon: string; // Phosphor icon name
  mass: number;
  friction: number;
  restitution: number;
}

export const OBJECT_PRESETS: ObjectPreset[] = [
  { id: 'cube', name: 'Cube', category: 'Primitives', icon: 'Cube', mass: 1, friction: 0.5, restitution: 0.2 },
  { id: 'sphere', name: 'Sphere', category: 'Primitives', icon: 'Circle', mass: 1, friction: 0.3, restitution: 0.8 },
  { id: 'cylinder', name: 'Cylinder', category: 'Primitives', icon: 'Cylinder', mass: 1, friction: 0.5, restitution: 0.2 },
  { id: 'wedge', name: 'Wedge', category: 'Primitives', icon: 'Triangle', mass: 1, friction: 0.5, restitution: 0.1 },
];
