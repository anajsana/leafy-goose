// Leafy Goose: DRF community assistant for Discord, powered by goose.
//
// Flow:
//   1. You run /leafy, or right-click a member's message → Apps → "Answer with Leafy Goose".
//   2. goose drafts an answer from the community guide (GUIDE_PATH). Only you see the draft.
//   3. You click Publish, Edit or Discard.
//   4. Publish replies to the member's message (or posts in the channel for /leafy),
//      with link previews off and a short AI disclosure line.

require("dotenv").config();

const {
  ActionRowBuilder,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonStyle,
  Client,
  ContextMenuCommandBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

const guideLib = require("./lib/guide");

const {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID,
  DISCORD_ALLOWED_USER_ID,
  DISCORD_ALLOWED_CHANNEL_IDS = "",
  GOOSE_TIMEOUT_SECONDS = "120",
} = process.env;

const missing = Object.entries({ DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_ALLOWED_USER_ID })
  .filter(([, value]) => !value)
  .map(([name]) => name);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);

// Comma-separated user IDs are allowed, so more reviewers (moderators, lead maintainers,
// community managers) can be added later.
const ALLOWED_USERS = new Set(DISCORD_ALLOWED_USER_ID.split(",").map((s) => s.trim()).filter(Boolean));
const ALLOWED_CHANNELS = new Set(DISCORD_ALLOWED_CHANNEL_IDS.split(",").map((s) => s.trim()).filter(Boolean));
const GOOSE_TIMEOUT_MS = Number(GOOSE_TIMEOUT_SECONDS) * 1000;
const COOLDOWN_MS = 15_000;
const DRAFT_TTL_MS = 14 * 60_000; // interaction tokens last 15 minutes

let guide = guideLib.loadGuide();
const drafts = new Map(); // draftId → draft
const cooldowns = new Map();
const activeUsers = new Set();

// ---------- commands ----------

const commands = [
  new SlashCommandBuilder()
    .setName("leafy")
    .setDescription("Leafy Goose drafts a DRF answer. Only you see the draft.")
    .addStringOption((o) =>
      o.setName("question").setDescription("The member's question").setRequired(true).setMaxLength(guideLib.MAX_QUESTION_CHARS))
    .setDMPermission(false),
  new ContextMenuCommandBuilder()
    .setName("Answer with Leafy Goose")
    .setType(ApplicationCommandType.Message)
    .setDMPermission(false),
  new SlashCommandBuilder()
    .setName("leafy-reload")
    .setDescription("Reload the community guide after you edit it.")
    .setDMPermission(false),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), {
    body: commands.map((c) => c.toJSON()),
  });
  console.log("✅ Commands registered: /leafy, /leafy-reload, Answer with Leafy Goose");
}

// ---------- draft UI ----------

function draftButtons(id) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`publish:${id}`).setLabel("Publish").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`edit:${id}`).setLabel("Edit").setEmoji("✏️").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`discard:${id}`).setLabel("Discard").setEmoji("🗑️").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function publicText(draft) {
  return `${draft.answer}\n${guideLib.footer(`<@${draft.reviewerId}>`, guide)}`;
}

function renderDraft(draft) {
  const quoted = draft.question.length > 200 ? `${draft.question.slice(0, 200)} …` : draft.question;
  const lines = [
    "**Draft: only you can see this.** Check it, then publish, edit or discard.",
    `> ${quoted}`,
    draft.target ? `Will reply to <@${draft.target.authorId}>'s message.` : "Will post in this channel.",
    ...draft.warnings.map((w) => `⚠️ ${w}`),
    "",
    publicText(draft),
  ];
  return lines.join("\n").slice(0, 2000);
}

function isAllowed(interaction) {
  if (!ALLOWED_USERS.has(interaction.user.id)) return "You are not authorized to use this command.";
  if (ALLOWED_CHANNELS.size && !ALLOWED_CHANNELS.has(interaction.channelId)) {
    return "This bot is limited to its test channel for now.";
  }
  return null;
}

