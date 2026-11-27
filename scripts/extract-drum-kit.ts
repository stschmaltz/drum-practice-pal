/**
 * Builds `public/drumkit/drums.sf3` (committed; `public/soundfont` is the alphaTab plugin's, gitignored): the standard drum kit (bank 128,
 * program 0) of MuseScore General, on its own. The player loads Sonivox for
 * every instrument and then this on top (`PLAYER_DRUM_SOUND_FONT_URL`):
 * Sonivox's kit is thin (its snare doesn't sound like one), and the whole of
 * MuseScore General is 40 MB, too big to precache for offline use.
 *
 * Run with `npm run drum-kit`. Reads `public/sf-candidates/MuseScore_General.sf3`
 * (MIT, https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/).
 *
 * A SoundFont 2 file is a RIFF of three lists: INFO, sdta (the sample data)
 * and pdta (presets -> instruments -> samples, as flat tables that index into
 * each other). This keeps the chosen presets, the instruments and samples they
 * reach, and the bytes of those samples, and renumbers every index. In an sf3
 * the samples are Ogg Vorbis: a sample's start and end are byte offsets into
 * the data and its loop points are relative to its start; in an sf2 they are
 * sample frames, all absolute. Both are handled.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = join('public', 'sf-candidates', 'MuseScore_General.sf3');
const TARGET = join('public', 'drumkit', 'drums.sf3');
const PERCUSSION_BANK = 128;
const KEEP_PROGRAMS = new Set([0]);

const GEN_INSTRUMENT = 41;
const GEN_SAMPLE_ID = 53;
const SAMPLE_TYPE_COMPRESSED = 0x10;
const SAMPLE_TYPE_ROM = 0x8000;

interface Chunk {
  id: string;
  /** For RIFF and LIST: the list type. */
  type?: string;
  data: Buffer;
}

function readChunks(buffer: Buffer, offset: number, end: number): Chunk[] {
  const chunks: Chunk[] = [];
  while (offset + 8 <= end) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === 'LIST' || id === 'RIFF') {
      chunks.push({
        id,
        type: buffer.toString('ascii', start, start + 4),
        data: buffer.subarray(start + 4, start + size),
      });
    } else {
      chunks.push({ id, data: buffer.subarray(start, start + size) });
    }
    offset = start + size + (size % 2);
  }
  return chunks;
}

function subChunks(list: Chunk): Chunk[] {
  return readChunks(list.data, 0, list.data.length);
}

