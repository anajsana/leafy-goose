# Contributing

Thank you for helping! Leafy Goose is small on purpose. Please keep changes simple and safe.

## Before you start

- For a bug or an idea, open an issue first.
- For a security problem, follow [SECURITY.md](SECURITY.md). Do not open a public issue.
- Be kind. This project follows the [DRF Code of Conduct](https://github.com/DevRel-Foundation/governance/blob/main/code_of_conduct.md).

## Set up

```bash
npm ci
npm test        # unit tests: no Discord, no goose, no network
npm run check   # syntax check
```

`npm run eval` runs real questions through goose. It needs goose installed and signed in.

## Pull requests

- Keep one change per pull request.
- Add or update tests in `test/` for any change to `lib/guide.js`.
- Do not weaken a control listed in [SECURITY.md](SECURITY.md) without discussing it in an issue first.
- Never commit `.env`, tokens, user IDs, meeting links with passwords, or other personal data.
- Changes to `skills/drf-community-guide/SKILL.md` should cite an official DRF source. Keep its `name` the same as the folder name.

## Writing style

The bot answers in plain, short English. Please write docs the same way: short sentences, one idea per sentence, no em dashes.
