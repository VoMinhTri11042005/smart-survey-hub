import { CheckCircle2, Info, X, AlertCircle } from 'lucide-react';
import { useEffect } from 'react';
import { motion } from 'motion/react';

export type ToastType = 'success' | 'info' | 'error';

export interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

export function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 bg-surface-container-highest border border-border-subtle rounded-2xl shadow-xl"
    >
      {type === 'success' ? (
        <CheckCircle2 className="text-sentiment-positive" size={20} />
      ) : type === 'error' ? (
        <AlertCircle className="text-sentiment-negative" size={20} />
      ) : (
        <Info className="text-secondary" size={20} />
      )}
      <span className="text-sm font-semibold text-text-primary">{message}</span>
      <button onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary transition-colors cursor-pointer ml-2">
        <X size={16} />
      </button>
    </motion.div>
  );
}
