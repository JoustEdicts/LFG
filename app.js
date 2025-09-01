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
import { DiscordRequest, fetchMessage } from './utils.js';
import { getSteamAppIdFromUrl, getSteamAppNameFromUrl, getSteamHeaderImage, extractYouTubeId, getYouTubeThumbnail } from './game.js';
import { getListedVotes, getUserIdFromPlayerId, getPostsFromGameId, addPost, getGameIdFromTitle, registerPlayer, addGame, getGameTitle, voteForGame, getGameVoteCount, getGameVotes, createSession, getAllSessions, addPlayerToSession, getPlayersInSession, getGameIdFromPostId} from './db.js';

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

  // TODO : add the "session" command to set up a game session on a specific game at a specific time
  // It should ping players that notified their interest of the game via the /lfg command
  // It should :
  //  1) Create a channel for the session, accessible to everyone who voted with interest
  //  2) Create a discord event and ping it to the channel
  //  3) Create a message where players can click a button to RSVP
  if (name === 'session')
  {

  }

  if (name === 'poll')
  {
    // Interaction context
    const interaction = req.body;
    const context = req.body.context;
    const url = req.body.data.options.find(o => o.name === 'game_url').value;
    const desc = req.body.data.options.find(o => o.name === 'description');
    const description = desc?.value || null;
    const userId = context === 0 ? req.body.member.user.id : req.body.user.id;

    const embed = {
      title: `Poll for ${url}`,
      description: description || "No description provided",
      color: 0x5865F2,
      fields: [
        { name: "Time Slots", value: "No slots yet", inline: false }
      ],
    };

    const components = [
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            label: "Add Time Slot",
            style: 1, // Primary
            custom_id: "add_time", // used to identify this button
          },
        ],
      },
    ];

    await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 4, // Channel message with source (sends a message in response)
        data: {
          embeds: [embed],
          components: components, // action rows + buttons
        },
      }),
    });
  }


  // TODO : see how to keep channels clean.
  // Should it be ephemeral ? Should creating the list
  // be a one shot and then refer to the message on command call ?
  // Should the list be paginated ?
  if (name === 'list') {
    const games = getListedVotes();

     if (!games.length) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: "📭 No games have been suggested yet." }
      };
    }

    const embed = {
      title: "Server Game Votes",
      color: 0x5865F2,
      fields: games.map((g, i) => ({
        name: `${i + 1}. ${g.title}`,
        value: `[🔗](${g.url})\t✅ ${g.interested_votes}\t❌ ${g.not_interested_votes}`,
        inline: false, // false makes it full-width, true would put multiple side-by-side
      })),
    };

    const components = games.map((g) => ({
      type: 1, // Action Row
      components: [
        {
          type: 2, // Button
          custom_id: `details_${g.game_id}`,
          label: "See Voters",
          style: 1 // Primary
        }
      ]
    }));

    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        embeds: [embed]
      },
    });
  }

  if (name === 'lfg' && id) {
    try
    {
      const { response, game_id } = await buildGameMessage(id, req, res);
      res.send(response);

      // Fetch the message the bot just created
      const messageRes = await fetch(
        `https://discord.com/api/v10/webhooks/${process.env.APP_ID}/${req.body.token}/messages/@original`
      );
      const messageData = await messageRes.json();

      // messageData.id now contains the Discord message ID
      addPost(game_id, messageData.id, messageData.channel_id);

      return;
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

  if (type === InteractionType.MODAL_SUBMIT) {
    const interaction = req.body;

    if (interaction.data.custom_id === 'time_slot_modal') {
      // Extract user input
      const timeValue = interaction.data.components[0].components[0].value;

      // Validate the date
      const date = new Date(timeValue);
      if (isNaN(date)) {
        // Send ephemeral message if invalid
        await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 4, // respond with message
            data: { content: 'Invalid date format! Use YYYY-MM-DD HH:MM', flags: 64 }, // 64 = ephemeral
          }),
        });
        return;
      }

      // Fetch original message (pseudo-function, implement your own)
      const message = await fetchMessage(interaction.channel_id, interaction.message.id);

      // Update embed
      const embed = message.embeds[0];
      let slotsField = embed.fields.find(f => f.name === 'Time Slots');
      if (!slotsField) {
        embed.fields.push({ name: 'Time Slots', value: `• ${timeValue}`, inline: false });
      } else {
        slotsField.value += `\n• ${timeValue}`;
      }

      // Edit message via API
      await fetch(`https://discord.com/api/v10/channels/${interaction.channel_id}/messages/${interaction.message.id}`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ embeds: [embed] }),
      });

      // Acknowledge the modal submission
      await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 4,
          data: { content: 'Time slot added!', flags: 64 },
        }),
      });
    }
  }

  /**
   * Handle requests from interactive components
   * See https://discord.com/developers/docs/components/using-message-components#using-message-components-with-interactions
   */
  if (type === InteractionType.MESSAGE_COMPONENT) {
    // custom_id set in payload when sending message component
    const componentId = data.custom_id;
    const interaction = req.body;
    const postId = req.body.message.id;

    if (componentId.startsWith('vote_yes_') || componentId.startsWith('vote_no_')) {
      const context = req.body.context;
      const userId = context === 0 ? req.body.member.user.id : req.body.user.id;
      const userName = context === 0 ? req.body.member.user.global_name : req.body.user.global_name;

      const gameId = getGameIdFromPostId(postId);
      registerPlayer(userId, userName);

      // initialize vote store
      var voteSet = 
      { 
        yes: new Set(), 
        no: new Set() 
      };

      // add to correct set
      if (componentId.startsWith('vote_yes_')) {
        voteForGame(userId, gameId, 1);
      } else {
        voteForGame(userId, gameId, 0);
      }

      // Get votes from db
      var allGameVotes = getGameVotes(gameId);

      // Update activeGames from db result
      for (const vote of allGameVotes) {
        if (vote.vote === 0)
          voteSet.no.add(getUserIdFromPlayerId(vote.player_id));
        else
          voteSet.yes.add(getUserIdFromPlayerId(vote.player_id));
      }
    // Build result text (using mentions so people see who voted)
    const yesUsers = [...voteSet.yes].map(id => `<@${id}>`).join(', ') || 'Nobody yet';
    const noUsers = [...voteSet.no].map(id => `<@${id}>`).join(', ') || 'Nobody yet';

    const results = `✅ Interested: ${yesUsers}\n❌ Not Interested: ${noUsers}`;

    const components = req.body.message.components.map((c, index) => {
      if (c.type === MessageComponentTypes.TEXT_DISPLAY && index === 2) 
      {
        return { ...c, content: results };
      }
      return c;
    });

    // Acknowledge interaction immediately
    res.send({ type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE });

    const posts = getPostsFromGameId(gameId);
    for (const post of posts) {
      // Patch the message using the bot token (long-lived)
      const endpoint = `channels/${post.channel_id}/messages/${post.post_id}`;

      try
      {
        await DiscordRequest(endpoint, {
          method: 'PATCH',
          headers: {
            Authorization: `Bot ${process.env.DISCORD_TOKEN}`, // use your bot token
            'Content-Type': 'application/json',
          },
          body: {
            components: components,
          },
        });
      }
      catch (err)
      {
        // Too many edits
        if (err.code === 30046) 
        {
            // Delete message and build anew
            await buildGameMessage(postId, req, res);
        }
      }
    }
  }

    // Handle button press
    if (componentId.startsWith('add_time')) {
      // Respond with a modal
      const modalPayload = {
        type: 9, // Modal
        data: {
          custom_id: 'time_slot_modal',
          title: 'Add a Time Slot',
          components: [
            {
              type: 1, // Action row
              components: [
                {
                  type: 4, // Text input
                  custom_id: 'time_slot',
                  style: 1, // Short text
                  label: 'Enter date & time (YYYY-MM-DD HH:MM)',
                  required: true,
                },
              ],
            },
          ],
        },
      };

      await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modalPayload),
      });
    }

  return;
}

  console.error('unknown interaction type', type);
  return res.status(400).json({ error: 'unknown interaction type' });
});

