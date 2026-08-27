import { cn } from './Panel';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'accent' | 'tertiary';
}

/**
 * Status badges for metrics and labels.
 */
export const Badge: React.FC<BadgeProps> = ({
  children,
  className,
  variant = 'default',
  ...props
}) => {
  const variants = {
    default: "bg-bg-elevated text-text-secondary border-transparent",
    outline: "bg-transparent border-border text-text-secondary",
    accent: "bg-white/10 border-white/20 text-text-primary",
    tertiary: "bg-transparent text-text-tertiary border-transparent",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-1.5 py-0.5 rounded-badge text-xs font-mono border",
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};
