export const site = {
  name: 'Wisp AI',
  url: 'https://wisp.fedeya.sh',
  version: '0.0.2',
  repository: 'https://github.com/fedeya/wisp-ai',
  // Must match scripts/build-desktop.ts and the published release asset.
  download:
    process.env.NEXT_PUBLIC_INSTALL_URL ||
    'https://github.com/fedeya/wisp-ai/releases/download/v0.0.2/WispAI-0.0.2-windows-x64-setup.exe',
  description:
    'Your AI companion for WoW: Forever. Find gear upgrades, create macros, plan quests and set routines that remember your guide. Open source for Windows.',
};
