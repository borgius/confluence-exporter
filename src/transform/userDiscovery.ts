/**
 * T098c: User mention discovery and resolution
 * Finds user pages to queue from user mentions and references
 * Supports FR-033 for global download queue functionality
 */

import type { QueueItem } from '../models/queueEntities.js';
import { logger } from '../util/logger.js';

export interface UserDiscoveryResult {
  queueItems: QueueItem[];
  usersFound: number;
  userMentions: number;
  userProfiles: number;
}

export interface UserDiscoveryConfig {
  enableUserMentionDiscovery: boolean;
  enableUserProfileDiscovery: boolean;
  enableUserSpaceDiscovery: boolean;
  maxUsersPerPage: number;
  userPagePattern: string;
}

export interface UserReference {
  username: string;
  userKey?: string;
  userId?: string;
  displayName?: string;
  referenceType: 'mention' | 'profile' | 'space';
}

export class UserDiscovery {
  private readonly config: UserDiscoveryConfig;
  private readonly baseUrl: string;

  constructor(baseUrl: string, config: Partial<UserDiscoveryConfig> = {}) {
    this.baseUrl = baseUrl;
    this.config = {
      enableUserMentionDiscovery: true,
      enableUserProfileDiscovery: true,
      enableUserSpaceDiscovery: false, // Usually not needed for content discovery
      maxUsersPerPage: 20,
      userPagePattern: '/display/~{username}',
      ...config,
    };
  }

  /**
   * Discover user references from content and create queue items for user pages
   */
  discoverFromContent(content: string, sourcePageId: string): UserDiscoveryResult {
    const queueItems: QueueItem[] = [];
    let userMentions = 0;
    let userProfiles = 0;

    try {
      // Discover user references from content
      const userReferences = this.extractUserReferences(content);
      
      for (const userRef of userReferences.slice(0, this.config.maxUsersPerPage)) {
        const queueItem = this.createQueueItemFromUser(userRef, sourcePageId);
        if (queueItem) {
          queueItems.push(queueItem);
          
          if (userRef.referenceType === 'mention') {
            userMentions++;
          } else if (userRef.referenceType === 'profile') {
            userProfiles++;
          }
        }
      }

      logger.debug(`User discovery completed for page ${sourcePageId}: ${queueItems.length} user queue items created`);

      return {
        queueItems,
        usersFound: userReferences.length,
        userMentions,
        userProfiles,
      };
    } catch (error) {
      logger.error(`User discovery failed for page ${sourcePageId}:`, error);
      return {
        queueItems: [],
        usersFound: 0,
        userMentions: 0,
        userProfiles: 0,
      };
    }
  }

  /**
   * Extract user references from various formats in content
   */
  extractUserReferences(content: string): UserReference[] {
    const users: UserReference[] = [];

    // Extract from @ mentions
    if (this.config.enableUserMentionDiscovery) {
      const mentions = this.extractUserMentions(content);
      users.push(...mentions);
    }

    // Extract from user profile links
    if (this.config.enableUserProfileDiscovery) {
      const profiles = this.extractUserProfileLinks(content);
      users.push(...profiles);
    }

    // Extract from Confluence user macros
    const macroUsers = this.extractUserMacros(content);
    users.push(...macroUsers);

    // Deduplicate users by username
    const uniqueUsers = this.deduplicateUsers(users);
    
    return uniqueUsers;
  }

