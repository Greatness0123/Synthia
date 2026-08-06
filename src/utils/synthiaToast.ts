import { toast } from 'sonner';
import { useLogStore } from '../store/logStore';

/**
 * Helper to strip detailed logs (like JSON or long stack traces) from the UI message.
 */
const getUiMessage = (msg: string) => {
  const parts = msg.split(' — ');
  return parts[0];
};

const notify = (type: 'success' | 'warning' | 'error' | 'info', msg: string) => {
  const uiMsg = getUiMessage(msg);
  useLogStore.getState().addEntry(uiMsg, type);

  switch (type) {
    case 'success':
      console.log(`%c[LOG ✅ SUCCESS] ${msg}`, 'color: #4ade80; font-weight: bold;');
      toast.success(uiMsg);
      break;
    case 'warning':
      console.warn(`%c[LOG ⚠️ WARNING] ${msg}`, 'color: #fbbf24; font-weight: bold;');
      toast.warning(uiMsg);
      break;
    case 'error':
      console.error(`[LOG ❌ ERROR] ${msg}`);
      toast.error(uiMsg);
      break;
    case 'info':
      console.info(`%c[LOG ℹ️ INFO] ${msg}`, 'color: #60a5fa; font-weight: bold;');
      toast.info(uiMsg);
      break;
  }
};

/**
 * Typed toast helper — visible popups plus log panel entries.
 */
export const synthiaToast = {
  success: (msg: string) => notify('success', msg),
  warning: (msg: string) => notify('warning', msg),
  error: (msg: string) => notify('error', msg),
  info: (msg: string) => notify('info', msg),
};
