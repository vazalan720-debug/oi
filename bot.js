const { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const mongoUri = process.env.mongoUri;
const dbName = "mongoGOMES";
let db, usersCollection;

async function connectDB() {
    try {
        const mongoClient = new MongoClient(mongoUri);
        await mongoClient.connect();
        db = mongoClient.db(dbName);
        usersCollection = db.collection("Users");
        console.log("🟢 Discord Bot connected to MongoDB!");
    } catch (error) { console.error("🔴 MongoDB Connection Error:", error); }
}

const commands = [
    { name: 'ping', description: 'Check if the backend engine is running smoothly!' },
    { name: 'stats', description: 'Check a player\'s in-game stats', options: [{ name: 'username', description: 'The exact username', type: 3, required: true }] },
    { name: 'changename', description: 'Change a player\'s name', options: [{ name: 'playerid', description: 'Player ID', type: 3, required: true }, { name: 'newname', description: 'New name', type: 3, required: true }] },
    { name: 'ban', description: 'Ban a player', options: [{ name: 'playerid', description: 'Player ID', type: 3, required: true }, { name: 'reason', description: 'Reason for ban', type: 3, required: true }] },
    { name: 'unban', description: 'Unban a player', options: [{ name: 'playerid', description: 'Player ID', type: 3, required: true }] },
    { name: 'ccname', description: 'Claim colored name', options: [{ name: 'playerid', description: 'Player ID', type: 3, required: true }] },
    { name: 'addtag', description: 'Add a temporary tag', options: [{ name: 'playerid', description: 'Player ID', type: 3, required: true }, { name: 'tag', description: 'Tag text', type: 3, required: true }, { name: 'days', description: 'Duration in days', type: 4, required: true }] },
    { name: 'setstats', description: 'Set crowns, trophies, or gems', options: [{ name: 'playerid', description: 'Player ID', type: 3, required: true }, { name: 'crowns', description: 'Amount of crowns', type: 4, required: false }, { name: 'trophies', description: 'Amount of trophies', type: 4, required: false }, { name: 'gems', description: 'Amount of gems', type: 4, required: false }] },
    { name: 'changeid', description: 'Change player ID', options: [{ name: 'currentid', description: 'Current ID', type: 3, required: true }, { name: 'newid', description: 'New ID', type: 4, required: true }] },
    { name: 'download', description: 'Generate Download Panel', options: [{ name: 'folder_link', description: 'Link to folder', type: 3, required: true }, { name: 'dll_link', description: 'Link to DLL', type: 3, required: true }] },
    { name: 'addgems', description: 'Add gems', options: [{ name: 'playerid', description: 'Player ID', type: 3, required: true }, { name: 'amount', description: 'Amount', type: 4, required: true }] },
    { name: 'removegems', description: 'Remove gems', options: [{ name: 'playerid', description: 'Player ID', type: 3, required: true }, { name: 'amount', description: 'Amount', type: 4, required: true }] },
    { name: 'search', description: 'Search user', options: [{ name: 'query', description: 'ID or Username', type: 3, required: true }] }
];

client.once('clientReady', async (c) => {
    console.log(`🤖 Bot is online! Logged in as ${c.user.tag}`);
    await connectDB();
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(c.user.id), { body: commands });
    
    // Status e Auto-tag remover (seu código original)
    async function updateBotStatus() {
        if (!usersCollection) return;
        try { const totalPlayers = await usersCollection.countDocuments(); c.user.setActivity(`${totalPlayers} Players`, { type: ActivityType.Watching }); } catch (e) { console.error(e); }
    }
    updateBotStatus(); setInterval(updateBotStatus, 2 * 60 * 1000);
    setInterval(async () => { /* Lógica de Auto-tag aqui */ }, 60 * 60 * 1000);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName } = interaction;

    // --- NOVOS COMANDOS (GEMS/SEARCH) ---
    if (commandName === 'addgems' || commandName === 'removegems') {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Apenas Admins.', ephemeral: true });
        const user = await usersCollection.findOne({ $or: [{ stumbleId: interaction.options.getString('playerid') }, { id: parseInt(interaction.options.getString('playerid')) || -1 }] });
        if (!user) return interaction.reply('❌ Usuário não encontrado.');
        let amount = interaction.options.getInteger('amount') * (commandName === 'addgems' ? 1 : -1);
        let balances = user.balances || [];
        let gemIdx = balances.findIndex(b => b.name === 'gems');
        if (gemIdx !== -1) balances[gemIdx].amount += amount;
        else balances.push({ name: 'gems', amount: amount });
        await usersCollection.updateOne({ _id: user._id }, { $set: { balances } });
        await interaction.reply(`✅ Sucesso! Novo saldo: ${balances[gemIdx > -1 ? gemIdx : balances.length - 1].amount}`);
    }

    if (commandName === 'search') {
        const query = interaction.options.getString('query');
        const user = await usersCollection.findOne({ $or: [{ username: new RegExp(query, 'i') }, { stumbleId: query }, { id: parseInt(query) || -1 }] });
        if (!user) return interaction.reply('❌ Não encontrado.');
        await interaction.reply(`👤 **User:** ${user.username} | 💎 **Gems:** ${user.balances?.find(b => b.name === 'gems')?.amount || 0}`);
    }
    // --- SEUS COMANDOS ORIGINAIS ---
    if (commandName === 'ping') {
        await interaction.reply('Pong! 🏓 Backend is running smooth.');
    }

    if (commandName === 'download') {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin only.', ephemeral: true });
        const folderLinkInput = interaction.options.getString('folder_link');
        const dllLinkInput = interaction.options.getString('dll_link');
        const sgVersion = interaction.options.getString('sg_version') || '0.56';
        const mlVersion = interaction.options.getString('ml_version') || '0.6.1';
        const coreVersion = interaction.options.getString('core_version') || 'v1.0';
        
        const embed = new EmbedBuilder().setColor('#FFA500').setDescription(`⚠️ **Stumble Core - Warning**\n\n**• Melon Loader** v${mlVersion} 🍉\n**• Stumble Guys** v${sgVersion} 🏃\n**• Stumble Core** ${coreVersion} ⚙️\n\n💻 **PC Download**`);
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Game Folder').setURL(folderLinkInput).setStyle(ButtonStyle.Link).setEmoji('🔗'),
            new ButtonBuilder().setLabel('.DLL').setURL(dllLinkInput).setStyle(ButtonStyle.Link).setEmoji('🔗')
        );
        await interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'stats') {
        const username = interaction.options.getString('username');
        const user = await usersCollection.findOne({ username: new RegExp(`^${username}$`, 'i') });
        if (!user) return interaction.reply(`❌ Player **${username}** not found.`);
        
        const embed = new EmbedBuilder()
            .setColor('#00FFCC')
            .setTitle(`📊 Stats for ${user.username.replace(/<[^>]*>/g, '')}`)
            .addFields(
                { name: '🆔 User ID', value: (user.stumbleId || 'N/A').toString(), inline: false },
                { name: '👑 Crowns', value: (user.crowns || 0).toString(), inline: true },
                { name: '🏆 Trophies', value: (user.skillRating || 0).toString(), inline: true },
                { name: '💎 Gems', value: (user.balances?.find(b => b.name === 'gems')?.amount || 0).toString(), inline: true }
            );
        await interaction.reply({ embeds: [embed] });
    }

    if (commandName === 'changename') {
        const { playerid, newname } = { playerid: interaction.options.getString('playerid'), newname: interaction.options.getString('newname') };
        const user = await usersCollection.findOne({ $or: [{ stumbleId: playerid }, { id: parseInt(playerid) || -1 }] });
        if (!user) return interaction.reply(`❌ Player **${playerid}** not found.`);
        await usersCollection.updateOne({ _id: user._id }, { $set: { username: newname, "userProfile.userName": newname } });
        await interaction.reply(`✅ Success! Changed name to **${newname}**.`);
    }

    if (commandName === 'ban') {
        const { playerid, reason } = { playerid: interaction.options.getString('playerid'), reason: interaction.options.getString('reason') };
        const user = await usersCollection.findOne({ $or: [{ stumbleId: playerid }, { id: parseInt(playerid) || -1 }] });
        if (!user) return interaction.reply(`❌ Player **${playerid}** not found.`);
        await usersCollection.updateOne({ _id: user._id }, { $set: { isBanned: true, banReason: reason } });
        await interaction.reply(`🔨 **BANNED!** Reason: ${reason}`);
    }

    if (commandName === 'unban') {
        const playerid = interaction.options.getString('playerid');
        const user = await usersCollection.findOne({ $or: [{ stumbleId: playerid }, { id: parseInt(playerid) || -1 }] });
        if (!user) return interaction.reply(`❌ Player **${playerid}** not found.`);
        await usersCollection.updateOne({ _id: user._id }, { $set: { isBanned: false }, $unset: { banReason: "" } });
        await interaction.reply(`🔓 **UNBANNED!** Player **${user.username}** can play again.`);
    }

    if (commandName === 'ccname') {
        const playerid = interaction.options.getString('playerid');
        const user = await usersCollection.findOne({ $or: [{ stumbleId: playerid }, { id: parseInt(playerid) || -1 }] });
        if (!user) return interaction.reply(`❌ Player **${playerid}** not found.`);
        const newName = `<color=cyan>${user.username.replace(/<[^>]*>/g, '')}<color=yellow><sup>GOAT`;
        await usersCollection.updateOne({ _id: user._id }, { $set: { username: newName, "userProfile.userName": newName } });
        await interaction.reply(`🎨 **Color Name Applied!**`);
    }

    if (commandName === 'addtag') {
        const { playerid, tag, days } = { playerid: interaction.options.getString('playerid'), tag: interaction.options.getString('tag'), days: interaction.options.getInteger('days') };
        const user = await usersCollection.findOne({ $or: [{ stumbleId: playerid }, { id: parseInt(playerid) || -1 }] });
        if (!user) return interaction.reply(`❌ Player **${playerid}** not found.`);
        const newName = `${tag} ${user.username.replace(/<[^>]*>/g, '')}`;
        await usersCollection.updateOne({ _id: user._id }, { $set: { username: newName, "userProfile.userName": newName, tempTag: { originalName: user.username, expiresAt: new Date(Date.now() + days * 86400000) } } });
        await interaction.reply(`🏷️ **Tag Added!** Expiration in ${days} days.`);
    }

    if (commandName === 'setstats') {
        const { playerid, crowns, trophies, gems } = { playerid: interaction.options.getString('playerid'), crowns: interaction.options.getInteger('crowns'), trophies: interaction.options.getInteger('trophies'), gems: interaction.options.getInteger('gems') };
        const user = await usersCollection.findOne({ $or: [{ stumbleId: playerid }, { id: parseInt(playerid) || -1 }] });
        if (!user) return interaction.reply(`❌ Player **${playerid}** not found.`);
        let updates = {};
        if (crowns !== null) updates.crowns = crowns;
        if (trophies !== null) updates.skillRating = trophies;
        if (gems !== null) {
            let b = user.balances || [];
            let i = b.findIndex(x => x.name === 'gems');
            if (i !== -1) b[i].amount = gems; else b.push({ name: 'gems', amount: gems });
            updates.balances = b;
        }
        await usersCollection.updateOne({ _id: user._id }, { $set: updates });
        await interaction.reply(`✅ Stats updated!`);
    }

    if (commandName === 'changeid') {
        const { currentid, newid } = { currentid: interaction.options.getString('currentid'), newid: interaction.options.getInteger('newid') };
        await usersCollection.updateOne({ $or: [{ stumbleId: currentid }, { id: parseInt(currentid) || -1 }] }, { $set: { id: newid } });
        await interaction.reply(`🚀 **ID Changed to ${newid}**`);
    }
});

if (!process.env.DISCORD_TOKEN) console.error("🔴 DISCORD_TOKEN is missing!");
else client.login("MTUyMDc4ODgyMDczMDE4NzgyNw.G0QWoU.zqbs5Te-IAsDpNuTrIznIz0abO2WhlnN5cunQg");