  private extractUserMentions(content: string): UserReference[] {
    const users: UserReference[] = [];
    
    // Match @ mentions: @username or @"Display Name"
    const mentionPatterns = [
      /@(\w+)/g,                    // @username
      /@"([^"]+)"/g,                // @"Display Name"
      /@\[([^\]]+)\]/g,             // @[username]
    ];

    for (const pattern of mentionPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const username = match[1];
        if (username && this.isValidUsername(username)) {
          users.push({
            username,
            referenceType: 'mention',
          });
        }
      }
    }

    return users;
  }

  private extractUserProfileLinks(content: string): UserReference[] {
    const users: UserReference[] = [];
    
    // Match user profile URLs
    const userProfilePatterns = [
      new RegExp(`${this.escapeRegExp(this.baseUrl)}/display/~([^\\s/)]+)`, 'g'),
      new RegExp(`${this.escapeRegExp(this.baseUrl)}/people/([^\\s/)]+)`, 'g'),
      /\/display\/~(\w+)/g,                    // Relative user profile links
      /\/people\/(\w+)/g,                      // Relative people links
    ];

    for (const pattern of userProfilePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const username = match[1];
        if (username && this.isValidUsername(username)) {
          users.push({
            username,
            referenceType: 'profile',
          });
        }
      }
    }

    return users;
  }

  private extractUserMacros(content: string): UserReference[] {
    const users: UserReference[] = [];
    
    // Match user-related macros
    const userMacroPatterns = [
      /<ac:link><ri:user ri:username="([^"]+)"[^>]*\/><\/ac:link>/g,
      /<ac:structured-macro ac:name="user-mention"[^>]*>[\s\S]*?<ac:parameter ac:name="username">([^<]+)<\/ac:parameter>[\s\S]*?<\/ac:structured-macro>/g,
      /<ac:structured-macro ac:name="userinfo"[^>]*>[\s\S]*?<ac:parameter ac:name="user">([^<]+)<\/ac:parameter>[\s\S]*?<\/ac:structured-macro>/g,
    ];

    for (const pattern of userMacroPatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const username = match[1];
        if (username && this.isValidUsername(username)) {
          users.push({
            username,
            referenceType: 'mention',
          });
        }
      }
    }

    return users;
  }

  private deduplicateUsers(users: UserReference[]): UserReference[] {
    const seen = new Set<string>();
    const unique: UserReference[] = [];

    for (const user of users) {
      const key = user.username.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(user);
      }
    }

    return unique;
  }

  private createQueueItemFromUser(userRef: UserReference, sourcePageId: string): QueueItem | null {
    if (!this.shouldProcessUser(userRef)) {
      return null;
    }

    // Create a special queue item format for user discovery
    const userPageId = `user:${userRef.username}`;

    return {
      pageId: userPageId,
      sourceType: 'user',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      parentPageId: sourcePageId,
      status: 'pending',
    };
  }

  private shouldProcessUser(userRef: UserReference): boolean {
    // Skip if user discovery is disabled for this type
    if (userRef.referenceType === 'mention' && !this.config.enableUserMentionDiscovery) {
      return false;
    }
    
    if (userRef.referenceType === 'profile' && !this.config.enableUserProfileDiscovery) {
      return false;
    }

    // Validate username format
    return this.isValidUsername(userRef.username);
  }

  private isValidUsername(username: string): boolean {
    if (!username || username.length === 0) {
      return false;
    }

    // Skip system users and common non-user strings
    const systemUsers = ['system', 'admin', 'anonymous', 'confluence', 'jira'];
    if (systemUsers.includes(username.toLowerCase())) {
      return false;
    }

    // Check for reasonable username format (alphanumeric + common separators)
    const usernamePattern = /^[a-zA-Z0-9._-]+$/;
    if (!usernamePattern.test(username)) {
      return false;
    }

    // Skip very short or very long usernames
    if (username.length < 2 || username.length > 50) {
      return false;
    }

    return true;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Convert user queue item to actual user page URL for discovery
   */
  getUserPageUrl(username: string): string {
    const userPath = this.config.userPagePattern.replace('{username}', username);
    return `${this.baseUrl}${userPath}`;
  }

  /**
   * Extract username from user queue item pageId
   */
  extractUsernameFromPageId(pageId: string): string | null {
    if (pageId.startsWith('user:')) {
      return pageId.substring(5);
    }
    return null;
  }
}

export const createUserDiscovery = (
  baseUrl: string,
  config?: Partial<UserDiscoveryConfig>
): UserDiscovery => {
  return new UserDiscovery(baseUrl, config);
};
