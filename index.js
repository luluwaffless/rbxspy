import { Client, EmbedBuilder, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import roblox from './roblox.js';
const log = async (data, error, dontSend) => {
    const timestamp = new Date().toISOString();
    if (error) {
        const errorStr = `[${timestamp}] ${data}: ${error.message}, ${error.stack || 'no stack trace available'}\n`;
        console.error(`[${timestamp}] ${data}:`, error);
        appendFileSync(`errors.log`, errorStr);
        if (!dontSend) {
            try {
                const msgStr = `@everyone\n\`\`\`\n${errorStr}\n\`\`\``;
                const channel = await getChannel(config.discord.errorChannelId);
                if (msgStr.length > 2000) {
                    writeFileSync(`message.txt`, errorStr);
                    await channel.send({ content: `@everyone`, files: [new AttachmentBuilder("message.txt")] });
                } else await channel.send(msgStr);
            } catch (err) {
                log(`❌ Couldn't log error to Discord`, err, true);
            };
        };
    } else {
        console.log(`[${timestamp}] ${data}`);
        appendFileSync(`logs.log`, `[${timestamp}] ${data}\n`);
    };
};
const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const config = JSON.parse(readFileSync('config.json', 'utf-8'))
const universeIds = Object.keys(config.games);
const userIds = Object.keys(config.users);
const data = JSON.parse(readFileSync('data.json', 'utf-8'));
const saveData = () => writeFileSync('data.json', JSON.stringify(data));
const baseData = ["lastUpdate", "chance"];
const createGameFormat = () => ({ lastUpdated: 0, rootPlaceId: 0, name: "", description: "", icon: "", updateCount: { today: 0, yesterday: 0 }, gamePasses: [], products: [], badges: [], places: [], thumbnails: [] });
const createUserFormat = () => ({ name: "", displayName: "", hasVerifiedBadge: false, presence: { presence: 0, location: "", placeId: 0, rootPlaceId: 0, gameId: "", universeId: 0, lastActivity: 0 } });
const validateData = () => {
    universeIds.forEach(id => {
        if (data[id] && Object.keys(createGameFormat()).every(key => data[id][key] !== undefined)) return;
        data[id] = createGameFormat();
        saveData();
        log(`✅ Game data for universe ${id} initialized.`);
    });
    userIds.forEach(id => {
        if (data[id] && Object.keys(createUserFormat()).every(key => data[id][key] !== undefined)) return;
        data[id] = createUserFormat();
        saveData();
        log(`✅ Game data for user ${id} initialized.`);
    });
};

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
const username = id => `${data[id].displayName === data[id].name ? `@${data[id].name}` : `${data[id].displayName} (@${data[id].name})`}${data[id].hasVerifiedBadge ? " ☑️" : ""}`;
const duration = (start, end) => {
    let durationMs = Math.abs(end - start);
    const seconds = Math.floor((durationMs / 1000) % 60);
    const minutes = Math.floor((durationMs / (1000 * 60)) % 60);
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const parts = [];
    if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    if (seconds || parts.length === 0) parts.push(`${seconds} second${seconds === 1 ? '' : 's'}`);
    if (parts.length === 1) {
        return parts[0];
    } else if (parts.length === 2) {
        return parts.join(' and ');
    } else {
        return parts.slice(0, -1).join(', ') + ' and ' + parts.slice(-1);
    };
};

const chances = [{ color: 0xe74c3c, text: "Impossible" }, { color: 0xe67e22, text: "Low" }, { color: 0xf1c40f, text: "Average" }, { color: 0x2ecc71, text: "High" }, { color: 0x3498db, text: "Very high" }, { color: 0x9b59b6, text: "Extremely high" }];
const presenceTypes = [{ text: "Offline", color: 0x202020 }, { text: "Online", color: 0x3498db }, { text: "Playing", color: 0x2ecc71 }, { text: "In Studio", color: 0xe67e22 }, { text: "Invisible", color: 0x808080 }];
let nextCheck = 0;
const check = async () => {
    try {
        if (universeIds.length > 0) { // games
            const universes = await roblox.getGames(universeIds);
            const thumbnails = await roblox.getGameThumbnails(universeIds);
            const icons = await roblox.getThumbnails(universeIds.map(targetId => roblox.generateBatch(targetId, roblox.thumbnailTypes.GameIcon)));
            for (const { id, rootPlaceId, updated, description, name } of universes) {
                // changes
                const icon = icons.find(icon => icon.targetId == id)?.imageUrl || "";
                if (data[id].name !== name || data[id].description !== description || (data[id].icon !== icon && icon.endsWith("noFilter"))) {
                    const changesEmbed = new EmbedBuilder()
                        .setColor(0x1abc9c)
                        .setTitle(`${config.games[id].name} changed!`)
                        .setURL(`https://www.roblox.com/games/${rootPlaceId}`)
                        .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                    if (data[id].name !== name) {
                        data[id].name = name;
                        const gameName = name ?? "";
                        changesEmbed.addFields({ name: "New Name", value: gameName.length > 1024 ? `${gameName.slice(0, 1021)}...` : gameName });
                    };
                    if (data[id].description !== description) {
                        data[id].description = description;
                        const gameDescription = description ?? "";
                        changesEmbed.addFields({ name: "New Description", value: gameDescription.length > 1024 ? `${gameDescription.slice(0, 1021)}...` : gameDescription });
                    };
                    if (data[id].icon !== icon && icon.endsWith("noFilter")) {
                        data[id].icon = icon;
                        changesEmbed.setImage(icon);
                    };
                    log(`✅ Game ${config.games[id].name} changed!`);
                    saveData();
                    const channel = await getChannel(config.games[id].discord.channelId);
                    await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [changesEmbed] });
                };

                // updates
                const updatedDate = new Date(updated);
                if (data[id].rootPlaceId !== rootPlaceId) data[id].rootPlaceId = rootPlaceId;
                if (data[id].lastUpdated < updatedDate.getTime() - 10000) {
                    log(`✅ Game ${config.games[id].name} updated! From ${new Date(data[id].lastUpdated).toISOString()} to ${updatedDate.toISOString()}`);
                    const embed = new EmbedBuilder()
                        .setColor(0x2ecc71)
                        .setTitle(`${config.games[id].name} updated!`)
                        .setURL(`https://www.roblox.com/games/${rootPlaceId}`)
                        .setDescription(`<t:${Math.floor(updatedDate.getTime() / 1000)}:D> at <t:${Math.floor(updatedDate.getTime() / 1000)}:T> (<t:${Math.floor(updatedDate.getTime() / 1000)}:R>)`)
                        .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                    data[id].lastUpdated = updatedDate.getTime();
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
                            log(`✅ Thumbnail for game ${config.games[id].name} (${targetId}) created! ID: ${targetId}`);
                            data[id].thumbnails.push(targetId);
                            saveData();
                            const embed = new EmbedBuilder()
                                .setColor(0xe67e22)
                                .setTitle(`${config.games[id].name} thumbnail created!`)
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
                        gamepassIcons.find(icon => icon.targetId == gamepass.id)?.imageUrl || ""
                    ];
                    const gpIndex = data[id].gamePasses.findIndex(gp => gp.id === gamepassId);
                    if (gpIndex === -1) {
                        log(`✅ Gamepass ${gamepassName} (${gamepassId}) created for game ${config.games[id].name}!`);
                        data[id].gamePasses.push({ id: gamepassId, name: gamepassName, price: gamepassPrice, description: gamepassDescription, icon: gamepassIcon });
                        saveData();
                        const embed = new EmbedBuilder()
                            .setColor(0x3498db)
                            .setTitle(`${config.games[id].name} gamepass created!`)
                            .setURL(`https://www.roblox.com/game-pass/${gamepassId}`)
                            .addFields({ name: "Name", value: gamepassName }, { name: "Price", value: gamepassPrice ? `${gamepassPrice} Robux` : "Unavailable" }, { name: "Description", value: gamepassDescription.length > 1024 ? `${gamepassDescription.slice(0, 1021)}...` : gamepassDescription })
                            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                        if (gamepassIcon) embed.setThumbnail(gamepassIcon);
                        const channel = await getChannel(config.games[id].discord.channelId);
                        await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                    } else {
                        const existingGamepass = data[id].gamePasses[gpIndex];
                        if (existingGamepass.name !== gamepassName || existingGamepass.price !== gamepassPrice || existingGamepass.description !== gamepassDescription || (existingGamepass.icon !== gamepassIcon && gamepassIcon.endsWith("noFilter"))) {
                            log(`✅ Gamepass ${gamepassName} (${gamepassId}) updated for game ${config.games[id].name}!`);
                            const embed = new EmbedBuilder()
                                .setColor(0x3498db)
                                .setTitle(`${config.games[id].name} gamepass updated!`)
                                .setURL(`https://www.roblox.com/game-pass/${gamepassId}`)
                                .addFields({ name: "Name", value: existingGamepass.name })
                                .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                            if (existingGamepass.icon !== gamepassIcon && gamepassIcon.endsWith("noFilter")) {
                                embed.setThumbnail(gamepassIcon);
                                data[id].gamePasses[gpIndex].icon = gamepassIcon;
                            };
                            if (existingGamepass.name !== gamepassName) {
                                embed.addFields({ name: "New Name", value: gamepassName });
                                data[id].gamePasses[gpIndex].name = gamepassName;
                            };
                            if (existingGamepass.price !== gamepassPrice) {
                                embed.addFields({ name: "New Price", value: gamepassPrice ? `${gamepassPrice} Robux` : "Unavailable" });
                                data[id].gamePasses[gpIndex].price = gamepassPrice;
                            };
                            if (existingGamepass.description !== gamepassDescription) {
                                embed.addFields({ name: "New Description", value: gamepassDescription.length > 1024 ? `${gamepassDescription.slice(0, 1021)}...` : gamepassDescription });
                                data[id].gamePasses[gpIndex].description = gamepassDescription;
                            };
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
                        productIcons.find(icon => icon.targetId == product.DeveloperProductId)?.imageUrl || ""
                    ];
                    const prodIndex = data[id].products.findIndex(p => p.id === productId);
                    if (prodIndex === -1) {
                        log(`✅ Product ${productName} (${productId}) created for game ${config.games[id].name}!`);
                        data[id].products.push({ id: productId, name: productName, price: productPrice, description: productDescription, icon: productIcon });
                        saveData();
                        const embed = new EmbedBuilder()
                            .setColor(0xe74c3c)
                            .setTitle(`${config.games[id].name} product created!`)
                            .setURL(`https://www.roblox.com/developer-products/${productId}`)
                            .addFields({ name: "Name", value: productName }, { name: "Price", value: productPrice ? `${productPrice} Robux` : "Unavailable" }, { name: "Description", value: productDescription.length > 1024 ? `${productDescription.slice(0, 1021)}...` : productDescription })
                            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                        if (productIcon) embed.setThumbnail(productIcon);
                        const channel = await getChannel(config.games[id].discord.channelId);
                        await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                    } else {
                        const existingProduct = data[id].products[prodIndex];
                        if (existingProduct.name !== productName || existingProduct.price !== productPrice || existingProduct.description !== productDescription || (existingProduct.icon !== productIcon && productIcon.endsWith("noFilter"))) {
                            log(`✅ Product ${productName} (${productId}) updated for game ${config.games[id].name}!`);
                            const embed = new EmbedBuilder()
                                .setColor(0x3498db)
                                .setTitle(`${config.games[id].name} product updated!`)
                                .setURL(`https://www.roblox.com/developer-products/${productId}`)
                                .addFields({ name: "Name", value: existingProduct.name })
                                .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                            if (existingProduct.icon !== productIcon && productIcon.endsWith("noFilter")) {
                                embed.setThumbnail(productIcon);
                                data[id].products[prodIndex].icon = productIcon;
                            };
                            if (existingProduct.name !== productName) {
                                embed.addFields({ name: "New Name", value: productName });
                                data[id].products[prodIndex].name = productName;
                            };
                            if (existingProduct.price !== productPrice) {
                                embed.addFields({ name: "New Price", value: productPrice ? `${productPrice} Robux` : "Unavailable" });
                                data[id].products[prodIndex].price = productPrice;
                            };
                            if (existingProduct.description !== productDescription) {
                                embed.addFields({ name: "New Description", value: productDescription.length > 1024 ? `${productDescription.slice(0, 1021)}...` : productDescription });
                                data[id].products[prodIndex].description = productDescription;
                            };
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
                        badgeIcons.find(icon => icon.targetId == badge.id)?.imageUrl || ""
                    ];
                    const badgeIndex = data[id].badges.findIndex(b => b.id === badgeId);
                    if (badgeIndex === -1) {
                        data[id].badges.push({ id: badgeId, name: badgeName, description: badgeDescription, icon: badgeIcon });
                        saveData();
                        const embed = new EmbedBuilder()
                            .setColor(0xf1c40f)
                            .setTitle(`${config.games[id].name} badge created!`)
                            .setURL(`https://www.roblox.com/badges/${badgeId}`)
                            .addFields({ name: "Name", value: badgeName }, { name: "Description", value: badgeDescription.length > 1024 ? `${badgeDescription.slice(0, 1021)}...` : badgeDescription })
                            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                        if (badgeIcon && badgeIcon.endsWith("noFilter")) embed.setThumbnail(badgeIcon);
                        const channel = await getChannel(config.games[id].discord.channelId);
                        await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                    } else {
                        const existingBadge = data[id].badges[badgeIndex];
                        if (existingBadge.name !== badgeName || existingBadge.description !== badgeDescription || (existingBadge.icon !== badgeIcon && badgeIcon.endsWith("noFilter"))) {
                            const embed = new EmbedBuilder()
                                .setColor(0xf1c40f)
                                .setTitle(`${config.games[id].name} badge updated!`)
                                .setURL(`https://www.roblox.com/badges/${badgeId}`)
                                .addFields({ name: "Name", value: existingBadge.name })
                                .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                            if (existingBadge.icon !== badgeIcon && badgeIcon.endsWith("noFilter")) {
                                embed.setThumbnail(badgeIcon);
                                data[id].badges[badgeIndex].icon = badgeIcon;
                            };
                            if (existingBadge.name !== badgeName) {
                                embed.addFields({ name: "New Name", value: badgeName });
                                data[id].badges[badgeIndex].name = badgeName;
                            };
                            if (existingBadge.description !== badgeDescription) {
                                embed.addFields({ name: "New Description", value: badgeDescription.length > 1024 ? `${badgeDescription.slice(0, 1021)}...` : badgeDescription });
                                data[id].badges[badgeIndex].description = badgeDescription;
                            };
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
                        placeIcons.find(icon => icon.targetId == place.id)?.imageUrl || ""
                    ];
                    if (placeId === rootPlaceId) continue;
                    const placeIndex = data[id].places.findIndex(p => p.id === placeId);
                    if (placeIndex === -1) {
                        log(`✅ Place ${placeName} (${placeId}) created for game ${config.games[id].name}!`);
                        data[id].places.push({ id: placeId, name: placeName, description: placeDescription, icon: placeIcon });
                        saveData();
                        const embed = new EmbedBuilder()
                            .setColor(0x9b59b6)
                            .setTitle(`${config.games[id].name} place created!`)
                            .setURL(`https://www.roblox.com/games/${placeId}`)
                            .addFields({ name: "Name", value: placeName }, { name: "Description", value: placeDescription.length > 1024 ? `${placeDescription.slice(0, 1021)}...` : placeDescription })
                            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                        if (placeIcon && placeIcon.endsWith("noFilter")) embed.setThumbnail(placeIcon);
                        const channel = await getChannel(config.games[id].discord.channelId);
                        await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                    } else {
                        const existingPlace = data[id].places[placeIndex];
                        if (existingPlace.name !== placeName || existingPlace.description !== placeDescription || (existingPlace.icon !== placeIcon && placeIcon.endsWith("noFilter"))) {
                            log(`✅ Place ${placeName} (${placeId}) updated for game ${config.games[id].name}!`);
                            const embed = new EmbedBuilder()
                                .setColor(0x9b59b6)
                                .setTitle(`${config.games[id].name} place updated!`)
                                .setURL(`https://www.roblox.com/games/${placeId}`)
                                .addFields({ name: "Name", value: existingPlace.name })
                                .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                            if (existingPlace.icon !== placeIcon && placeIcon.endsWith("noFilter")) {
                                embed.setThumbnail(placeIcon);
                                data[id].places[placeIndex].icon = placeIcon;
                            };
                            if (existingPlace.name !== placeName) {
                                embed.addFields({ name: "New Name", value: placeName });
                                data[id].places[placeIndex].name = placeName;
                            };
                            if (existingPlace.description !== placeDescription) {
                                embed.addFields({ name: "New Description", value: placeDescription.length > 1024 ? `${placeDescription.slice(0, 1021)}...` : placeDescription });
                                data[id].places[placeIndex].description = placeDescription;
                            };
                            saveData();
                            const channel = await getChannel(config.games[id].discord.channelId);
                            await channel.send({ content: `-# ||<@&${config.games[id].discord.roleId}>||`, embeds: [embed] });
                        };
                    };
                };
            };
        };

        if (userIds.length > 0) { // users
            const userIcons = await roblox.getThumbnails(userIds.map(targetId => roblox.generateBatch(targetId, roblox.thumbnailTypes.AvatarHeadShot)));
            const users = await roblox.getUsers(userIds);
            // profile changes
            for (const { hasVerifiedBadge, id, name, displayName } of users) {
                if (data[id].name !== name || data[id].displayName !== displayName || data[id].hasVerifiedBadge !== hasVerifiedBadge) {
                    log(`✅ User ${username(id)} [${id}] data updated!`);
                    const userIcon = userIcons.find(i => i.targetId == id)?.imageUrl || "";
                    const embed = new EmbedBuilder()
                        .setColor(0x1abc9c)
                        .setAuthor({ name: username(id), iconURL: userIcon, url: `https://www.roblox.com/users/${id}/profile` })
                        .setTitle(`${username(id)} profile changed!`)
                        .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                    if (data[id].name !== name) {
                        embed.addFields({ name: "New Name", value: name });
                        data[id].name = name;
                    };
                    if (data[id].displayName !== displayName) {
                        embed.addFields({ name: "New Display Name", value: displayName });
                        data[id].displayName = displayName;
                    };
                    if (data[id].hasVerifiedBadge !== hasVerifiedBadge) {
                        embed.addFields({ name: "Verified Badge", value: hasVerifiedBadge ? "Yes" : "No" });
                        data[id].hasVerifiedBadge = hasVerifiedBadge;
                    };
                    saveData();
                    const channel = await getChannel(config.users[id].discord.channelId);
                    await channel.send({
                        content: `-# ||<@&${config.users[id].discord.allRoleId}> <@&${config.users[id].discord.relevantRoleId}>||`,
                        embeds: [embed]
                    });
                };
            };

            // presence
            const presences = await roblox.getPresences(userIds);
            for (const { userPresenceType, lastLocation, placeId, rootPlaceId, gameId, universeId, userId } of presences) {
                if (userPresenceType != data[userId].presence.presence || lastLocation != data[userId].presence.location || placeId != data[userId].presence.placeId || rootPlaceId != data[userId].presence.rootPlaceId || gameId != data[userId].presence.gameId || universeId != data[userId].presence.universeId) {
                    const currentPresence = presenceTypes[userPresenceType];
                    const previousPresence = presenceTypes[data[userId].presence.presence];
                    log(`✅ User ${username(userId)} [${userId}] is now ${currentPresence.text.toLowerCase()}${userPresenceType === 2 && lastLocation ? ` ${lastLocation}` : ""}!`);
                    const userIcon = userIcons.find(i => i.targetId == userId)?.imageUrl || "";
                    const time = new Date().getTime();
                    const embed = new EmbedBuilder()
                        .setColor(currentPresence.color)
                        .setAuthor({ name: username(userId), iconURL: userIcon, url: `https://www.roblox.com/users/${userId}/profile` })
                        .setTitle(`${username(userId)} is now ${currentPresence.text.toLowerCase()}${userPresenceType === 2 && lastLocation ? ` ${lastLocation}` : ""}!`)
                        .setURL(userPresenceType === 2 && placeId ? `https://www.roblox.com/games/${placeId}` : null)
                        .setDescription(`Was ${previousPresence.text.toLowerCase()}${data[userId].presence.presence === 2 && data[userId].presence.location ? ` ${data[userId].presence.location}` : ""} for ${duration(data[userId].presence.lastActivity, time)}`)
                        .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` });
                    const row = userPresenceType === 2 && placeId && gameId ? new ActionRowBuilder().addComponents(new ButtonBuilder()
                        .setURL(`https://deepblox.vercel.app/experiences/start?placeId=${placeId}&gameInstanceId=${gameId}`)
                        .setStyle(ButtonStyle.Link)
                        .setLabel("Join")
                        .setEmoji("🎮")) : null;
                    data[userId].presence = { presence: userPresenceType, location: lastLocation, placeId: placeId, rootPlaceId: rootPlaceId, gameId: gameId, universeId: universeId, lastActivity: time };
                    saveData();
                    const channel = await getChannel(config.users[userId].discord.channelId);
                    await channel.send({
                        content: `-# ||<@&${config.users[userId].discord.allRoleId}>${row !== null || userPresenceType === 3 ? ` <@&${config.users[userId].discord.relevantRoleId}>` : ""}||`,
                        embeds: [embed],
                        components: row ? [row] : []
                    });
                };
            };
        };
    } catch (error) {
        log('❌ Error checking', error);
        return;
    };
    const now = new Date();
    const time = now.getTime();
    const hour = now.getHours();
    if (!data.lastUpdate || (time - data.lastUpdate) >= 86400000) {
        data.lastUpdate = time;
        Object.keys(data).forEach((id) => {
            if (baseData.includes(id) || data[id].updateCount === undefined) return;
            data[id].updateCount.yesterday = data[id].updateCount.today;
            data[id].updateCount.today = 0;
        });
        saveData();
        log("✅ Update count reset.");
    };
    let estimate = 0;
    if (hour > 23 || hour < 11) estimate += 10;
    Object.keys(data).forEach((id) => {
        if (baseData.includes(id) || data[id].updateCount === undefined) return;
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
    if (!data.chance) data.chance = chances[0];
    if (data.chance.text !== chances[estimate].text) {
        log(`✅ Chance of updating changed! From ${data.chance.text} to ${chances[estimate].text}`);
        data.chance = chances[estimate];
        saveData();
        const chanceChannel = await getChannel(config.discord.chanceChannelId);
        await chanceChannel.send({
            content: `-# ||<@&${config.discord.chanceRoleId}>||`,
            embeds: [new EmbedBuilder()
                .setTitle("Chance of updating changed!")
                .setDescription(data.chance.text)
                .setColor(data.chance.color)
                .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` })
            ]
        });
    };
    return;
};

client.once('ready', async () => {
    log(`✅ Logged into Discord as ${client.user.tag}!`);
    setName(config.discord.categoryId, "🟢 online");
    if (process.env.cookie) {
        try {
            const login = await roblox.login(process.env.cookie);
            log(`✅ Logged into Roblox as ${login.displayName} (@${login.name})!`);
        } catch (error) {
            log('❌ Error logging into Roblox with cookie', error);
            return;
        }
    } else if (userIds.length > 0) {
        log(`⚠️ Tracking users without a cookie, may not work.`);
    };
    await check();
    nextCheck = new Date().getTime() + config.checkInterval;
    setInterval(async () => {
        await check();
        nextCheck = new Date().getTime() + config.checkInterval;
    }, config.checkInterval);
    for (let evt of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
        process.on(evt, async () => {
            await setName(config.discord.categoryId, "🔴 offline");
            process.exit(1);
        });
    };
});
const commands = {
    status: async (interaction) => await interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle(config.discord.name)
            .setColor(0xe91e63)
            .addFields(
                { name: "Version", value: `[${version}](https://github.com/luluwaffless/rbxspy)` },
                { name: "Next Check", value: `<t:${Math.floor(nextCheck / 1000)}:R>` },
                { name: "Next Count Reset", value: `<t:${Math.floor((data.lastUpdate + 86400000) / 1000)}:R>` },
                { name: "Chance of updating", value: data.chance.text }
            )
            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` })]
    }),
    games: async (interaction) => await interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle(`${config.discord.name} | games`)
            .setColor(0xe91e63)
            .setDescription(universeIds.length > 0 ? null : "No games are being tracked at the moment.")
            .addFields(...universeIds.map(id => ({
                name: config.games[id].name,
                value: `**Last updated:** <t:${Math.floor(data[id].lastUpdated / 1000)}:R>\n**Updates today:** ${data[id].updateCount.today}\n**Updates yesterday:** ${data[id].updateCount.yesterday}`
            })))
            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` })]
    }),
    users: async (interaction) => await interaction.reply({
        embeds: [new EmbedBuilder()
            .setTitle(`${config.discord.name} | users`)
            .setColor(0xe91e63)
            .setDescription(userIds.length > 0 ? null : "No users are being tracked at the moment.")
            .addFields(...userIds.map(id => ({
                name: username(id),
                value: `**Current Status:** ${presenceTypes[data[id].presence.presence].text}\n**Last location:** ${data[id].presence.location ? (data[id].presence.placeId && data[id].presence.gameId ? `[${data[id].presence.location}](https://deepblox.vercel.app/experiences/start?placeId=${data[id].presence.placeId}&gameInstanceId=${data[id].presence.gameId})` : data[id].presence.location) : "Unknown"}\n**Last activity:** <t:${Math.floor(data[id].presence.lastActivity / 1000)}:R>`
            })))
            .setFooter({ text: `${config.discord.name} | ${config.discord.invite}` })]
    }),
};
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (!commands[interaction.commandName]) return;
    await commands[interaction.commandName](interaction).catch(error => {
        log('❌ Error replying to interaction', error);
        interaction.reply({ content: '❌ An error occurred while processing your request.', ephemeral: true });
    });
});
process.on('unhandledRejection', (err, promise) => log(`❌ Unhandled rejection at ${promise}`, err));
process.on('uncaughtException', (err) => log(`❌ Uncaught exception`, err));
validateData();
client.login(process.env.token);