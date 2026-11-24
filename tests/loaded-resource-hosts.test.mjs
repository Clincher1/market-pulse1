import test from 'node:test';
import assert from 'node:assert/strict';
import { findForeignResourceHosts } from '../supabase/functions/_shared/loaded-resource-hosts.mjs';

const site = 'https://market-pulse1-eta.vercel.app/';

test('selfcheck flags external network resources and CSS URLs, not links or descriptive metadata', () => {
  const html = `<!doctype html><html><head>
    <link rel="canonical" href="https://external.example/page">
    <meta property="og:image" content="https://images.example/card.png">
    <meta name="description" content="Visit https://metadata.example/">
    <script type="application/ld+json">{"@context":"https://schema.org","url":"https://jsonld.example/"}</script>
    <style>.hero { background: url('https://css.example/bg.png') }</style>
    <link rel="stylesheet" href="https://cdn.example/site.css">
    <script src="https://scripts.example/app.js"></script>
    <img src="https://img.example/photo.png">
    <iframe src="https://frame.example/embed"></iframe>
    <source srcset="https://video.example/a.mp4 1x, https://video.example/b.mp4 2x">
    <video poster="https://poster.example/cover.jpg"></video>
    <audio src="https://audio.example/track.mp3"></audio>
    <a href="https://link-only.example/">external link</a>
  </head></html>`;
  assert.deepEqual(findForeignResourceHosts(html, site), [
    'audio.example', 'cdn.example', 'css.example', 'frame.example', 'img.example',
    'poster.example', 'scripts.example', 'video.example',
  ]);
});

test('selfcheck permits site and Supabase resources and ignores domains in scripts and comments', () => {
  const html = `<!-- <img src="https://comment.example/image.png"> -->
    <script type="application/ld+json">{"@context":"https://schema.org"}</script>
    <script>const text = 'https://runtime-string.example';</script>
    <link rel="preconnect" href="https://project.supabase.co">
    <img src="/local.png"><div style="background-image:url('/local-bg.png')"></div>`;
  assert.deepEqual(findForeignResourceHosts(html, site), []);
});

test('resource link recognition does not treat canonical and alternate links as requests', () => {
  const html = `<link rel="canonical" href="https://canonical.example/">
    <link rel="alternate" href="https://alternate.example/feed.xml">
    <link rel="preload" href="https://assets.example/font.woff2">`;
  assert.deepEqual(findForeignResourceHosts(html, site), ['assets.example']);
});
