/**
 * TMX → Tiled JSON converter (matching the documented structure).
 * Usage: node scripts/tmx-to-json.mjs
 * Output: public/assets/Tiled/Tilemaps/Beginning Fields.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TILEMAPS = path.join(ROOT, 'public/assets/Tiled/Tilemaps');
const TILESETS = path.join(ROOT, 'public/assets/Tiled/Tilesets');

function csvToData(csvText) {
  return csvText
    .trim()
    .split(/\s*[\r\n,]+\s*/)
    .map((s) => parseInt(s, 10) || 0);
}

function getTsxImage(tsxPath) {
  const xml = fs.readFileSync(tsxPath, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  const tileset = doc.tileset;
  if (!tileset) return null;
  const name = tileset['@_name'] || path.basename(tsxPath, '.tsx');
  const image = tileset.image;
  if (!image) return { name, image: null, imagewidth: 16, imageheight: 16 };
  const src = image['@_source'] || image;
  const w = parseInt(image['@_width'], 10) || 16;
  const h = parseInt(image['@_height'], 10) || 16;
  const imagePath = src.replace(/^\.\.\/\.\.\//, ''); // ../../Art/... → Art/...
  return { name, image: imagePath, imagewidth: w, imageheight: h };
}

const tmxPath = path.join(TILEMAPS, 'Beginning Fields.tmx');
const tmx = fs.readFileSync(tmxPath, 'utf8');
const parser = new XMLParser({ ignoreAttributes: false });
const doc = parser.parse(tmx);
const map = doc.map;

const width = parseInt(map['@_width'], 10);
const height = parseInt(map['@_height'], 10);
const tilewidth = parseInt(map['@_tilewidth'], 10);
const tileheight = parseInt(map['@_tileheight'], 10);

const tilesetRefs = Array.isArray(map.tileset) ? map.tileset : [map.tileset];
const tilesets = tilesetRefs.map((ref) => {
  const firstgid = parseInt(ref['@_firstgid'], 10);
  const source = ref['@_source'] || '';
  const tsxPath = path.resolve(TILEMAPS, source);
  const info = getTsxImage(tsxPath);
  return {
    firstgid,
    name: info.name,
    image: info.image,
    imagewidth: info.imagewidth,
    imageheight: info.imageheight,
    tilewidth,
    tileheight,
  };
});

const layers = [];
const rawLayers = Array.isArray(map.layer) ? map.layer : map.layer ? [map.layer] : [];
const rawObjectgroups = Array.isArray(map.objectgroup)
  ? map.objectgroup
  : map.objectgroup
    ? [map.objectgroup]
    : [];

for (const layer of rawLayers) {
  const id = parseInt(layer['@_id'], 10);
  const name = layer['@_name'];
  const data = layer.data;
  const encoding = data?.['@_encoding'];
  const csvText = data?.['#text'] || '';
  const dataArray = encoding === 'csv' ? csvToData(csvText) : [];
  layers.push({
    id,
    name,
    type: 'tilelayer',
    width,
    height,
    data: dataArray,
    visible: layer['@_visible'] !== '0',
  });
}

for (const og of rawObjectgroups) {
  const id = parseInt(og['@_id'], 10);
  const name = og['@_name'];
  const rawObjects = Array.isArray(og.object) ? og.object : og.object ? [og.object] : [];
  const objects = rawObjects.map((obj) => ({
    id: parseInt(obj['@_id'], 10),
    gid: parseInt(obj['@_gid'], 10) || undefined,
    x: parseFloat(obj['@_x']) || 0,
    y: parseFloat(obj['@_y']) || 0,
    width: parseFloat(obj['@_width']) || 0,
    height: parseFloat(obj['@_height']) || 0,
  }));
  layers.push({
    id,
    name,
    type: 'objectgroup',
    draworder: 'topdown',
    objects,
    visible: og['@_visible'] !== '0',
  });
}

const out = {
  compressionlevel: -1,
  height,
  infinite: false,
  layers,
  nextlayerid: parseInt(map['@_nextlayerid'], 10) || layers.length + 1,
  nextobjectid: parseInt(map['@_nextobjectid'], 10) || 1,
  orientation: map['@_orientation'] || 'orthogonal',
  renderorder: map['@_renderorder'] || 'right-down',
  tiledversion: map['@_tiledversion'] || '1.11.2',
  tileheight,
  tilesets,
  tilewidth,
  type: 'map',
  version: '1.10',
  width,
};

const outPath = path.join(TILEMAPS, 'Beginning Fields.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 0), 'utf8');
console.log('Written:', outPath);
