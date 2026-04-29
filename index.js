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

if (fs.existsSync("data.json")) {
  data = JSON.parse(fs.readFileSync("data.json"));
}

function save() {
  fs.writeFileSync("data.json", JSON.stringify(data, null, 2));
}

// XP Formel (besser als vorher)
function neededXP(level) {
  return Math.floor(100 * Math.pow(level, 1.5));
}

// Rollen
const roles = [
  { level: 10, name: "Bronze" },
  { level: 25, name: "Silver" },
  { level: 50, name: "Gold" },
  { level: 100, name: "Platinum" }
];

function checkRoles(member, level) {
  roles.forEach(r => {
    if (level >= r.level) {
      const role = member.guild.roles.cache.find(x => x.name === r.name);
      if (role) member.roles.add(role).catch(() => {});
    }
  });
}

// READY
client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("rank")
      .setDescription("Zeigt deinen Rank")
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );
});

// VOICE XP SYSTEM
setInterval(() => {
  client.guilds.cache.forEach(guild => {
    guild.members.cache.forEach(member => {
      if (!member.voice.channel) return;
      if (member.user.bot) return;

      const id = member.id;

      if (!data.users[id]) {
        data.users[id] = { xp: 0, level: 1 };
      }

      data.users[id].xp += 10;

      const needed = neededXP(data.users[id].level);

      if (data.users[id].xp >= needed) {
        data.users[id].xp = 0;
        data.users[id].level++;

        checkRoles(member, data.users[id].level);

        const ch = guild.channels.cache.get(data.config.levelChannel);
        if (ch) ch.send(`<@${id}> ist jetzt Level ${data.users[id].level} 🔥`);
      }
    });
  });

  save();
}, 60000);

// PREFIX COMMAND
client.on("messageCreate", msg => {
  if (msg.author.bot) return;

  if (msg.content === "!setlevelchannel") {
    data.config.levelChannel = msg.channel.id;
    save();
    msg.reply("✅ Level Channel gesetzt");
  }
});

// SLASH COMMAND
client.on("interactionCreate", async i => {
  if (!i.isChatInputCommand()) return;

  if (i.commandName === "rank") {
    const user = i.user;

    if (!data.users[user.id]) {
      return i.reply({ content: "Kein Level", ephemeral: true });
    }

    const u = data.users[user.id];

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

    i.reply({ files: [attachment] });
  }
});

client.login(token);
