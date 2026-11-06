// Live TV channels. YouTube live embeds first (proven); HLS streams from
// iptv-org's free playlist as alternates. Edit the IDs here only.
export const TV_CHANNELS = [
  { id: 'aljazeera', name: 'Al Jazeera English', channel: 'UCNye-wNBqNL5ZzHSJj3l8Bg' },
  { id: 'dw', name: 'DW News', channel: 'UCknLrEdhRCp1aegoMqRaCZg' },
  { id: 'france24', name: 'France 24', channel: 'UCQfwfsi5VrQ8yKZ-UWmAEFg' },
  { id: 'sky', name: 'Sky News', channel: 'UCoMdktPbSTixAyNGwb-UYkQ' },
  { id: 'aje-hls', name: 'Al Jazeera HLS', kind: 'hls', url: 'https://live-hls-apps-aje-fa.getaj.net/AJE/index.m3u8' },
  { id: 'dw-hls', name: 'DW English HLS', kind: 'hls', url: 'https://amg01644-amg01644c1-amgplt0343.playout.now3.amagi.tv/ts-eu-w1-n2/playlist/amg01644-amg01644c1-amgplt0343/playlist.m3u8' },
  { id: 'cnn-intl', name: 'CNN International', kind: 'hls', url: 'https://d3bp6dwmpbdajl.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-ury0meh5m4nzm/index.m3u8' },
  { id: 'africanews', name: 'Africanews', kind: 'hls', url: 'https://cdn-euronews.akamaized.net/live/eds/africanews-en/25049/index.m3u8' },
  { id: 'bbc-news', name: 'BBC News', kind: 'hls', url: 'https://mumbai-edge.smartplaytv.in/BBCNews/index.m3u8' },
  { id: 'nhk', name: 'NHK World', kind: 'hls', url: 'https://media-tyo.hls.nhkworld.jp/hls/wp/live/master.m3u8' },
  { id: 'france24-ar', name: 'France 24 Arabic', kind: 'hls', url: 'https://live.france24.com/hls/live/2037222-b/F24_AR_HI_HLS/master_5000.m3u8' },
];

export const TV_EMBED = (channelId) => `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1&mute=1&rel=0`;
export const TV_ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
export const TV_LAST_KEY = 'foxhole.tvChannel';
export const TV_HLS_ONLY = () => TV_CHANNELS.filter((c) => c.kind === 'hls').map((c) => ({ id: c.id, name: c.name, url: c.url }));
