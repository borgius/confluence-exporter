import { contentHash } from '../../src/util/hash';
import { createHash } from 'crypto';

describe('Unit: hash utility', () => {
  describe('contentHash function', () => {
    it('produces stable truncated hashes for strings', () => {
      const input1 = 'Hello, World!';
      const input2 = 'Different content';
      
      const hash1 = contentHash(input1);
      const hash2 = contentHash(input2);
      
      // Should be consistent
      expect(contentHash(input1)).toBe(hash1);
      expect(contentHash(input2)).toBe(hash2);
      
      // Should be different
      expect(hash1).not.toBe(hash2);
      
      // Should be 12 characters hex
      expect(hash1).toMatch(/^[a-f0-9]{12}$/);
      expect(hash2).toMatch(/^[a-f0-9]{12}$/);
    });

    it('produces stable truncated hashes for buffers', () => {
      const buffer1 = Buffer.from('Hello, World!', 'utf8');
      const buffer2 = Buffer.from('Different content', 'utf8');
      
      const hash1 = contentHash(buffer1);
      const hash2 = contentHash(buffer2);
      
      // Should be consistent
      expect(contentHash(buffer1)).toBe(hash1);
      expect(contentHash(buffer2)).toBe(hash2);
      
      // Should be different
      expect(hash1).not.toBe(hash2);
      
      // Should be 12 characters hex
      expect(hash1).toMatch(/^[a-f0-9]{12}$/);
      expect(hash2).toMatch(/^[a-f0-9]{12}$/);
    });

    it('produces identical hashes for string and equivalent buffer', () => {
      const content = 'Test content for hashing';
      const stringHash = contentHash(content);
      const bufferHash = contentHash(Buffer.from(content, 'utf8'));
      
      expect(stringHash).toBe(bufferHash);
    });

    it('truncates SHA-256 to 12 hex characters', () => {
      const input = 'Test input';
      const fullHash = createHash('sha256').update(input).digest('hex');
      const truncatedHash = contentHash(input);
      
      expect(truncatedHash).toBe(fullHash.slice(0, 12));
      expect(truncatedHash.length).toBe(12);
    });

    it('handles empty input', () => {
      const emptyStringHash = contentHash('');
      const emptyBufferHash = contentHash(Buffer.alloc(0));
      
      expect(emptyStringHash).toMatch(/^[a-f0-9]{12}$/);
      expect(emptyBufferHash).toMatch(/^[a-f0-9]{12}$/);
      expect(emptyStringHash).toBe(emptyBufferHash);
    });

    it('handles large input efficiently', () => {
      const largeInput = 'A'.repeat(100000);
      const hash = contentHash(largeInput);
      
      expect(hash).toMatch(/^[a-f0-9]{12}$/);
      expect(hash.length).toBe(12);
    });

    it('handles Unicode content correctly', () => {
      const unicodeContent = '🌟 Unicode test: café, naïve, résumé 测试';
      const hash = contentHash(unicodeContent);
      
      expect(hash).toMatch(/^[a-f0-9]{12}$/);
      expect(contentHash(unicodeContent)).toBe(hash); // Consistent
    });
  });
});
