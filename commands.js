import 'dotenv/config';
import { InstallGlobalCommands, InstallGuildCommands } from './utils.js';

// Command containing options
const LFG_COMMAND = {
  name: 'lfg',
  description: 'Post a game suggestion.',
  type: 1, // CHAT_INPUT
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      name: 'game_url',
      description: 'The url of the game to share',
      type: 3, // STRING
      required: true,
    },
    {
      name: 'image_url',
      description: 'The url of the image to display',
      type: 3, // STRING
      required: false,
    },
    {
      name: 'game_name',
      description: 'The name of the game to share',
      type: 3, // STRING
      required: false,
    },
  ],
};

const LIST_TOP_COMMAND = {
  name: 'list',
  description: 'List all game suggestions.',
  type: 1, // CHAT_INPUT
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const ALL_COMMANDS = [LFG_COMMAND, LIST_TOP_COMMAND];
//InstallGuildCommands(process.env.APP_ID, process.env.GUILD_ID, ALL_COMMANDS);
InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
