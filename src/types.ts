/**
 * Minimal type definitions for Confluence export
 */

export interface ConfluenceConfig {
  baseUrl: string;
  username: string;
  password: string;
  spaceKey: string;
  outputDir: string;
}

export interface Page {
  id: string;
  title: string;
  body: string;
  version?: number;
  parentId?: string;
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
