import { redirect } from 'next/navigation';

/** The governance area opens on the rule registry. */
export default function GovernancePage() {
  redirect('/governance/rules');
}
