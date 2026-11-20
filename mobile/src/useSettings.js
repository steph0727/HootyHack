import { useState } from 'react';

import { api } from './api';
import { useAuth } from './auth';

/** Local draft of the user's profile/settings with an explicit Save (matches the Figma save buttons). */
export function useSettingsDraft(pick) {
  const { user, setUser } = useAuth();
  const [draft, setDraft] = useState(() => pick(user));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const save = async (toPatch) => {
    setSaving(true); setError(''); setMessage('');
    try {
      const updated = await api.updateMe(toPatch(draft));
      setUser(updated);
      setMessage('Saved.');
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { user, draft, setDraft, save, saving, message, error };
}
