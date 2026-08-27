import { useUIStore } from '../../store/uiStore';
import { cn } from './Panel';

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 40, className }: LogoProps) {
  const theme = useUIStore((s) => s.theme);

  return (
    <img
      src="/logo.svg"
      alt="Synthia"
      className={cn(
        'shrink-0 transition-[filter] duration-300',
        theme === 'dark' && 'invert',
        className,
      )}
      style={{ height: size, width: 'auto' }}
      draggable={false}
    />
  );
}
