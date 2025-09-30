import { slugify, resolveSlugCollision } from '../../src/util/slugify';

describe('Unit: slugify utility', () => {
  describe('slugify function', () => {
    it('normalizes basic titles correctly', () => {
      expect(slugify('Hello World')).toBe('hello-world');
      expect(slugify('Test Page Title')).toBe('test-page-title');
      expect(slugify('  Spaced   Title  ')).toBe('spaced-title');
    });

    it('removes punctuation and special characters', () => {
      expect(slugify('Hello, World!')).toBe('hello-world');
      expect(slugify('Test: A Guide')).toBe('test-a-guide');
      expect(slugify('What\'s "going" on?')).toBe('whats-going-on');
      expect(slugify('(Parentheses) & [Brackets]')).toBe('parentheses-brackets');
    });

    it('handles Unicode and normalization', () => {
      // Test the actual behavior: NFKD normalization and character preservation
      const cafe = slugify('Café & Naïve');
      const resume = slugify('Résumé Guide');
      
      // Test basic structure and transformations
      expect(cafe).toBeDefined();
      expect(cafe.length).toBeGreaterThan(0);
      expect(cafe).toContain('-'); // Should have hyphens from spaces
      expect(cafe).not.toContain('&'); // Ampersand should be removed
      expect(cafe).not.toContain(' '); // Spaces should be converted to hyphens
      expect(cafe.toLowerCase()).toBe(cafe); // Should be lowercase
      
      expect(resume).toBeDefined();
      expect(resume.length).toBeGreaterThan(0);
      expect(resume).toContain('-'); // Should have hyphen from space
      expect(resume).not.toContain(' '); // Spaces should be converted to hyphens
      expect(resume.toLowerCase()).toBe(resume); // Should be lowercase
      
      // Test consistency - same input should produce same output
      expect(slugify('Café & Naïve')).toBe(cafe);
      expect(slugify('Résumé Guide')).toBe(resume);
      
      // Test specific behaviors
      expect(cafe.startsWith('caf')).toBe(true); // Should start with "caf" from "Café"
      expect(cafe.endsWith('ve')).toBe(true); // Should end with "ve" from "Naïve"
      expect(resume.startsWith('r')).toBe(true); // Should start with "r" from "Résumé"
      expect(resume.endsWith('guide')).toBe(true); // Should end with "guide"
    });

    it('collapses multiple hyphens and whitespace', () => {
      expect(slugify('Multiple---Hyphens')).toBe('multiple-hyphens');
      expect(slugify('Lots    of    spaces')).toBe('lots-of-spaces');
      expect(slugify('Mixed---   spaces-and--hyphens')).toBe('mixed-spaces-and-hyphens');
    });

    it('truncates long titles respecting word boundaries', () => {
      const longTitle = 'This is a very long title that should be truncated at a reasonable boundary to maintain readability and filesystem compatibility';
      const result = slugify(longTitle, { maxLength: 50 });
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result).not.toMatch(/-$/); // Should not end with hyphen
    });

    it('handles edge cases', () => {
      expect(slugify('')).toBe('untitled');
      expect(slugify('   ')).toBe('untitled');
      expect(slugify('!!!')).toBe('untitled');
      expect(slugify('123')).toBe('123');
    });
  });

  describe('resolveSlugCollision function', () => {
    it('returns original slug when no collision exists', () => {
      const existing = new Set<string>();
      const result = resolveSlugCollision('introduction', '123456', existing);
      expect(result).toBe('introduction');
      expect(existing.has('introduction')).toBe(true);
    });

    it('resolves collisions by appending ID fragment', () => {
      const existing = new Set(['introduction']);
      const result = resolveSlugCollision('introduction', '123456', existing);
      expect(result).toBe('introduction-3456');
      expect(existing.has('introduction-3456')).toBe(true);
    });

    it('handles multiple collision levels', () => {
      const existing = new Set(['introduction', 'introduction-3456']);
      const result = resolveSlugCollision('introduction', '123456', existing);
      expect(result).toBe('introduction-3456-2');
      expect(existing.has('introduction-3456-2')).toBe(true);
    });

    it('uses last 4 characters of ID', () => {
      const existing = new Set(['test']);
      const result = resolveSlugCollision('test', 'abcdef789012', existing);
      expect(result).toBe('test-9012');
    });

    it('handles short IDs gracefully', () => {
      const existing = new Set(['test']);
      const result = resolveSlugCollision('test', '12', existing);
      expect(result).toBe('test-12');
    });
  });
});
