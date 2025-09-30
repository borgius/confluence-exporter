import { diffManifests, type Manifest, type ManifestDiff } from '../../src/fs/manifest';

describe('Unit: manifest diff', () => {
  it('identifies added, changed, and removed entries', () => {
    // Create old manifest with some entries
    const oldManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'page1',
          title: 'Introduction',
          path: 'introduction.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        },
        {
          id: 'page2',
          title: 'Getting Started',
          path: 'getting-started.md',
          hash: 'def456',
          status: 'exported',
          version: 2
        },
        {
          id: 'page3',
          title: 'Old Page',
          path: 'old-page.md',
          hash: 'ghi789',
          status: 'exported',
          version: 1
        }
      ]
    };

    // Create new manifest with added, modified, and some unchanged entries
    const newManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-02T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'page1',
          title: 'Introduction',
          path: 'introduction.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
          // Unchanged entry
        },
        {
          id: 'page2',
          title: 'Getting Started',
          path: 'getting-started.md',
          hash: 'def999', // Changed hash (content updated)
          status: 'exported',
          version: 3 // Changed version
        },
        {
          id: 'page4',
          title: 'New Page',
          path: 'new-page.md',
          hash: 'jkl012',
          status: 'exported',
          version: 1
          // Added entry
        },
        {
          id: 'page5',
          title: 'Another New Page',
          path: 'another-new-page.md',
          hash: 'mno345',
          status: 'exported',
          version: 1
          // Added entry
        }
      ]
    };

    const diff: ManifestDiff = diffManifests(oldManifest, newManifest);

    // Verify added entries
    expect(diff.added).toHaveLength(2);
    expect(diff.added.map(e => e.id)).toContain('page4');
    expect(diff.added.map(e => e.id)).toContain('page5');
    expect(diff.added.find(e => e.id === 'page4')?.title).toBe('New Page');

    // Verify modified entries
    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0].id).toBe('page2');
    expect(diff.modified[0].hash).toBe('def999');
    expect(diff.modified[0].version).toBe(3);

    // Verify unchanged entries
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.unchanged[0].id).toBe('page1');
    expect(diff.unchanged[0].hash).toBe('abc123');

    // Verify deleted entries
    expect(diff.deleted).toHaveLength(1);
    expect(diff.deleted[0].id).toBe('page3');
    expect(diff.deleted[0].title).toBe('Old Page');
  });

  it('detects changes in entry properties', () => {
    const oldManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'page1',
          title: 'Original Title',
          path: 'original-path.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        }
      ]
    };

    // Test title change
    const newManifestTitleChange: Manifest = {
      ...oldManifest,
      timestamp: '2024-01-02T00:00:00.000Z',
      entries: [
        {
          ...oldManifest.entries[0],
          title: 'Updated Title'
        }
      ]
    };

    const diffTitle = diffManifests(oldManifest, newManifestTitleChange);
    expect(diffTitle.modified).toHaveLength(1);
    expect(diffTitle.modified[0].title).toBe('Updated Title');

    // Test path change
    const newManifestPathChange: Manifest = {
      ...oldManifest,
      timestamp: '2024-01-02T00:00:00.000Z',
      entries: [
        {
          ...oldManifest.entries[0],
          path: 'new-path.md'
        }
      ]
    };

    const diffPath = diffManifests(oldManifest, newManifestPathChange);
    expect(diffPath.modified).toHaveLength(1);
    expect(diffPath.modified[0].path).toBe('new-path.md');

    // Test status change
    const newManifestStatusChange: Manifest = {
      ...oldManifest,
      timestamp: '2024-01-02T00:00:00.000Z',
      entries: [
        {
          ...oldManifest.entries[0],
          status: 'denied'
        }
      ]
    };

    const diffStatus = diffManifests(oldManifest, newManifestStatusChange);
    expect(diffStatus.modified).toHaveLength(1);
    expect(diffStatus.modified[0].status).toBe('denied');
  });

  it('handles empty manifests', () => {
    const emptyManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: []
    };

    const manifestWithEntries: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-02T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'page1',
          title: 'First Page',
          path: 'first-page.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        }
      ]
    };

    // Empty to populated
    const diffEmptyToPopulated = diffManifests(emptyManifest, manifestWithEntries);
    expect(diffEmptyToPopulated.added).toHaveLength(1);
    expect(diffEmptyToPopulated.modified).toHaveLength(0);
    expect(diffEmptyToPopulated.deleted).toHaveLength(0);
    expect(diffEmptyToPopulated.unchanged).toHaveLength(0);

    // Populated to empty
    const diffPopulatedToEmpty = diffManifests(manifestWithEntries, emptyManifest);
    expect(diffPopulatedToEmpty.added).toHaveLength(0);
    expect(diffPopulatedToEmpty.modified).toHaveLength(0);
    expect(diffPopulatedToEmpty.deleted).toHaveLength(1);
    expect(diffPopulatedToEmpty.unchanged).toHaveLength(0);

    // Empty to empty
    const diffEmptyToEmpty = diffManifests(emptyManifest, emptyManifest);
    expect(diffEmptyToEmpty.added).toHaveLength(0);
    expect(diffEmptyToEmpty.modified).toHaveLength(0);
    expect(diffEmptyToEmpty.deleted).toHaveLength(0);
    expect(diffEmptyToEmpty.unchanged).toHaveLength(0);
  });

  it('handles parent-child relationships in diff', () => {
    const oldManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-01T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'parent',
          title: 'Parent Page',
          path: 'parent.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
        },
        {
          id: 'child',
          title: 'Child Page',
          path: 'parent/child.md',
          hash: 'def456',
          status: 'exported',
          version: 1,
          parentId: 'parent'
        }
      ]
    };

    const newManifest: Manifest = {
      version: '1.0.0',
      timestamp: '2024-01-02T00:00:00.000Z',
      spaceKey: 'TEST',
      entries: [
        {
          id: 'parent',
          title: 'Parent Page',
          path: 'parent.md',
          hash: 'abc123',
          status: 'exported',
          version: 1
          // Unchanged
        },
        {
          id: 'child',
          title: 'Child Page',
          path: 'parent/child.md',
          hash: 'def456',
          status: 'exported',
          version: 1,
          parentId: 'new-parent' // Changed parent relationship
        }
      ]
    };

    const diff = diffManifests(oldManifest, newManifest);

    expect(diff.modified).toHaveLength(1);
    expect(diff.modified[0].id).toBe('child');
    expect(diff.modified[0].parentId).toBe('new-parent');
    expect(diff.unchanged).toHaveLength(1);
    expect(diff.unchanged[0].id).toBe('parent');
  });
});
