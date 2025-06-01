import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
dotenv.config();

const { clientId, guildId } = JSON.parse(readFileSync('config.json', 'utf-8')).discord;
const rest = new REST().setToken(process.env.token);
(async () => {
	try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [ new SlashCommandBuilder().setName('status').setDescription('shows currently saved data').toJSON() ]});
    } catch (error) {
        console.error(error);
    };
})();