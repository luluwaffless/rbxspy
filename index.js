import { Client, EmbedBuilder, GatewayIntentBits } from 'discord.js';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import roblox from './roblox.js';
const log = (data, error) => {
    const timestamp = new Date().toISOString();
    if (error) {
        console.error(`[${timestamp}] ${data}:`, error);
        appendFileSync(`errors.log`, `[${timestamp}] ${data}: ${error.message}, ${error.stack || 'no stack trace available'}\n`);
    } else {
        console.log(`[${timestamp}] ${data}`);
        appendFileSync(`logs.log`, `[${timestamp}] ${data}\n`);
    };
};
const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const config = JSON.parse(readFileSync('config.json', 'utf-8'));
const data = JSON.parse(readFileSync('data.json', 'utf-8'));
const saveData = () => writeFileSync('data.json', JSON.stringify(data));
const universeIds = Object.keys(config.games);
const createDataFormat = () => ({ lastUpdated: 0, rootPlaceId: 0, name: "", description: "", icon: "", updateCount: { today: 0, yesterday: 0 }, gamePasses: [], products: [], badges: [], places: [], thumbnails: [] });
const validateGameData = () => universeIds.forEach(id => {
    if (data[id] && Object.keys(createDataFormat()).every(key => data[id][key] !== undefined)) return;
    data[id] = createDataFormat();
    saveData();
    log(`✅ Game data for universe ${id} initialized.`);
});

const channels = {};
const getChannel = async (id) => {
    if (channels[id]) return channels[id];
    const channel = await client.channels.fetch(id);
    channels[id] = channel;
    return channel;
};
const setName = async (id, name) => {
    const channel = await getChannel(id);
    if (channel.name !== name) await channel.setName(name);
};

