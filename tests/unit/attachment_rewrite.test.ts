import { AttachmentRewriter, type AttachmentMap } from '../../src/transform/attachmentRewriter';
import type { AttachmentReference } from '../../src/transform/markdownTransformer';

describe('Unit: attachment path rewrite', () => {
  describe('AttachmentRewriter', () => {
    const attachmentMap: AttachmentMap = {
      'att123': 'attachments/image1.png',
      'att456': 'attachments/document.pdf',
      'att789': 'attachments/diagrams/flowchart.svg'
    };

    const rewriter = new AttachmentRewriter(attachmentMap);

    it('rewrites attachment references to local paths', () => {
      const content = '![Test Image](https://confluence.test.com/download/att123/image1.png)';
      const attachments: AttachmentReference[] = [
        {
          originalSrc: 'https://confluence.test.com/download/att123/image1.png',
          attachmentId: 'att123',
          fileName: 'image1.png'
        }
      ];

      const result = rewriter.rewriteAttachments(content, attachments, 'pages/current-page.md');
      
      // Should rewrite to relative path from pages/ to attachments/
      expect(result.content).toBe('![Test Image](../attachments/image1.png)');
      expect(result.unresolvedAttachments).toHaveLength(0);
    });

    it('handles multiple attachment types', () => {
      const content = 'See ![image](https://confluence.test.com/download/att123/image1.png) and [document](https://confluence.test.com/download/att456/document.pdf)';
      const attachments: AttachmentReference[] = [
        {
          originalSrc: 'https://confluence.test.com/download/att123/image1.png',
          attachmentId: 'att123',
          fileName: 'image1.png'
        },
        {
          originalSrc: 'https://confluence.test.com/download/att456/document.pdf',
          attachmentId: 'att456',
          fileName: 'document.pdf'
        }
      ];

      const result = rewriter.rewriteAttachments(content, attachments, 'current-page.md');
      
      expect(result.content).toBe('See ![image](attachments/image1.png) and [document](attachments/document.pdf)');
      expect(result.unresolvedAttachments).toHaveLength(0);
    });

    it('handles unresolved attachments', () => {
      const content = '![Missing](https://confluence.test.com/download/att999/missing.png)';
      const attachments: AttachmentReference[] = [
        {
          originalSrc: 'https://confluence.test.com/download/att999/missing.png',
          attachmentId: 'att999',
          fileName: 'missing.png'
        }
      ];

      const result = rewriter.rewriteAttachments(content, attachments, 'current-page.md');
      
      // Should remain unchanged for unresolved attachments
      expect(result.content).toBe(content);
      expect(result.unresolvedAttachments).toHaveLength(1);
      expect(result.unresolvedAttachments[0]).toMatchObject({
        attachmentId: 'att999',
        fileName: 'missing.png'
      });
    });

    it('calculates relative paths for nested directories', () => {
      const content = '![Diagram](https://confluence.test.com/download/att789/flowchart.svg)';
      const attachments: AttachmentReference[] = [
        {
          originalSrc: 'https://confluence.test.com/download/att789/flowchart.svg',
          attachmentId: 'att789',
          fileName: 'flowchart.svg'
        }
      ];

      const result = rewriter.rewriteAttachments(content, attachments, 'guides/advanced/configuration.md');
      
      // From guides/advanced/ to attachments/diagrams/
      expect(result.content).toBe('![Diagram](../../attachments/diagrams/flowchart.svg)');
      expect(result.unresolvedAttachments).toHaveLength(0);
    });

    it('handles attachments without ID', () => {
      const content = '![No ID](https://confluence.test.com/download/unknown.png)';
      const attachments: AttachmentReference[] = [
        {
          originalSrc: 'https://confluence.test.com/download/unknown.png',
          fileName: 'unknown.png'
        }
      ];

      const result = rewriter.rewriteAttachments(content, attachments, 'current-page.md');
      
      // Should remain unchanged when no attachment ID
      expect(result.content).toBe(content);
      expect(result.unresolvedAttachments).toHaveLength(1);
    });

    it('handles mixed resolved and unresolved attachments', () => {
      const content = 'Good: ![image1](https://confluence.test.com/download/att123/image1.png) Bad: ![image2](https://confluence.test.com/download/att999/missing.png)';
      const attachments: AttachmentReference[] = [
        {
          originalSrc: 'https://confluence.test.com/download/att123/image1.png',
          attachmentId: 'att123',
          fileName: 'image1.png'
        },
        {
          originalSrc: 'https://confluence.test.com/download/att999/missing.png',
          attachmentId: 'att999',
          fileName: 'missing.png'
        }
      ];

      const result = rewriter.rewriteAttachments(content, attachments, 'current-page.md');
      
      expect(result.content).toBe('Good: ![image1](attachments/image1.png) Bad: ![image2](https://confluence.test.com/download/att999/missing.png)');
      expect(result.unresolvedAttachments).toHaveLength(1);
      expect(result.unresolvedAttachments[0].attachmentId).toBe('att999');
    });

    it('preserves attachment text and alt attributes', () => {
      const content = '![Important Diagram](https://confluence.test.com/download/att123/image1.png "Hover text")';
      const attachments: AttachmentReference[] = [
        {
          originalSrc: 'https://confluence.test.com/download/att123/image1.png',
          attachmentId: 'att123',
          fileName: 'image1.png'
        }
      ];

      const result = rewriter.rewriteAttachments(content, attachments, 'current-page.md');
      
      expect(result.content).toBe('![Important Diagram](attachments/image1.png "Hover text")');
    });
  });
});
