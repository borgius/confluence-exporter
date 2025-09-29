// Core domain & DTO interfaces

export interface Space {
  id: string;
  key: string;
  name: string;
  homepageId?: string;
}

export interface PageAncestorRef {
  id: string;
  title: string;
}

export interface Page {
  id: string;
  title: string;
  type: 'page' | string;
  version?: number;
  parentId?: string; // direct parent page id (if any)
  ancestors?: PageAncestorRef[]; // ordered root -> parent chain
  bodyStorage?: string; // Confluence storage format
  slug?: string; // resolved slug (after collision handling)
  path?: string; // relative path to markdown file once known
}

export interface Attachment {
  id: string;
  pageId: string;
  fileName: string;
  mediaType?: string;
  downloadUrl: string; // relative or absolute API path
  size?: number;
  hash?: string; // optional integrity hash if computed
  localPath?: string; // relative path where stored locally
}

export interface User {
  userKey: string;
  username: string;
  displayName: string;
  profilePicture?: {
    path: string;
    width: number;
    height: number;
    isDefault: boolean;
  };
  type: string;
  email?: string;
}

export type ManifestEntryStatus = 'exported' | 'changed' | 'added' | 'removed' | 'denied' | 'skipped' | 'unchanged';

export interface ManifestEntry {
  id: string; // page id
  title: string;
  path: string; // markdown path relative to export root
  hash: string; // content hash of rendered markdown
  version?: number;
  status: ManifestEntryStatus;
  parentId?: string;
}

export interface LinkReference {
  sourcePageId: string;
  targetPageId: string;
  originalHref: string;
  deferred?: boolean; // resolved after final link map build
}

export interface RetryPolicyConfig {
  maxAttempts: number; // total attempts including initial
  baseDelayMs: number; // initial backoff base
  maxDelayMs: number; // cap backoff
  jitterRatio: number; // 0..1 fraction for randomization
}

export interface ExportConfig {
  spaceKey: string;
  outputDir: string;
  dryRun: boolean;
  concurrency: number;
  limit?: number;
  resume: boolean;
  fresh: boolean;
  rootPageId?: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  username: string;
  password: string;
  baseUrl: string; // Confluence base URL (e.g., https://your-domain.atlassian.net/wiki)
  retry: RetryPolicyConfig;
}

export interface ExportJob {
  startedAt: number;
  space: Space;
  pages: Page[]; // all pages (or filtered by root)
  attachments: Attachment[]; // flattened list
}

export interface RetryPolicyState {
  attempt: number;
  nextDelayMs: number;
}
