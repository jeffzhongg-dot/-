/** Fragment-only parsing: never persist credentials or accept arbitrary redirects. */
export type RecoveryCredentials = { token_hash: string } | { access_token: string; refresh_token: string };
export function recoveryCredentials(fragment: string): RecoveryCredentials | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  if (params.has('error') || params.get('type') !== 'recovery') return null;
  const hash = params.get('token_hash');
  if (hash && /^[a-fA-F0-9]{56,64}$/.test(hash)) return {token_hash: hash};
  const access = params.get('access_token'), refresh = params.get('refresh_token');
  if (access && refresh && access.length <= 8192 && refresh.length <= 512 &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(access) && /^[A-Za-z0-9_-]{8,512}$/.test(refresh)) {
    return {access_token: access, refresh_token: refresh};
  }
  return null;
}
