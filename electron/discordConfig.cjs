'use strict';
// The Discord application VOID shows up as ("Playing VOID"). Created in the
// Discord Developer Portal; the ID is public and not a secret. Empty means
// Rich Presence is not set up in this build: the settings say so and nothing
// connects. VOID_DISCORD_CLIENT_ID overrides it for testing.
const DISCORD_CLIENT_ID = '1574062836974358668';

module.exports = {
  DISCORD_CLIENT_ID: process.env.VOID_DISCORD_CLIENT_ID || DISCORD_CLIENT_ID,
};
