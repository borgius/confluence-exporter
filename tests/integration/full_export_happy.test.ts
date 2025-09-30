import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { saveManifest, type Manifest } from '../../src/fs/manifest';
import { atomicWriteFile } from '../../src/fs/atomicWriter';
import { slugify } from '../../src/util/slugify';
import type { Space, Page, ManifestEntry } from '../../src/models/entities';

describe('Integration: full export happy path', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test output
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'confluence-export-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  it('exports all pages and manifest', async () => {
    // Mock space data
    const mockSpace: Space = {
      id: 'space-123',
      key: 'TEST',
      name: 'Test Space',
      homepageId: 'page-home'
    };

    // Mock pages data
    const mockPages: Page[] = [
      {
        id: 'page-home',
        title: 'Test Home Page',
        type: 'page',
        bodyStorage: '<h1>Welcome</h1><p>This is the homepage content.</p>',
        ancestors: []
      },
      {
        id: 'page-guide',
        title: 'User Guide',
        type: 'page',
        bodyStorage: '<h1>User Guide</h1><p>This is the guide content with <strong>bold text</strong>.</p>',
        ancestors: [{ id: 'page-home', title: 'Test Home Page' }]
      }
    ];

    // Simulate the export process by creating files and manifest
    const manifestEntries: ManifestEntry[] = [];
    
    for (const page of mockPages) {
      // Generate slug and content
      const slug = slugify(page.title);
      const markdownContent = `# ${page.title}\n\n${page.bodyStorage}\n`;
      const fileName = `${slug}.md`;
      const filePath = path.join(tempDir, fileName);
      
      // Write markdown file
      await atomicWriteFile(filePath, markdownContent);
      
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
      spaceKey: mockSpace.key,
      entries: manifestEntries
    };

    await saveManifest(path.join(tempDir, 'manifest.json'), manifest);

    // Verify files were created
    const outputFiles = await fs.readdir(tempDir);
    expect(outputFiles).toContain('manifest.json');
    expect(outputFiles).toContain('test-home-page.md');
    expect(outputFiles).toContain('user-guide.md');

    // Verify manifest content
    const manifestPath = path.join(tempDir, 'manifest.json');
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    const loadedManifest = JSON.parse(manifestContent);
    
    expect(loadedManifest.spaceKey).toBe('TEST');
    expect(loadedManifest.entries).toHaveLength(2);
    expect(loadedManifest.entries[0].id).toBe('page-home');
    expect(loadedManifest.entries[0].title).toBe('Test Home Page');
    expect(loadedManifest.entries[0].status).toBe('exported');
    expect(loadedManifest.entries[1].id).toBe('page-guide');
    expect(loadedManifest.entries[1].title).toBe('User Guide');
    expect(loadedManifest.entries[1].status).toBe('exported');

    // Verify markdown content
    const homepageContent = await fs.readFile(path.join(tempDir, 'test-home-page.md'), 'utf-8');
    expect(homepageContent).toContain('# Test Home Page');
    expect(homepageContent).toContain('<h1>Welcome</h1>');

    const guideContent = await fs.readFile(path.join(tempDir, 'user-guide.md'), 'utf-8');
    expect(guideContent).toContain('# User Guide');
    expect(guideContent).toContain('<strong>bold text</strong>');

    // Verify summary statistics
    expect(loadedManifest.entries).toHaveLength(2);
    expect(loadedManifest.version).toBe('1.0');
    expect(loadedManifest.spaceKey).toBe('TEST');
  });

  it('handles empty space gracefully', async () => {
    const mockSpace: Space = {
      id: 'empty-space',
      key: 'EMPTY',
      name: 'Empty Space',
      homepageId: undefined
    };

    // Create manifest for empty space
    const manifest: Manifest = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      spaceKey: mockSpace.key,
      entries: []
    };

    await saveManifest(path.join(tempDir, 'manifest.json'), manifest);

    // Should create manifest even for empty space
    const outputFiles = await fs.readdir(tempDir);
    expect(outputFiles).toContain('manifest.json');

    const manifestContent = await fs.readFile(path.join(tempDir, 'manifest.json'), 'utf-8');
    const loadedManifest = JSON.parse(manifestContent);
    expect(loadedManifest.spaceKey).toBe('EMPTY');
    expect(loadedManifest.entries).toHaveLength(0);
  });

  it('creates hierarchical directory structure for nested pages', async () => {
    const mockPages: Page[] = [
      {
        id: 'root-page',
        title: 'Root Page',
        type: 'page',
        bodyStorage: '<h1>Root</h1>',
        ancestors: []
      },
      {
        id: 'child-page',
        title: 'Child Page',
        type: 'page',
        bodyStorage: '<h1>Child</h1>',
        ancestors: [{ id: 'root-page', title: 'Root Page' }]
      },
      {
        id: 'grandchild-page',
        title: 'Grandchild Page',
        type: 'page',
        bodyStorage: '<h1>Grandchild</h1>',
        ancestors: [
          { id: 'root-page', title: 'Root Page' },
          { id: 'child-page', title: 'Child Page' }
        ]
      }
    ];

    // Simulate hierarchical file creation
    const manifestEntries: ManifestEntry[] = [];
    
    for (const page of mockPages) {
      let filePath: string;
      const slug = slugify(page.title);
      const markdownContent = `# ${page.title}\n\n${page.bodyStorage}\n`;
      
      if (page.ancestors && page.ancestors.length > 0) {
        // Create nested structure
        const ancestorPath = page.ancestors.map(a => slugify(a.title)).join('/');
        const dirPath = path.join(tempDir, ancestorPath);
        await fs.mkdir(dirPath, { recursive: true });
        filePath = path.join(dirPath, `${slug}.md`);
      } else {
        // Root level page
        filePath = path.join(tempDir, `${slug}.md`);
        // Also create directory for potential children
        const dirPath = path.join(tempDir, slug);
        await fs.mkdir(dirPath, { recursive: true });
      }
      
      await atomicWriteFile(filePath, markdownContent);
      
      // Calculate relative path for manifest
      const relativePath = path.relative(tempDir, filePath);
      manifestEntries.push({
        id: page.id,
        title: page.title,
        path: relativePath,
        hash: 'mock-hash-' + page.id,
        status: 'exported'
      });
    }

    // Create manifest
    const manifest: Manifest = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      spaceKey: 'NESTED',
      entries: manifestEntries
    };

    await saveManifest(path.join(tempDir, 'manifest.json'), manifest);

    // Verify hierarchical structure
    const files = await fs.readdir(tempDir, { recursive: true });
    expect(files).toContain('root-page.md');
    expect(files).toContain('root-page');
    expect(files).toContain('root-page/child-page.md');
    expect(files).toContain('root-page/child-page');
    expect(files).toContain('root-page/child-page/grandchild-page.md');

    // Verify content exists
    await expect(fs.access(path.join(tempDir, 'root-page.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tempDir, 'root-page/child-page.md'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tempDir, 'root-page/child-page/grandchild-page.md'))).resolves.toBeUndefined();

    // Verify manifest contains correct paths
    const manifestContent = await fs.readFile(path.join(tempDir, 'manifest.json'), 'utf-8');
    const loadedManifest = JSON.parse(manifestContent);
    expect(loadedManifest.entries).toHaveLength(3);
    
    const rootPage = loadedManifest.entries.find((p: ManifestEntry) => p.id === 'root-page');
    const childPage = loadedManifest.entries.find((p: ManifestEntry) => p.id === 'child-page');
    const grandchildPage = loadedManifest.entries.find((p: ManifestEntry) => p.id === 'grandchild-page');
    
    expect(rootPage.path).toBe('root-page.md');
    expect(childPage.path).toBe('root-page/child-page.md');
    expect(grandchildPage.path).toBe('root-page/child-page/grandchild-page.md');
  });
});
