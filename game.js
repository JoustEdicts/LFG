import { capitalize } from './utils.js';

export function getSteamAppIdFromUrl(url) {
  const match = url.match(/\/app\/(\d+)\//);
  return match ? match[1] : null;
}

export function getSteamAppNameFromUrl(url) {
  const match = url.match(/\/app\/\d+\/([^/]+)/);
  return match ? match[1].replace(/_/g, " ") : null;
}

export function extractYouTubeId(url) {
  const regex = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^\s&]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

export function getYouTubeThumbnail(videoId, quality = 'maxresdefault') {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

export async function getSteamHeaderImage(appId) {
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}`);
  const data = await res.json();

  if (data[appId] && data[appId].success) {
    return data[appId].data.header_image;
  }
  return null;
}
