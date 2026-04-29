const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot läuft");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webserver läuft auf Port ${PORT}`);
});

const { Client, GatewayIntentBits, AttachmentBuilder, SlashCommandBuilder, REST, Routes, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const Canvas = require("canvas");

const token = process.env.DISCORD_BOT_TOKEN;

// 🔥 SAFE CLIENT (kein Crash durch missing events)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🛡️ HARD CRASH PROTECTION
process.on("unhandledRejection", console.log);
process.on("uncaughtException", console.log);

// DATA
let data = {
  users: {},
  config: {
    levelChannel: null
  }
};

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

// ROLES
const roles = [
  { level: 10, name: "𝐛𝐫𝐨𝐧𝐳𝐞" },
  { level: 25, name: "𝐬𝐢𝐥𝐛𝐞𝐫" },
  { level: 50, name: "𝐠𝐨𝐥𝐝" },
  { level: 100, name: "𝐩𝐥𝐚𝐭𝐢𝐧𝐮𝐦" }
];

// ROLE FIX SYSTEM
async function fixRoles(member, level) {
  for (const r of roles) {
    const role = member.guild.roles.cache.find(x => x.name === r.name);
    if (!role) continue;

    if (level >= r.level) {
      await member.roles.add(role).catch(() => {});
    } else {
      await member.roles.remove(role).catch(() => {});
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
    new SlashCommandBuilder().setName("setlevelchannel").setDescription("Setzt Level Channel"),
    new SlashCommandBuilder().setName("profile").setDescription("Zeigt dein Profil")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("Slash Commands registriert");
});

// 🚀 SAFE VOICE XP LOOP (FIXED - NO GUILD CACHE CRASH)
setInterval(async () => {
  try {
    const today = new Date().toDateString();

    for (const guild of client.guilds.cache.values()) {

      // 🔥 FIX: LOOP VIA VOICE CHANNELS (STABLE)
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased()) continue;

        for (const member of channel.members.values()) {

          if (!member || member.user.bot) continue;

          const id = member.id;

          if (!data.users[id]) {
            data.users[id] = {
              xp: 0,
              level: 1,
              time: 0,
              streak: 0,
              lastDaily: null,
              lastXp: 0
            };
          }

          const u = data.users[id];

          const now = Date.now();
          if (now - u.lastXp < 30000) continue;

          if (member.voice?.selfMute || member.voice?.selfDeaf) continue;
          if (channel.members.size <= 1) continue;

          // XP
          u.xp += 10;
          u.time += 60;
          u.lastXp = now;

          // DAILY + STREAK
          if (!u.lastDaily) u.lastDaily = today;

          if (u.lastDaily !== today) {
            u.lastDaily = today;
            u.streak = (u.streak || 0) + 1;
            u.xp += 50 + u.streak * 10;
          }

          // LEVEL UP
          const need = neededXP(u.level);

          if (u.xp >= need) {
            u.xp = 0;
            u.level++;

            await fixRoles(member, u.level);

            const role = roles.find(r => r.level === u.level);

            const ch = guild.channels.cache.get(data.config.levelChannel);
            if (ch) {
              ch.send(
                `🎉 **Level Up!**\n` +
                `👉 <@${id}> ist jetzt **Level ${u.level}** 🔥\n` +
                (role ? `🏆 Neue Rolle: **${role.name}**` : "")
              ).catch(() => {});
            }
          }
        }
      }
    }

    save();
  } catch (err) {
    console.log("🔥 XP LOOP ERROR:", err);
  }
}, 60000);

// SLASH COMMANDS
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const u = data.users[i.user.id];

  if (i.commandName === "setlevelchannel") {
    data.config.levelChannel = i.channel.id;
    save();
    return i.reply({ content: "✅ Level Channel gesetzt", ephemeral: true });
  }

  if (i.commandName === "voicetime") {
    if (!u) return i.reply("Keine Daten");

    let minutes = Math.floor((u.time || 0) / 60);
    let hours = Math.floor(minutes / 60);

    return i.reply(`⏱️ ${hours}h ${minutes % 60}m Voice Time`);
  }

  if (i.commandName === "top") {
    const sorted = Object.entries(data.users)
      .sort((a, b) => b[1].level - a[1].level)
      .slice(0, 10);

    let desc = "";

    sorted.forEach((x, idx) => {
      desc += `**#${idx + 1}** <@${x[0]}> — Level ${x[1].level}\n`;
    });

    const embed = new EmbedBuilder()
      .setTitle("🏆 Leaderboard")
      .setDescription(desc)
      .setColor("Gold");

    return i.reply({ embeds: [embed] });
  }

  if (i.commandName === "profile") {
    if (!u) return i.reply("Keine Daten");

    return i.reply({
      content:
`👤 **Profil**
📊 Level: ${u.level}
⭐ XP: ${u.xp}
🎧 Voice: ${Math.floor((u.time || 0)/60)} min
🔥 Streak: ${u.streak || 0} Tage`
    });
  }

  if (i.commandName === "rank") {
    if (!u) return i.reply("Kein Level");

    const canvas = Canvas.createCanvas(800, 250);
    const ctx = canvas.getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, 800, 250);
    gradient.addColorStop(0, "#141414");
    gradient.addColorStop(1, "#2a2a2a");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 800, 250);

    ctx.fillStyle = "#fff";
    ctx.font = "36px sans-serif";
    ctx.fillText(i.user.username, 200, 80);

    ctx.font = "28px sans-serif";
    ctx.fillText(`Level: ${u.level}`, 200, 130);

    const need = neededXP(u.level);
    const percent = u.xp / need;

    ctx.fillStyle = "#333";
    ctx.fillRect(200, 170, 500, 25);

    ctx.fillStyle = "#00ff88";
    ctx.fillRect(200, 170, 500 * percent, 25);

    const avatar = await Canvas.loadImage(i.user.displayAvatarURL({ extension: "png" }));

    ctx.save();
    ctx.beginPath();
    ctx.arc(100, 120, 70, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 30, 50, 140, 140);
    ctx.restore();

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: "rank.png" });

    return i.reply({ files: [attachment] });
  }
});

client.login(token);