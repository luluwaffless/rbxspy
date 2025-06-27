import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';
dotenv.config();

const { clientId, guildId } = JSON.parse(readFileSync('config.json', 'utf-8')).discord;
const rest = new REST().setToken(process.env.token);
const commands = [
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('shows information on the bot'),
    new SlashCommandBuilder()
        .setName('games')
        .setDescription('shows current saved data on tracked games'),
    new SlashCommandBuilder()
        .setName('users')
        .setDescription('shows current saved data on tracked users')
].map(command => command.toJSON());
(async () => {
    try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    } catch (error) {
        console.error(error);
    };
})();