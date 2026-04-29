const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot läuft");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webserver läuft auf Port ${PORT}`);
});

const { Client, GatewayIntentBits, AttachmentBuilder, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const Canvas = require('canvas');

const token = process.env.DISCORD_BOT_TOKEN;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let data = {
  users: {},
  config: {
    levelChannel: null
  }
};

// LOAD DATA
if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json"));
}

function save() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

// XP FORMEL
function neededXP(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

// ROLLEN
const roles = [
  { level: 10, name: "Bronze" },
  { level: 25, name: "Silver" },
  { level: 50, name: "Gold" },
  { level: 100, name: "Platinum" }
];

async function checkRoles(member, level) {
  for (const r of roles) {
    if (level >= r.level) {
      const role = member.guild.roles.cache.find(x => x.name === r.name);
      if (role) {
        await member.roles.add(role).catch(() => {});
      }
    }
  }
}

// READY
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName("rank").setDescription("Zeigt deinen Rank"),
    new SlashCommandBuilder().setName("top").setDescription("Leaderboard anzeigen"),
    new SlashCommandBuilder().setName("voicetime").setDescription("Zeigt deine Voice Zeit"),
    new SlashCommandBuilder().setName("setlevelchannel").setDescription("Setzt den Level Channel")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("Slash Commands registriert");
});

// VOICE XP SYSTEM
setInterval(async () => {
  for (const guild of client.guilds.cache.values()) {
    await guild.members.fetch();

    for (const member of guild.members.cache.values()) {
      if (!member.voice.channel) continue;
      if (member.user.bot) continue;

      const id = member.id;

      if (!data.users[id]) {
        data.users[id] = { xp: 0, level: 1, time: 0 };
      }

      data.users[id].xp += 10;
      data.users[id].time += 60;

      const needed = neededXP(data.users[id].level);

      if (data.users[id].xp >= needed) {
        data.users[id].xp = 0;
        data.users[id].level++;

        await checkRoles(member, data.users[id].level);

        const ch = guild.channels.cache.get(data.config.levelChannel);
        if (ch) {
          ch.send(`<@${id}> ist jetzt Level ${data.users[id].level} 🔥`).catch(() => {});
        }
      }
    }
  }

  save();
}, 60000);

// SLASH COMMANDS
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const user = i.user;

  if (i.commandName === "setlevelchannel") {
    data.config.levelChannel = i.channel.id;
    save();
    return i.reply({ content: "✅ Level Channel gesetzt", ephemeral: true });
  }

  if (i.commandName === "voicetime") {
    const u = data.users[user.id];
    if (!u) return i.reply("Keine Daten");

    let minutes = Math.floor((u.time || 0) / 60);
    let hours = Math.floor(minutes / 60);

    return i.reply(`⏱️ ${hours}h ${minutes % 60}m Voice Time`);
  }

  if (i.commandName === "top") {
    let sorted = Object.entries(data.users)
      .sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp)
      .slice(0, 10);

    let text = "🏆 Leaderboard:\n";

    sorted.forEach((u, index) => {
      text += `#${index + 1} <@${u[0]}> - Level ${u[1].level} (${u[1].xp} XP)\n`;
    });

    return i.reply(text);
  }

  if (i.commandName === "rank") {
    const u = data.users[user.id];
    if (!u) return i.reply("Kein Level");

    const canvas = Canvas.createCanvas(600, 200);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, 600, 200);

    ctx.fillStyle = "#fff";
    ctx.font = "28px sans-serif";
    ctx.fillText(user.username, 180, 60);

    ctx.font = "20px sans-serif";
    ctx.fillText(`Level: ${u.level}`, 180, 100);
    ctx.fillText(`XP: ${u.xp}/${neededXP(u.level)}`, 180, 140);

    const avatar = await Canvas.loadImage(user.displayAvatarURL({ extension: "png" }));
    ctx.drawImage(avatar, 30, 30, 120, 120);

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: "rank.png" });

    return i.reply({ files: [attachment] });
  }
});

client.login(token);