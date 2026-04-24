import { describe, it, expect } from 'vitest';

import { formatMarkdownLink } from './llms-markdown';

describe('formatMarkdownLink', () => {
  it('emits a plain CommonMark link for ordinary text and URL', () => {
    expect(
      formatMarkdownLink(
        'Building Your First AI-Assisted Workflow',
        'https://how-do-i.ai/blog/sample-post/',
      ),
    ).toBe(
      '[Building Your First AI-Assisted Workflow](https://how-do-i.ai/blog/sample-post/)',
    );
  });

  it('escapes `]` in link text so it does not terminate the link early', () => {
    // `[` is intentionally NOT escaped (see test at bottom); only the `]`
    // closing bracket needs prefixing to keep CommonMark from ending the
    // link text prematurely.
    expect(
      formatMarkdownLink(
        'Reviewing [Claude] — A Hands-On Take',
        'https://example.com/post/',
      ),
    ).toBe(
      '[Reviewing [Claude\\] — A Hands-On Take](https://example.com/post/)',
    );
  });

  it('escapes `\\` in link text so it does not escape the following char', () => {
    expect(formatMarkdownLink('Using \\n vs \\r', 'https://example.com/')).toBe(
      '[Using \\\\n vs \\\\r](https://example.com/)',
    );
  });

  it('escapes both `]` and `\\` in a single pass without double-escape', () => {
    // Input contains one `\` and one `]`; each should be prefixed by ONE `\`,
    // not cascade into further escaping.
    expect(formatMarkdownLink('a\\b]c', 'https://example.com/')).toBe(
      '[a\\\\b\\]c](https://example.com/)',
    );
  });

  it('URL-encodes spaces in the target while preserving `/` separators', () => {
    expect(
      formatMarkdownLink('Post', 'https://how-do-i.ai/blog/my post/'),
    ).toBe('[Post](https://how-do-i.ai/blog/my%20post/)');
  });

  it('URL-encodes non-ASCII chars in the target', () => {
    expect(formatMarkdownLink('Post', 'https://how-do-i.ai/blog/café/')).toBe(
      '[Post](https://how-do-i.ai/blog/caf%C3%A9/)',
    );
  });

  it('preserves `/` path separators for nested post ids', () => {
    expect(
      formatMarkdownLink('Post', 'https://how-do-i.ai/blog/nested/sub/post/'),
    ).toBe('[Post](https://how-do-i.ai/blog/nested/sub/post/)');
  });

  it('leaves opening `[` in link text unescaped (CommonMark only needs `]` escaped to close early)', () => {
    // Defensive: asymmetric escape is intentional — `[` inside link text is
    // tolerated by CommonMark; `]` is the terminator. Escaping `[` would add
    // noise without improving parser safety.
    expect(formatMarkdownLink('a[b', 'https://example.com/')).toBe(
      '[a[b](https://example.com/)',
    );
  });
});
