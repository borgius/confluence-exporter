/**
 * Minimal type definitions for Confluence export
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface ConfluenceConfig {
  baseUrl: string;
  username: string;
  password: string;
  spaceKey: string;
  outputDir: string;
  pageId?: string; // Optional: if specified, export only this page
  pageSize?: number; // Optional: number of items per API page (default: 25)
  limit?: number; // Optional: maximum number of pages to process
}

// ============================================================================
// Core Domain Types
// ============================================================================

export interface Page {
  id: string;
  title: string;
  body: string;
  version?: number;
  parentId?: string;
  modifiedDate?: string;
}

export interface User {
  userKey: string;
  username: string;
  displayName: string;
  email?: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface PaginatedResponse<T> {
  results: T[];
  start: number;
  limit: number;
  size: number;
  _links?: {
    next?: string;
  };
}

export interface PageResponse {
  id: string;
  title: string;
  body?: { storage?: { value: string } };
  version?: { number: number; when?: string };
  ancestors?: Array<{ id: string }>;
  history?: { lastUpdated?: { when?: string } };
}

export interface RawPage {
  id: string;
  title: string;
  body?: { storage?: { value: string } };
  version?: { number: number; when?: string };
  ancestors?: Array<{ id: string }>;
  history?: { lastUpdated?: { when?: string } };
}

export interface ListPagesResponse {
  results: RawPage[];
  start: number;
  limit: number;
  size: number;
  _links?: {
    next?: string;
  };
}

export interface ChildPageResponse {
  id: string;
  title: string;
  version?: { number: number };
}

export interface ChildPagesResponse {
  results: ChildPageResponse[];
}

export interface AttachmentResult {
  id: string;
  title: string;
  _links: {
    download: string;
  };
}

export interface AttachmentResponse {
  results: AttachmentResult[];
}

// ============================================================================
// Index & Export Types
// ============================================================================

export interface PageIndexEntry {
  id: string;
  title: string;
  version?: number;
  parentId?: string;
  modifiedDate?: string;
  indexedDate: string;
  pageNumber: number;
}

export interface PageIndex {
  spaceKey: string;
  exportDate: string;
  totalPages: number;
  pages: PageIndexEntry[];
}

export interface PageTreeNode {
  id: string;
  title: string;
  version?: number;
  parentId?: string;
  modifiedDate?: string;
  children?: PageTreeNode[];
}

// ============================================================================
// Transformation Types
// ============================================================================

export interface MarkdownResult {
  content: string;
  frontMatter: {
    title: string;
    id: string;
    version?: number;
    parentId?: string;
  };
  images: Array<{
    filename: string;
    data: Buffer;
  }>;
}
