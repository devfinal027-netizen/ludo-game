import { useEffect, useState } from 'react';

export default function Toast({ message, onClose, duration = 3000 }) {
  const [open, setOpen] = useState(Boolean(message));
  useEffect(() => {
    if (!message) return;
    setOpen(true);
    const t = setTimeout(() => {
      setOpen(false);
      onClose && onClose();
    }, duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);
  if (!open || !message) return null;
  return (
    <div className="fixed bottom-4 right-4 bg-black text-white rounded px-4 py-2 shadow-lg text-sm">
      {message}
    </div>
  );
}
