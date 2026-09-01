import { ComponentType } from 'react';
import {
  DeployedCode,
  Circle as CircleIcon,
  ChangeHistory as TriangleIcon,
  DataObject as CylinderIcon,
} from '@material-symbols-svg/react';

export type IconComponent = ComponentType<{ size?: number | string; className?: string }>;

export const PRESET_ICONS: Record<string, IconComponent> = {
  Cube: DeployedCode,
  Circle: CircleIcon,
  Cylinder: CylinderIcon,
  Triangle: TriangleIcon,
};
