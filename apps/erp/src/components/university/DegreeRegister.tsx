'use client';

import { Award } from 'lucide-react';
import NextLink from 'next/link';
import { Button } from '@/components/kx';
import { Grid } from '@/components/ops/kit';
import { StatusPill } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import type { DegreeRow } from '@/lib/curriculum';

/** The register of degrees conferred: certificate number, graduate, degree, class, convocation, with the certificate. */
export function DegreeRegister({ rows }: { rows: DegreeRow[] }) {
  const { t, fmt } = useI18n();
  return (
    <Grid
      testId="un-degrees"
      empty={t('un.reg.empty')}
      emptyIcon={<Award />}
      exportName="degree-register"
      rows={rows}
      cols={[
        { label: t('un.d.certNo'), cell: (r) => r.certificateNo, sort: (r) => r.certificateNo },
        { label: t('un.d.graduate'), cell: (r) => <NextLink className="font-medium hover:underline" href={`/students/${r.studentId}`}>{r.name}</NextLink>, sort: (r) => r.name },
        { label: t('un.d.degree'), cell: (r) => r.degreeTitle, wrap: true, sort: (r) => r.degreeTitle },
        { label: t('un.d.cgpa'), cell: (r) => (r.cgpa === null ? '—' : r.cgpa.toFixed(2)), num: true, sort: (r) => r.cgpa ?? 0 },
        { label: t('un.reg.class'), cell: (r) => r.classification || '—' },
        { label: t('un.reg.convocation'), cell: (r) => <NextLink className="hover:underline" href={`/university/convocations/${r.convocationId}`}>{r.convocation}</NextLink>, sort: (r) => r.heldOn },
        { label: t('un.c.date'), cell: (r) => fmt.date(r.heldOn), sort: (r) => r.heldOn },
        { label: t('un.reg.mode'), cell: (r) => (r.inAbsentia ? t('un.reg.absentia') : t('un.reg.inPerson')) },
        { label: t('un.reg.register'), cell: (r) => <StatusPill tone={r.registerStatus === 'valid' ? 'success' : r.registerStatus ? 'danger' : 'neutral'}>{t(r.registerStatus === 'valid' ? 'un.reg.valid' : r.registerStatus ? 'un.reg.notValid' : 'un.reg.notRecorded')}</StatusPill> },
        {
          label: '',
          cell: (r) => (
            <Button size="small" variant="text" href={`/api/download?kind=degree&id=${r.convocationId}&candidate=${r.candidateId}`} target="_blank" rel="noopener">
              {t('un.d.download')}
            </Button>
          ),
        },
      ]}
    />
  );
}
