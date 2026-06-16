// Mirrors the role checks enforced server-side in backend/src/middleware/auth.js +
// the authorize(...) calls in the route files. Keeping this in one place means the
// UI hides actions a user can't perform instead of letting them hit a 403.

export const canWrite = (user) => user?.role === 'admin' || user?.role === 'accountant';
export const canDelete = (user) => user?.role === 'admin';
export const isViewer = (user) => user?.role === 'viewer';

export const ROLE_LABELS = {
  admin: 'Admin',
  accountant: 'Accountant',
  viewer: 'Viewer (read-only)',
};
