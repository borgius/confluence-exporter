/**
 * Minimal type definitions for Confluence export
 */

export interface ConfluenceConfig {
  baseUrl: string;
  username: string;
  password: string;
  spaceKey: string;
  outputDir: string;
  pageId?: string; // Optional: if specified, export only this page
  pageSize?: number; // Optional: number of items per API page (default: 25)
}

export interface Page {
  id: string;
  title: string;
  body: string;
  version?: number;
  parentId?: string;
  modifiedDate?: string;
}

export interface PaginatedResponse<T> {
  results: T[];
  start: number;
  limit: number;
  size: number;
  _links?: {
    next?: string;
  };
}

export interface User {
  userKey: string;
  username: string;
  displayName: string;
  email?: string;
}

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