app.listen(PORT, () => {
  console.log('Listening on port', PORT);
});

async function buildGameMessage(id, req)
{
  // Interaction context
    const context = req.body.context;
    const url = req.body.data.options.find(o => o.name === 'game_url').value;
    const imageOption = req.body.data.options.find(o => o.name === 'image_url');
    const image_url = imageOption?.value || null; // null or fallback URL
    const gameNameOption = req.body.data.options.find(o => o.name === 'game_name');
    const game_name = gameNameOption?.value || null; // null or fallback URL
    const userId = context === 0 ? req.body.member.user.id : req.body.user.id;

    // Check if URL is a Steam link
    const isSteamUrl = url?.startsWith('https://store.steampowered.com/') 
              || url?.startsWith('https://steamcommunity.com/app/');

    const isYoutubeUrl = url?.startsWith('https://www.youtube.com')

    var appId = null;
    var imageUrl = null;
    var gameName = null;
    var voteContent = '✅ Interested: Nobody yet\n❌ Not Interested: Nobody yet';

    if (isSteamUrl)
    {
      appId = getSteamAppIdFromUrl(url);
      imageUrl = await getSteamHeaderImage(appId);
      gameName = getSteamAppNameFromUrl(url);
    }
    else if (isYoutubeUrl)
    {
      appId = extractYouTubeId(url);
      imageUrl = getYouTubeThumbnail(appId);
      gameName = game_name;
    }
    else
    {
      imageUrl = image_url;
      gameName = game_name;
    }

    if (gameName === null)
    {
      return {
          response: {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ If the game is not from steam you must provide a game name by adding the game_name argument in the command.' }
          },
          game_id: null
        };
    }

    if (!isSteamUrl && !isYoutubeUrl && imageUrl === null)
    {
        return {
          response: {
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: { content: '❌ If the game is not from steam or youtube you must provide an image by adding the image_url argument in the command.' }
          },
          game_id: null
        };
    }

    // initialize vote store
    var voteSet = 
    { 
      yes: new Set(), 
      no: new Set() 
    };

    var gameId = null;
    // Add the game in db if it doesn't already exist
    if (getGameTitle(gameName) === null)
    {
      addGame(gameName, url);
      gameId = getGameIdFromTitle(gameName);
    }
    else
    {
      gameId = getGameIdFromTitle(gameName);
      // This game already exists, populate activeGames (votes) accordingly
      // Get votes from db
      var allGameVotes = getGameVotes(gameId);

      // Update activeGames from db result
      for (const vote of allGameVotes) {
        if (vote.vote === 0)
          voteSet.no.add(userId);
        else
          voteSet.yes.add(userId);
      }
      // Build result text (using mentions so people see who voted)
      const yesUsers = [...voteSet.yes].map(id => `<@${id}>`).join(', ') || 'Nobody yet';
      const noUsers = [...voteSet.no].map(id => `<@${id}>`).join(', ') || 'Nobody yet';

      voteContent = `✅ Interested: ${yesUsers}\n❌ Not Interested: ${noUsers}`;
    }

    try
    {
      return {
        response: {
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
                content: voteContent,
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
        },
        game_id: gameId
      };
    }
    catch (err)
    {
      console.error(err);
      return {
        response: {
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: '❌ Something went wrong!' }
        },
        game_id: null
      };
    }
}
