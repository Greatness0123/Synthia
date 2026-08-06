import { Toaster } from 'sonner';
import { useUIStore } from '../../store/uiStore';

/**
 * Custom Toast Provider configuring Sonner.
 */
export const ToastProvider = () => {
  const theme = useUIStore((s) => s.theme);

  return (
    <Toaster
      position="bottom-right"
      theme={theme}
      visibleToasts={1}
      toastOptions={{
        className: "!bg-bg-elevated !border-border !text-text-primary !rounded-btn !shadow-none !p-3",
        closeButton: true,
        duration: 4000,
        classNames: {
          toast: 'synthia-toast',
          closeButton: 'synthia-toast-close'
        }
      }}
    />
  );
};
