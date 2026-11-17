import type { ReactNode } from 'react';
import type { useJob, JobData } from '@/hooks/useJob';
import type { ChangeOrder, Section, Settings } from '@/lib/types';
type H = ReturnType<typeof useJob>;
export type JobView = {
  d: JobData; calc: NonNullable<H['calc']>; api: H['api']; st: Settings; editable: boolean; mode: 'estimation' | 'project';
  tx: (v: number) => number; openCO: ChangeOrder | null; libButtons: (sec: Section) => ReactNode;
};
