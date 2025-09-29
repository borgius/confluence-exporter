#!/usr/bin/env node

/**
 * Demo of enhanced transformer with user resolution
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { EnhancedMarkdownTransformer, type EnhancedTransformContext } from '../src/transform/enhancedMarkdownTransformer.js';
import { ConfluenceApi } from '../src/confluence/api.js';
import type { Page } from '../src/models/entities.js';

async function demoEnhancedTransformer() {
  const transformer = new EnhancedMarkdownTransformer();

  // Set up API (using environment variables if available)
  const baseUrl = process.env.CONFLUENCE_BASE_URL || 'https://confluence.fmr.com';
  const username = process.env.CONFLUENCE_USERNAME || 'a631851';
  const password = process.env.CONFLUENCE_PASSWORD || 'vV1234$#@!';

  const api = new ConfluenceApi({
    baseUrl,
    username,
    password,
    retry: {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      jitterRatio: 0.1,
    }
  });

  // Load the fixture with user links
  const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'html', 'page-05-104595769.json');
  const page = JSON.parse(readFileSync(fixturePath, 'utf-8')) as Page;

  const context: EnhancedTransformContext = {
    currentPageId: page.id,
    spaceKey: 'PR000299',
    baseUrl: 'https://confluence.fmr.com',
    api // Include API for user resolution
  };

  console.log('=== Enhanced Transformer with User Resolution ===');
  console.log('This will attempt to resolve actual usernames via Confluence API...\n');

  try {
    const result = await transformer.transformWithUserResolution(page, context);

    console.log('\n=== User References (Resolved) ===');
    console.log('Count:', result.users.length);
    result.users.forEach((user, index) => {
      console.log(`${index + 1}. UserKey: ${user.userKey}`);
      console.log(`   Username: ${user.username || 'UNRESOLVED'}`);
      console.log(`   Display Name: ${user.displayName || 'UNRESOLVED'}`);
      console.log(`   URL: ${user.resolvedUrl}`);
      console.log('');
    });

    console.log('\n=== Sample of Enhanced Content (first 800 chars) ===');
    console.log(result.content.substring(0, 800) + '...');

  } catch (error) {
    console.error('Error during enhanced transformation:', error);
    console.log('\nFalling back to basic transformation...');
    
    // Fallback to basic transformation without API
    const context2: EnhancedTransformContext = {
      currentPageId: page.id,
      spaceKey: 'PR000299',
      baseUrl: 'https://confluence.fmr.com'
      // No API - will use placeholder usernames
    };

    const result = await transformer.transformWithUserResolution(page, context2);
    console.log('\n=== Fallback Result (first 800 chars) ===');
    console.log(result.content.substring(0, 800) + '...');
  }
}

demoEnhancedTransformer().catch(console.error);
