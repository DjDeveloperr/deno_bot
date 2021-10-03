#!/usr/bin/env -S deno run --no-check --allow-hrtime --allow-net --allow-env --allow-run

import { Client, Message } from "./deps.ts";
import { TOKEN } from "./config.ts";
import { runWithDeno } from "./runner.ts";

const client = new Client({
  token: TOKEN,
  intents: ["GUILDS"],
});

async function runUserCode(options: {
  content: string;
  guildID?: string;
  channelID: string;
  messageID: string;
}) {
  const match = options.content.match(
    /```(ts|js|typescript|javascript)\n([\S\s]*)\n```/i,
  );

  let lang;
  if (
    !match || match.length !== 3 || !(lang = match[1].toLowerCase()) ||
    !["typescript", "javascript", "ts", "js"].includes(lang)
  ) {
    throw new Error(
      "Failed to match code from message content. Please make sure your code is properly formatted, that is, in code blocks and has `js` or `ts` as language.",
    );
  }

  const code = match[2];

  if (lang === "typescript") lang = "ts";
  else if (lang === "javascript" || lang == "js") lang = "js";

  const result = await runWithDeno(lang, code);

  return {
    result,
    content: `[**Executed in \`${
      result.time.toFixed(2)
    }ms\`**](<https://discord.com/channels/${options.guildID ??
      "@me"}/${options.channelID}/${options.messageID}>) (Last run: <t:${
      Math.floor(Date.now() / 1000)
    }>)\n**Exit Code:** ${result.code}${
      result.error
        ? `\n**Error:** ${result.error}`
        : `${
          !result.stdout && !result.stderr
            ? ""
            : `${
              result.stdout
                ? `\n**Stdout:**\n${"```"}\n${result.stdout}${"```"}`
                : ""
            }${
              result.stderr
                ? `\n**Stderr:**\n${"```"}\n${result.stderr}\n${"```"}`
                : ""
            }`
        }`
    }`,
  };
}

client.interactions.handle("Run with Deno", async (d) => {
  if (!d.targetMessage) return;

  await d.defer();

  try {
    const { content, result } = await runUserCode({
      content: d.targetMessage.content,
      guildID: d.guild?.id,
      channelID: d.targetMessage.channelID,
      messageID: d.targetMessage.id,
    });
    await d.editResponse({
      content,
      components: [
        {
          type: "ACTION_ROW",
          components: [
            {
              type: "BUTTON",
              style: "GREEN",
              label: "Rerun",
              customID: "rerun",
              disabled: result.unexpected,
              emoji: { name: "🔁" },
            },
            {
              type: "BUTTON",
              style: "RED",
              label: "Delete",
              customID: "delete",
              emoji: { name: "🗑️" },
            },
          ],
        },
      ],
    });
  } catch (e) {
    return d.editResponse({ content: e.message });
  }
}, "MESSAGE");

client.on("interactionCreate", async (i) => {
  if (i.isMessageComponent()) {
    if (i.customID === "rerun") {
      if (i.member) {
        if (
          i.message.interaction?.user.id !== i.user.id &&
          !i.member.permissions.has("MANAGE_MESSAGES")
        ) {
          return i.reply("You can't do this.", { ephemeral: true });
        }
      }

      await i.respond({ type: 6 });
      const [, , channelID, messageID] = i.message.content.match(
        /channels\/(\d+|@me)\/(\d+)\/(\d+)>/,
      )!;
      const msg = await client.rest.endpoints.getChannelMessage(
        channelID,
        messageID,
      ).catch(() => undefined);
      if (!msg) return;

      const { content } = await runUserCode({
        content: msg.content,
        guildID: msg.guild_id,
        channelID: msg.channel_id,
        messageID: msg.id,
      });

      await client.channels.editMessage(i.message.channelID, i.message.id, {
        content,
      });
    } else if (i.customID === "delete") {
      if (i.member) {
        if (
          i.message.interaction?.user.id !== i.user.id &&
          !i.member.permissions.has("MANAGE_MESSAGES")
        ) {
          return i.reply("You can't do this.", { ephemeral: true });
        }
      }

      await i.respond({ type: 6 });
      await client.rest.endpoints.deleteMessage(
        i.message.channelID,
        i.message.id,
      ).catch(() => {});
    }
  }
});

client.interactions.on("interactionError", console.error);

client.connect().then(() => {
  console.log(`Connected as ${client.user!.tag}!`);
});

if (Deno.args.includes("sync")) {
  client.interactions.commands.bulkEdit([
    {
      name: "Run with Deno",
      type: "MESSAGE",
    },
  ]).then(() => console.log("Synced Commands!"));
}
