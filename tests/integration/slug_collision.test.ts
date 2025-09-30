import { resolveSingleSlug, type SlugCollisionContext } from '../../src/fs/slugCollision';
import type { Page } from '../../src/models/entities';

describe('Integration: slug collision handling', () => {
  it('applies collision suffix logic for duplicate page titles', async () => {
    // Create mock pages with duplicate titles
    const pages: Page[] = [
      {
        id: 'page-001',
        title: 'Getting Started',
        type: 'page',
        ancestors: []
      },
      {
        id: 'page-002', 
        title: 'Getting Started',
        type: 'page',
        ancestors: []
      },
      {
        id: 'page-003',
        title: 'Getting Started',
        type: 'page',
        ancestors: []
      },
      {
        id: 'page-004',
        title: 'Getting Started Guide',
        type: 'page',
        ancestors: []
      }
    ];

    const existingSlugs = new Set<string>();
    const context: SlugCollisionContext = { existingSlugs };
    
    // Process pages in order and track slug assignments
    const processedPages = [];
    
    for (const page of pages) {
      const resolution = resolveSingleSlug(page, existingSlugs, context);
      existingSlugs.add(resolution.resolvedSlug);
      
      processedPages.push({
        ...page,
        slug: resolution.resolvedSlug,
        path: resolution.finalPath
      });
    }

    // Verify that slugs are unique and properly suffixed
    expect(processedPages[0].slug).toBe('getting-started');
    expect(processedPages[1].slug).toBe('getting-started-1');
    expect(processedPages[2].slug).toBe('getting-started-2');
    expect(processedPages[3].slug).toBe('getting-started-guide');

    // Verify all paths are unique
    const paths = processedPages.map(p => p.path);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(paths.length);
  });

  it('handles complex collision scenarios with special characters', async () => {
    const complexPages: Page[] = [
      {
        id: 'a1',
        title: 'API & Integration Guide',
        type: 'page',
        ancestors: []
      },
      {
        id: 'a2',
        title: 'API & Integration Guide!',
        type: 'page',
        ancestors: []
      },
      {
        id: 'a3',
        title: 'API & Integration Guide - Updated',
        type: 'page',
        ancestors: []
      },
      {
        id: 'a4',
        title: 'api & integration guide',
        type: 'page',
        ancestors: []
      }
    ];

    const existingSlugs = new Set<string>();
    const context: SlugCollisionContext = { existingSlugs };
    const processedPages = [];

    for (const page of complexPages) {
      const resolution = resolveSingleSlug(page, existingSlugs, context);
      existingSlugs.add(resolution.resolvedSlug);
      
      processedPages.push({
        ...page,
        slug: resolution.resolvedSlug,
        path: resolution.finalPath
      });
    }

    // Verify that different variations of the same title get unique slugs
    const firstSlug = processedPages[0].slug;
    expect(firstSlug).toBe('api-integration-guide');
    
    // Subsequent similar titles should get numeric suffixes since they normalize to the same base slug
    expect(processedPages[1].slug).toBe('api-integration-guide-1');
    expect(processedPages[2].slug).toBe('api-integration-guide-updated');
    expect(processedPages[3].slug).toBe('api-integration-guide-2');

    // All should be filesystem-safe and unique
    const slugs = processedPages.map(p => p.slug);
    const uniqueSlugs = new Set(slugs);
    expect(uniqueSlugs.size).toBe(slugs.length);

    // Should not contain special characters
    slugs.forEach(slug => {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
      expect(slug).not.toContain('&');
      expect(slug).not.toContain('!');
    });
  });

  it('integrates with file system path generation', async () => {
    const hierarchicalPages: Page[] = [
      {
        id: 'parent',
        title: 'Development Guide',
        type: 'page',
        ancestors: []
      },
      {
        id: 'child1',
        title: 'Setup',
        type: 'page',
        parentId: 'parent',
        ancestors: [{ id: 'parent', title: 'Development Guide' }]
      },
      {
        id: 'child2',
        title: 'Setup',
        type: 'page',
        parentId: 'parent', 
        ancestors: [{ id: 'parent', title: 'Development Guide' }]
      }
    ];

    const existingSlugs = new Set<string>();
    
    // First process parent
    const parentResolution = resolveSingleSlug(hierarchicalPages[0], existingSlugs, { existingSlugs });
    existingSlugs.add(parentResolution.resolvedSlug);
    expect(parentResolution.resolvedSlug).toBe('development-guide');

    // Then process children - they should get unique slugs even though they have the same title
    const child1Resolution = resolveSingleSlug(hierarchicalPages[1], existingSlugs, { existingSlugs });
    existingSlugs.add(child1Resolution.resolvedSlug);
    
    const child2Resolution = resolveSingleSlug(hierarchicalPages[2], existingSlugs, { existingSlugs });
    existingSlugs.add(child2Resolution.resolvedSlug);

    expect(child1Resolution.resolvedSlug).toBe('setup');
    expect(child2Resolution.resolvedSlug).toBe('setup-1');

    // Build full paths considering hierarchy
    const parentPath = parentResolution.finalPath;
    const child1Path = `${parentResolution.resolvedSlug}/${child1Resolution.resolvedSlug}.md`;
    const child2Path = `${parentResolution.resolvedSlug}/${child2Resolution.resolvedSlug}.md`;

    expect(parentPath).toBe('development-guide.md');
    expect(child1Path).toBe('development-guide/setup.md');
    expect(child2Path).toBe('development-guide/setup-1.md');

    // All paths should be unique
    const allPaths = [parentPath, child1Path, child2Path];
    const uniquePaths = new Set(allPaths);
    expect(uniquePaths.size).toBe(allPaths.length);
  });
});
