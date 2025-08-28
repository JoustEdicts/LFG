import 'dotenv/config';
import express from 'express';
import {
  InteractionType,
  InteractionResponseType,
  InteractionResponseFlags,
  MessageComponentTypes,
  ButtonStyleTypes,
  verifyKeyMiddleware,
} from 'discord-interactions';
import { getRandomEmoji, DiscordRequest } from './utils.js';
import { getShuffledOptions, getResult, getAppIdFromUrl, getSteamHeaderImage } from './game.js';

// Create an express app
const app = express();
// Get port, or default to 3000
const PORT = process.env.PORT || 3000;

// Store for in-progress games. In production, you'd want to use a DB
const activeGames = {};

/**
 * Interactions endpoint URL where Discord will send HTTP requests
 * Parse request body and verifies incoming requests using discord-interactions package
 */
app.post('/interactions', verifyKeyMiddleware(process.env.PUBLIC_KEY), async function (req, res) {
  // Interaction type and data
  const { type, id, data } = req.body;

  /**
   * Handle verification requests
   */
  if (type === InteractionType.PING) {
    return res.send({ type: InteractionResponseType.PONG });
  }

  /**
   * Handle slash command requests
   * See https://discord.com/developers/docs/interactions/application-commands#slash-commands
   */
  if (type === InteractionType.APPLICATION_COMMAND) {
    const { name } = data;

    if (name === 'lfg' && id) {
      // Interaction context
      const context = req.body.context;
      const url = req.body.data.options.find(o => o.name === 'url').value;
      const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
      const appId = getAppIdFromUrl(url);
      const imageUrl = await getSteamHeaderImage(appId);

      // initialize vote store
      activeGames[id] = 
      { 
        yes: new Set(), 
        no: new Set() 
      };

      try
      {
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            flags: InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: `@here, seems like <@${userId}> wants you to check a game out ! ${url}`,
              },
              {
                type: MessageComponentTypes.MEDIA_GALLERY,
                items: [
                  {
                    media:
                    {
                      url: imageUrl
                    },
                  }
                ],
              },
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: '✅ Interested: Nobody yet\n❌ Not Interested: Nobody yet',
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: `vote_yes_${req.body.id}`,
                    label: 'Interested 👍',
                    style: ButtonStyleTypes.SUCCESS,
                  },
                  {
                    type: MessageComponentTypes.BUTTON,
                    custom_id: `vote_no_${req.body.id}`,
                    label: 'Not Interested 👎',
                    style: ButtonStyleTypes.DANGER,
                  }
                ],
              },
            ],
          },
        });
      }
      catch (err)
      {
        console.error(err);
        return res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Something went wrong!' }
        });
      }
    }

    console.error(`unknown command: ${name}`);
    return res.status(400).json({ error: 'unknown command' });
  }

  /**
   * Handle requests from interactive components
   * See https://discord.com/developers/docs/components/using-message-components#using-message-components-with-interactions
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    // custom_id set in payload when sending message component
    const componentId = data.custom_id;

    if (componentId.startsWith('vote_yes_') || componentId.startsWith('vote_no_')) {
      const postId = componentId.split('_').pop();
      const context = req.body.context;
      const userId = context === 0 ? req.body.member.user.id : req.body.user.id;

    if (!activeGames[postId]) {
      activeGames[postId] = { yes: new Set(), no: new Set() };
    }

  // remove from both
  activeGames[postId].yes.delete(userId);
  activeGames[postId].no.delete(userId);

  // add to correct set
  if (componentId.startsWith('vote_yes_')) {
    activeGames[postId].yes.add(userId);
  } else {
    activeGames[postId].no.add(userId);
  }

  // Build result text (using mentions so people see who voted)
  const yesUsers = [...activeGames[postId].yes].map(id => `<@${id}>`).join(', ') || 'Nobody yet';
  const noUsers = [...activeGames[postId].no].map(id => `<@${id}>`).join(', ') || 'Nobody yet';

  const results = `✅ Interested: ${yesUsers}\n❌ Not Interested: ${noUsers}`;

  const components = req.body.message.components.map((c, index) => {
    if (c.type === MessageComponentTypes.TEXT_DISPLAY && index === 2) 
    {
      return { ...c, content: results };
    }
    return c;
  });

  return res.send({
    type: InteractionResponseType.UPDATE_MESSAGE,
    data: { components }
  });
}

    if (componentId.startsWith('accept_button_')) {
      // get the associated game ID
      const gameId = componentId.replace('accept_button_', '');
      // Delete message with token in request body
      const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;
      try {
        await res.send({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            // Indicates it'll be an ephemeral message
            flags: InteractionResponseFlags.EPHEMERAL | InteractionResponseFlags.IS_COMPONENTS_V2,
            components: [
              {
                type: MessageComponentTypes.TEXT_DISPLAY,
                content: 'What is your object of choice?',
              },
              {
                type: MessageComponentTypes.ACTION_ROW,
                components: [
                  {
                    type: MessageComponentTypes.STRING_SELECT,
                    // Append game ID
                    custom_id: `select_choice_${gameId}`,
                    options: getShuffledOptions(),
                  },
                ],
              },
            ],
          },
        });
        // Delete previous message
        await DiscordRequest(endpoint, { method: 'DELETE' });
      } catch (err) {
        console.error('Error sending message:', err);
      }
    } else if (componentId.startsWith('select_choice_')) {
      // get the associated game ID
      const gameId = componentId.replace('select_choice_', '');

      if (activeGames[gameId]) {
        // Interaction context
        const context = req.body.context;
        // Get user ID and object choice for responding user
        // User ID is in user field for (G)DMs, and member for servers
        const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
        const objectName = data.values[0];
        // Calculate result from helper function
        const resultStr = getResult(activeGames[gameId], {
          id: userId,
          objectName,
        });

        // Remove game from storage
        delete activeGames[gameId];
        // Update message with token in request body
        const endpoint = `webhooks/${process.env.APP_ID}/${req.body.token}/messages/${req.body.message.id}`;

        try {
          // Send results
          await res.send({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { 
              flags: InteractionResponseFlags.IS_COMPONENTS_V2,
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: resultStr
                }
              ]
             },
          });
          // Update ephemeral message
          await DiscordRequest(endpoint, {
            method: 'PATCH',
            body: {
              components: [
                {
                  type: MessageComponentTypes.TEXT_DISPLAY,
                  content: 'Nice choice ' + getRandomEmoji()
                }
              ],
            },
          });
        } catch (err) {
          console.error('Error sending message:', err);
        }
      }
    }
    
    return;
  }

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});
