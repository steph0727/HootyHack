import { AccountForm } from '../../../src/AccountForm';
import { PageHeading, Screen } from '../../../src/ui';

/** 11 · Profile & password */
export default function Profile() {
  return (
    <Screen>
      <PageHeading title="Profile & password" subtitle="Keep your details up to date and your account secure." />
      <AccountForm />
    </Screen>
  );
}
