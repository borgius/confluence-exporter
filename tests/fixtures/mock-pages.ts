/**
 * Mock page data for testing
 */

import type { Page } from '../../src/types.js';

export const mockRootPage: Page = {
  id: '200001',
  title: 'Root Page',
  body: '<p>Root content</p>',
  version: 1,
  modifiedDate: '2025-10-01T10:00:00.000Z',
};

export const mockChild1: Page = {
  id: '200002',
  title: 'Child 1',
  body: '<p>Child 1 content</p>',
  version: 1,
  parentId: '200001',
  modifiedDate: '2025-10-02T10:00:00.000Z',
};

export const mockChild2: Page = {
  id: '200003',
  title: 'Child 2',
  body: '<p>Child 2 content</p>',
  version: 1,
  parentId: '200001',
  modifiedDate: '2025-10-03T10:00:00.000Z',
};

export const mockGrandchild: Page = {
  id: '200004',
  title: 'Grandchild',
  body: '<p>Grandchild content</p>',
  version: 1,
  parentId: '200002',
  modifiedDate: '2025-10-04T10:00:00.000Z',
};

export const mockSinglePage: Page = {
  id: '300001',
  title: 'Single Page',
  body: '<p>Content</p>',
  version: 1,
  modifiedDate: '2025-10-01T10:00:00.000Z',
};

export const mockQueuePage: Page = {
  id: '500002',
  title: 'Queue Page',
  body: '<p>Queue content</p>',
  version: 1,
};

export const mockIndexPage: Page = {
  id: '600001',
  title: 'Index Page',
  body: '<p>Index content</p>',
  version: 1,
};
