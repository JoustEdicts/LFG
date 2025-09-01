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

const SESSION_POLL_COMMAND = {
  name: 'poll',
  description: 'Poll for game session availability.',
  type: 1, // CHAT_INPUT
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      name: 'game_url',
      description: 'The url of the game to sesh',
      type: 3, // STRING
      required: true,
    },
    {
      name: 'description',
      description: 'The description of the game session.',
      type: 3, // STRING
      required: false,
    },
  ],
}

const SESSION_COMMAND = {
  name: 'session',
  description: 'Set up a game session.',
  type: 1, // CHAT_INPUT
  integration_types: [0, 1],
  contexts: [0, 1, 2],
  options: [
    {
      name: 'game_url',
      description: 'The url of the game to sesh',
      type: 3, // STRING
      required: true,
    },
    {
      name: 'from',
      description: 'Start date & time of the session (YYYY-MM-DD HH:MM)',
      type: 3, // STRING
      required: false,
    },
    {
      name: 'to',
      description: 'End date & time of the session (YYYY-MM-DD HH:MM)',
      type: 3, // STRING
      required: false,
    },
  ],
};

const ALL_COMMANDS = [LFG_COMMAND, LIST_TOP_COMMAND, SESSION_COMMAND, SESSION_POLL_COMMAND];
InstallGuildCommands(process.env.APP_ID, process.env.GUILD_ID, ALL_COMMANDS);
//InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
