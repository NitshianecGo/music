// Rename this file to config.js.
// These are CLIENT-SIDE public identifiers. Never put private API secrets here.
//
// YouTube: create an API key and restrict it by your GitHub Pages domain.
// Spotify: create an app and add your GitHub Pages URL as a Redirect URI.
// Supabase: create a project and enable Anonymous Sign-Ins.

window.MUSICWAVE_CONFIG = {
  youtubeApiKey: "PASTE_YOUTUBE_API_KEY",
  spotifyClientId: "PASTE_SPOTIFY_CLIENT_ID",
  spotifyRedirectUri: window.location.origin + window.location.pathname,
  // VK: optional user/service access token with permission to search audio.
  vkAccessToken: "PASTE_VK_ACCESS_TOKEN",
  vkApiVersion: "5.199",
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "PASTE_SUPABASE_ANON_KEY"
};
