import { useEffect } from "react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

export default function BottomDrawer({ open, title, onClose, children }: Props) {
  // ESC schließen
  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="drawer-dialog"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="drawer-backdrop"
      />

      {/* Sheet */}
      <div className="drawer-sheet">
        <div className="d-flex items-center justify-between gap-12">
          <div>
            <div className="font-bold text-md">{title}</div>
            <div className="text-muted text-sm">Tap outside or press ESC to close</div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="drawer-close"
          >
            ×
          </button>
        </div>

        <div className="mt-14">{children}</div>
      </div>
    </div>
  );
}
