# User Link Resolution Feature

## Overview

This feature automatically resolves Confluence user links (user mentions) to their display names when exporting to Markdown.

## How It Works

### 1. Detection

The transformer detects user links in two formats:

**By Username:**
```html
<ac:link><ri:user ri:username="john.doe"/></ac:link>
```

**By User Key:**
```html
<ac:link><ri:user ri:userkey="ff8080817b0a1234"/></ac:link>
```

### 2. Resolution

When a user link is found:
1. Check the cache for previously fetched user info
2. If not cached, call the Confluence API:
   - `/rest/api/user?username=...` for username lookup
   - `/rest/api/user?key=...` for userkey lookup
3. Cache the result for future use
4. Replace the link with the user's display name

### 3. Output

The user link is replaced with a simple mention:

```markdown
@John Doe
```

### 4. Fallback Behavior

If the API call fails or the user is not found:
- For username: Uses `@username`
- For userkey: Uses `@user-{last8chars}`

## Implementation Details

### Files Changed

1. **src/types.ts** - Added `User` interface
2. **src/api.ts** - Added user lookup methods with caching
3. **src/transformer.ts** - Added user link transformation
4. **src/runner.ts** - Updated to pass API to transformer

### Key Features

- ✅ **Simple**: Minimal code, easy to understand
- ✅ **Efficient**: Caches user lookups to reduce API calls
- ✅ **Robust**: Graceful fallback for unknown users
- ✅ **Non-blocking**: Logs warnings instead of failing

### API Methods

```typescript
// Get user by username (e.g., "john.doe")
async getUserByUsername(username: string): Promise<User | null>

// Get user by userkey (e.g., "ff8080817b0a1234")
async getUserByKey(userKey: string): Promise<User | null>
```

Both methods:
- Return cached result if available
- Call Confluence REST API if needed
- Cache successful results
- Return `null` on error (with warning log)

### Caching Strategy

Users are cached in a `Map<string, User>`:
- Username lookups: key = `username`
- Userkey lookups: key = `key:${userkey}`

This prevents duplicate API calls when:
- Multiple pages mention the same user
- A user is mentioned multiple times in the same page

## Testing

Run the test to see it in action:

```bash
npm run build
node dist/transformer.test.js
```

Expected output:
```
Testing user link transformation...

Input HTML:
      <p>Hello <ac:link><ri:user ri:username="john.doe"/></ac:link>, welcome!</p>
      <p>User by key: <ac:link><ri:user ri:userkey="ff8080817b0a1234"/></ac:link></p>
      <p>Unknown user: <ac:link><ri:user ri:username="unknown.user"/></ac:link></p>

Output Markdown:
Hello @John Doe, welcome!

User by key: @John Doe

Unknown user: @unknown.user

✓ User links transformed successfully!
✓ Username resolved to display name
✓ Unknown user fallback working
```

## Example Usage

The feature works automatically when running the exporter:

```bash
node dist/index.js https://mysite.atlassian.net user@example.com token SPACE ./output
```

When processing pages with user links:
```
[1] Processing: Team Meeting Notes (123456)
  ✓ Saved: team-meeting-notes.md
[2] Processing: Project Overview (789012)
  ✓ Saved: project-overview.md
```

The exported markdown files will have resolved user names instead of Confluence user link XML.

## Comparison with src-sunrise

Our implementation is simpler but follows the same pattern:

| Feature | src-sunrise | src (our version) |
|---------|-------------|-------------------|
| User discovery | ✓ Complex queue-based | ✗ Not needed |
| User resolution | ✓ Via services | ✓ Direct in transformer |
| Caching | ✓ Yes | ✓ Yes |
| API calls | ✓ getUser/getUserByUsername | ✓ Same |
| Fallback | ✓ Yes | ✓ Yes |
| Lines of code | ~300+ | ~50 |

**Why simpler?**
- We don't need queue-based discovery (no recursive page fetching)
- We transform inline during page processing
- We don't create separate user pages
- We focus on just resolving mentions to names

## Future Enhancements

Possible improvements (if needed):
1. Batch user lookups to reduce API calls
2. Persist cache to disk for subsequent runs
3. Support for user profile links in output
4. Option to keep raw usernames vs display names
5. Link user mentions to GitHub/LDAP profiles