function chunk(id: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(id, 0, 'ascii');
  header.writeUInt32LE(data.length, 4);
  return Buffer.concat([header, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}

function list(id: 'LIST' | 'RIFF', type: string, children: Buffer[]): Buffer {
  return chunk(id, Buffer.concat([Buffer.from(type, 'ascii'), ...children]));
}

/** Splits a pdta table into its fixed-size records, the terminal record included. */
function records(data: Buffer, size: number): Buffer[] {
  const out: Buffer[] = [];
  for (let offset = 0; offset + size <= data.length; offset += size) {
    out.push(Buffer.from(data.subarray(offset, offset + size)));
  }
  return out;
}

function find(chunks: Chunk[], id: string, type?: string): Chunk {
  const found = chunks.find((c) => c.id === id && (type === undefined || c.type === type));
  if (!found) throw new Error(`No ${id}${type ? ` ${type}` : ''} chunk in ${SOURCE}`);
  return found;
}

function main(): void {
  const file = readFileSync(SOURCE);
  const [riff] = readChunks(file, 0, file.length);
  if (riff?.id !== 'RIFF' || riff.type !== 'sfbk') throw new Error(`${SOURCE} is not a SoundFont`);
  const top = subChunks(riff);
  const info = find(top, 'LIST', 'INFO');
  const smpl = find(subChunks(find(top, 'LIST', 'sdta')), 'smpl').data;
  const pdta = subChunks(find(top, 'LIST', 'pdta'));
  const table = (id: string, size: number) => records(find(pdta, id).data, size);

  const phdr = table('phdr', 38);
  const pbag = table('pbag', 4);
  const pmod = table('pmod', 10);
  const pgen = table('pgen', 4);
  const inst = table('inst', 22);
  const ibag = table('ibag', 4);
  const imod = table('imod', 10);
  const igen = table('igen', 4);
  const shdr = table('shdr', 46);

  const bagRange = (headers: Buffer[], index: number, bagOffset: number) => [
    headers[index]!.readUInt16LE(bagOffset),
    headers[index + 1]!.readUInt16LE(bagOffset),
  ];
  const genRange = (bags: Buffer[], index: number) => [
    bags[index]!.readUInt16LE(0),
    bags[index + 1]!.readUInt16LE(0),
  ];
  const modRange = (bags: Buffer[], index: number) => [
    bags[index]!.readUInt16LE(2),
    bags[index + 1]!.readUInt16LE(2),
  ];

  // The presets kept (every record but the terminal one is a preset).
  const presetIndexes = phdr.slice(0, -1).flatMap((record, index) => {
    const program = record.readUInt16LE(20);
    const bank = record.readUInt16LE(22);
    return bank === PERCUSSION_BANK && KEEP_PROGRAMS.has(program) ? [index] : [];
  });
  if (presetIndexes.length === 0) throw new Error('No drum kit preset found');

  // The instruments those presets reach, then the samples those instruments reach.
  const instrumentIndexes = new Set<number>();
  for (const p of presetIndexes) {
    const [bagStart, bagEnd] = bagRange(phdr, p, 24);
    for (let b = bagStart!; b < bagEnd!; b++) {
      const [genStart, genEnd] = genRange(pbag, b);
      for (let g = genStart!; g < genEnd!; g++) {
        if (pgen[g]!.readUInt16LE(0) === GEN_INSTRUMENT) {
          instrumentIndexes.add(pgen[g]!.readUInt16LE(2));
        }
      }
    }
  }
  const sampleIndexes = new Set<number>();
  for (const i of instrumentIndexes) {
    const [bagStart, bagEnd] = bagRange(inst, i, 20);
    for (let b = bagStart!; b < bagEnd!; b++) {
      const [genStart, genEnd] = genRange(ibag, b);
      for (let g = genStart!; g < genEnd!; g++) {
        if (igen[g]!.readUInt16LE(0) === GEN_SAMPLE_ID) sampleIndexes.add(igen[g]!.readUInt16LE(2));
      }
    }
  }
  // A stereo sample names its other half; keep that too.
  for (const s of [...sampleIndexes]) {
    const type = shdr[s]!.readUInt16LE(44);
    if (type !== 1) sampleIndexes.add(shdr[s]!.readUInt16LE(42));
  }

  const sortedSamples = [...sampleIndexes].sort((a, b) => a - b);
  const sortedInstruments = [...instrumentIndexes].sort((a, b) => a - b);
  const sampleMap = new Map(sortedSamples.map((old, index) => [old, index]));
  const instrumentMap = new Map(sortedInstruments.map((old, index) => [old, index]));

  // Samples: copy each one's data, and point its header at the copy.
  const compressed = sortedSamples.some(
    (s) => (shdr[s]!.readUInt16LE(44) & SAMPLE_TYPE_COMPRESSED) !== 0,
  );
  // sf2 data is 16-bit frames with 46 zero frames after each sample; sf3 is bytes.
  const unit = compressed ? 1 : 2;
  const pieces: Buffer[] = [];
  let written = 0;
  const newShdr: Buffer[] = sortedSamples.map((s) => {
    const record = Buffer.from(shdr[s]!);
    const type = record.readUInt16LE(44);
    if ((type & SAMPLE_TYPE_ROM) !== 0) throw new Error('ROM samples are not supported');
    const start = record.readUInt32LE(20);
    const end = record.readUInt32LE(24);
    const piece = smpl.subarray(start * unit, end * unit);
    const newStart = written;
    pieces.push(piece);
    written += end - start;
    if (!compressed) {
      pieces.push(Buffer.alloc(46 * 2));
      written += 46;
    }
    record.writeUInt32LE(newStart, 20);
    record.writeUInt32LE(newStart + (end - start), 24);
    if (!compressed) {
      // Loop points are absolute frames in an sf2.
      const delta = newStart - start;
      record.writeUInt32LE(record.readUInt32LE(28) + delta, 28);
      record.writeUInt32LE(record.readUInt32LE(32) + delta, 32);
    }
    if (type !== 1) {
      const linked = sampleMap.get(record.readUInt16LE(42));
      if (linked === undefined) throw new Error('A linked sample was left out');
      record.writeUInt16LE(linked, 42);
    }
    return record;
  });
  newShdr.push(Buffer.from(shdr[shdr.length - 1]!));

  // Instruments and their zones, renumbered.
  const newInst: Buffer[] = [];
  const newIbag: Buffer[] = [];
  const newImod: Buffer[] = [];
  const newIgen: Buffer[] = [];
  for (const i of sortedInstruments) {
    const record = Buffer.from(inst[i]!);
    record.writeUInt16LE(newIbag.length, 20);
    newInst.push(record);
    const [bagStart, bagEnd] = bagRange(inst, i, 20);
    for (let b = bagStart!; b < bagEnd!; b++) {
      const bag = Buffer.alloc(4);
      bag.writeUInt16LE(newIgen.length, 0);
      bag.writeUInt16LE(newImod.length, 2);
      newIbag.push(bag);
      const [genStart, genEnd] = genRange(ibag, b);
      for (let g = genStart!; g < genEnd!; g++) {
        const gen = Buffer.from(igen[g]!);
        if (gen.readUInt16LE(0) === GEN_SAMPLE_ID) {
          gen.writeUInt16LE(sampleMap.get(gen.readUInt16LE(2))!, 2);
        }
        newIgen.push(gen);
      }
      const [modStart, modEnd] = modRange(ibag, b);
      for (let m = modStart!; m < modEnd!; m++) newImod.push(Buffer.from(imod[m]!));
    }
  }
  const instTerminal = Buffer.from(inst[inst.length - 1]!);
  instTerminal.writeUInt16LE(newIbag.length, 20);
  newInst.push(instTerminal);
  newIbag.push(terminalBag(newIgen.length, newImod.length));
  newImod.push(Buffer.alloc(10));
  newIgen.push(Buffer.alloc(4));

  // Presets and their zones, renumbered.
  const newPhdr: Buffer[] = [];
  const newPbag: Buffer[] = [];
  const newPmod: Buffer[] = [];
  const newPgen: Buffer[] = [];
  for (const p of presetIndexes) {
    const record = Buffer.from(phdr[p]!);
    record.writeUInt16LE(newPbag.length, 24);
    newPhdr.push(record);
    const [bagStart, bagEnd] = bagRange(phdr, p, 24);
    for (let b = bagStart!; b < bagEnd!; b++) {
      newPbag.push(terminalBag(newPgen.length, newPmod.length));
      const [genStart, genEnd] = genRange(pbag, b);
      for (let g = genStart!; g < genEnd!; g++) {
        const gen = Buffer.from(pgen[g]!);
        if (gen.readUInt16LE(0) === GEN_INSTRUMENT) {
          gen.writeUInt16LE(instrumentMap.get(gen.readUInt16LE(2))!, 2);
        }
        newPgen.push(gen);
      }
      const [modStart, modEnd] = modRange(pbag, b);
      for (let m = modStart!; m < modEnd!; m++) newPmod.push(Buffer.from(pmod[m]!));
    }
  }
  const presetTerminal = Buffer.from(phdr[phdr.length - 1]!);
  presetTerminal.writeUInt16LE(newPbag.length, 24);
  newPhdr.push(presetTerminal);
  newPbag.push(terminalBag(newPgen.length, newPmod.length));
  newPmod.push(Buffer.alloc(10));
  newPgen.push(Buffer.alloc(4));

  const infoChunks = subChunks(info).map((c) =>
    c.id === 'INAM'
      ? chunk('INAM', zeroTerminated('MuseScore General drum kit'))
      : chunk(c.id, c.data),
  );
  const output = list('RIFF', 'sfbk', [
    list('LIST', 'INFO', infoChunks),
    list('LIST', 'sdta', [chunk('smpl', Buffer.concat(pieces))]),
    list('LIST', 'pdta', [
      chunk('phdr', Buffer.concat(newPhdr)),
      chunk('pbag', Buffer.concat(newPbag)),
      chunk('pmod', Buffer.concat(newPmod)),
      chunk('pgen', Buffer.concat(newPgen)),
      chunk('inst', Buffer.concat(newInst)),
      chunk('ibag', Buffer.concat(newIbag)),
      chunk('imod', Buffer.concat(newImod)),
      chunk('igen', Buffer.concat(newIgen)),
      chunk('shdr', Buffer.concat(newShdr)),
    ]),
  ]);
  writeFileSync(TARGET, output);
  console.log(
    `${TARGET}: ${presetIndexes.length} preset(s), ${sortedInstruments.length} instruments, ` +
      `${sortedSamples.length} samples, ${(output.length / 1024 / 1024).toFixed(2)} MB`,
  );
}

function terminalBag(genIndex: number, modIndex: number): Buffer {
  const bag = Buffer.alloc(4);
  bag.writeUInt16LE(genIndex, 0);
  bag.writeUInt16LE(modIndex, 2);
  return bag;
}

/** An INFO string: zero-terminated, padded to an even length. */
function zeroTerminated(text: string): Buffer {
  const bytes = Buffer.from(`${text}\0`, 'ascii');
  return bytes.length % 2 ? Buffer.concat([bytes, Buffer.alloc(1)]) : bytes;
}

main();
