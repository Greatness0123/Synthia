/**
 * Central icon re-exports using lucide-react.
 * All icons are tree-shaken at build time.
 * Usage: import { Brain, Trash, Eye } from '../ui/icons';
 */
import type { ComponentType } from 'react';
export type { LucideProps as IconProps } from 'lucide-react';

export {
  // Core UI
  X,
  Eye,
  Info,
  Search,
  Search as MagnifyingGlass,
  Settings,
  Settings2 as GearSix,
  Settings as Gear,
  SlidersHorizontal,

  // Navigation / Actions
  ArrowRight,
  ArrowDown,
  ArrowUp,
  ArrowUpFromLine as ArrowFatLinesUp,
  RotateCw as ArrowsClockwise,
  Download as DownloadSimple,
  Upload as UploadSimple,
  ArrowDownToLine as Export,

  // Status / Feedback
  CheckCircle2 as CheckCircle,
  CheckCircle as CheckCircleFilled,
  AlertTriangle as WarningCircle,
  AlertTriangle as WarningFilled,
  XCircle,
  Info as InfoFilled,
  Loader2 as Spinner,
  Wifi as WifiHigh,
  Plug2 as PlugsConnected,

  // Agent / AI
  Brain,
  Bot as Robot,
  Cpu,
  Bone,
  Syringe,
  Dna,

  // Media / Sensors
  Camera,
  Video as VideoCamera,
  Monitor,
  Sun,
  Moon,
  Volume2 as SpeakerHigh,
  VolumeX as SpeakerSlash,
  Mic as Microphone,
  Music2 as MusicNotes,
  Music as MusicNote,

  // Data / Files
  Database,
  Archive,
  FileCode,
  FileText as FileCsv,
  FileText as Document,
  BookOpen as Notebook,
  Bookmark,
  Package as FileCloud,

  // 3D / World
  Box as Cube,
  Circle,
  Triangle,
  Cylinder,
  Layers as DotsNine,
  Grid3x3 as Grid,

  // People / Social
  User,
  Users as People,

  // Section / Misc
  Globe,
  Sliders,
  Bot,
  Zap,
  RefreshCw,
  Flag,
  Target,
  ChevronDown as CaretDown,
  ChevronUp as CaretUp,
  List as ListChecks,
  Network as TreeStructure,
  TrendingUp as TrendUp,
  TrendingUp as ArrowTrendingLines,
  Footprints as Steps,
  Move,
  Trash2 as Trash,
  Play,
  Pause,

} from 'lucide-react';

// PRESET_ICONS registry for ObjectSpawner dynamic lookup
import {
  Box,
  Circle as CircleIcon,
  Triangle as TriangleIcon,
  Cylinder as CylinderIcon,
  ArrowUpFromLine,
  Footprints,
  TrendingUp,
  Music2,
  Grid3x3,
  RotateCw,
} from 'lucide-react';

export type IconComponent = ComponentType<{ size?: number | string; className?: string; strokeWidth?: number }>;

export const PRESET_ICONS: Record<string, IconComponent> = {
  Cube: Box,
  Circle: CircleIcon,
  Cylinder: CylinderIcon,
  Triangle: TriangleIcon,
  ArrowFatLinesUp: ArrowUpFromLine,
  Steps: Footprints,
  TrendUp: TrendingUp,
  MusicNotes: Music2,
  DotsNine: Grid3x3,
  ArrowsClockwise: RotateCw,
};
