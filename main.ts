#!/usr/bin/env -S deno run --no-check --allow-net --allow-env --allow-run=deno

import { Client } from "./deps.ts";
import { TOKEN } from "./config.ts";
import { runWithDeno } from "./runner.ts";

const client = new Client({
  token: TOKEN,
  intents: ["GUILDS"],
});

client.interactions.handle("Run with Deno", async (d) => {
  if (!d.targetMessage) return;

  const match = d.targetMessage.content.match(
    /```(ts|js|typescript|javascript)\n([\S\s]*)\n```/i,
  );

  let lang;
  if (
    !match || match.length !== 3 || !(lang = match[1].toLowerCase()) ||
    !["typescript", "javascript", "ts", "js"].includes(lang)
  ) {
    return d.reply(
      "Failed to match code from message content. Please make sure your code is properly formatted, that is, in code blocks and has `js` or `ts` as language.",
      { ephemeral: true },
    );
  }

  const code = match[2];

  if (lang === "typescript") lang = "ts";
  else if (lang === "javascript" || lang == "js") lang = "js";

  await d.defer();

  const now = performance.now();
  const result = await runWithDeno(lang, code);
  const time = performance.now() - now;

  return d.editResponse(
    `[**Executed in \`${
      time.toFixed(2)
    }ms\`**](<https://discord.com/channels/${d.guild
      ?.id}/${d.targetMessage.channelID}/${d.targetMessage.id}>)\n**Exit Code:** ${result.code}${
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
  );
}, "MESSAGE");

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