async function createDraft(interaction, question, target) {
  const refusal = isAllowed(interaction);
  if (refusal) return interaction.reply({ content: refusal, flags: MessageFlags.Ephemeral });

  question = (question || "").trim();
  if (!question) return interaction.reply({ content: "That message has no text I can answer.", flags: MessageFlags.Ephemeral });

  if (activeUsers.has(interaction.user.id)) {
    return interaction.reply({ content: "Your previous request is still running. Please wait.", flags: MessageFlags.Ephemeral });
  }
  const wait = COOLDOWN_MS - (Date.now() - (cooldowns.get(interaction.user.id) ?? 0));
  if (wait > 0) {
    return interaction.reply({ content: `Please wait ${Math.ceil(wait / 1000)} seconds.`, flags: MessageFlags.Ephemeral });
  }

  activeUsers.add(interaction.user.id);
  cooldowns.set(interaction.user.id, Date.now());

  try {
    // Discord needs a first response within 3 seconds; goose takes longer.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const started = Date.now();
    const raw = await guideLib.askGoose(guide, question, { timeoutMs: GOOSE_TIMEOUT_MS });
    const result = guideLib.checkAnswer(raw, guide);
    console.log(`Draft in ${((Date.now() - started) / 1000).toFixed(1)}s, ${result.warnings.length} warning(s)`);

    if (!result.answer) {
      return interaction.editReply(
        `🤔 Leafy Goose has no approved answer for this (${result.noAnswerReason}).\n` +
        "Answer it yourself, or add the facts to the guide and run `/leafy-reload`.");
    }

    const id = interaction.id;
    const draft = {
      id, question, answer: result.answer, warnings: result.warnings,
      reviewerId: interaction.user.id, interaction, target,
      timer: setTimeout(() => expireDraft(id), DRAFT_TTL_MS),
    };
    drafts.set(id, draft);
    await interaction.editReply({
      content: renderDraft(draft), components: draftButtons(id),
      allowedMentions: { parse: [] }, flags: MessageFlags.SuppressEmbeds,
    });
  } catch (error) {
    console.error("Error making a draft:", error.message);
    await interaction.editReply("⚠️ Leafy Goose could not answer. Check the terminal where the bot is running.").catch(() => {});
  } finally {
    activeUsers.delete(interaction.user.id);
  }
}

async function expireDraft(id) {
  const draft = drafts.get(id);
  if (!draft) return;
  drafts.delete(id);
  await draft.interaction.editReply({ content: "⌛ Draft expired. Run the command again.", components: [] }).catch(() => {});
}

