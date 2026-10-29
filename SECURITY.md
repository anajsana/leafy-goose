# Security policy

## Report a vulnerability

Please do not open a public issue for a security problem.

Use GitHub's private reporting instead: **Security** tab → **Report a vulnerability**.
Include what you found, how to reproduce it, and what an attacker could do with it.
You will get a reply within 7 days.

## Supported versions

Only the latest version on the `main` branch gets security fixes.

## Security design

Leafy Goose reads untrusted text from Discord and sends it to an AI model. These are the controls in place:

| Risk | Control |
|---|---|
| The model posts something wrong or harmful | Nothing is posted without a human. Every answer is an ephemeral draft that a reviewer must publish. |
| Strangers use the bot or your model account | Only user IDs in `DISCORD_ALLOWED_USER_ID` can run commands. Only the reviewer who made a draft can use its buttons and edit form. Optional channel allowlist. |
| Prompt injection in a member's message | Member text is marked as untrusted, its size is limited, and every `<` and `>` is escaped so it cannot open or close the prompt markers. |
| The agent runs tools on your machine | goose runs with `--no-profile` (no extensions) and `GOOSE_MODE=chat` (no tool calls), through `execFile` (no shell). |
| Secrets leak to the model | Every `DISCORD_*` variable is removed from the environment before goose starts. |
| Wrong or malicious links | Links and channel mentions that are not in the guide show a warning on the draft. Link previews are off. |
| Mass mentions | Published messages cannot mention `@everyone`, `@here` or roles. Only the member being answered is mentioned. |
| Private data in logs | Member questions are not logged. goose errors report only the exit code, never the prompt. |

## Keep your deployment safe

- Never commit `.env`. It is in `.gitignore`. If a token leaks, reset it in the Discord Developer Portal at once.
- In the Developer Portal, turn **Public Bot** off so only you can add the bot to servers.
- Give the bot only these permissions: View Channels, Send Messages, Send Messages in Threads, Read Message History.
- Do not turn on privileged gateway intents. The bot does not need them.
- Limit the commands to your reviewers in **Server Settings → Integrations**.
- Keep the guide free of secrets: no meeting passwords, private links or personal data. The bot may quote anything in it.
- Turn on GitHub secret scanning and Dependabot alerts for your repository.
