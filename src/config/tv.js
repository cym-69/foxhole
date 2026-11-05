// Live TV channels. Edit the IDs here only.
export const TV_CHANNELS = [
  { id: 'aljazeera', name: 'Al Jazeera English', channel: 'UCNye-wNBqNL5ZzHSJj3l8Bg' },
  { id: 'dw', name: 'DW News', channel: 'UCknLrEdhRCp1aegoMqRaCZg' },
  { id: 'france24', name: 'France 24', channel: 'UCQfwfsi5VrQ8yKZ-UWmAEFg' },
  { id: 'sky', name: 'Sky News', channel: 'UCoMdktPbSTixAyNGwb-UYkQ' },
];

export const TV_EMBED = (channelId) => `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1&mute=1&rel=0`;
export const TV_ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
export const TV_LAST_KEY = 'foxhole.tvChannel';
