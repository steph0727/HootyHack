import { AccountForm } from '../../src/AccountForm';
import { PageHeading, Screen } from '../../src/ui';

/** Admin/club account: same form as Settings › Profile, but inside the admin stack so Back returns here. */
export default function Account() {
  return (
    <Screen>
      <PageHeading title="Account & password" subtitle="Keep your details up to date and your account secure."
        backLabel="Events" />
      <AccountForm />
    </Screen>
  );
}
