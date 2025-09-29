#!/usr/bin/env node

/**
 * Script to fetch the first 10 HTML pages from PR000299 space for testing
 */

import { ConfluenceApi } from '../src/confluence/api.js';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function fetchTestFixtures() {
  // Use environment variables if available, otherwise use hardcoded values for PR000299 space
  const baseUrl = process.env.CONFLUENCE_BASE_URL;
  const username = process.env.CONFLUENCE_USERNAME;
  const password = process.env.CONFLUENCE_PASSWORD;
  
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

  const spaceKey = 'PR000299';
  
  try {
    console.log(`Fetching first 10 pages from space ${spaceKey}...`);
    
    // Get list of pages (first 10)
    const response = await api.listPages(spaceKey, {
      expand: ['version', 'ancestors'],
      limit: 10
    });
    
    const fixturesDir = join(process.cwd(), 'tests', 'fixtures', 'html');
    mkdirSync(fixturesDir, { recursive: true });
    
    console.log(`Found ${response.results.length} pages, fetching content...`);
    
    for (let i = 0; i < response.results.length; i++) {
      const page = response.results[i];
      console.log(`${i + 1}/10: Fetching page "${page.title}" (ID: ${page.id})`);
      
      try {
        // Get page with full HTML content
        const fullPage = await api.getPageWithBody(page.id, {
          expand: ['body.storage', 'version', 'ancestors']
        });
        
        // Create fixture object
        const fixture = {
          id: fullPage.id,
          title: fullPage.title,
          type: fullPage.type,
          version: fullPage.version,
          parentId: fullPage.parentId,
          ancestors: fullPage.ancestors,
          bodyStorage: fullPage.bodyStorage
        };
        
        // Save as JSON fixture
        const filename = `page-${String(i + 1).padStart(2, '0')}-${page.id}.json`;
        const filepath = join(fixturesDir, filename);
        writeFileSync(filepath, JSON.stringify(fixture, null, 2));
        
        console.log(`  ✓ Saved ${filename}`);
        
        // Small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`  ✗ Failed to fetch page ${page.id}:`, error.message);
      }
    }
    
    console.log('\n✅ Test fixtures created successfully!');
    console.log(`📁 Fixtures saved to: ${fixturesDir}`);
    
  } catch (error) {
    console.error('❌ Failed to fetch test fixtures:', error.message);
    process.exit(1);
  }
}

// Run the script
fetchTestFixtures().catch(console.error);
