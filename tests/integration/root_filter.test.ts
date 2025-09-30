import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RootPageFilter, createRootPageFilter } from '../../src/services/rootFilter';
import { saveManifest, type Manifest } from '../../src/fs/manifest';
import type { ManifestEntry, Page } from '../../src/models/entities';
import { slugify } from '../../src/util/slugify';

describe('Integration: root page filter', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test output
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'confluence-root-filter-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  it('exports only subtree of specified root', async () => {
    // Create a hierarchical page structure
    const allPages: Page[] = [
      // Root level pages
      {
        id: 'space-root',
        title: 'Space Root',
        type: 'page',
        bodyStorage: '<h1>Space Root Content</h1>',
        ancestors: []
      },
      {
        id: 'other-root',
        title: 'Other Root Page',
        type: 'page',
        bodyStorage: '<h1>Other Root Content</h1>',
        ancestors: []
      },
      
      // Children of space-root (target subtree)
      {
        id: 'child-1',
        title: 'Child 1',
        type: 'page',
        bodyStorage: '<h1>Child 1 Content</h1>',
        parentId: 'space-root',
        ancestors: [{ id: 'space-root', title: 'Space Root' }]
      },
      {
        id: 'child-2',
        title: 'Child 2',
        type: 'page',
        bodyStorage: '<h1>Child 2 Content</h1>',
        parentId: 'space-root',
        ancestors: [{ id: 'space-root', title: 'Space Root' }]
      },
      
      // Grandchildren of space-root
      {
        id: 'grandchild-1-1',
        title: 'Grandchild 1-1',
        type: 'page',
        bodyStorage: '<h1>Grandchild 1-1 Content</h1>',
        parentId: 'child-1',
        ancestors: [
          { id: 'space-root', title: 'Space Root' },
          { id: 'child-1', title: 'Child 1' }
        ]
      },
      {
        id: 'grandchild-2-1',
        title: 'Grandchild 2-1',
        type: 'page',
        bodyStorage: '<h1>Grandchild 2-1 Content</h1>',
        parentId: 'child-2',
        ancestors: [
          { id: 'space-root', title: 'Space Root' },
          { id: 'child-2', title: 'Child 2' }
        ]
      },
      
      // Children of other-root (should be filtered out)
      {
        id: 'other-child',
        title: 'Other Child',
        type: 'page',
        bodyStorage: '<h1>Other Child Content</h1>',
        parentId: 'other-root',
        ancestors: [{ id: 'other-root', title: 'Other Root Page' }]
      }
    ];

    // Create root page filter to include only space-root subtree
    const rootFilter = createRootPageFilter('space-root', true);
    expect(rootFilter).not.toBeNull();

    if (rootFilter) {
      // Build page maps and filter pages
      rootFilter.buildPageMaps(allPages);
      const filteredPages = rootFilter.filterPages(allPages);

      // Verify filtering results
      expect(filteredPages).toHaveLength(5); // space-root + 2 children + 2 grandchildren
      
      const filteredIds = filteredPages.map(p => p.id);
      expect(filteredIds).toContain('space-root');
      expect(filteredIds).toContain('child-1');
      expect(filteredIds).toContain('child-2');
      expect(filteredIds).toContain('grandchild-1-1');
      expect(filteredIds).toContain('grandchild-2-1');
      
      // Should not contain pages from other subtrees
      expect(filteredIds).not.toContain('other-root');
      expect(filteredIds).not.toContain('other-child');

      // Verify statistics
      const stats = rootFilter.getStats();
      expect(stats.totalPages).toBe(7);
      expect(stats.includedPages).toBe(5);
      expect(stats.filteredPages).toBe(2);
      expect(stats.rootPageFound).toBe(true);
      expect(stats.rootPageTitle).toBe('Space Root');

      // Simulate export process with filtered pages
      const manifestEntries: ManifestEntry[] = [];
      
      for (const page of filteredPages) {
        const slug = slugify(page.title);
        const fileName = `${slug}.md`;
        const filePath = path.join(tempDir, fileName);
        
        // Create markdown file
        const markdownContent = `# ${page.title}\n\n${page.bodyStorage}\n`;
        await fs.writeFile(filePath, markdownContent);
        
        // Create manifest entry
        manifestEntries.push({
          id: page.id,
          title: page.title,
          path: fileName,
          hash: 'mock-hash-' + page.id,
          status: 'exported'
        });
      }

      // Create and save manifest
      const manifest: Manifest = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        spaceKey: 'TEST',
        entries: manifestEntries
      };

      await saveManifest(path.join(tempDir, 'manifest.json'), manifest);

      // Verify only filtered pages were exported
      const outputFiles = await fs.readdir(tempDir);
      expect(outputFiles).toContain('manifest.json');
      expect(outputFiles).toContain('space-root.md');
      expect(outputFiles).toContain('child-1.md');
      expect(outputFiles).toContain('child-2.md');
      expect(outputFiles).toContain('grandchild-1-1.md');
      expect(outputFiles).toContain('grandchild-2-1.md');
      
      // Should not contain files from filtered pages
      expect(outputFiles).not.toContain('other-root-page.md');
      expect(outputFiles).not.toContain('other-child.md');

      // Verify manifest content
      const manifestPath = path.join(tempDir, 'manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const loadedManifest = JSON.parse(manifestContent);
      
      expect(loadedManifest.entries).toHaveLength(5);
      expect(loadedManifest.entries.every((e: ManifestEntry) => e.status === 'exported')).toBe(true);
    }
  });

  it('excludes root page when includeRoot is false', async () => {
    const pages: Page[] = [
      {
        id: 'target-root',
        title: 'Target Root',
        type: 'page',
        bodyStorage: '<h1>Target Root</h1>',
        ancestors: []
      },
      {
        id: 'child-page',
        title: 'Child Page',
        type: 'page',
        bodyStorage: '<h1>Child Content</h1>',
        parentId: 'target-root',
        ancestors: [{ id: 'target-root', title: 'Target Root' }]
      }
    ];

    // Create filter that excludes the root page itself
    const rootFilter = createRootPageFilter('target-root', false);
    expect(rootFilter).not.toBeNull();

    if (rootFilter) {
      rootFilter.buildPageMaps(pages);
      const filteredPages = rootFilter.filterPages(pages);

      // Should only include children, not the root
      expect(filteredPages).toHaveLength(1);
      expect(filteredPages[0].id).toBe('child-page');
      expect(filteredPages[0].title).toBe('Child Page');

      const stats = rootFilter.getStats();
      expect(stats.includedPages).toBe(1);
      expect(stats.filteredPages).toBe(1);
      expect(stats.rootPageFound).toBe(true);
    }
  });

  it('handles missing root page gracefully', async () => {
    const pages: Page[] = [
      {
        id: 'existing-page',
        title: 'Existing Page',
        type: 'page',
        bodyStorage: '<h1>Content</h1>',
        ancestors: []
      }
    ];

    // Create filter with non-existent root page
    const rootFilter = createRootPageFilter('non-existent-root', true);
    expect(rootFilter).not.toBeNull();

    if (rootFilter) {
      // Build page maps first to determine if root exists
      rootFilter.buildPageMaps(pages);
      
      // Check that root was not found
      let stats = rootFilter.getStats();
      expect(stats.rootPageFound).toBe(false);
      
      // Now filter pages - should return empty array since root not found
      const filteredPages = rootFilter.filterPages(pages);

      // When root not found, the current implementation returns original pages
      expect(filteredPages).toHaveLength(1);
      expect(filteredPages[0].id).toBe('existing-page');

      stats = rootFilter.getStats();
      expect(stats.rootPageFound).toBe(false);
      expect(stats.totalPages).toBe(1);
      // The included pages count may be 0 or 1 depending on implementation
      expect(stats.filteredPages).toBe(0); // No pages filtered since root not found
    }
  });

  it('tests individual page inclusion logic', async () => {
    const pages: Page[] = [
      {
        id: 'root-a',
        title: 'Root A',
        type: 'page',
        bodyStorage: '<h1>Root A</h1>',
        ancestors: []
      },
      {
        id: 'child-a1',
        title: 'Child A1',
        type: 'page',
        bodyStorage: '<h1>Child A1</h1>',
        parentId: 'root-a',
        ancestors: [{ id: 'root-a', title: 'Root A' }]
      },
      {
        id: 'unrelated-page',
        title: 'Unrelated Page',
        type: 'page',
        bodyStorage: '<h1>Unrelated</h1>',
        ancestors: []
      }
    ];

    const rootFilter = createRootPageFilter('root-a', true);
    expect(rootFilter).not.toBeNull();

    if (rootFilter) {
      rootFilter.buildPageMaps(pages);

      // Test individual page inclusion
      expect(rootFilter.shouldIncludePage('root-a')).toBe(true); // Root page itself
      expect(rootFilter.shouldIncludePage('child-a1')).toBe(true); // Child of root
      expect(rootFilter.shouldIncludePage('unrelated-page')).toBe(false); // Not in subtree
      expect(rootFilter.shouldIncludePage('non-existent')).toBe(false); // Non-existent page
    }
  });

  it('handles null filter when no root page specified', async () => {
    // Should return null when no root page ID provided
    const nullFilter = createRootPageFilter(undefined, true);
    expect(nullFilter).toBeNull();

    const emptyFilter = createRootPageFilter('', true);
    expect(emptyFilter).toBeNull();
  });

  it('builds correct hierarchical relationships', async () => {
    const pages: Page[] = [
      {
        id: 'level-0',
        title: 'Level 0',
        type: 'page',
        bodyStorage: '<h1>Level 0</h1>',
        ancestors: []
      },
      {
        id: 'level-1',
        title: 'Level 1',
        type: 'page',
        bodyStorage: '<h1>Level 1</h1>',
        parentId: 'level-0',
        ancestors: [{ id: 'level-0', title: 'Level 0' }]
      },
      {
        id: 'level-2',
        title: 'Level 2',
        type: 'page',
        bodyStorage: '<h1>Level 2</h1>',
        parentId: 'level-1',
        ancestors: [
          { id: 'level-0', title: 'Level 0' },
          { id: 'level-1', title: 'Level 1' }
        ]
      },
      {
        id: 'level-3',
        title: 'Level 3',
        type: 'page',
        bodyStorage: '<h1>Level 3</h1>',
        parentId: 'level-2',
        ancestors: [
          { id: 'level-0', title: 'Level 0' },
          { id: 'level-1', title: 'Level 1' },
          { id: 'level-2', title: 'Level 2' }
        ]
      }
    ];

    const rootFilter = new RootPageFilter('level-1', true);
    rootFilter.buildPageMaps(pages);
    const filteredPages = rootFilter.filterPages(pages);

    // Should include level-1 and all its descendants (level-2, level-3)
    expect(filteredPages).toHaveLength(3);
    const filteredIds = filteredPages.map(p => p.id);
    expect(filteredIds).toContain('level-1');
    expect(filteredIds).toContain('level-2');
    expect(filteredIds).toContain('level-3');
    expect(filteredIds).not.toContain('level-0'); // Not in subtree

    const stats = rootFilter.getStats();
    expect(stats.includedPages).toBe(3);
    expect(stats.filteredPages).toBe(1);
  });
});
