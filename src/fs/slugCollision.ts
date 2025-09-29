import { slugify } from '../util/slugify.js';
import type { Page } from '../models/entities.js';
import { logger } from '../util/logger.js';

export interface SlugCollisionContext {
  existingSlugs: Set<string>;
  parentPath?: string;
  fileExtension?: string;
}

export interface SlugResolution {
  originalSlug: string;
  resolvedSlug: string;
  collisionCount: number;
  finalPath: string;
}

/**
 * Resolve slug collisions for a batch of pages
 */
export function resolveSlugCollisions(
  pages: Page[],
  context: SlugCollisionContext = { existingSlugs: new Set() }
): Map<string, SlugResolution> {
  const resolutions = new Map<string, SlugResolution>();
  const workingSlugs = new Set(context.existingSlugs);
  
  // Sort pages to ensure consistent ordering for collision resolution
  const sortedPages = [...pages].sort((a, b) => {
    // Primary sort: by parent (root pages first)
    const aParentId = a.parentId || '';
    const bParentId = b.parentId || '';
    if (aParentId !== bParentId) {
      return aParentId.localeCompare(bParentId);
    }
    
    // Secondary sort: by title
    return a.title.localeCompare(b.title);
  });

  for (const page of sortedPages) {
    const resolution = resolveSingleSlug(page, workingSlugs, context);
    resolutions.set(page.id, resolution);
    workingSlugs.add(resolution.resolvedSlug);
  }

  logger.debug('Slug collision resolution completed', {
    totalPages: pages.length,
    collisions: Array.from(resolutions.values()).filter(r => r.collisionCount > 0).length
  });

  return resolutions;
}

/**
 * Resolve slug collision for a single page
 */
export function resolveSingleSlug(
  page: Page,
  existingSlugs: Set<string>,
  context: SlugCollisionContext = { existingSlugs }
): SlugResolution {
  const baseSlug = slugify(page.title);
  let resolvedSlug = baseSlug;
  let collisionCount = 0;

  // Check for collisions and resolve with numeric suffix
  while (existingSlugs.has(resolvedSlug)) {
    collisionCount++;
    resolvedSlug = `${baseSlug}-${collisionCount}`;
    
    // Safety check to prevent infinite loops
    if (collisionCount > 999) {
      logger.warn('Excessive slug collisions detected', {
        pageId: page.id,
        title: page.title,
        baseSlug,
        collisionCount
      });
      // Use page ID as fallback
      resolvedSlug = `${baseSlug}-${page.id.substring(0, 8)}`;
      break;
    }
  }

  const finalPath = buildFinalPath(resolvedSlug, context);

  const resolution: SlugResolution = {
    originalSlug: baseSlug,
    resolvedSlug,
    collisionCount,
    finalPath
  };

  if (collisionCount > 0) {
    logger.debug('Slug collision resolved', {
      pageId: page.id,
      title: page.title,
      originalSlug: baseSlug,
      resolvedSlug,
      collisionCount
    });
  }

  return resolution;
}

/**
 * Build the final file path from slug and context
 */
function buildFinalPath(
  slug: string,
  context: SlugCollisionContext
): string {
  const { parentPath = '', fileExtension = '.md' } = context;
  
  if (parentPath) {
    return `${parentPath}/${slug}${fileExtension}`;
  }
  
  return `${slug}${fileExtension}`;
}

/**
 * Pre-populate slug set from existing manifest entries
 */
export function extractExistingSlugs(
  pages: Page[],
  includeExtension = false
): Set<string> {
  const slugs = new Set<string>();
  
  for (const page of pages) {
    if (page.slug) {
      const slug = includeExtension ? page.slug : removeExtension(page.slug);
      slugs.add(slug);
    } else if (page.path) {
      // Extract slug from path
      const pathSlug = extractSlugFromPath(page.path, includeExtension);
      if (pathSlug) {
        slugs.add(pathSlug);
      }
    }
  }
  
  return slugs;
}

/**
 * Extract slug from file path
 */
function extractSlugFromPath(path: string, includeExtension: boolean): string | null {
  const parts = path.split('/');
  const filename = parts[parts.length - 1];
  
  if (!filename) {
    return null;
  }
  
  return includeExtension ? filename : removeExtension(filename);
}

/**
 * Remove file extension from filename
 */
function removeExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.substring(0, lastDot) : filename;
}

/**
 * Apply slug resolutions to pages, updating their slug and path properties
 */
export function applySlugResolutions(
  pages: Page[],
  resolutions: Map<string, SlugResolution>
): Page[] {
  return pages.map(page => {
    const resolution = resolutions.get(page.id);
    
    if (!resolution) {
      logger.warn('No slug resolution found for page', {
        pageId: page.id,
        title: page.title
      });
      return page;
    }
    
    return {
      ...page,
      slug: resolution.resolvedSlug,
      path: resolution.finalPath
    };
  });
}

/**
 * Validate slug resolution results
 */
export function validateSlugResolutions(
  resolutions: Map<string, SlugResolution>
): void {
  const resolvedSlugs = new Set<string>();
  const duplicates: string[] = [];
  
  for (const [pageId, resolution] of resolutions) {
    if (resolvedSlugs.has(resolution.resolvedSlug)) {
      duplicates.push(resolution.resolvedSlug);
      logger.error('Duplicate slug detected after resolution', {
        pageId,
        slug: resolution.resolvedSlug
      });
    } else {
      resolvedSlugs.add(resolution.resolvedSlug);
    }
  }
  
  if (duplicates.length > 0) {
    throw new Error(`Slug collision resolution failed: duplicate slugs found: ${duplicates.join(', ')}`);
  }
}

/**
 * Build hierarchical path structure for pages
 */
export function buildHierarchicalPaths(
  pages: Page[],
  resolutions: Map<string, SlugResolution>,
  context: { baseDir?: string; fileExtension?: string } = {}
): Map<string, string> {
  const { baseDir = '', fileExtension = '.md' } = context;
  const pathMap = new Map<string, string>();
  const pageMap = new Map(pages.map(page => [page.id, page]));
  
  // Helper to build path for a page and its ancestors
  function buildPagePath(pageId: string, visited = new Set<string>()): string {
    // Prevent infinite loops in case of circular references
    if (visited.has(pageId)) {
      logger.warn('Circular reference detected in page hierarchy', { pageId });
      return '';
    }
    
    const cached = pathMap.get(pageId);
    if (cached) {
      return cached;
    }
    
    const page = pageMap.get(pageId);
    if (!page) {
      return '';
    }
    
    const resolution = resolutions.get(pageId);
    if (!resolution) {
      return '';
    }
    
    visited.add(pageId);
    
    let path: string;
    if (page.parentId) {
      const parentPath = buildPagePath(page.parentId, visited);
      path = parentPath ? 
        `${parentPath}/${resolution.resolvedSlug}${fileExtension}` :
        `${resolution.resolvedSlug}${fileExtension}`;
    } else {
      // Root page
      path = `${resolution.resolvedSlug}${fileExtension}`;
    }
    
    if (baseDir) {
      path = `${baseDir}/${path}`;
    }
    
    pathMap.set(pageId, path);
    return path;
  }
  
  // Build paths for all pages
  for (const page of pages) {
    buildPagePath(page.id);
  }
  
  return pathMap;
}
