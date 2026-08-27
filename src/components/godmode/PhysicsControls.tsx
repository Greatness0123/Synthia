/**
 * Controls for global physics properties.
 */

import { useWorldStore } from '../../store/worldStore';
import { Toggle } from '../ui/Toggle';
import { ValueInput } from '../ui/ValueInput';
import { Panel } from '../ui/Panel';
import { STRINGS } from '../../constants/strings';
import { Sliders, Globe } from '../ui/icons';

export const PhysicsControls: React.FC = () => {
  const { 
    gravity, setGravity, 
    globalFriction, setGlobalFriction,
    showFloor, setShowFloor,
    floorColor, setFloorColor,
    skyColor, setSkyColor,
    showGrid, setShowGrid
  } = useWorldStore();

  return (
    <Panel className="p-4 border-none bg-transparent">
      <h3 className="text-xs font-medium text-text-tertiary mb-4 flex items-center gap-1.5">
        <Sliders size={12} />
        {STRINGS.GOD_MODE.PHYSICS}
      </h3>
      <div className="space-y-6">
        <ValueInput
          label={STRINGS.GOD_MODE.GRAVITY}
          value={gravity}
          onChange={setGravity}
          min={-20}
          max={20}
          step={0.1}
          unit="m/s²"
          defaultValue={-9.81}
        />
        <ValueInput
          label={STRINGS.GOD_MODE.FRICTION}
          value={globalFriction}
          onChange={setGlobalFriction}
          min={0}
          max={1}
          step={0.01}
          defaultValue={0.5}
        />
      </div>

      <h3 className="text-xs font-medium text-text-tertiary mb-4 mt-8 flex items-center gap-1.5">
        <Globe size={12} />
        Environment
      </h3>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-tertiary">Sky Color</label>
          <input
            type="color"
            value={skyColor}
            onChange={(e) => setSkyColor(e.target.value)}
            className="w-6 h-6 rounded border-none cursor-pointer bg-transparent p-0"
          />
        </div>
        
        <Toggle
          label="Show Floor"
          ariaLabel="Show Floor"
          enabled={showFloor}
          onChange={setShowFloor}
        />
        {showFloor && (
          <div className="flex items-center justify-between">
            <label className="text-xs text-text-tertiary">Floor Color</label>
            <input 
              type="color" 
              value={floorColor} 
              onChange={(e) => setFloorColor(e.target.value)}
              className="w-8 h-6 rounded border border-border bg-transparent cursor-pointer"
            />
          </div>
        )}
        <Toggle
          label="Show Grid"
          ariaLabel="Show Grid"
          enabled={showGrid}
          onChange={setShowGrid}
        />
      </div>
    </Panel>
  );
};
