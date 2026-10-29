# Leafy Goose 🍃🪿

A human-reviewed AI community assistant for Discord, powered by [goose](https://github.com/aaif-goose/goose).
It was built for the [Developer Relations Foundation (DRF)](https://dev-rel.org/) community, and any community can run its own copy.

Leafy Goose drafts answers to common community questions. **It never posts on its own.**
A moderator, lead maintainer or community manager reviews every draft and decides to publish, edit or discard it.

> Design and decisions: [docs/SPEC.md](docs/SPEC.md). Security: [SECURITY.md](SECURITY.md).

## Who this guide is for

You are a lead maintainer, moderator or community manager, and you want to run Leafy Goose for your community.
You need:

- **Manage Server** permission on your community's Discord server, so you can add the bot.
  Only the person who installs the bot needs it. Other reviewers need no special server permission.
- A computer or server that stays on while the bot runs. Linux, macOS and Windows all work.
- [Node.js](https://nodejs.org/) 20 or later.
- [goose](https://github.com/aaif-goose/goose), signed in to a model provider (an account or an API key). Run `goose configure` to set it up.

## How it works

1. A reviewer right-clicks a member's message → **Apps** → **Answer with Leafy Goose**, or types `/leafy question: ...`.
2. goose drafts an answer using only the facts in your community guide.
3. The draft is visible only to the reviewer. It shows warnings for links or channels that are not in the guide.
4. The reviewer clicks **Publish**, **Edit** or **Discard**.
5. On Publish, the bot replies to the member with link previews off and a short line:
   `AI-assisted answer, reviewed by @reviewer. DRF info checked <date>.`

One running copy serves all your reviewers. Each reviewer only sees their own drafts.

## Step 1: Create the Discord app

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) - **New Application**. Give it a name.
2. **Bot** tab:
   - **Reset Token** and copy the token. Keep it secret.
   - Turn **Public Bot** off, so only you can add the bot to servers.
   - Leave the three privileged intents off. The bot does not need them.
3. **Installation** tab: keep **Guild Install** only.
4. **OAuth2 → URL Generator**:
   - Scopes: `bot` and `applications.commands`.
   - Bot permissions: View Channels, Send Messages, Send Messages in Threads, Read Message History.
   - Open the generated URL and add the bot to your server.

Tip: create the app inside a Developer Portal **Team**, so more than one maintainer can manage it.

## Step 2: Collect the IDs

In Discord, turn on **User Settings → Advanced → Developer Mode**. Then right-click to copy:

- your **server** ID,
- the **user** ID of each reviewer,
- the ID of each **public channel** you want the bot to mention or work in.

## Step 3: Write your community guide

The guide is the only thing the bot knows. Start from [guides/drf-community-guide.md](guides/drf-community-guide.md):

1. Copy it to a new file, for example `guides/my-community-guide.md`.
2. Replace the facts, links and public channel IDs with your own.
3. Keep the line `Last reviewed: <Month Day, Year>`. Drafts show a warning when the guide is older than 30 days.

Only put public information in the guide. The bot may quote anything in it. No passwords, private links, private channels or personal data.

## Step 4: Install and configure

```bash
git clone <this-repository-url> leafy-goose
cd leafy-goose
npm ci
```

Copy `.env.example` to `.env` and fill it in:

| Setting | What to put |
|---|---|
| `DISCORD_TOKEN` | The token from Step 1 |
| `DISCORD_CLIENT_ID` | **General Information → Application ID** |
| `DISCORD_GUILD_ID` | Your server ID |
| `DISCORD_ALLOWED_USER_ID` | Reviewer user IDs, comma-separated |
| `DISCORD_ALLOWED_CHANNEL_IDS` | Optional. Channels where the bot works, comma-separated |
| `GUIDE_PATH` | Your guide, for example `guides/my-community-guide.md` |

`.env` holds your secrets. It is never committed (it is in `.gitignore`). Do not share it.

## Step 5: Test

```bash
npm test
npm run eval
```

Edit `test/eval-questions.json` so the test questions match what your members ask.

## Step 6: Run

```bash
npm start
```

The bot answers only while this command runs. Keep the computer awake, or run it on a server.

## Step 7: Limit who sees the commands

In Discord: **Server Settings → Integrations → your app → Manage**. Allow only your reviewers.
Test first in a private channel: add the bot to it under **Edit Channel → Permissions**.

## Daily use

| Command | What it does |
|---|---|
| **Answer with Leafy Goose** (message → Apps) | Drafts a reply to that message |
| `/leafy question:` | Drafts an answer that posts in the current channel |
| `/leafy-reload` | Reloads the guide after you edit it |

When the bot has no approved answer, it says so. Answer by hand, then add the missing facts to the guide.

## Project layout

```
index.js                       Discord bot: commands, draft buttons, edit form, publish
lib/guide.js                   Loads the guide, builds the prompt, runs goose, checks answers
guides/drf-community-guide.md  Example guide for the DRF community
scripts/eval.js                Runs the eval questions through goose
test/                          Unit tests and eval questions
docs/SPEC.md                   Specification
```

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). To report a security problem, follow [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE).
