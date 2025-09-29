import { MarkdownTransformer, type TransformContext, type UserReference, type MacroExpansionRequest } from './markdownTransformer.js';
import type { ConfluenceApi } from '../confluence/api.js';
import type { Page } from '../models/entities.js';

export interface EnhancedTransformContext extends TransformContext {
  api?: ConfluenceApi; // Optional API instance for user resolution and macro expansion
}

export class EnhancedMarkdownTransformer extends MarkdownTransformer {
  private userCache = new Map<string, string>(); // Cache userKey -> username mappings

  /**
   * Transform with optional user resolution and macro expansion via API
   */
  async transformWithEnhancements(page: Page, context: EnhancedTransformContext) {
    // First do the basic transformation
    const result = this.transform(page, context);

    // Track discovered page IDs
    const discoveredPageIds = new Set<string>();

    // If API is available, resolve user information
    if (context.api && result.users.length > 0) {
      await this.resolveUserInformation(result.users, context.api, context.baseUrl);
      
      // Replace placeholder user links with actual usernames
      result.content = this.replaceUserPlaceholders(result.content, result.users);
    }

    // If API is available, expand macros and collect discovered pages
    if (context.api && result.macroExpansions.length > 0) {
      const expansionResult = await this.expandMacros(result.content, result.macroExpansions, context.api, context);
      result.content = expansionResult.content;
      expansionResult.discoveredPageIds.forEach(id => discoveredPageIds.add(id));
    }

    // Update result with discovered page IDs
    result.discoveredPageIds = Array.from(discoveredPageIds);

    return result;
  }

  /**
   * Legacy method for backward compatibility
   */
  async transformWithUserResolution(page: Page, context: EnhancedTransformContext) {
    return this.transformWithEnhancements(page, context);
  }

  /**
   * Expand macros using API calls
   */
  private async expandMacros(
    content: string, 
    macroExpansions: MacroExpansionRequest[], 
    api: ConfluenceApi,
    context: EnhancedTransformContext
  ): Promise<{ content: string; discoveredPageIds: string[] }> {
    let result = content;
    const discoveredPageIds: string[] = [];

    for (const expansion of macroExpansions) {
      try {
        let replacementResult: { content: string; discoveredPageIds?: string[] };

        switch (expansion.type) {
          case 'list-children':
            replacementResult = await this.expandListChildren(expansion, api, context);
            break;
          case 'contentbylabel':
            replacementResult = await this.expandContentByLabel(expansion, api, context);
            break;
          case 'excerpt-include':
            replacementResult = await this.expandExcerptInclude(expansion, api, context);
            break;
          default:
            replacementResult = { content: `<!-- Unsupported macro expansion: ${expansion.type} -->` };
        }

        result = result.replace(expansion.placeholder, replacementResult.content);
        
        // Collect discovered page IDs
        if (replacementResult.discoveredPageIds) {
          discoveredPageIds.push(...replacementResult.discoveredPageIds);
        }
      } catch (error) {
        console.warn(`Failed to expand macro ${expansion.type}:`, error);
        const fallback = `<!-- Failed to expand ${expansion.type} macro -->`;
        result = result.replace(expansion.placeholder, fallback);
      }
    }

    return { content: result, discoveredPageIds };
  }

  /**
   * Expand list-children macro by fetching child pages
   */
  private async expandListChildren(
    expansion: MacroExpansionRequest, 
    api: ConfluenceApi,
    _context: EnhancedTransformContext
  ): Promise<{ content: string; discoveredPageIds: string[] }> {
    console.log(`Expanding list-children macro for page ${expansion.pageId}`);
    
    const childPages = await api.getChildPages(expansion.pageId, {
      expand: ['version'],
      limit: 50 // Reasonable limit for child pages
    });

    if (childPages.results.length === 0) {
      return { content: '<!-- No child pages found -->', discoveredPageIds: [] };
    }

    // Generate markdown list of child pages
    const listItems = childPages.results.map(child => {
      // Create relative link - this will be resolved later by link rewriter
      const relativePath = `${this.slugify(child.title)}.md`;
      return `- [${child.title}](${relativePath})`;
    });

    // Extract page IDs that need to be downloaded
    const discoveredPageIds = childPages.results.map(child => child.id);

    return { 
      content: listItems.join('\n') + '\n',
      discoveredPageIds 
    };
  }

    /**
   * Expand content-by-label macro (placeholder implementation)
   */
  private async expandContentByLabel(
    expansion: MacroExpansionRequest, 
    _api: ConfluenceApi,
    _context: EnhancedTransformContext
  ): Promise<{ content: string; discoveredPageIds: string[] }> {
    console.log(`Expanding content-by-label macro:`, expansion.parameters);
    
    // For now, just return a placeholder comment
    // TODO: Implement actual label-based content search
    return { 
      content: `<!-- content-by-label: ${JSON.stringify(expansion.parameters)} -->`,
      discoveredPageIds: []
    };
  }

  /**
   * Expand excerpt-include macro (placeholder for now)
   */
  private async expandExcerptInclude(
    expansion: MacroExpansionRequest,
    _api: ConfluenceApi,
    _context: EnhancedTransformContext
  ): Promise<{ content: string; discoveredPageIds: string[] }> {
    const pageTitle = expansion.parameters.pageTitle || 'unknown page';
    // TODO: Implement excerpt inclusion when needed
    return { 
      content: `<!-- Excerpt from: ${pageTitle} (expansion not yet implemented) -->`,
      discoveredPageIds: []
    };
  }

  /**
   * Simple slugify function for generating relative paths
   */
  private slugify(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Resolve user information via API
   */
  private async resolveUserInformation(users: UserReference[], api: ConfluenceApi, baseUrl: string): Promise<void> {
    for (const userRef of users) {
      // Check cache first
      if (this.userCache.has(userRef.userKey)) {
        const username = this.userCache.get(userRef.userKey);
        if (username) {
          userRef.username = username;
          userRef.resolvedUrl = `${baseUrl}/display/~${username}`;
          continue;
        }
      }

      try {
        // Call API to get user information
        const user = await api.getUser(userRef.userKey);
        userRef.username = user.username;
        userRef.displayName = user.displayName;
        userRef.resolvedUrl = `${baseUrl}/display/~${user.username}`;
        
        // Cache the result
        this.userCache.set(userRef.userKey, user.username);
        
        console.log(`Resolved user: ${userRef.userKey} -> ${user.username} (${user.displayName})`);
      } catch (error) {
        console.warn(`Failed to resolve user ${userRef.userKey}:`, error);
        // Keep the placeholder values
      }
    }
  }

  /**
   * Replace placeholder user links with resolved usernames
   */
  private replaceUserPlaceholders(content: string, users: UserReference[]): string {
    let result = content;

    for (const userRef of users) {
      if (userRef.username) {
        // The placeholder was created with the original resolvedUrl (using extracted ID)
        const extractedId = userRef.userKey.slice(-8);
        const placeholderUrl = userRef.resolvedUrl; // This was set in basic transformer with extractedId
        const placeholder = `[@user:${extractedId}](${placeholderUrl})`;
        
        // Create resolved URL with actual username
        const resolvedUrl = `${userRef.resolvedUrl.split('/display/~')[0]}/display/~${userRef.username}`;
        const resolved = `[@${userRef.displayName || userRef.username}](${resolvedUrl})`;
        
        result = result.replace(placeholder, resolved);
      }
    }

    return result;
  }
}