const chances = [{ color: 0xe74c3c, text: "Impossible" }, { color: 0xe67e22, text: "Low" }, { color: 0xf1c40f, text: "Average" }, { color: 0x2ecc71, text: "High" }, { color: 0x3498db, text: "Very high" }, { color: 0x9b59b6, text: "Extremely high" }];
let chance = chances[0];
const checkChance = async () => {
    const now = new Date();
    const time = now.getTime();
    const hour = now.getHours();
    if (!data.lastUpdate || (time - data.lastUpdate) >= 86400000) {
        data.lastUpdate = time;
        Object.keys(data).forEach((id) => {
            if (id === "lastUpdate") return;
            data[id].updateCount.yesterday = data[id].updateCount.today;
            data[id].updateCount.today = 0;
        });
        saveData();
        log("✅ Update count reset.");
    } else {
        let estimate = 0;
        if (hour > 23 || hour < 11) estimate += 10;
        Object.keys(data).forEach((id) => {
            const { yesterday, today } = data[id].updateCount;
            const total = (yesterday / 2) + today;
            if (total >= 5) {
                estimate += 20;
            } else if (total === 4) {
                estimate += 15;
            } else if (total === 3) {
                estimate += 10;
            };
        });
        estimate = estimate > 100 ? 6
            : estimate >= 80 ? 5
                : estimate >= 60 ? 4
                    : estimate >= 40 ? 3
                        : estimate >= 20 ? 2
                            : estimate > 0 ? 1
                                : 0;
        if (chance !== chances[estimate]) {
            log(`✅ Chance of updating changed! From ${chance.text} to ${chances[estimate].text}`);
            chance = chances[estimate];
            const chanceChannel = await getChannel(config.discord.chanceChannelId);
            await chanceChannel.send({
                content: `-# ||<@&${config.discord.chanceRoleId}>||`,
                embeds: [new EmbedBuilder()
                    .setTitle("Chance of updating changed!")
                    .setDescription(chance.text)
                    .setColor(chance.color)
                    .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` })
                ]
            });
        };
    };
    return;
};

let nextCheck = 0;
const checkGames = async () => {
    try {
        const universes = await roblox.getGames(universeIds);
        const thumbnails = await roblox.getGameThumbnails(universeIds);
        const icons = await roblox.getThumbnails(universeIds.map(targetId => roblox.generateBatch(targetId, roblox.thumbnailTypes.GameIcon)));
        for (const { id, rootPlaceId, updated, description, name } of universes) {
            // updates
            const icon = icons.find(icon => icon.targetId === id)?.imageUrl || "";
            const updatedDate = new Date(updated);
            if (data[id].rootPlaceId !== rootPlaceId) data[id].rootPlaceId = rootPlaceId;
            if (data[id].lastUpdated < updatedDate.getTime() - 10000) {
                log(`✅ Game ${config.games[id].displayName} updated! From ${new Date(data[id].lastUpdated).toISOString()} to ${updatedDate.toISOString()}`);
                const embed = new EmbedBuilder()
                    .setColor(0x2ecc71)
                    .setTitle(`${config.games[id].displayName} updated!`)
                    .setURL(`https://www.roblox.com/games/${rootPlaceId}`)
                    .setDescription(`<t:${Math.floor(updatedDate.getTime() / 1000)}:R>`)
                    .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                data[id].lastUpdated = updatedDate.getTime();
                if (data[id].name !== name) {
                    data[id].name = name;
                    const gameName = name ?? "";
                    embed.addFields({ name: "New Name", value: gameName.length > 1024 ? `${gameName.slice(0, 1021)}...` : gameName });
                };
                if (data[id].description !== description) {
                    data[id].description = description;
                    const gameDescription = description ?? "";
                    embed.addFields({ name: "New Description", value: gameDescription.length > 1024 ? `${gameDescription.slice(0, 1021)}...` : gameDescription });
                };
                if (data[id].icon !== icon) {
                    data[id].icon = icon;
                    embed.setImage(icon);
                };
                data[id].updateCount.today++;
                saveData();
                const channel = await getChannel(config.games[id].discord.channelId);
                await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
            };

            // thumbnails
            const thumbnailData = thumbnails.find(data => data.universeId === id);
            if (thumbnailData.thumbnails) {
                for (const { targetId, imageUrl } of thumbnailData.thumbnails) {
                    if (!data[id].thumbnails.includes(targetId)) {
                        log(`✅ Thumbnail for game ${config.games[id].displayName} (${targetId}) created! ID: ${targetId}`);
                        data[id].thumbnails.push(targetId);
                        saveData();
                        const embed = new EmbedBuilder()
                            .setColor(0xe67e22)
                            .setTitle(`${config.games[id].displayName} Thumbnail created!`)
                            .setURL(`https://www.roblox.com/games/${id}`)
                            .setImage(imageUrl)
                            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                        const channel = await getChannel(config.games[id].discord.channelId);
                        await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                    };
                };
            };

            // gamepasses
            const gamepasses = await roblox.getGamePasses(id);
            const gamepassIcons = await roblox.getThumbnails(gamepasses.map(gamepass => roblox.generateBatch(gamepass.id, roblox.thumbnailTypes.GamePass)));
            for (const gamepass of gamepasses) {
                const [gamepassId, gamepassName, gamepassPrice, gamepassDescription, gamepassIcon] = [
                    gamepass.id,
                    gamepass.displayName,
                    gamepass.price,
                    gamepass.description,
                    gamepassIcons.find(icon => icon.targetId === gamepass.id)?.imageUrl || ""
                ];
                const gpIndex = data[id].gamePasses.findIndex(gp => gp.id === gamepassId);
                if (gpIndex === -1) {
                    log(`✅ Gamepass ${gamepassName} (${gamepassId}) created for game ${config.games[id].name}!`);
                    data[id].gamePasses.push({ id: gamepassId, name: gamepassName, price: gamepassPrice, description: gamepassDescription, icon: gamepassIcon });
                    saveData();
                    const embed = new EmbedBuilder()
                        .setColor(0x3498db)
                        .setTitle(`${config.games[id].displayName} Gamepass created!`)
                        .setURL(`https://www.roblox.com/game-pass/${gamepassId}`)
                        .addFields({ name: "Name", value: gamepassName }, { name: "Price", value: gamepassPrice ? `${gamepassPrice} Robux` : "Unavailable" }, { name: "Description", value: gamepassDescription.length > 1024 ? `${gamepassDescription.slice(0, 1021)}...` : gamepassDescription })
                        .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                    if (gamepassIcon) embed.setThumbnail(gamepassIcon);
                    const channel = await getChannel(config.games[id].discord.channelId);
                    await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                } else {
                    const existingGamepass = data[id].gamePasses[gpIndex];
                    if (existingGamepass.name !== gamepassName || existingGamepass.price !== gamepassPrice ||
                        existingGamepass.description !== gamepassDescription || existingGamepass.icon !== gamepassIcon) {
                        log(`✅ Gamepass ${gamepassName} (${gamepassId}) updated for game ${config.games[id].name}!`);
                        const embed = new EmbedBuilder()
                            .setColor(0x3498db)
                            .setTitle(`${config.games[id].displayName} Gamepass updated!`)
                            .setURL(`https://www.roblox.com/game-pass/${gamepassId}`)
                            .addFields({ name: "Name", value: existingGamepass.name })
                            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                        if (existingGamepass.icon !== gamepassIcon) embed.setThumbnail(gamepassIcon);
                        if (existingGamepass.name !== gamepassName) embed.addFields({ name: "New Name", value: gamepassName });
                        if (existingGamepass.price !== gamepassPrice) embed.addFields({ name: "New Price", value: gamepassPrice ? `${gamepassPrice} Robux` : "Unavailable" });
                        if (existingGamepass.description !== gamepassDescription) embed.addFields({ name: "New Description", value: gamepassDescription.length > 1024 ? `${gamepassDescription.slice(0, 1021)}...` : gamepassDescription });
                        data[id].gamePasses[gpIndex] = { id: gamepassId, name: gamepassName, price: gamepassPrice, description: gamepassDescription, icon: gamepassIcon };
                        saveData();
                        const channel = await getChannel(config.games[id].discord.channelId);
                        await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                    };
                };
            };

            // products
            const products = await roblox.getProducts(id);
            const productIcons = await roblox.getThumbnails(products.map(product => roblox.generateBatch(product.DeveloperProductId, roblox.thumbnailTypes.DeveloperProduct)));
            for (const product of products) {
                const [productId, productName, productPrice, productDescription, productIcon] = [
                    product.DeveloperProductId,
                    product.displayName,
                    product.PriceInRobux,
                    product.displayDescription,
                    productIcons.find(icon => icon.targetId === product.DeveloperProductId)?.imageUrl || ""
                ];
                const prodIndex = data[id].products.findIndex(p => p.id === productId);
                if (prodIndex === -1) {
                    log(`✅ Product ${productName} (${productId}) created for game ${config.games[id].name}!`);
                    data[id].products.push({ id: productId, name: productName, price: productPrice, description: productDescription, icon: productIcon });
                    saveData();
                    const embed = new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setTitle(`${config.games[id].displayName} Product created!`)
                        .setURL(`https://www.roblox.com/developer-products/${productId}`)
                        .addFields({ name: "Name", value: productName }, { name: "Price", value: productPrice ? `${productPrice} Robux` : "Unavailable" }, { name: "Description", value: productDescription.length > 1024 ? `${productDescription.slice(0, 1021)}...` : productDescription })
                        .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                    if (productIcon) embed.setThumbnail(productIcon);
                    const channel = await getChannel(config.games[id].discord.channelId);
                    await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                } else {
                    const existingProduct = data[id].products[prodIndex];
                    if (existingProduct.name !== productName || existingProduct.price !== productPrice ||
                        existingProduct.description !== productDescription || existingProduct.icon !== productIcon) {
                        log(`✅ Product ${productName} (${productId}) updated for game ${config.games[id].name}!`);
                        const embed = new EmbedBuilder()
                            .setColor(0x3498db)
                            .setTitle(`${config.games[id].displayName} Product updated!`)
                            .setURL(`https://www.roblox.com/developer-products/${productId}`)
                            .addFields({ name: "Name", value: existingProduct.name })
                            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                        if (existingProduct.icon !== productIcon) embed.setThumbnail(productIcon);
                        if (existingProduct.name !== productName) embed.addFields({ name: "New Name", value: productName });
                        if (existingProduct.price !== productPrice) embed.addFields({ name: "New Price", value: productPrice ? `${productPrice} Robux` : "Unavailable" });
                        if (existingProduct.description !== productDescription) embed.addFields({ name: "New Description", value: productDescription.length > 1024 ? `${productDescription.slice(0, 1021)}...` : productDescription });
                        data[id].products[prodIndex] = { id: productId, name: productName, price: productPrice, description: productDescription, icon: productIcon };
                        saveData();
                        const channel = await getChannel(config.games[id].discord.channelId);
                        await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                    };
                };
            };

            // badges
            const badges = await roblox.getBadges(id);
            const badgeIcons = await roblox.getThumbnails(badges.map(badge => roblox.generateBatch(badge.id, roblox.thumbnailTypes.BadgeIcon)));
            for (const badge of badges) {
                const [badgeId, badgeName, badgeDescription, badgeIcon] = [
                    badge.id,
                    badge.displayName,
                    badge.displayDescription,
                    badgeIcons.find(icon => icon.targetId === badge.id)?.imageUrl || ""
                ];
                const badgeIndex = data[id].badges.findIndex(b => b.id === badgeId);
                if (badgeIndex === -1) {
                    data[id].badges.push({ id: badgeId, name: badgeName, description: badgeDescription, icon: badgeIcon });
                    saveData();
                    const embed = new EmbedBuilder()
                        .setColor(0xf1c40f)
                        .setTitle(`${config.games[id].displayName} Badge created!`)
                        .setURL(`https://www.roblox.com/badges/${badgeId}`)
                        .addFields({ name: "Name", value: badgeName }, { name: "Description", value: badgeDescription.length > 1024 ? `${badgeDescription.slice(0, 1021)}...` : badgeDescription })
                        .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                    if (badgeIcon) embed.setThumbnail(badgeIcon);
                    const channel = await getChannel(config.games[id].discord.channelId);
                    await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                } else {
                    const existingBadge = data[id].badges[badgeIndex];
                    if (existingBadge.name !== badgeName || existingBadge.description !== badgeDescription || existingBadge.icon !== badgeIcon) {
                        const embed = new EmbedBuilder()
                            .setColor(0xf1c40f)
                            .setTitle(`${config.games[id].displayName} Badge updated!`)
                            .setURL(`https://www.roblox.com/badges/${badgeId}`)
                            .addFields({ name: "Name", value: existingBadge.name })
                            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                        if (existingBadge.icon !== badgeIcon) embed.setThumbnail(badgeIcon);
                        if (existingBadge.name !== badgeName) embed.addFields({ name: "New Name", value: badgeName });
                        if (existingBadge.description !== badgeDescription) embed.addFields({ name: "New Description", value: badgeDescription.length > 1024 ? `${badgeDescription.slice(0, 1021)}...` : badgeDescription });
                        data[id].badges[badgeIndex] = { id: badgeId, name: badgeName, description: badgeDescription, icon: badgeIcon };
                        saveData();
                        const channel = await getChannel(config.games[id].discord.channelId);
                        await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                    };
                };
            };

            // places
            const places = await roblox.getPlaces(id);
            const placeIcons = await roblox.getThumbnails(places.map(place => roblox.generateBatch(place.id, roblox.thumbnailTypes.PlaceIcon)));
            for (const place of places) {
                const [placeId, placeName, placeDescription, placeIcon] = [
                    place.id,
                    place.name,
                    place.description,
                    placeIcons.find(icon => icon.targetId === place.id)?.imageUrl || ""
                ];
                if (placeId === rootPlaceId) continue;
                const placeIndex = data[id].places.findIndex(p => p.id === placeId);
                if (placeIndex === -1) {
                    log(`✅ Place ${placeName} (${placeId}) created for game ${config.games[id].name}!`);
                    data[id].places.push({ id: placeId, name: placeName, description: placeDescription, icon: placeIcon });
                    saveData();
                    const embed = new EmbedBuilder()
                        .setColor(0x9b59b6)
                        .setTitle(`${config.games[id].displayName} Place created!`)
                        .setURL(`https://www.roblox.com/games/${placeId}`)
                        .addFields({ name: "Name", value: placeName }, { name: "Description", value: placeDescription.length > 1024 ? `${placeDescription.slice(0, 1021)}...` : placeDescription })
                        .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                    if (placeIcon) embed.setThumbnail(placeIcon);
                    const channel = await getChannel(config.games[id].discord.channelId);
                    await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                } else {
                    const existingPlace = data[id].places[placeIndex];
                    if (existingPlace.name !== placeName || existingPlace.description !== placeDescription ||
                        existingPlace.icon !== placeIcon) {
                        log(`✅ Place ${placeName} (${placeId}) updated for game ${config.games[id].name}!`);
                        const embed = new EmbedBuilder()
                            .setColor(0x9b59b6)
                            .setTitle(`${config.games[id].displayName} Place updated!`)
                            .setURL(`https://www.roblox.com/games/${placeId}`)
                            .addFields({ name: "Name", value: existingPlace.name })
                            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                        if (existingPlace.icon !== placeIcon) embed.setThumbnail(placeIcon);
                        if (existingPlace.name !== placeName) embed.addFields({ name: "New Name", value: placeName });
                        if (existingPlace.description !== placeDescription) embed.addFields({ name: "New Description", value: placeDescription.length > 1024 ? `${placeDescription.slice(0, 1021)}...` : placeDescription });
                        data[id].places[placeIndex] = { id: placeId, name: placeName, description: placeDescription, icon: placeIcon };
                        saveData();
                        const channel = await getChannel(config.games[id].discord.channelId);
                        await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                    };
                };
            };
        };
    } catch (error) {
        log('❌ Error checking games', error);
        return;
    };
    checkChance();
    nextCheck = new Date().getTime() + 60000;
    setTimeout(() => checkGames(true), 60000);
    return;
};

client.once('ready', async () => {
    log(`✅ Logged into Discord as ${client.user.tag}!`);
    setName(config.discord.categoryId, "🟢 online");
    if (process.env.cookie) {
        const login = await roblox.login(process.env.cookie);
        log(`✅ Logged into Roblox as ${login.displayName} (@${login.name})!`);
    };
    for (let evt of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
        process.on(evt, async () => {
            await setName(config.discord.categoryId, "🔴 offline");
            process.exit(1);
        });
    };
    await checkGames();
});
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.commandName == "status") return;
    await interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle(config.discord.name)
            .setColor(0xe91e63)
            .addFields(...universeIds.map(id => ({
                name: config.games[id].displayName,
                value: `Last updated: <t:${Math.floor(data[id].lastUpdated / 1000)}:R>\nUpdates today: ${data[id].updateCount.today}\nUpdates yesterday: ${data[id].updateCount.yesterday}`
            })), { name: "Chance of updating", value: chance.text }, { name: "Version", value: version }, { name: "Next Check", value: `<t:${Math.floor(nextCheck / 1000)}:R>` })
            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` })]
    });
});
validateGameData();
client.login(process.env.token);