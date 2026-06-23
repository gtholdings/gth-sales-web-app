'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Client hook for the admin-configurable installment-plan settings, read from
 * GET /api/config. Returns sensible defaults until loaded / if missing.
 *   { interestPercent, maxInstallments }
 */
export function useAppConfig() {
  const { token } = useAuth();
  const [config, setConfig] = useState({ interestPercent: 10, maxInstallments: 12 });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetch('/api/config', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (cancelled || !res?.data) return;
        const get = (k, fb) => {
          const n = Number(res.data.find((c) => c.key === k)?.value);
          return Number.isFinite(n) ? n : fb;
        };
        setConfig({
          interestPercent: get('installment_interest_percent', 10),
          maxInstallments: get('max_installments', 12),
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token]);

  return config;
}
