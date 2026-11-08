import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

// Publish the manifest last, after the draft contains every referenced artifact.
const tag = process.env.GITHUB_REF_NAME;
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
if (tag !== `v${version}`) {
  throw Error('Release tag does not match the app version.');
}
const release = JSON.parse(
  execFileSync('gh', ['release', 'view', tag, '--json', 'body,isDraft'], {
    encoding: 'utf8',
    windowsHide: true,
  }),
);
if (!release.isDraft) {
  throw Error('Only draft releases can be prepared.');
}
const manifest = JSON.parse(await readFile('dist/latest.json', 'utf8'));
if (manifest.version !== version) {
  throw Error('Update manifest version does not match.');
}
manifest.notes = release.body || manifest.notes;
await writeFile('dist/latest.json', JSON.stringify(manifest, null, 2) + '\n');
execFileSync('gh', ['release', 'upload', tag, 'dist/latest.json', '--clobber'], {
  stdio: 'inherit',
  windowsHide: true,
});
