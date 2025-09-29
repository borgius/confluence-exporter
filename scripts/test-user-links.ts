#!/usr/bin/env node

/**
 * Test the user link transformation with the actual fixture
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { MarkdownTransformer, type TransformContext } from '../src/transform/markdownTransformer.js';
import type { Page } from '../src/models/entities.js';

const transformer = new MarkdownTransformer();

// Load the fixture with user links (page 5)
const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'html', 'page-05-104595769.json');
const page = JSON.parse(readFileSync(fixturePath, 'utf-8')) as Page;

const context: TransformContext = {
  currentPageId: page.id,
  spaceKey: 'PR000299',
  baseUrl: 'https://confluence.fmr.com'
};

console.log('=== Testing User Link Transformation ===');
const result = transformer.transform(page, context);

console.log('\n=== User References Found ===');
console.log('Count:', result.users.length);
result.users.forEach((user, index) => {
  console.log(`${index + 1}. UserKey: ${user.userKey}`);
  console.log(`   URL: ${user.resolvedUrl}`);
});

console.log('\n=== Sample of Transformed Content (first 1000 chars) ===');
console.log(result.content.substring(0, 1000) + '...');

// Check if there are any remaining ac:link tags
const remainingAcLinks = (result.content.match(/<ac:link>/g) || []).length;
console.log(`\n=== Remaining <ac:link> tags: ${remainingAcLinks} ===`);
