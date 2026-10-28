import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

export const projectRoot = resolve(import.meta.dirname, '..');
export function projectEnvironment(env = process.env) {
  const next = { ...env };
  const privateDir = resolve(env.KAFFEIN_RECOVERY_DIR ?? join(projectRoot, 'recovery/private'));
  const credentials = join(privateDir, 'aws/credentials');
  if (existsSync(credentials) && !env.AWS_SHARED_CREDENTIALS_FILE && !env.AWS_ACCESS_KEY_ID && !env.AWS_PROFILE) {
    next.AWS_SHARED_CREDENTIALS_FILE = credentials;
    next.AWS_CONFIG_FILE = join(privateDir, 'aws/config');
    next.AWS_PROFILE = 'default';
  }
  next.KAFFEIN_RECOVERY_DIR = privateDir;
  next.KAFFEIN_ARTIFACTS_DIR = env.KAFFEIN_ARTIFACTS_DIR ?? join(privateDir, 'artifacts');
  next.KAFFEIN_SSH_KEY_PATH = env.KAFFEIN_SSH_KEY_PATH ?? join(privateDir, 'oci/ssh-key-2026-09-17.key');
  return next;
}
