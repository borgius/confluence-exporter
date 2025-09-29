import { MarkdownTransformer, type TransformContext, type UserReference } from './markdownTransformer.js';
import type { ConfluenceApi } from '../confluence/api.js';
import type { Page } from '../models/entities.js';

export interface EnhancedTransformContext extends TransformContext {
  api?: ConfluenceApi; // Optional API instance for user resolution
}

export class EnhancedMarkdownTransformer extends MarkdownTransformer {
  private userCache = new Map<string, string>(); // Cache userKey -> username mappings

  /**
   * Transform with optional user resolution via API
   */
  async transformWithUserResolution(page: Page, context: EnhancedTransformContext) {
    // First do the basic transformation
    const result = this.transform(page, context);

    // If API is available, resolve user information
    if (context.api && result.users.length > 0) {
      await this.resolveUserInformation(result.users, context.api, context.baseUrl);
      
      // Replace placeholder user links with actual usernames
      result.content = this.replaceUserPlaceholders(result.content, result.users);
    }

    return result;
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
        const placeholder = `[@user:${this.getUserIdFromKey(userRef.userKey)}](${this.extractPlaceholderUrl(userRef.userKey)})`;
        const resolved = `[@${userRef.displayName || userRef.username}](${userRef.resolvedUrl})`;
        result = result.replace(placeholder, resolved);
      }
    }

    return result;
  }

  /**
   * Extract placeholder URL for a given userKey (for replacement)
   */
  private extractPlaceholderUrl(userKey: string): string {
    const extractedId = this.getUserIdFromKey(userKey);
    return `https://confluence.fmr.com/display/~${extractedId}`;
  }

  /**
   * Extract user ID from userKey
   */
  private getUserIdFromKey(userKey: string): string {
    return userKey.slice(-8);
  }
}
