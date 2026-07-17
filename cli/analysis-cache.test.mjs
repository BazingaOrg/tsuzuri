import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  computeAnalysisHash,
  hasValidAnalysisCache,
  readAnalysisFingerprint,
  readDemucsSetting,
  writeAnalysisManifest,
} from './analysis-cache.mjs';

const RUNTIME = JSON.stringify({version: 1, beat_features_version: 1, backend: 'mlx', model: 'medium', demucs_available: false});

const makeProject = () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tsuzuri-analysis-cache-'));
  const metadata = path.join(folder, 'metadata');
  fs.mkdirSync(metadata);
  fs.writeFileSync(path.join(folder, 'song.mp3'), 'audio');
  fs.writeFileSync(path.join(folder, 'lyrics.lrc'), '[00:01.00]line');
  fs.writeFileSync(path.join(metadata, 'beats.json'), '{"version":1}');
  fs.writeFileSync(path.join(metadata, 'lyrics.json'), '{"version":1,"segments":[]}');
  return {
    folder,
    analysisPath: path.join(metadata, 'analysis.json'),
    beatsPath: path.join(metadata, 'beats.json'),
    lyricsPath: path.join(metadata, 'lyrics.json'),
  };
};

test('analysis hash ignores photos and non-analysis TOML while tracking audio and lyrics', () => {
  const project = makeProject();
  try {
    const inputs = {audio: 'song.mp3', lyrics: 'lyrics.lrc', runtimeFingerprint: RUNTIME};
    const first = computeAnalysisHash(project.folder, inputs);
    fs.writeFileSync(path.join(project.folder, 'new-photo.jpg'), 'photo');
    fs.writeFileSync(path.join(project.folder, 'tsuzuri.toml'), 'photo_scale = 0.9\n');
    assert.equal(computeAnalysisHash(project.folder, inputs), first);

    fs.writeFileSync(path.join(project.folder, 'song.mp3'), 'new audio');
    assert.notEqual(computeAnalysisHash(project.folder, inputs), first);
    fs.writeFileSync(path.join(project.folder, 'song.mp3'), 'audio');
    fs.writeFileSync(path.join(project.folder, 'lyrics.lrc'), '[00:02.00]new line');
    assert.notEqual(computeAnalysisHash(project.folder, inputs), first);
  } finally {
    fs.rmSync(project.folder, {recursive: true, force: true});
  }
});

test('analysis hash tracks normalized demucs and the effective analyzer runtime', () => {
  const project = makeProject();
  try {
    const inputs = {audio: 'song.mp3', runtimeFingerprint: RUNTIME};
    const first = computeAnalysisHash(project.folder, inputs);
    fs.writeFileSync(path.join(project.folder, 'tsuzuri.toml'), 'demucs = true # same\nfps = 30\n');
    assert.equal(readDemucsSetting(project.folder), true);
    assert.equal(computeAnalysisHash(project.folder, inputs), first);
    fs.writeFileSync(path.join(project.folder, 'tsuzuri.toml'), 'demucs = false\n');
    assert.notEqual(computeAnalysisHash(project.folder, inputs), first);
    assert.notEqual(
      computeAnalysisHash(project.folder, {
        ...inputs,
        runtimeFingerprint: JSON.stringify({
          version: 1, beat_features_version: 1, backend: 'cpu', model: 'small', demucs_available: true,
        }),
      }),
      computeAnalysisHash(project.folder, inputs),
    );
  } finally {
    fs.rmSync(project.folder, {recursive: true, force: true});
  }
});

test('invalid or duplicate demucs config conservatively disables cache hashing', () => {
  const project = makeProject();
  try {
    fs.writeFileSync(path.join(project.folder, 'tsuzuri.toml'), 'demucs = "yes"\n');
    assert.equal(readDemucsSetting(project.folder), null);
    assert.equal(computeAnalysisHash(project.folder, {audio: 'song.mp3', runtimeFingerprint: RUNTIME}), null);
    fs.writeFileSync(path.join(project.folder, 'tsuzuri.toml'), 'demucs = true\ndemucs = false\n');
    assert.equal(readDemucsSetting(project.folder), null);
  } finally {
    fs.rmSync(project.folder, {recursive: true, force: true});
  }
});

test('manifest requires matching version, hash, and both valid analyzer artifacts', () => {
  const project = makeProject();
  try {
    const audioHash = computeAnalysisHash(project.folder, {audio: 'song.mp3', runtimeFingerprint: RUNTIME});
    const args = {...project, audioHash};
    assert.equal(hasValidAnalysisCache(args), false);
    writeAnalysisManifest(args);
    assert.equal(hasValidAnalysisCache(args), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(project.analysisPath, 'utf8')), {
      version: 1,
      audio_hash: audioHash,
    });

    fs.writeFileSync(project.lyricsPath, 'broken');
    assert.equal(hasValidAnalysisCache(args), false);
    fs.writeFileSync(project.lyricsPath, '{"version":1}');
    fs.writeFileSync(project.analysisPath, '{"version":2,"audio_hash":"x"}');
    assert.equal(hasValidAnalysisCache(args), false);
  } finally {
    fs.rmSync(project.folder, {recursive: true, force: true});
  }
});

test('runtime fingerprint accepts only a complete analyzer response', () => {
  const spawn = (_cmd, _args, _opts) => ({
    status: 0,
    stdout: '{"version":1,"beat_features_version":1,"backend":"cpu","model":"small","demucs_available":true}\n',
  });
  assert.equal(
    readAnalysisFingerprint('/analyzer', spawn),
    '{"version":1,"beat_features_version":1,"backend":"cpu","model":"small","demucs_available":true}',
  );
  assert.equal(readAnalysisFingerprint('/analyzer', () => ({status: 1, stdout: ''})), null);
  assert.equal(readAnalysisFingerprint('/analyzer', () => ({status: 0, stdout: '{}'})), null);
  assert.equal(readAnalysisFingerprint('/analyzer', () => ({status: 0, stdout: '{"version":1,"backend":"cpu","model":"small","demucs_available":true}'})), null);
  // Node validates the shape only. The full runtime fingerprint is part of the
  // analysis hash, so a newer Python feature version invalidates old manifests.
  assert.equal(
    readAnalysisFingerprint('/analyzer', () => ({
      status: 0,
      stdout: '{"version":1,"beat_features_version":2,"backend":"cpu","model":"small","demucs_available":true}',
    })),
    '{"version":1,"beat_features_version":2,"backend":"cpu","model":"small","demucs_available":true}',
  );
});
