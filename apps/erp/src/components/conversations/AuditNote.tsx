import type { ReactNode } from 'react';

import { Alert } from '@/components/kx';
import { ShieldCheck as PolicyOutlined } from 'lucide-react';
/** The safeguarding notice: leaders may read threads, and every reading is recorded. */
export function AuditNote({ children }: { children: ReactNode }) {
  return (
    <Alert className="mb-5 rounded-[12px]" severity="info" icon={<PolicyOutlined />} data-testid="audit-note">
      {children}
    </Alert>
  );
}
