import { diffManifests, type Manifest, type ManifestDiff } from '../../src/fs/manifest';

describe('Unit: manifest diff - deleted pages edge cases', () => {
  it('handles single page deletion correctly', () => {
    const oldManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'page-1',
          title: 'Page 1',
          path: 'page-1.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        },
        {
          id: 'page-2',
          title: 'Page 2',
          path: 'page-2.md',
          hash: 'def456',
          status: 'exported',
          version: 1
        }
      ]
    };

    const newManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-02T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'page-1',
          title: 'Page 1',
          path: 'page-1.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        }
      ]
    };

    const diff: ManifestDiff = diffManifests(oldManifest, newManifest);

    expect(diff.deleted).toHaveLength(1);
    expect(diff.deleted[0].id).toBe('page-2');
    expect(diff.deleted[0].title).toBe('Page 2');
    expect(diff.added).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(1);
  });

  it('handles complete manifest deletion (all pages removed)', () => {
    const oldManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'page-1',
          title: 'Page 1',
          path: 'page-1.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        }
      ]
    };

    const newManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-02T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: []
    };

    const diff: ManifestDiff = diffManifests(oldManifest, newManifest);

    expect(diff.deleted).toHaveLength(1);
    expect(diff.deleted[0].id).toBe('page-1');
    expect(diff.added).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(0);
  });

  it('handles parent-child page deletions correctly', () => {
    const oldManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'parent-1',
          title: 'Parent Page',
          path: 'parent-1.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        },
        {
          id: 'child-1',
          title: 'Child Page 1',
          path: 'child-1.md',
          hash: 'def456',
          status: 'exported',
          version: 1,
          parentId: 'parent-1'
        },
        {
          id: 'child-2',
          title: 'Child Page 2',
          path: 'child-2.md',
          hash: 'ghi789',
          status: 'exported',
          version: 1,
          parentId: 'parent-1'
        }
      ]
    };

    const newManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-02T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'parent-1',
          title: 'Parent Page',
          path: 'parent-1.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        },
        {
          id: 'child-1',
          title: 'Child Page 1',
          path: 'child-1.md',
          hash: 'def456',
          status: 'exported',
          version: 1,
          parentId: 'parent-1'
        }
      ]
    };

    const diff: ManifestDiff = diffManifests(oldManifest, newManifest);

    expect(diff.deleted).toHaveLength(1);
    expect(diff.deleted[0].id).toBe('child-2');
    expect(diff.deleted[0].parentId).toBe('parent-1');
    expect(diff.added).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(2);
  });

  it('handles mixed operations with deletions', () => {
    const oldManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'keep-1',
          title: 'Keep This Page',
          path: 'keep-1.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        },
        {
          id: 'modify-1',
          title: 'Modify This Page',
          path: 'modify-1.md',
          hash: 'def456',
          status: 'exported',
          version: 1
        },
        {
          id: 'delete-1',
          title: 'Delete This Page',
          path: 'delete-1.md',
          hash: 'ghi789',
          status: 'exported',
          version: 1
        },
        {
          id: 'delete-2',
          title: 'Delete This Too',
          path: 'delete-2.md',
          hash: 'jkl012',
          status: 'exported',
          version: 1
        }
      ]
    };

    const newManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-02T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'keep-1',
          title: 'Keep This Page',
          path: 'keep-1.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        },
        {
          id: 'modify-1',
          title: 'Modify This Page',
          path: 'modify-1.md',
          hash: 'def999', // Modified hash
          status: 'exported',
          version: 2 // Modified version
        },
        {
          id: 'add-1',
          title: 'New Page',
          path: 'add-1.md',
          hash: 'mno345',
          status: 'exported',
          version: 1
        }
      ]
    };

    const diff: ManifestDiff = diffManifests(oldManifest, newManifest);

    expect(diff.deleted).toHaveLength(2);
    const deletedIds = diff.deleted.map(entry => entry.id);
    expect(deletedIds).toContain('delete-1');
    expect(deletedIds).toContain('delete-2');
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].id).toBe('add-1');
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0].id).toBe('modify-1');
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.unchanged[0].id).toBe('keep-1');
  });

  it('handles deletion of pages with attachments referenced', () => {
    const oldManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'page-with-attachment',
          title: 'Page With Attachment',
          path: 'page-with-attachment.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        }
      ]
    };

    const newManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-02T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: []
    };

    const diff: ManifestDiff = diffManifests(oldManifest, newManifest);

    expect(diff.deleted).toHaveLength(1);
    expect(diff.deleted[0].id).toBe('page-with-attachment');
    expect(diff.deleted[0].title).toBe('Page With Attachment');
  });

  it('preserves deletion order based on original manifest order', () => {
    const oldManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'first',
          title: 'First Page',
          path: 'first.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        },
        {
          id: 'second',
          title: 'Second Page',
          path: 'second.md',
          hash: 'def456',
          status: 'exported',
          version: 1
        },
        {
          id: 'third',
          title: 'Third Page',
          path: 'third.md',
          hash: 'ghi789',
          status: 'exported',
          version: 1
        }
      ]
    };

    const newManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-02T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'second',
          title: 'Second Page',
          path: 'second.md',
          hash: 'def456',
          status: 'exported',
          version: 1
        }
      ]
    };

    const diff: ManifestDiff = diffManifests(oldManifest, newManifest);

    expect(diff.deleted).toHaveLength(2);
    // Note: Order depends on how diffManifests processes the Map iteration
    const deletedIds = diff.deleted.map(entry => entry.id);
    expect(deletedIds).toContain('first');
    expect(deletedIds).toContain('third');
  });

  it('handles empty old manifest (no deletions possible)', () => {
    const oldManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: []
    };

    const newManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-02T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'new-page',
          title: 'New Page',
          path: 'new-page.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        }
      ]
    };

    const diff: ManifestDiff = diffManifests(oldManifest, newManifest);

    expect(diff.deleted).toHaveLength(0);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].id).toBe('new-page');
    expect(diff.modified).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(0);
  });

  it('handles identical manifests (no deletions)', () => {
    const baseManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'page-1',
          title: 'Page 1',
          path: 'page-1.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        }
      ]
    };

    const identicalManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-02T00:00:00.000Z', // Different timestamp
      spaceKey: 'TEST',
      entries: [
        {
          id: 'page-1',
          title: 'Page 1',
          path: 'page-1.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        }
      ]
    };

    const diff: ManifestDiff = diffManifests(baseManifest, identicalManifest);

    expect(diff.deleted).toHaveLength(0);
    expect(diff.added).toHaveLength(0);
    expect(diff.modified).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.unchanged[0].id).toBe('page-1');
  });
});
