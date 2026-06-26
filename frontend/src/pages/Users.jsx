import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/helpers';
import { usePageEntrance } from '../utils/motion';
import { useDocumentTitle } from '../utils/useDocumentTitle';

const ROLE_BADGE = {
  admin:      'bg-ink-700 text-white border-ink-700',
  accountant: 'bg-amber-50 text-amber-800 border-amber-200',
  viewer:     'bg-ivory-100 text-ivory-700 border-ivory-300',
};

function RoleBadge({ role }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border capitalize ${ROLE_BADGE[role] || ROLE_BADGE.viewer}`}>
      {role}
    </span>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  useDocumentTitle('Users');
  const pageRef = usePageEntrance(!loading);

  const load = () => {
    setLoading(true);
    userAPI.getAll()
      .then((res) => setUsers(res.data.data))
      .catch((err) => toast.error(err.response?.data?.message || 'Failed to load users'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleRoleChange = async (targetUser, newRole) => {
    if (newRole === targetUser.role) return;
    setSavingId(targetUser._id);
    try {
      await userAPI.updateRole(targetUser._id, newRole);
      setUsers((prev) => prev.map((u) => (u._id === targetUser._id ? { ...u, role: newRole } : u)));
      toast.success(`${targetUser.name} is now ${newRole}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update role');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div ref={pageRef} className="space-y-5 max-w-4xl">
      <div data-animate>
        <h1 className="font-serif text-2xl font-bold text-ink-800">Team & Roles</h1>
        <p className="text-ivory-700 text-sm mt-0.5">
          Everyone who registers starts as an Accountant. Assign Viewer to anyone who should only browse and review.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-ivory-300 shadow-card overflow-hidden" data-animate>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-ivory-100 border-b border-ivory-200">
                {['Name', 'Email', 'Joined', 'Role', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-ivory-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-14">
                  <div className="flex items-center justify-center gap-2 text-ivory-600">
                    <div className="animate-spin w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full" />
                    Loading…
                  </div>
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-14 text-ivory-600">No users found</td></tr>
              ) : users.map((u) => {
                const isFixedAdmin = u.role === 'admin';
                const isSelf = u._id === me?.id;
                return (
                  <tr key={u._id} className="border-b border-ivory-100 hover:bg-ivory-50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-ink-800">
                      {u.name}{isSelf && <span className="text-ivory-400 font-normal text-xs ml-1.5">(you)</span>}
                    </td>
                    <td className="px-4 py-3.5 text-ivory-700 text-sm">{u.email}</td>
                    <td className="px-4 py-3.5 text-xs text-ivory-500">{formatDate(u.createdAt)}</td>
                    <td className="px-4 py-3.5"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3.5">
                      {isFixedAdmin ? (
                        <span className="text-xs text-ivory-400 italic">fixed — can't be changed</span>
                      ) : (
                        <select
                          className="input py-1.5 text-xs w-36"
                          value={u.role}
                          disabled={savingId === u._id}
                          onChange={(e) => handleRoleChange(u, e.target.value)}
                          aria-label={`Change role for ${u.name}`}
                        >
                          <option value="accountant">Accountant</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 text-sm text-amber-900" data-animate>
        <p className="font-semibold mb-1">How roles work</p>
        <ul className="list-disc list-inside space-y-0.5 text-amber-800">
          <li><strong>Admin</strong> — full access, including deleting vendors/invoices and assigning roles. There is exactly one fixed admin account.</li>
          <li><strong>Accountant</strong> — can upload invoices, run OCR, edit fields, and manage vendors/POs, but can't delete or assign roles.</li>
          <li><strong>Viewer</strong> — read-only access to everything.</li>
        </ul>
      </div>
    </div>
  );
}
