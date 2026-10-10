import { useEffect, useRef, useState } from 'react';
import { adminUsersApi, toast } from '../api.js';

export default function AdminUsers({ currentUserId }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const menuRef = useRef(null);

  const refresh = async () => {
    try {
      const data = await adminUsersApi.list();
      setUsers(data.users);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenu(null);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  const openMenu = (e, user) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ user, top: r.bottom + 4, left: Math.max(8, r.left - 140) });
  };

  const isSelf = (userId) => userId === currentUserId;

  const adminCount = users?.filter((u) => u.role === 'admin').length ?? 0;
  const isLastAdmin = (user) => user.role === 'admin' && adminCount <= 1;

  const handleCreate = async (e) => {
    e.preventDefault();
    const form = e.target;
    const username = form.username.value.trim();
    const password = form.password.value;
    const role = form.role.value;
    if (!username || !password || !role) return;
    try {
      await adminUsersApi.create({ username, password, role });
      toast('User created', username, 'ok');
      setModal(null);
      refresh();
    } catch (err) {
      toast('Create failed', err.message, 'err');
    }
  };

  const handlePasswordChange = async (e, userId) => {
    e.preventDefault();
    const form = e.target;
    const password = form.password.value;
    const confirm = form.confirm.value;
    if (password !== confirm) {
      toast('Mismatch', 'Passwords do not match', 'err');
      return;
    }
    if (password.length < 8) {
      toast('Too short', 'Password must be at least 8 characters', 'err');
      return;
    }
    try {
      await adminUsersApi.update(userId, { password });
      toast('Password changed', 'Other sessions signed out', 'ok');
      setModal(null);
      refresh();
    } catch (err) {
      toast('Change failed', err.message, 'err');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await adminUsersApi.update(userId, { role: newRole });
      toast('Role changed', newRole, 'ok');
      setMenu(null);
      refresh();
    } catch (err) {
      toast('Change failed', err.message, 'err');
    }
  };

  const handleDelete = async (userId, username) => {
    if (!window.confirm(`Delete ${username}? This cannot be undone.`)) return;
    try {
      await adminUsersApi.remove(userId);
      toast('Deleted', username, 'ok');
      setMenu(null);
      refresh();
    } catch (err) {
      toast('Delete failed', err.message, 'err');
    }
  };

  if (!users) {
    return (
      <div className="card fill">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h3>Admin Users</h3>
        </div>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="card fill">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3>Admin Users</h3>
        <button onClick={() => setModal({ type: 'create' })}>Add user</button>
      </div>
      {error && <p style={{ color: 'var(--stain)' }}>{error}</p>}
      <div className="scroll">
        <table style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: '30%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '20%' }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Username</th>
              <th>Role</th>
              <th>Created</th>
              <th align="right"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.username}
                  {isSelf(user.id) && <span className="pill" style={{ marginLeft: 8, fontSize: 11 }}>you</span>}
                </td>
                <td>
                  <span className={`pill ${user.role === 'admin' ? '' : 'viewer'}`}>{user.role}</span>
                </td>
                <td>{new Date(user.created_at).toLocaleString()}</td>
                <td align="right" style={{ position: 'relative' }}>
                  <button onClick={(e) => openMenu(e, user)}>⋯</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="muted">No users yet.</p>}
      </div>

      {menu && (
        <div className="menu open" ref={menuRef} style={{ top: menu.top, left: menu.left }}>
          {!isSelf(menu.user.id) && (
            <>
              <button onClick={() => setModal({ type: 'password', user: menu.user })}>
                Change password
              </button>
              <button onClick={() => setModal({ type: 'role', user: menu.user })}>
                Change role
              </button>
              <button className="danger" onClick={() => handleDelete(menu.user.id, menu.user.username)}>
                Delete
              </button>
            </>
          )}
          {isSelf(menu.user.id) && (
            <>
              <button disabled>Change password (self)</button>
              <button disabled>Change role (self)</button>
              <button className="danger" disabled>Delete (self)</button>
            </>
          )}
          {isLastAdmin(menu.user) && !isSelf(menu.user.id) && (
            <button className="danger" disabled>Delete (last admin)</button>
          )}
        </div>
      )}

      {modal && (
        <div className="modalback" onClick={() => setModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {modal.type === 'create' && (
              <>
                <h3>Add user</h3>
                <form onSubmit={handleCreate} style={{ display: 'grid', gap: 8, minWidth: 280 }}>
                  <input name="username" placeholder="Username" autoComplete="username" required />
                  <input name="password" type="password" placeholder="Password (8+ chars)" autoComplete="new-password" required minLength={8} />
                  <select name="role" required>
                    <option value="">— Role —</option>
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                    <button type="button" onClick={() => setModal(null)}>Cancel</button>
                    <button type="submit" className="primary">Create</button>
                  </div>
                </form>
              </>
            )}
            {modal.type === 'password' && (
              <>
                <h3>Change password for {modal.user.username}</h3>
                <form onSubmit={(e) => handlePasswordChange(e, modal.user.id)} style={{ display: 'grid', gap: 8, minWidth: 280 }}>
                  <input name="password" type="password" placeholder="New password (8+ chars)" autoComplete="new-password" required minLength={8} />
                  <input name="confirm" type="password" placeholder="Confirm new password" autoComplete="new-password" required />
                  <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                    <button type="button" onClick={() => setModal(null)}>Cancel</button>
                    <button type="submit" className="primary">Change</button>
                  </div>
                </form>
              </>
            )}
            {modal.type === 'role' && (
              <>
                <h3>Change role for {modal.user.username}</h3>
                <div style={{ display: 'grid', gap: 8, minWidth: 240 }}>
                  <select
                    defaultValue={modal.user.role}
                    onChange={(e) => handleRoleChange(modal.user.id, e.target.value)}
                    disabled={isSelf(modal.user.id) || isLastAdmin(modal.user)}
                  >
                    <option value="admin">Admin</option>
                    <option value="viewer">Viewer</option>
                  </select>
                  <p className="muted" style={{ fontSize: 12 }}>
                    {isSelf(modal.user.id) ? 'Cannot change your own role.' : isLastAdmin(modal.user) ? 'Cannot demote the last admin.' : ''}
                  </p>
                  <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                    <button onClick={() => setModal(null)}>Close</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}