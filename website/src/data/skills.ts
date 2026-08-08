export interface SkillLevel {
  id: number
  name: string
  description: string
  criteria: string
}

export const skillLevels: SkillLevel[] = [
  {
    id: 1,
    name: 'Static Balance',
    description: 'Hold still and stay upright.',
    criteria: 'Balance for more than 10 seconds',
  },
  {
    id: 1,
    name: 'Single Step',
    description: 'Shift weight and move one foot forward.',
    criteria: 'One successful step',
  },
  {
    id: 2,
    name: 'Linear Walk',
    description: 'Walk forward without stopping.',
    criteria: 'Walk more than 5 meters',
  },
  {
    id: 3,
    name: 'Directional Turning',
    description: 'Change direction while moving.',
    criteria: 'Complete a 90° turn',
  },
  {
    id: 4,
    name: 'Obstacle Avoidance',
    description: 'Navigate around objects in the way.',
    criteria: 'Reach the goal with zero collisions',
  },
  {
    id: 5,
    name: 'Dynamic Recovery',
    description: 'Recover from pushes and disturbances.',
    criteria: 'Stay on feet after external force',
  },
  {
    id: 6,
    name: 'Stair Ascent',
    description: 'Climb a series of steps.',
    criteria: 'Climb three steps up',
  },
  {
    id: 7,
    name: 'Object Manipulation',
    description: 'Pick up and move an object.',
    criteria: 'Relocate an object to a new spot',
  },
  {
    id: 8,
    name: 'Complex Navigation',
    description: 'Find a path through a cluttered space.',
    criteria: 'Reach a distant goal',
  },
  {
    id: 9,
    name: 'Full Autonomy',
    description: 'Follow multi-stage directives on its own.',
    criteria: 'Complete a dynamic objective',
  },
]
