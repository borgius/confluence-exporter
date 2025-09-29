import { ExportConfig, RetryPolicyConfig } from '../models/entities.js';

export interface RawEnv {
  CONFLUENCE_BASE_URL?: string;
  CONFLUENCE_USERNAME?: string;
  CONFLUENCE_PASSWORD?: string;
  LOG_LEVEL?: string;
}

export interface CliFlags {
  spaceKey?: string;
  outDir?: string;
  dryRun?: boolean;
  concurrency?: number;
  resume?: boolean;
  fresh?: boolean;
  rootPageId?: string;
  logLevel?: string;
}

const DEFAULT_RETRY: RetryPolicyConfig = {
  maxAttempts: 6,
  baseDelayMs: 500,
  maxDelayMs: 30_000,
  jitterRatio: 0.3
};

function validateLogLevel(value: string | undefined): ExportConfig['logLevel'] {
  const lvl = (value || 'info') as ExportConfig['logLevel'];
  if (!['debug','info','warn','error'].includes(lvl)) {
    throw new Error(`Invalid logLevel: ${lvl}`);
  }
  return lvl;
}

function validateAuth(baseUrl?: string, username?: string, password?: string) {
  if (!baseUrl) throw new Error('CONFLUENCE_BASE_URL is required');
  if (!username || !password) throw new Error('CONFLUENCE_USERNAME and CONFLUENCE_PASSWORD are required');
}

export function buildConfig(env: RawEnv, flags: CliFlags): ExportConfig {
  const spaceKey = flags.spaceKey || process.env.SPACE_KEY; // fallback (CI convenience)
  const baseUrl = env.CONFLUENCE_BASE_URL;
  const username = env.CONFLUENCE_USERNAME;
  const password = env.CONFLUENCE_PASSWORD;
  if (!spaceKey) throw new Error('spaceKey is required');
  validateAuth(baseUrl, username, password);

  const dryRun = !!flags.dryRun;
  const concurrency = flags.concurrency && flags.concurrency > 0 ? flags.concurrency : 8;
  const resume = !!flags.resume;
  const fresh = !!flags.fresh;
  if (resume && fresh) throw new Error('Cannot specify both --resume and --fresh');

  const retry = DEFAULT_RETRY; // could make configurable later

  const logLevel = validateLogLevel(flags.logLevel || env.LOG_LEVEL);

  return {
    spaceKey,
    outputDir: flags.outDir || 'spaces',
    dryRun,
    concurrency,
    resume,
    fresh,
    rootPageId: flags.rootPageId,
    logLevel,
    username,
    password,
    baseUrl,
    retry
  };
}
