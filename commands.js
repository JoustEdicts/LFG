import 'dotenv/config';
import { getRPSChoices } from './game.js';
import { capitalize, InstallGlobalCommands } from './utils.js';

// Get the game choices from game.js
function createCommandChoices() {
  const choices = getRPSChoices();
  const commandChoices = [];

  for (let choice of choices) {
    commandChoices.push({
      name: capitalize(choice),
      value: choice.toLowerCase(),
    });
  }

  return commandChoices;
}

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
  ],
};

const ALL_COMMANDS = [LFG_COMMAND];
InstallGlobalCommands(process.env.APP_ID, ALL_COMMANDS);
