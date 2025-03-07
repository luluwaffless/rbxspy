import config from "./config.js";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, GatewayIntentBits, ActivityType, EmbedBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from "discord.js";
(async () => {
    const { default: locale } = await import(`./locale/${config.locale}.js`);
    dotenv.config();
    const app = express();
    app.use(express.static("public"));
    const version = readFileSync("version", "utf8");
    let updateNeeded = false;
    let last = JSON.parse(readFileSync("last.json", "utf8"));
    const saveLast = () => writeFileSync("last.json", JSON.stringify(last));
    let probability = JSON.parse(readFileSync("probability.json", "utf8"));
    const saveProbability = () => writeFileSync("probability.json", JSON.stringify(probability));
    let sessionInfo = { checks: { testers: 0, updates: 0, topics: 0, status: 0, probability: 0 }, probability: locale.probability[5], testupd: 0, mainupd: 0, newTopics: 0, erd: 0, efd: 0, esm: 0, ce: 0, tsit: [], lastStatusBegin: "", lastStatus: -1, lastLocation: "", placeId: null, gameId: null, status: 0, startTime: new Date().toISOString(), nextChecks: { testers: "", updates: "", topics:"", status: "", probability: "" } };
    async function log(data, error) {
        return appendFileSync(`${error ? "errors" : "logs"}.txt`, `[${new Date().toISOString()}] ${data}\n`);
    };
    let gameChannel;
    let devChannel;
    const send = async (c, m) => await c.send(m).then((msg) => { msg.crosspost(); }).catch((err) => {
        sessionInfo.esm += 1;
        log(`❌ Error sending message: ${err.message}, ${err.stack || 'no stack trace available'}`, true);
    });
    function timeSince(isostr) {
        const timestamp = new Date(isostr).getTime();
        const now = new Date().getTime();
        const diff = now - timestamp;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        let parts = [];
        if (hours && hours > 0) parts.push(`${hours} ${locale.hours(hours)}`);
        if (minutes && minutes > 0) parts.push(`${minutes} ${locale.minutes(minutes)}`);
        if (seconds && seconds > 0) parts.push(`${seconds} ${locale.seconds(seconds)}`);
        return parts.length > 0 ? parts.join(", ") : locale.now;
    };
    async function downloadImageAsBuffer(url) {
        const response = await axios({
            url,
            responseType: 'arraybuffer'
        });
        return Buffer.from(response.data);
    };
    async function combineImages(imageUrls) {
        const sharpImages = [];
        for (let url of imageUrls) {
            const imageBuffer = await downloadImageAsBuffer(url);
            sharpImages.push(sharp(imageBuffer));
        }
        const { height } = await sharpImages[0].metadata();
        const resizedImagesBuffers = await Promise.all(
            sharpImages.map(image => image.resize({ height }).toBuffer({ resolveWithObject: true }))
        );
        const totalWidth = resizedImagesBuffers.reduce((sum, { info }) => sum + info.width, 0);
        const combinedHeight = resizedImagesBuffers[0].info.height;
        const combinedImageBuffer = await sharp({
            create: {
                width: totalWidth,
                height: combinedHeight,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 0 }
            }
        }).composite(resizedImagesBuffers.map((bufferObj, i) => ({
            input: bufferObj.data,
            left: resizedImagesBuffers.slice(0, i).reduce((sum, b) => sum + b.info.width, 0),
            top: 0
        }))).png().toBuffer();
        return combinedImageBuffer;
    };
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    app.get("/logs", (_, res) => {
        res.sendFile(path.join(__dirname, "./logs.txt"));
    });
    app.get("/last", (_, res) => {
        res.sendFile(path.join(__dirname, "./last.json"));
    });
    app.get("/version", (_, res) => {
        res.json({version: version, updateNeeded: updateNeeded});
    });
    app.get("/info", (_, res) => {
        res.json(sessionInfo);
    });
    app.get("/config", function(_, res) {
        res.json(config);
    });
    app.get("/check", async function (req, res) {
        if (req.query.check == "testers") {
            await checkTesters(true);
        } else if (req.query.check == "updates") {
            await checkUpdates(true);
        } else if (req.query.check == "topics") {
            await checkTopics(true);
            (true);
        } else if (req.query.check == "status") {
            await checkStatus(true);
        };
        res.json(sessionInfo);
    });
    app.get("/advertise", (_, res) => {
        advertise();
        res.sendStatus(200);
    });

    const statusEmoji = ['⚫', '🔵', '🟢', '🟠', '❔'];
    async function checkProbability(individual) {
        const now = new Date();
        const hour = now.getUTCHours();
        const minute = now.getUTCMinutes();
        if (hour !== 0 || minute !== 0) {
            let estimate = 0;
            if (hour > 23 || hour < 11) estimate += 10;
            Object.keys(probability).forEach((category) => {
                const { yesterday, today } = probability[category];
                const total = yesterday + today;
                if (category === "main" && total > 0) {
                    estimate /= 2;
                } else if (total >= 5) {
                    estimate += 40;
                } else if (total === 4) {
                    estimate += 30;
                } else if (total === 3) {
                    estimate += 20;
                };
            });
            estimate = estimate > 100 ? 6
                : estimate >= 80 ? 5
                : estimate >= 60 ? 4
                : estimate >= 40 ? 3
                : estimate >= 20 ? 2
                : estimate > 0 ? 1
                : 0;
            sessionInfo.probability = locale.probability[estimate];
        } else if (now.getUTCSeconds() > 30) {
            Object.keys(probability).forEach((key) => {
                probability[key].yesterday = probability[key].today;
                probability[key].today = 0;
            });
            saveProbability();
        };
        sessionInfo.checks.probability += 1;
        if (!individual) sessionInfo.nextChecks.probability = new Date(new Date().getTime() + 60000).toISOString();
        await updateStatus();
    };
    async function checkTesters(individual) {
        await axios.get(`https://games.roblox.com/v1/games/${config.testGame.placeId}/servers/0?sortOrder=2&excludeFullGames=false&limit=10`, { "headers": { "accept": "application/json" } })
            .then(async instances => {
                if (instances.data["data"]) {
                    if (instances.data.data[0] && instances.data.data[0]["playerTokens"]) {
                        if (instances.data.data[0].playerTokens.length < 1 && sessionInfo.tsit.length == 0) return;
                        let changed = false;
                        let batchData = [];
                        let tokens = [];
                        for (let token of instances.data.data[0].playerTokens) {
                            if (!sessionInfo.tsit.includes(token)) {
                                changed = true;
                                sessionInfo.tsit.push(token);
                            };
                            tokens.push(token);
                            batchData.push({ "requestId": `0:${token}:AvatarHeadshot:150x150:png:regular`, "targetId": 0, "token": token, "type": "AvatarHeadShot", "size": "150x150", "format": "png" });
                        };
                        for (let i = 0; i < sessionInfo.tsit.length; i++) {
                            if (!tokens.includes(sessionInfo.tsit[i])) {
                                changed = true;
                                sessionInfo.tsit.splice(i, 1);
                            };
                        };
                        if (changed) {
                            await axios.post("https://thumbnails.roblox.com/v1/batch", batchData, { "headers": { "accept": "application/json", "Content-Type": "application/json" } })
                                .then(async batches => {
                                    if (batches.data["data"] && batches.data.data.length > 0) {
                                        let imageUrls = [];
                                        for (let batch of batches.data.data) imageUrls.push(batch.imageUrl);
                                        const combinedImageBuffer = await combineImages(imageUrls);
                                        const image = new AttachmentBuilder(combinedImageBuffer, { name: 'image.png' })
                                        send(gameChannel, {content: locale.devsinindev(
                                            config.testGame.displayName, 
                                            config.testGame.placeId, 
                                            sessionInfo.probability,
                                            config.discord.pings.testerPing
                                        ), files: [image]});
                                    } else {
                                        sessionInfo.erd += 1;
                                        log("❌ Line 130: Error reading data: " + JSON.stringify(batches.data), true);
                                    };
                                })
                                .catch(error => {
                                    sessionInfo.efd += 1;
                                    log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
                                });
                        };
                    } else if (sessionInfo.tsit.length > 0) {
                        send(gameChannel, locale.devsleft(
                            config.testGame.displayName, 
                            config.testGame.placeId, 
                            sessionInfo.probability,
                            config.discord.pings.testerPing
                        ));
                        sessionInfo.tsit = [];
                    };
                } else {
                    sessionInfo.erd += 1;
                    log("❌ Line 151: Error reading data: " + JSON.stringify(instances.data), true);
                };
            })
            .catch(error => {
                sessionInfo.efd += 1;
                log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
            });
        sessionInfo.checks.testers += 1;
        if (!individual) sessionInfo.nextChecks.testers = new Date(new Date().getTime() + 120000).toISOString();
        await updateStatus();
    };
    async function checkUpdates(individual) {
        await axios.get(`https://games.roblox.com/v1/games?universeIds=${config.mainGame.universeId}`, { "headers": { "accept": "application/json" } })
            .then(response => {
                if (response.data["data"] && response.data.data[0] && response.data.data[0]["updated"]) {
                    if (response.data.data[0].updated != last.updated.main && (new Date(response.data.data[0].updated).getTime() > new Date(last.updated.main).getTime() + 1000)) {
                        log(`✅ ${config.mainGame.name.toUpperCase()} updated. From ${last.updated.main} to ${response.data.data[0].updated}.`);
                        probability.main.today++;
                        saveProbability();
                        last.updated.main = response.data.data[0].updated;
                        saveLast();
                        sessionInfo.mainupd++;
                        axios.get(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${config.mainGame.universeId}&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false`, { "headers": { "accept": "application/json" } })
                            .then(image => {
                                if (image.data["data"] && image.data.data[0] && image.data.data[0]["imageUrl"]) {
                                    send(gameChannel, locale.mainupdimg(
                                        config.mainGame.displayName, 
                                        config.mainGame.placeId, 
                                        response.data.data[0].description, 
                                        image.data.data[0].imageUrl, 
                                        timeSince(response.data.data[0].updated), 
                                        config.discord.pings.mainUpdPing
                                    ));
                                } else {
                                    sessionInfo.erd += 1;
                                    log("❌ Line 183: Error reading data: " + JSON.stringify(image.data), true);
                                    send(gameChannel, locale.mainupd(
                                        config.mainGame.displayName, 
                                        config.mainGame.placeId, 
                                        response.data.data[0].description, 
                                        timeSince(response.data.data[0].updated), 
                                        config.discord.pings.mainUpdPing
                                    ));
                                }
                            })
                            .catch(error => {
                                sessionInfo.efd += 1;
                                log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
                            });
                    };
                } else {
                    sessionInfo.erd += 1;
                    log("❌ Line 194: Error reading data: " + JSON.stringify(response.data), true);
                };
            })
            .catch(error => {
                sessionInfo.efd += 1;
                log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
            });
        await axios.get(`https://games.roblox.com/v1/games?universeIds=${config.testGame.universeId}`, { "headers": { "accept": "application/json" } })
            .then(async response => {
                if (response.data["data"] && response.data.data[0] && response.data.data[0]["updated"]) {
                    if (response.data.data[0].updated != last.updated.test && (new Date(response.data.data[0].updated).getTime() > new Date(last.updated.test).getTime() + 1000)) {
                        log(`✅ ${config.testGame.name.toUpperCase()} updated. From ${last.updated.test} to ${response.data.data[0].updated}.`);
                        probability.test.today++;
                        saveProbability();
                        last.updated.test = response.data.data[0].updated;
                        saveLast();
                        sessionInfo.testupd += 1;
                        send(gameChannel, locale.testupd(
                            config.testGame.displayName, 
                            config.testGame.placeId, 
                            timeSince(response.data.data[0].updated), 
                            sessionInfo.probability,
                            config.discord.pings.testUpdPing
                        ));
                    };
                } else {
                    sessionInfo.erd += 1;
                    log("❌ Line 161: Error reading data: " + JSON.stringify(response.data), true);
                };
            })
            .catch(error => {
                sessionInfo.efd += 1;
                log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
            });
        sessionInfo.checks.updates += 1;
        if (!individual) sessionInfo.nextChecks.updates = new Date(new Date().getTime() + 60000).toISOString();
        await updateStatus();
    };
    async function checkTopics(individual) {
        await axios.get(`https://devforum.roblox.com/topics/created-by/${config.leadDev.username.toLowerCase()}.json`)
            .then(function (response) {
                if (response.data["topic_list"] && response.data.topic_list["topics"]) {
                    response.data.topic_list.topics.forEach(function(topic) {
                        if (!last.topics.includes(topic.id)) {
                            last.topics.push(topic.id);
                            log(`📰 New topic by ${config.leadDev.username}. https://devforum.roblox.com/t/${topic.slug}/${topic.id}`);
                            saveLast();
                            sessionInfo.newTopics += 1;
                            send(devChannel, locale.newtopic(
                                config.leadDev.preDisplay, 
                                config.leadDev.username, 
                                topic.slug, 
                                topic.id, 
                                timeSince(topic.created_at), 
                                sessionInfo.probability,
                                config.discord.pings.topicsPing
                            ));
                        };
                    });
                } else {
                    sessionInfo.erd += 1;
                    log("❌ Line 231: Error reading data: " + JSON.stringify(response.data), true);
                }
            })
            .catch(function (error) {
                sessionInfo.efd += 1;
                log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
            });
        await axios.get(`https://devforum.roblox.com/u/${config.leadDev.username.toLowerCase()}.json`)
            .then(async function (response) {
                if (response.data["user"] && response.data.user["last_seen_at"]) {
                    if (response.data.user.last_seen_at != last.onlineindevforum && (new Date(response.data.user.last_seen_at).getTime() > new Date(last.onlineindevforum).getTime() + 600000)) {
                        send(devChannel, locale.onlineindevforum(
                            config.leadDev.preDisplay, 
                            config.leadDev.displayName,
                            config.leadDev.username,
                            sessionInfo.probability,
                            config.discord.pings.topicsPing
                        ));
                    };
                    last.onlineindevforum = response.data.user.last_seen_at;
                    saveLast();
                } else {
                    sessionInfo.erd += 1;
                    log("❌ Line 312: Error reading data: " + JSON.stringify(response.data), true);
                }
            })
            .catch(function (error) {
                sessionInfo.efd += 1;
                log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
            });
        sessionInfo.checks.topics += 1;
        if (!individual) sessionInfo.nextChecks.topics = new Date(new Date().getTime() + 60000).toISOString();
        await updateStatus();
    };
    async function checkStatus(individual) {
        await axios.post("https://presence.roblox.com/v1/presence/users", { "userIds": [config.leadDev.userId] }, {
            headers: {
                "accept": "application/json",
                "Content-Type": "application/json",
                "Cookie": process.env.cookie
            }, withCredentials: true
        })
            .then(function (response) {
                if (response.data["userPresences"] && response.data.userPresences[0] && !isNaN(response.data.userPresences[0]["userPresenceType"])) {
                    if (sessionInfo.status != response.data.userPresences[0].userPresenceType || sessionInfo.gameId != response.data.userPresences[0].gameId) {
                        log(`🔎 ${config.leadDev.username}'s status changed from ${sessionInfo.status} to ${response.data.userPresences[0].userPresenceType}`);
                        sessionInfo.lastStatus = sessionInfo.status;
                        sessionInfo.status = response.data.userPresences[0].userPresenceType;
                        sessionInfo.placeId = response.data.userPresences[0].placeId;
                        sessionInfo.gameId = response.data.userPresences[0].gameId;
                        if (sessionInfo.status === 3) { probability.studio.today++; saveProbability(); };
                        if (response.data.userPresences[0].userPresenceType === 2 && response.data.userPresences[0].placeId && response.data.userPresences[0].gameId) {
                            const button = new ButtonBuilder()
                                .setLabel(locale.join)
                                .setURL(`https://deepblox.onrender.com/experiences/start?placeId=${response.data.userPresences[0].placeId}&gameInstanceId=${response.data.userPresences[0].gameId}`)
                                .setStyle(ButtonStyle.Link);
                            const row = new ActionRowBuilder()
                                .addComponents(button);
                            send(devChannel, {
                                content: locale.joinedgame(
                                    config.leadDev.preDisplay, 
                                    config.leadDev.displayName, 
                                    config.leadDev.userId, 
                                    response.data.userPresences[0].lastLocation, 
                                    response.data.userPresences[0].placeId, 
                                    sessionInfo.lastStatus, 
                                    sessionInfo.lastStatus == 2 
                                        ? `${locale.playing} ${sessionInfo.lastLocation}` 
                                        : locale.statusText[sessionInfo.lastStatus], 
                                    timeSince(sessionInfo.lastStatusBegin),
                                    sessionInfo.probability,
                                    config.discord.pings.statusPing
                                ),
                                components: [row]
                            });
                        } else send(devChannel, locale.changedstatus(
                            statusEmoji[sessionInfo.status], 
                            locale.statusText[sessionInfo.status], 
                            config.leadDev.preDisplay, 
                            config.leadDev.displayName, 
                            config.leadDev.userId, 
                            sessionInfo.lastLocation,
                            sessionInfo.lastStatus, 
                            sessionInfo.lastStatus == 2 
                                ? `${locale.playing} ${sessionInfo.lastLocation}` 
                                : locale.statusText[sessionInfo.lastStatus], 
                            timeSince(sessionInfo.lastStatusBegin), 
                            sessionInfo.status, 
                            sessionInfo.probability,
                            config.discord.pings.studioPing, 
                            config.discord.pings.statusPing
                        ));
                        sessionInfo.lastLocation = response.data.userPresences[0].lastLocation;
                        sessionInfo.lastStatusBegin = new Date().toISOString();
                    };
                } else {
                    sessionInfo.erd += 1;
                    log("❌ Line 214: Error reading data: " + JSON.stringify(response.data), true);
                };
            })
            .catch(function (error) {
                sessionInfo.efd += 1;
                log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
            });
        sessionInfo.checks.status += 1;
        if (!individual) sessionInfo.nextChecks.status = new Date(new Date().getTime() + 30000).toISOString();
        await updateStatus();
    };

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    let statusMessage;
    let updating = false;
    async function updateStatus(goingOffline) {
        if (updating) return;
        updating = true;
        const embedFields = locale.embedFields(
            config.discord.serverId,
            config.discord.channels.gameUpdatesId,
            config.leadDev.preDisplay,
            config.leadDev.displayName,
            sessionInfo.tsit.length,
            config.testGame.name, 
            Math.floor(new Date(last.updated.test).getTime() / 1000), 
            config.mainGame.name, 
            Math.floor(new Date(last.updated.main).getTime() / 1000), 
            statusEmoji[sessionInfo.status], 
            locale.statusText[sessionInfo.status], 
            sessionInfo.lastStatus >= 0 
                ? Math.floor(new Date(sessionInfo.lastStatusBegin).getTime() / 1000) 
                : null, 
            sessionInfo.lastStatus >= 0 
                ? statusEmoji[sessionInfo.lastStatus] 
                : null, 
            sessionInfo.lastStatus >= 0 
                ? locale.statusText[sessionInfo.lastStatus] 
                : null,
            sessionInfo.probability,
            {
                probability: Math.floor(new Date(sessionInfo.nextChecks.probability).getTime() / 1000),
                testers: Math.floor(new Date(sessionInfo.nextChecks.testers).getTime() / 1000),
                updates: Math.floor(new Date(sessionInfo.nextChecks.updates).getTime() / 1000),
                topics: Math.floor(new Date(sessionInfo.nextChecks.topics).getTime() / 1000),
                status: Math.floor(new Date(sessionInfo.nextChecks.status).getTime() / 1000)
            }
        );
        const embed = new EmbedBuilder()
            .setColor(goingOffline ? 0xff0000 : 0x00ff00)
            .setTitle(config.discord.displayName)
            .setURL("https://discord.gg/6SMbZn7KtW")
            .setDescription(config.discord.description)
            .addFields(...embedFields)
            .setFooter({ text: `v${version}` });

        if (!statusMessage) {
            const statusChannel = await client.channels.fetch(config.discord.channels.statusId);
            await statusChannel.bulkDelete(await statusChannel.messages.fetch({ limit: 100 }));
            await statusChannel.send({ embeds: [embed] })
                .then(message => {
                    statusMessage = message;
                });
        } else {
            await statusMessage.edit({ embeds: [embed] });
        };
        updating = false;
    };
    async function advertise() {
        const advertiseChannel = await client.channels.fetch(config.discord.channels.advertiseId);
        await advertiseChannel.bulkDelete(await advertiseChannel.messages.fetch({ limit: 100 }));
        await advertiseChannel.send({content: config.advertisement})
            .then(async msg => await msg.react("🩷"));
    };

    async function checkBotUpdates() {
        if (updateNeeded) return;
        await axios.get("https://raw.githubusercontent.com/luluwaffless/ftfspy/refs/heads/main/version")
            .then(function(response) {
                if (response.data.trim() != version.trim()) {
                    updateNeeded = true;
                    console.log(`⚠️ New version v${response.data.trim()}! Please update by using "git pull".`);
                };
            })
            .catch(function (error) {
                sessionInfo.efd += 1;
                log(`❌ Error fetching data: ${error.message}, ${error.stack || 'no stack trace available'}`, true);
            });
    };

    const startUp = (f, t) => { f(); setInterval(f, t * 1000); };
    const changeName = (n, c) => { if (c.name != n) return c.setName(n); };
    client.on('ready', async function () {
        gameChannel = await client.channels.fetch(config.discord.channels.gameUpdatesId);
        devChannel = await client.channels.fetch(config.discord.channels.devUpdatesId);
        const vc = await client.channels.fetch(config.discord.channels.vcStatusId);
        await changeName("bot: online 🟢", vc);
        client.user.setPresence({
            activities: [{
                name: config.discord.status,
                type: ActivityType.Watching
            }],
            status: 'online'
        });
        if (config.checkBotUpdates) startUp(checkBotUpdates, 300);
        if (config.advertise) startUp(advertise, 43200);
        startUp(checkProbability, 60);
        startUp(checkTesters, 120);
        startUp(checkUpdates, 60);
        startUp(checkTopics, 60);
        startUp(checkStatus, 30);
        app.listen(config.port, function () {
            console.log("✅ http://localhost:" + config.port);
        });
        log("🟢 Online");
        for (let evt of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
            process.on(evt, async function () {
                process.stdin.resume();
                await changeName("bot: offline 🔴", vc);
                await updateStatus(true);
                await log("🔴 Offline");
                process.exit();
            });
        };
        process.on('unhandledRejection', (reason, promise) => {
            sessionInfo.ce += 1;
            log(`❌ Unhandled Rejection at ${promise}: ${reason} (${reason.message || 'no message'}, ${reason.stack || 'no stack'})`, true);
        });
        
        process.on('uncaughtException', (err) => {
            sessionInfo.ce += 1;
            log(`❌ Uncaught Exception: ${err.message}, ${err.stack}`, true);
        });
    });
    client.login(process.env.token);
})();