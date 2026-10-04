import SearchOffOutlined from '@mui/icons-material/SearchOffOutlined';
import Box from '@mui/material/Box';
import { LinkButton } from '@/components/LinkButton';
import { EmptyState } from '@/components/States';

export default function NotFound() {
  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 12, px: 2 }}>
      <EmptyState icon={<SearchOffOutlined />} title="Page not found" actions={<LinkButton variant="contained" href="/">Go to Today</LinkButton>}>
        This address doesn&apos;t exist in KINETIX ERP.
      </EmptyState>
    </Box>
  );
}
