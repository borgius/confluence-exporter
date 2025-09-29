#!/usr/bin/env node

/**
 * Quick demo script to show transformer output
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { MarkdownTransformer, type TransformContext } from '../src/transform/markdownTransformer.js';
import type { Page } from '../src/models/entities.js';

const transformer = new MarkdownTransformer();

// Load the first fixture with substantial content
const fixturePath = join(process.cwd(), 'tests', 'fixtures', 'html', 'page-02-95956405.json');
const page = JSON.parse(readFileSync(fixturePath, 'utf-8')) as Page;

const context: TransformContext = {
  currentPageId: page.id,
  spaceKey: 'PR000299',
  baseUrl: 'https://confluence.fmr.com'
};

console.log('=== Original HTML (first 500 chars) ===');
console.log(page.bodyStorage.substring(0, 500) + '...');

console.log('\n=== Transformed Markdown ===');
const result = transformer.transform(page, context);
console.log(result.content);

console.log('\n=== Front Matter ===');
console.log(JSON.stringify(result.frontMatter, null, 2));

console.log('\n=== Links Found ===');
console.log(result.links);

console.log('\n=== Attachments Found ===');
console.log(result.attachments);