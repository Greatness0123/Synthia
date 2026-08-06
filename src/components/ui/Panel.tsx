import { cn } from '../../utils/cn';
export { cn } from '../../utils/cn';

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Reusable panel wrapper with consistent borders and background.
 */
export const Panel: React.FC<PanelProps> = ({ children, className, ...props }) => {
  return (
    <div
      className={cn(
        "border border-border bg-bg-panel rounded-panel overflow-hidden",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