async function handleButton(interaction) {
  const [action, id] = interaction.customId.split(":");
  const draft = drafts.get(id);
  if (!draft) return interaction.update({ content: "⌛ This draft has expired.", components: [] });
  if (interaction.user.id !== draft.reviewerId) {
    return interaction.reply({ content: "Only the person who made this draft can use it.", flags: MessageFlags.Ephemeral });
  }

  if (action === "discard") {
    clearTimeout(draft.timer);
    drafts.delete(id);
    return interaction.update({ content: "🗑️ Draft discarded.", components: [] });
  }

  if (action === "edit") {
    const modal = new ModalBuilder().setCustomId(`editmodal:${id}`).setTitle("Edit the answer");
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("answer").setLabel("Answer (the footer is added for you)")
        .setStyle(TextInputStyle.Paragraph).setMaxLength(guideLib.MAX_ANSWER_CHARS)
        .setValue(draft.answer.slice(0, guideLib.MAX_ANSWER_CHARS)),
    ));
    return interaction.showModal(modal);
  }

  if (action === "publish") {
    // Take the draft first, so a double click cannot post it twice.
    drafts.delete(id);
    const options = {
      content: publicText(draft),
      flags: MessageFlags.SuppressEmbeds,
      allowedMentions: { parse: [], repliedUser: true },
    };
    let sent = null;
    try {
      const channel = await interaction.client.channels.fetch(draft.interaction.channelId);
      if (draft.target) {
        const message = await channel.messages.fetch(draft.target.messageId);
        sent = await message.reply(options);
      } else {
        sent = await channel.send(options);
      }
      clearTimeout(draft.timer);
      console.log(`Published answer reviewed by ${draft.reviewerId}`);
      return await interaction.update({ content: `✅ Published: ${sent.url}`, components: [] });
    } catch (error) {
      // Already posted: only the draft update failed. Never post a second time.
      if (sent) return console.error("Posted, but the draft could not be updated:", error.message);
      // No channel permissions (for example a private channel): publish as a public
      // reply to this interaction instead. That works without channel permissions.
      console.warn("Channel post failed, using interaction reply instead:", error.message);
      try {
        const mention = draft.target ? `<@${draft.target.authorId}> ` : "";
        await interaction.update({
          content: "✅ Published as a command reply. Tip: give me View Channel, Send Messages and Read Message History in this channel so I can reply to the member's message directly.",
          components: [],
        });
        await interaction.followUp({
          content: mention + publicText(draft),
          flags: MessageFlags.SuppressEmbeds,
          allowedMentions: draft.target ? { users: [draft.target.authorId] } : { parse: [] },
        });
        clearTimeout(draft.timer);
        console.log(`Published answer (interaction reply) reviewed by ${draft.reviewerId}`);
      } catch (fallbackError) {
        drafts.set(id, draft); // nothing was posted: keep the draft
        console.error("Publish failed:", fallbackError.message);
        await interaction.followUp({
          content: "❌ I couldn't publish. Check my permissions in this channel: View Channel, Send Messages, Read Message History.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
  }
}

async function handleEditSubmit(interaction) {
  const id = interaction.customId.split(":")[1];
  const draft = drafts.get(id);
  if (!draft) return interaction.reply({ content: "⌛ This draft has expired.", flags: MessageFlags.Ephemeral });
  if (interaction.user.id !== draft.reviewerId) {
    return interaction.reply({ content: "Only the person who made this draft can use it.", flags: MessageFlags.Ephemeral });
  }
  const edited = interaction.fields.getTextInputValue("answer").trim();
  const result = guideLib.checkAnswer(edited, guide);
  draft.answer = result.answer || edited;
  draft.warnings = result.warnings;
  return interaction.update({
    content: renderDraft(draft), components: draftButtons(id),
    allowedMentions: { parse: [] }, flags: MessageFlags.SuppressEmbeds,
  });
}

// ---------- events ----------

const client = new Client({ intents: [GatewayIntentBits.Guilds] }); // no privileged intents

client.once(Events.ClientReady, (ready) => {
  console.log(`✅ Bot connected as ${ready.user.tag}`);
  console.log(`✅ Guide reviewed ${guide.reviewed.toISOString().slice(0, 10)}: ${guide.allowedUrls.size} links, ${guide.channelIds.size} channels`);
  console.log(`✅ Allowed users: ${ALLOWED_USERS.size}. Channel limit: ${ALLOWED_CHANNELS.size ? [...ALLOWED_CHANNELS].join(", ") : "none"}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "leafy") {
      return await createDraft(interaction, interaction.options.getString("question", true), null);
    }
    if (interaction.isMessageContextMenuCommand() && interaction.commandName === "Answer with Leafy Goose") {
      const m = interaction.targetMessage;
      return await createDraft(interaction, m.content, { messageId: m.id, authorId: m.author.id });
    }
    if (interaction.isChatInputCommand() && interaction.commandName === "leafy-reload") {
      const refusal = isAllowed(interaction);
      if (refusal) return await interaction.reply({ content: refusal, flags: MessageFlags.Ephemeral });
      try {
        guide = guideLib.loadGuide();
        return await interaction.reply({
          content: `✅ Guide reloaded (reviewed ${guide.reviewed.toISOString().slice(0, 10)}, ${guide.allowedUrls.size} links, ${guide.channelIds.size} channels).`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        return await interaction.reply({ content: `❌ Reload failed, old guide kept: ${error.message}`, flags: MessageFlags.Ephemeral });
      }
    }
    if (interaction.isButton()) return await handleButton(interaction);
    if (interaction.isModalSubmit() && interaction.customId.startsWith("editmodal:")) return await handleEditSubmit(interaction);
  } catch (error) {
    console.error("Interaction error:", error);
  }
});

async function main() {
  await registerCommands();
  await client.login(DISCORD_TOKEN);
}

function shutdown(signal) {
  console.log(`\nReceived ${signal}. Disconnecting the bot...`);
  client.destroy();
  process.exit(0);
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

main().catch((error) => {
  console.error("Error starting the bot:", error);
  process.exit(1);
});
