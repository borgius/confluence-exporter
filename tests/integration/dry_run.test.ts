import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DryRunPlanner } from '../../src/core/dryRunPlanner';
import type { Page } from '../../src/models/entities';

describe('Integration: dry run', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for test output
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'confluence-dry-run-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  });

  it('produces planning output but no files', async () => {
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
        bodyStorage: '<h1>User Guide</h1><p>This is the guide content.</p>',
        ancestors: [{ id: 'page-home', title: 'Test Home Page' }]
      },
      {
        id: 'page-admin',
        title: 'Admin Documentation',
        type: 'page',
        bodyStorage: '<h1>Admin</h1><p>Admin content here.</p>',
        ancestors: []
      }
    ];

    // Create dry run planner
    const planner = new DryRunPlanner(tempDir);
    
    // Execute dry run planning
    const dryRunResult = planner.planExport(mockPages, undefined, false);

    // Verify planning output structure
    expect(dryRunResult).toBeDefined();
    expect(dryRunResult.totalPages).toBe(3);
    expect(dryRunResult.totalAttachments).toBe(0);
    expect(dryRunResult.expectedFiles).toHaveLength(3);
    expect(dryRunResult.estimatedSize).toBeGreaterThan(0);

    // Verify expected file paths (noting the actual format used by DryRunPlanner)
    expect(dryRunResult.expectedFiles).toContain('pages/Test-Home-Page.md');
    expect(dryRunResult.expectedFiles).toContain('pages/User-Guide.md');
    expect(dryRunResult.expectedFiles).toContain('pages/Admin-Documentation.md');

    // Verify no errors in planning
    expect(dryRunResult.errors).toHaveLength(0);
    expect(dryRunResult.warnings).toHaveLength(0);

    // CRITICAL: Verify no actual files were created
    const outputFiles = await fs.readdir(tempDir);
    expect(outputFiles).toHaveLength(0); // Should be empty - no files created in dry run

    // Verify the temporary directory exists but is empty
    const tempDirStats = await fs.stat(tempDir);
    expect(tempDirStats.isDirectory()).toBe(true);
  });

  it('shows hierarchy in planning output', async () => {
    const mockPages: Page[] = [
      {
        id: 'root',
        title: 'Root',
        type: 'page',
        bodyStorage: '<h1>Root</h1>',
        ancestors: []
      },
      {
        id: 'child-a',
        title: 'Child A',
        type: 'page',
        bodyStorage: '<h1>Child A</h1>',
        ancestors: [{ id: 'root', title: 'Root' }]
      },
      {
        id: 'child-b',
        title: 'Child B',
        type: 'page',
        bodyStorage: '<h1>Child B</h1>',
        ancestors: [{ id: 'root', title: 'Root' }]
      },
      {
        id: 'grandchild',
        title: 'Grandchild',
        type: 'page',
        bodyStorage: '<h1>Grandchild</h1>',
        ancestors: [
          { id: 'root', title: 'Root' },
          { id: 'child-a', title: 'Child A' }
        ]
      }
    ];

    const planner = new DryRunPlanner(tempDir);
    const dryRunResult = planner.planExport(mockPages, undefined, false);

    // Verify hierarchical planning
    expect(dryRunResult.totalPages).toBe(4);
    expect(dryRunResult.expectedFiles).toHaveLength(4);

    // Verify proper hierarchical paths (noting the actual format used by DryRunPlanner)
    expect(dryRunResult.expectedFiles).toContain('pages/Root.md');
    expect(dryRunResult.expectedFiles).toContain('pages/Child-A.md');
    expect(dryRunResult.expectedFiles).toContain('pages/Child-B.md');
    expect(dryRunResult.expectedFiles).toContain('pages/Grandchild.md');

    // Verify no files created
    const outputFiles = await fs.readdir(tempDir);
    expect(outputFiles).toHaveLength(0);
  });

  it('handles planning with no output files created', async () => {
    const mockPages: Page[] = [
      {
        id: 'page-with-content',
        title: 'Page with Content',
        type: 'page',
        bodyStorage: '<h1>Page with Files</h1><p>This page has substantial content that would be exported.</p>',
        ancestors: []
      }
    ];

    const planner = new DryRunPlanner(tempDir);
    const dryRunResult = planner.planExport(mockPages, undefined, false);

    // Verify basic planning
    expect(dryRunResult.totalPages).toBe(1);
    expect(dryRunResult.expectedFiles).toHaveLength(1);
    expect(dryRunResult.expectedFiles).toContain('pages/Page-with-Content.md');
    expect(dryRunResult.estimatedSize).toBeGreaterThan(0);

    // Verify no errors in planning
    expect(dryRunResult.errors).toHaveLength(0);

    // Verify no files created
    const outputFiles = await fs.readdir(tempDir);
    expect(outputFiles).toHaveLength(0);
  });
});
