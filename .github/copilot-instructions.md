when test commands, please follow these guidelines:
- never specify params about url, user, etc. All such params should be read from .env or config files.
  example: instead of `npm run dev -- download -u https://site.atlassian.net -n user@example.com -p token123 -s PR000299 -l 5`, use `npm run dev -- download -l 5`.
