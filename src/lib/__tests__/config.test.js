import { describe, it, expect } from 'vitest';
import { readPlanConfig } from '@/lib/config';
import { makeSupabase } from './_mockSupabase';

describe('readPlanConfig', () => {
  it('reads configured values', async () => {
    const sb = makeSupabase();
    sb.stage('app_config', {
      data: [
        { key: 'installment_interest_percent', value: '7.5' },
        { key: 'max_installments', value: '24' },
      ],
      error: null,
    });
    expect(await readPlanConfig(sb)).toEqual({ interestPercent: 7.5, maxInstallments: 24 });
  });

  it('falls back to defaults 10/12 when keys are missing', async () => {
    const sb = makeSupabase();
    sb.stage('app_config', { data: [], error: null });
    expect(await readPlanConfig(sb)).toEqual({ interestPercent: 10, maxInstallments: 12 });
  });

  it('falls back to defaults when data is null', async () => {
    const sb = makeSupabase();
    sb.stage('app_config', { data: null, error: null });
    expect(await readPlanConfig(sb)).toEqual({ interestPercent: 10, maxInstallments: 12 });
  });

  it('falls back when values are non-numeric (NaN)', async () => {
    const sb = makeSupabase();
    sb.stage('app_config', {
      data: [
        { key: 'installment_interest_percent', value: 'abc' },
        { key: 'max_installments', value: 'xyz' },
      ],
      error: null,
    });
    expect(await readPlanConfig(sb)).toEqual({ interestPercent: 10, maxInstallments: 12 });
  });

  it('mixes a valid and an invalid key', async () => {
    const sb = makeSupabase();
    sb.stage('app_config', {
      data: [{ key: 'installment_interest_percent', value: '15' }],
      error: null,
    });
    expect(await readPlanConfig(sb)).toEqual({ interestPercent: 15, maxInstallments: 12 });
  });
});
