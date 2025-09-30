import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createRestrictedPageHandler, type RestrictedPageHandler } from '../../src/services/restrictedHandling';
import { saveManifest, type Manifest } from '../../src/fs/manifest';
import type { ManifestEntry, Page } from '../../src/models/entities';

describe('Integration: restricted page skip', () => {
  let tempDir: string;
  let restrictedHandler: RestrictedPageHandler;

  beforeEach(async () => {
    // Create temporary directory for test output
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'confluence-restricted-test-'));
    restrictedHandler = createRestrictedPageHandler();
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  it('skips restricted page and marks denied in manifest', async () => {
    // Mock restricted pages with different restriction reasons
    const restrictedPages: Array<{page: Page, reason: 'permission_denied' | 'archived' | 'restricted_space', httpStatus?: number}> = [
      {
        page: {
          id: 'page-restricted-1',
          title: 'Confidential Document',
          type: 'page',
          bodyStorage: '<p>Secret content</p>',
          ancestors: []
        },
        reason: 'permission_denied',
        httpStatus: 403
      },
      {
        page: {
          id: 'page-restricted-2',
          title: 'Archived Page',
          type: 'page',
          bodyStorage: '<p>Old content</p>',
          ancestors: []
        },
        reason: 'archived',
        httpStatus: 404
      },
      {
        page: {
          id: 'page-restricted-3',
          title: 'Private Space Document',
          type: 'page',
          bodyStorage: '<p>Private content</p>',
          ancestors: []
        },
        reason: 'restricted_space',
        httpStatus: 401
      }
    ];

    // Process each restricted page through the handler
    const manifestEntries: ManifestEntry[] = [];

    for (const { page, reason, httpStatus } of restrictedPages) {
      // Record the restricted page
      restrictedHandler.recordRestrictedPage(page.id, page.title, reason, httpStatus);

      // Create manifest entry for restricted page
      const manifestEntry = restrictedHandler.createRestrictedManifestEntry(page.id, page.title, reason);
      manifestEntries.push(manifestEntry);
    }

    // Add some successful pages to the manifest as well
    manifestEntries.push({
      id: 'page-success-1',
      title: 'Public Document',
      path: 'public-document.md',
      hash: 'abc123',
      status: 'exported'
    });

    // Create and save manifest
    const manifest: Manifest = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      spaceKey: 'TEST',
      entries: manifestEntries
    };

    await saveManifest(path.join(tempDir, 'manifest.json'), manifest);

    // Verify manifest contains correct restricted page entries
    const manifestPath = path.join(tempDir, 'manifest.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const loadedManifest = JSON.parse(manifestContent);

    expect(loadedManifest.entries).toHaveLength(4);

    // Check permission denied page (should be marked as 'denied')
    const permissionDeniedEntry = loadedManifest.entries.find((e: ManifestEntry) => e.id === 'page-restricted-1');
    expect(permissionDeniedEntry).toBeDefined();
    expect(permissionDeniedEntry.title).toBe('Confidential Document');
    expect(permissionDeniedEntry.status).toBe('denied');
    expect(permissionDeniedEntry.path).toBe(''); // No file path for restricted pages
    expect(permissionDeniedEntry.hash).toBe(''); // No content hash for restricted pages

    // Check archived page (should be marked as 'removed')
    const archivedEntry = loadedManifest.entries.find((e: ManifestEntry) => e.id === 'page-restricted-2');
    expect(archivedEntry).toBeDefined();
    expect(archivedEntry.title).toBe('Archived Page');
    expect(archivedEntry.status).toBe('removed');
    expect(archivedEntry.path).toBe('');
    expect(archivedEntry.hash).toBe('');

    // Check restricted space page (should be marked as 'denied')
    const restrictedSpaceEntry = loadedManifest.entries.find((e: ManifestEntry) => e.id === 'page-restricted-3');
    expect(restrictedSpaceEntry).toBeDefined();
    expect(restrictedSpaceEntry.title).toBe('Private Space Document');
    expect(restrictedSpaceEntry.status).toBe('denied');
    expect(restrictedSpaceEntry.path).toBe('');
    expect(restrictedSpaceEntry.hash).toBe('');

    // Check successful page (should be marked as 'exported')
    const successEntry = loadedManifest.entries.find((e: ManifestEntry) => e.id === 'page-success-1');
    expect(successEntry).toBeDefined();
    expect(successEntry.title).toBe('Public Document');
    expect(successEntry.status).toBe('exported');
    expect(successEntry.path).toBe('public-document.md');
    expect(successEntry.hash).toBe('abc123');

    // Verify restricted page statistics
    const stats = restrictedHandler.getStats();
    expect(stats.totalRestricted).toBe(3);
    expect(stats.byReason.get('permission_denied')).toBe(1);
    expect(stats.byReason.get('archived')).toBe(1);
    expect(stats.byReason.get('restricted_space')).toBe(1);
    expect(stats.pages).toHaveLength(3);

    // Verify that no markdown files were created for restricted pages
    const outputFiles = await fs.readdir(tempDir);
    expect(outputFiles).toContain('manifest.json');
    expect(outputFiles).not.toContain('confidential-document.md');
    expect(outputFiles).not.toContain('archived-page.md');
    expect(outputFiles).not.toContain('private-space-document.md');
  });

  it('detects restriction errors from HTTP status and messages', async () => {
    // Test HTTP status-based restriction detection
    const error403 = new Error('HTTP 403 Forbidden');
    const restrictionReason403 = restrictedHandler.isRestrictedError(error403, 403);
    expect(restrictionReason403).toBe('permission_denied');

    const error401 = new Error('HTTP 401 Unauthorized');
    const restrictionReason401 = restrictedHandler.isRestrictedError(error401, 401);
    expect(restrictionReason401).toBe('permission_denied');

    const error404 = new Error('HTTP 404 Not Found');
    const restrictionReason404 = restrictedHandler.isRestrictedError(error404, 404);
    expect(restrictionReason404).toBe('not_found');

    // Test non-restricted error
    const error500 = new Error('HTTP 500 Internal Server Error');
    const restrictionReason500 = restrictedHandler.isRestrictedError(error500, 500);
    expect(restrictionReason500).toBeNull(); // Should not be treated as restriction

    // Test error message-based detection
    const permissionError = new Error('Access denied to this content');
    const messageRestriction = restrictedHandler.isRestrictedError(permissionError);
    expect(messageRestriction).toBe('permission_denied'); // Should detect access denied messages

    // Test non-restriction error
    const networkError = new Error('Network connection failed');
    const networkRestriction = restrictedHandler.isRestrictedError(networkError);
    expect(networkRestriction).toBeNull();
  });

  it('creates appropriate manifest entries for different restriction types', async () => {
    // Test permission denied entry
    const permissionEntry = restrictedHandler.createRestrictedManifestEntry(
      'page-1',
      'Secret Page',
      'permission_denied'
    );
    expect(permissionEntry.id).toBe('page-1');
    expect(permissionEntry.title).toBe('Secret Page');
    expect(permissionEntry.status).toBe('denied');
    expect(permissionEntry.path).toBe('');
    expect(permissionEntry.hash).toBe('');

    // Test archived entry
    const archivedEntry = restrictedHandler.createRestrictedManifestEntry(
      'page-2',
      'Old Page',
      'archived'
    );
    expect(archivedEntry.id).toBe('page-2');
    expect(archivedEntry.title).toBe('Old Page');
    expect(archivedEntry.status).toBe('removed');
    expect(archivedEntry.path).toBe('');
    expect(archivedEntry.hash).toBe('');

    // Test restricted space entry
    const restrictedSpaceEntry = restrictedHandler.createRestrictedManifestEntry(
      'page-3',
      'Private Page',
      'restricted_space'
    );
    expect(restrictedSpaceEntry.id).toBe('page-3');
    expect(restrictedSpaceEntry.title).toBe('Private Page');
    expect(restrictedSpaceEntry.status).toBe('denied');
    expect(restrictedSpaceEntry.path).toBe('');
    expect(restrictedSpaceEntry.hash).toBe('');

    // Test API error entry
    const apiErrorEntry = restrictedHandler.createRestrictedManifestEntry(
      'page-4',
      'API Error Page',
      'api_error'
    );
    expect(apiErrorEntry.id).toBe('page-4');
    expect(apiErrorEntry.title).toBe('API Error Page');
    expect(apiErrorEntry.status).toBe('skipped');
    expect(apiErrorEntry.path).toBe('');
    expect(apiErrorEntry.hash).toBe('');
  });

  it('tracks multiple restricted pages and provides accurate statistics', async () => {
    // Record multiple restricted pages of various types
    restrictedHandler.recordRestrictedPage('page-1', 'Secret Doc 1', 'permission_denied', 403);
    restrictedHandler.recordRestrictedPage('page-2', 'Secret Doc 2', 'permission_denied', 403);
    restrictedHandler.recordRestrictedPage('page-3', 'Archived Doc', 'archived', 404);
    restrictedHandler.recordRestrictedPage('page-4', 'Deleted Doc', 'not_found', 404);
    restrictedHandler.recordRestrictedPage('page-5', 'Private Space Doc', 'restricted_space', 401);

    // Verify statistics
    const stats = restrictedHandler.getStats();
    expect(stats.totalRestricted).toBe(5);
    expect(stats.byReason.get('permission_denied')).toBe(2);
    expect(stats.byReason.get('archived')).toBe(1);
    expect(stats.byReason.get('not_found')).toBe(1);
    expect(stats.byReason.get('restricted_space')).toBe(1);
    expect(stats.pages).toHaveLength(5);

    // Verify individual page information
    const permissionDeniedPages = stats.pages.filter(p => p.reason === 'permission_denied');
    expect(permissionDeniedPages).toHaveLength(2);
    expect(permissionDeniedPages[0].pageId).toBe('page-1');
    expect(permissionDeniedPages[0].title).toBe('Secret Doc 1');
    expect(permissionDeniedPages[0].httpStatus).toBe(403);

    const archivedPages = stats.pages.filter(p => p.reason === 'archived');
    expect(archivedPages).toHaveLength(1);
    expect(archivedPages[0].pageId).toBe('page-3');
    expect(archivedPages[0].title).toBe('Archived Doc');
    expect(archivedPages[0].httpStatus).toBe(404);
  });
});
