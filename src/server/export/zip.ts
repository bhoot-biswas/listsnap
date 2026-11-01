import "server-only";
import { crc32 } from "node:zlib";

/**
 * A zip written as it goes, for the export downloads. Entries are stored, not deflated:
 * JPEGs don't shrink, and storing keeps this small with no new dependency. Each entry is
 * whole in memory only while it is written, so a 50-listing export never holds every
 * photo at once (this server has little memory to spare). No zip64: an export is far
 * below 4 GB and 65,535 files.
 */

export interface ZipEntry {
  /** Path inside the zip, with forward slashes. */
  name: string;
  data: Buffer;
}

// general purpose flag bit 11: names are UTF-8
const UTF8 = 0x0800;

export async function* zipStream(entries: AsyncIterable<ZipEntry>, now = new Date()): AsyncGenerator<Buffer> {
  const { time, date } = dosTime(now);
  const central: Buffer[] = [];
  let offset = 0;
  for await (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const size = entry.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(UTF8, 6);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    yield Buffer.concat([local, name]);
    yield entry.data;

    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4); // made by
    head.writeUInt16LE(20, 6); // version needed
    head.writeUInt16LE(UTF8, 8);
    head.writeUInt16LE(0, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(size, 20);
    head.writeUInt32LE(size, 24);
    head.writeUInt16LE(name.length, 28);
    // extra, comment, disk, internal attributes, external attributes stay 0
    head.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([head, name]));
    offset += local.length + name.length + size;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  yield Buffer.concat([dir, end]);
}

function dosTime(d: Date) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** A web stream for a Response body. */
export function toWebStream(chunks: AsyncGenerator<Buffer>): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await chunks.next();
      if (done) controller.close();
      else controller.enqueue(new Uint8Array(value));
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}
