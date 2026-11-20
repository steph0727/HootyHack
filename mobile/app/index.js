import { Redirect } from 'expo-router';

import { homePath, useAuth } from '../src/auth';

export default function Index() {
  const { user } = useAuth();
  return <Redirect href={homePath(user)} />;
}
