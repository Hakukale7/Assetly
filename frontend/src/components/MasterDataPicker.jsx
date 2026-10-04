import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import SearchSelect from './SearchSelect.jsx';

export default function MasterDataPicker({
  type,
  value,
  onChange,
  placeholder,
}) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get('/master-data?type=' + encodeURIComponent(type))
      .then(rows => {
        if (cancelled) return;
        setOptions(rows.map(r => ({ value: r.value, label: r.value, id: r.id })));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [type]);

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      allowCreate={false}
      placeholder={loading ? 'Loading…' : (placeholder || 'Select…')}
    />
  );
}
