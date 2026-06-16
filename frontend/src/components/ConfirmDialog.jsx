import React from 'react';
import Modal from './Modal';

/**
 * Accessible confirmation dialog for destructive/important actions.
 * Replaces window.confirm() so the app doesn't fall back to native browser chrome.
 *
 * Usage: const [confirming, setConfirming] = useState(false);
 *   {confirming && (
 *     <ConfirmDialog
 *       title="Delete vendor?"
 *       message="All associated data will be affected. This cannot be undone."
 *       confirmLabel="Delete"
 *       onConfirm={() => { doDelete(); setConfirming(false); }}
 *       onClose={() => setConfirming(false)}
 *     />
 *   )}
 */
export default function ConfirmDialog({
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = true,
  loading = false,
  onConfirm,
  onClose,
}) {
  return (
    <Modal title={title} onClose={onClose} maxWidth="max-w-sm">
      <div className="p-6">
        <p className="text-sm text-ivory-700 leading-relaxed">{message}</p>
        <div className="flex gap-3 pt-5 mt-2">
          <button
            type="button"
            className={`flex-1 ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
            autoFocus
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
