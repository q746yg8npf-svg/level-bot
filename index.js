const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot läuft");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webserver läuft auf Port ${PORT}`);
});

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder
} = require("discord.js");

const fs = require("fs");

const token = process.env.DISCORD_BOT_TOKEN;

/* =========================
   CLIENT
========================= */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

/* =========================
   CRASH PROTECTION
========================= */
process.on("unhandledRejection", err => console.log("UNHANDLED:", err));
process.on("uncaughtException", err => console.log("UNCAUGHT:", err));

/* =========================
   CONNECTION LOGS
========================= */
client.on("error", err => console.log("CLIENT ERROR:", err));
client.on("shardError", err => console.log("SHARD ERROR:", err));
client.on("shardDisconnect", () => console.log("SHARD DISCONNECT"));
client.on("shardReconnecting", () => console.log("SHARD RECONNECTING"));
client.on("shardResume", () => console.log("SHARD RESUMED"));

/* =========================
   DATA
========================= */
let data = {
  users: {},
  config: {
    levelChannel: null
  }
};

if (fs.existsSync("data.json")) {
  try {
    data = JSON.parse(fs.readFileSync("data.json"));
  } catch {
    console.log("data.json konnte nicht geladen werden");
  }
}

/* =========================
   SAVE SYSTEM
========================= */
let saving = false;

function save() {
  if (saving) return;

  saving = true;

  fs.writeFile(
    "data.json",
    JSON.stringify(data, null, 2),
    err => {
      if (err) console.log("SAVE ERROR:", err);
      saving = false;
    }
  );
}

/* =========================
   XP SYSTEM
========================= */
function neededXP(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

const roles = [
  { level: 10, name: "𝐛𝐫𝐨𝐧𝐳𝐞" },
  { level: 25, name: "𝐬𝐢𝐥𝐛𝐞𝐫" },
  { level: 50, name: "𝐠𝐨𝐥𝐝" },
  { level: 100, name: "𝐩𝐥𝐚𝐭𝐢𝐧𝐮𝐦" }
];

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

/* =========================
   READY (FIXED)
========================= */
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName("rank").setDescription("Zeigt deinen Rank"),
    new SlashCommandBuilder().setName("top").setDescription("Leaderboard"),
    new SlashCommandBuilder().setName("voicetime").setDescription("Voice Zeit"),
    new SlashCommandBuilder().setName("setlevelchannel").setDescription("Setzt Level Channel"),
    new SlashCommandBuilder().setName("profile").setDescription("Profil")
  ].map(c => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(token);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log("Slash Commands registriert");
});

/* =========================
   VOICE XP LOOP
========================= */
setInterval(async () => {
  try {
    console.log("XP LOOP START");

    const today = new Date().toDateString();

    for (const guild of client.guilds.cache.values()) {
      for (const channel of guild.channels.cache.values()) {
        if (!channel.isVoiceBased()) continue;
        if (channel.members.size <= 1) continue;

        for (const member of channel.members.values()) {
          if (!member) continue;
          if (member.user.bot) continue;
          if (member.voice?.selfMute) continue;
          if (member.voice?.selfDeaf) continue;

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

          u.xp += 10;
          u.time += 60;
          u.lastXp = now;

          if (!u.lastDaily) u.lastDaily = today;

          if (u.lastDaily !== today) {
            u.lastDaily = today;
            u.streak = (u.streak || 0) + 1;
            u.xp += 50 + u.streak * 10;
          }

          const need = neededXP(u.level);

          if (u.xp >= need) {
            u.xp = 0;
            u.level++;

            await fixRoles(member, u.level);

            const reward = roles.find(r => r.level === u.level);
            const ch = guild.channels.cache.get(data.config.levelChannel);

            if (ch) {
              ch.send(
                `🎉 **Level Up!**\n` +
                `👉 <@${id}> ist jetzt **Level ${u.level}** 🔥\n` +
                (reward ? `🏆 Neue Rolle: **${reward.name}**` : "")
              ).catch(() => {});
            }
          }
        }
      }
    }

    save();
    console.log("XP LOOP DONE");

  } catch (err) {
    console.log("XP LOOP ERROR:", err);
  }
}, 60000);

/* =========================
   COMMANDS
========================= */
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  const u = data.users[i.user.id];

  try {

    if (i.commandName === "setlevelchannel") {
      data.config.levelChannel = i.channel.id;
      save();

      return i.reply({
        content: "✅ Level Channel gesetzt",
        ephemeral: true
      });
    }

    if (i.commandName === "voicetime") {
      if (!u) return i.reply("Keine Daten");

      const minutes = Math.floor((u.time || 0) / 60);
      const hours = Math.floor(minutes / 60);

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
        .setDescription(desc || "Keine Daten")
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

      const need = neededXP(u.level);

      const embed = new EmbedBuilder()
        .setTitle(`🏆 Rank von ${i.user.username}`)
        .setColor("Blue")
        .addFields(
          { name: "📊 Level", value: `${u.level}`, inline: true },
          { name: "⭐ XP", value: `${u.xp}/${need}`, inline: true },
          { name: "🎧 Voice", value: `${Math.floor((u.time || 0)/60)} min`, inline: true },
          { name: "🔥 Streak", value: `${u.streak || 0}`, inline: true }
        );

      return i.reply({ embeds: [embed] });
    }

  } catch (err) {
    console.log("COMMAND ERROR:", err);

    if (!i.replied && !i.deferred) {
      return i.reply("Fehler.");
    }
  }
});

/* =========================
   LOGIN
========================= */
client.login(token);