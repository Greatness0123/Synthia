/**
 * Pure-browser Apache Parquet v1 writer.
 *
 * Supports flat rows of: string, number (int32 / double), boolean, null.
 * Uses PLAIN encoding with no compression (UNCOMPRESSED) — maximally
 * compatible with pandas / PyArrow / DuckDB / Hugging Face datasets.
 *
 * Binary layout:
 *   magic(4) | row_group* | footer(Thrift) | footer_len(4) | magic(4)
 *
 * Thrift encoding used here is the compact binary protocol (field-delta IDs).
 */

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------
type PrimitiveValue = string | number | boolean | null | undefined;
export type ParquetRow = Record<string, PrimitiveValue>;

// ---------------------------------------------------------------------------
// Thrift compact-protocol helpers
// ---------------------------------------------------------------------------

/** Append a Thrift compact varint (i32 zigzag-encoded) */
function writeZigzag(buf: number[], n: number) {
  let v = (n << 1) ^ (n >> 31);
  while (v > 0x7f) {
    buf.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  buf.push(v & 0x7f);
}

/** Append a raw unsigned varint */
function writeUVarint(buf: number[], n: number) {
  while (n > 0x7f) {
    buf.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  buf.push(n & 0x7f);
}

/** Thrift compact field header: delta-field-id + type */
function thriftField(buf: number[], delta: number, type: number) {
  buf.push(((delta & 0x0f) << 4) | (type & 0x0f));
}

/** Thrift string (binary) */
function thriftString(buf: number[], s: string) {
  const enc = new TextEncoder().encode(s);
  writeUVarint(buf, enc.length);
  for (const b of enc) buf.push(b);
}

/** Thrift stop byte */
function thriftStop(buf: number[]) {
  buf.push(0x00);
}

/** Thrift i32 */
function thriftI32(buf: number[], delta: number, v: number) {
  thriftField(buf, delta, 5); // type = 5 (i32)
  writeZigzag(buf, v);
}

/** Thrift i64 (written as two i32s — just store as two 32-bit LE words) */
function thriftI64(buf: number[], delta: number, v: number) {
  thriftField(buf, delta, 6); // type = 6 (i64)
  // Write as 8 bytes little-endian (v fits in 53-bit JS Number)
  const lo = v >>> 0;
  const hi = Math.floor(v / 0x100000000) >>> 0;
  buf.push(lo & 0xff, (lo >> 8) & 0xff, (lo >> 16) & 0xff, (lo >> 24) & 0xff);
  buf.push(hi & 0xff, (hi >> 8) & 0xff, (hi >> 16) & 0xff, (hi >> 24) & 0xff);
}

/** Write a Thrift list header */
function thriftListHeader(buf: number[], size: number, elemType: number) {
  if (size < 15) {
    buf.push(((size & 0x0f) << 4) | (elemType & 0x0f));
  } else {
    buf.push(0xf0 | (elemType & 0x0f));
    writeUVarint(buf, size);
  }
}

// ---------------------------------------------------------------------------
// Parquet physical/logical type constants
// ---------------------------------------------------------------------------
const PT_BOOLEAN = 0;
const PT_INT32 = 1;
const PT_INT64 = 2;
const PT_DOUBLE = 5;
const PT_BYTE_ARRAY = 6;

// Repetition/definition levels
const REQUIRED = 0;
const OPTIONAL = 1;

// Encoding
const ENC_PLAIN = 0;
const ENC_RLE = 3;

// Compression
const COMP_UNCOMPRESSED = 0;

// Page type
const PAGE_DATA_V1 = 0;

// Row group sort order
type ColPhysicalType = typeof PT_BOOLEAN | typeof PT_INT32 | typeof PT_INT64 | typeof PT_DOUBLE | typeof PT_BYTE_ARRAY;

// ---------------------------------------------------------------------------
// Schema inference
// ---------------------------------------------------------------------------
function inferSchema(rows: ParquetRow[]): Array<{ name: string; ptype: ColPhysicalType; optional: boolean }> {
  const nameSet = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) nameSet.add(k);
  }
  const names = Array.from(nameSet);

  return names.map(name => {
    let hasNull = false;
    let hasBool = false;
    let hasFloat = false;
    let hasInt = false;
    let hasStr = false;

    for (const row of rows) {
      const v = row[name];
      if (v === null || v === undefined) { hasNull = true; continue; }
      if (typeof v === 'boolean') { hasBool = true; continue; }
      if (typeof v === 'number') {
        if (!Number.isInteger(v) || v > 2147483647 || v < -2147483648) hasFloat = true;
        else hasInt = true;
        continue;
      }
      hasStr = true;
    }

    let ptype: ColPhysicalType;
    if (hasBool && !hasFloat && !hasInt && !hasStr) ptype = PT_BOOLEAN;
    else if (hasFloat && !hasStr) ptype = PT_DOUBLE;
    else if (hasInt && !hasFloat && !hasStr) ptype = PT_INT32;
    else ptype = PT_BYTE_ARRAY; // strings + mixed

    return { name, ptype, optional: hasNull };
  });
}

// ---------------------------------------------------------------------------
// Data page encoding
// ---------------------------------------------------------------------------

function encodeBoolean(values: (boolean | null)[], optional: boolean): Uint8Array {
  const buf: number[] = [];

  if (optional) {
    // RLE definition levels (0 = null, 1 = present)
    const defs = values.map(v => (v !== null && v !== undefined ? 1 : 0));
    appendRleBitPacked(buf, defs, 1);
  }

  // Pack bits
  let byte = 0;
  let bit = 0;
  for (const v of values) {
    if (v) byte |= 1 << bit;
    bit++;
    if (bit === 8) { buf.push(byte); byte = 0; bit = 0; }
  }
  if (bit > 0) buf.push(byte);

  return new Uint8Array(buf);
}

function encodeInt32(values: (number | null)[], optional: boolean): Uint8Array {
  const buf: number[] = [];

  if (optional) {
    const defs = values.map(v => (v !== null && v !== undefined ? 1 : 0));
    appendRleBitPacked(buf, defs, 1);
  }

  for (const v of values) {
    if (v === null || v === undefined) continue;
    const n = Math.trunc(v);
    buf.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff);
  }
  return new Uint8Array(buf);
}

function encodeDouble(values: (number | null)[], optional: boolean): Uint8Array {
  const dv = new DataView(new ArrayBuffer(8));
  const buf: number[] = [];

  if (optional) {
    const defs = values.map(v => (v !== null && v !== undefined ? 1 : 0));
    appendRleBitPacked(buf, defs, 1);
  }

  for (const v of values) {
    if (v === null || v === undefined) continue;
    dv.setFloat64(0, v, true);
    for (let i = 0; i < 8; i++) buf.push(dv.getUint8(i));
  }
  return new Uint8Array(buf);
}

function encodeByteArray(values: (string | number | boolean | null | undefined)[], optional: boolean): Uint8Array {
  const enc = new TextEncoder();
  const buf: number[] = [];

  if (optional) {
    const defs = values.map(v => (v !== null && v !== undefined ? 1 : 0));
    appendRleBitPacked(buf, defs, 1);
  }

  for (const v of values) {
    if (v === null || v === undefined) continue;
    const bytes = enc.encode(String(v));
    const len = bytes.length;
    buf.push(len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, (len >> 24) & 0xff);
    for (const b of bytes) buf.push(b);
  }
  return new Uint8Array(buf);
}

/** Simple RLE encoding for bit-width=1 definition levels */
function appendRleBitPacked(buf: number[], values: number[], bitWidth: number) {
  // We'll write a length-prefixed RLE block
  const inner: number[] = [];

  // bit-packing header
  let i = 0;
  while (i < values.length) {
    // run of up to 8 values
    const run = values.slice(i, i + 8);
    const header = (run.length << 1) | 1; // bit-packed run
    writeUVarint(inner, header);
    // pack bits into bytes
    let byte = 0;
    for (let j = 0; j < run.length; j++) {
      byte |= (run[j] & ((1 << bitWidth) - 1)) << (j * bitWidth);
    }
    inner.push(byte);
    i += run.length;
  }

  // prefix with total byte length of the RLE block
  writeUVarint(buf, inner.length);
  for (const b of inner) buf.push(b);
}

// ---------------------------------------------------------------------------
// Thrift PageHeader serialisation
// ---------------------------------------------------------------------------
function buildDataPageHeader(
  numValues: number,
  encodedSize: number,
  uncompressedSize: number,
  encoding: number,
  defLevelEncoding: number,
  repLevelEncoding: number
): Uint8Array {
  const buf: number[] = [];
  let prevField = 0;

  // field 1: page_type (i32) = 0 (DATA_PAGE)
  thriftI32(buf, 1 - prevField, PAGE_DATA_V1); prevField = 1;
  // field 2: uncompressed_page_size (i32)
  thriftI32(buf, 2 - prevField, uncompressedSize); prevField = 2;
  // field 3: compressed_page_size (i32)
  thriftI32(buf, 3 - prevField, encodedSize); prevField = 3;

  // field 5: data_page_header (struct)
  thriftField(buf, 5 - prevField, 12); prevField = 5; // type = 12 (struct)
  {
    let f = 0;
    // field 1: num_values (i32)
    thriftI32(buf, 1 - f, numValues); f = 1;
    // field 2: encoding (i32)
    thriftI32(buf, 2 - f, encoding); f = 2;
    // field 3: definition_level_encoding (i32)
    thriftI32(buf, 3 - f, defLevelEncoding); f = 3;
    // field 4: repetition_level_encoding (i32)
    thriftI32(buf, 4 - f, repLevelEncoding); f = 4;
    thriftStop(buf);
  }

  thriftStop(buf);
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// Thrift FileMetaData + ColumnMetaData
// ---------------------------------------------------------------------------
interface ColumnChunkMeta {
  name: string;
  ptype: ColPhysicalType;
  optional: boolean;
  fileOffset: number;
  totalUncompressedSize: number;
  totalCompressedSize: number;
  numValues: number;
  dataPageOffset: number;
  encodings: number[];
}

function buildFileMetadata(
  numRows: number,
  schema: Array<{ name: string; ptype: ColPhysicalType; optional: boolean }>,
  chunks: ColumnChunkMeta[]
): Uint8Array {
  const buf: number[] = [];
  let f = 0;

  // field 1: version (i32) = 1
  thriftI32(buf, 1 - f, 1); f = 1;

  // field 2: schema (list<SchemaElement>)
  thriftField(buf, 2 - f, 15); f = 2; // list
  thriftListHeader(buf, schema.length + 1, 12); // +1 for message element

  // Root schema element
  {
    let sf = 0;
    // field 1: type — omit for root (it's a group)
    // field 2: repetition_type omitted
    // field 3: name
    thriftField(buf, 3 - sf, 8); sf = 3; thriftString(buf, 'schema');
    // field 4: num_children
    thriftI32(buf, 4 - sf, schema.length); sf = 4;
    thriftStop(buf);
  }

  for (const col of schema) {
    let sf = 0;
    // field 1: type (i32)
    thriftI32(buf, 1 - sf, col.ptype); sf = 1;
    // field 2: type_length — omit
    // field 3: repetition_type
    thriftI32(buf, 3 - sf, col.optional ? OPTIONAL : REQUIRED); sf = 3;
    // field 4: name (string)
    thriftField(buf, 4 - sf, 8); sf = 4; thriftString(buf, col.name);
    thriftStop(buf);
  }

  // field 3: num_rows (i64)
  thriftI64(buf, 3 - f, numRows); f = 3;

  // field 4: row_groups (list<RowGroup>)
  thriftField(buf, 4 - f, 15); f = 4; // list
  thriftListHeader(buf, 1, 12); // 1 row group

  {
    // RowGroup
    let rg = 0;
    // field 1: columns (list<ColumnChunk>)
    thriftField(buf, 1 - rg, 15); rg = 1;
    thriftListHeader(buf, chunks.length, 12);

    for (const chunk of chunks) {
      let cc = 0;
      // field 2: meta_data (ColumnMetaData struct)
      thriftField(buf, 2 - cc, 12); cc = 2;
      {
        let cm = 0;
        // field 1: type
        thriftI32(buf, 1 - cm, chunk.ptype); cm = 1;
        // field 2: encodings (list<Encoding>)
        thriftField(buf, 2 - cm, 15); cm = 2;
        thriftListHeader(buf, chunk.encodings.length, 5);
        for (const enc of chunk.encodings) writeZigzag(buf, enc);
        // field 3: path_in_schema (list<string>)
        thriftField(buf, 3 - cm, 15); cm = 3;
        thriftListHeader(buf, 1, 8);
        thriftString(buf, chunk.name);
        // field 4: codec
        thriftI32(buf, 4 - cm, COMP_UNCOMPRESSED); cm = 4;
        // field 5: num_values (i64)
        thriftI64(buf, 5 - cm, chunk.numValues); cm = 5;
        // field 6: total_uncompressed_size (i64)
        thriftI64(buf, 6 - cm, chunk.totalUncompressedSize); cm = 6;
        // field 7: total_compressed_size (i64)
        thriftI64(buf, 7 - cm, chunk.totalCompressedSize); cm = 7;
        // field 9: data_page_offset (i64)
        thriftI64(buf, 9 - cm, chunk.dataPageOffset); cm = 9;
        thriftStop(buf);
      }
      thriftStop(buf); // ColumnChunk
    }

    // field 2: total_byte_size (i64)
    const totalBytes = chunks.reduce((s, c) => s + c.totalCompressedSize, 0);
    thriftI64(buf, 2 - rg, totalBytes); rg = 2;
    // field 3: num_rows (i64)
    thriftI64(buf, 3 - rg, numRows); rg = 3;
    thriftStop(buf); // RowGroup
  }

  // field 6: created_by (string)
  thriftField(buf, 6 - f, 8); f = 6;
  thriftString(buf, 'synthia-parquet-writer v1.0');

  thriftStop(buf);
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert an array of plain JS objects into a valid Apache Parquet v1 binary.
 * Returns a Uint8Array suitable for download via a Blob.
 */
export function writeParquet(rows: ParquetRow[]): Uint8Array {
  if (rows.length === 0) {
    throw new Error('Cannot write empty Parquet file — no rows provided');
  }

  const schema = inferSchema(rows);
  const MAGIC = new Uint8Array([0x50, 0x41, 0x52, 0x31]); // "PAR1"

  // Collect parts: [magic, ...pages, footer, footer_len_le32, magic]
  const parts: Uint8Array[] = [MAGIC];
  let byteOffset = 4; // after leading magic

  const chunkMetas: ColumnChunkMeta[] = [];

  for (const col of schema) {
    const rawValues = rows.map(r => r[col.name] ?? null);

    // Encode column data
    let encoded: Uint8Array;
    let encoding: number;

    switch (col.ptype) {
      case PT_BOOLEAN:
        encoded = encodeBoolean(rawValues as (boolean | null)[], col.optional);
        encoding = ENC_PLAIN;
        break;
      case PT_INT32:
        encoded = encodeInt32(rawValues as (number | null)[], col.optional);
        encoding = ENC_PLAIN;
        break;
      case PT_DOUBLE:
        encoded = encodeDouble(rawValues as (number | null)[], col.optional);
        encoding = ENC_PLAIN;
        break;
      default: // BYTE_ARRAY
        encoded = encodeByteArray(rawValues, col.optional);
        encoding = ENC_PLAIN;
    }

    const defEncoding = col.optional ? ENC_RLE : ENC_PLAIN;
    const pageHeader = buildDataPageHeader(
      rows.length,
      encoded.length,
      encoded.length,
      encoding,
      defEncoding,
      ENC_PLAIN
    );

    const dataPageOffset = byteOffset;
    parts.push(pageHeader);
    byteOffset += pageHeader.length;
    parts.push(encoded);
    byteOffset += encoded.length;

    const totalSize = pageHeader.length + encoded.length;

    chunkMetas.push({
      name: col.name,
      ptype: col.ptype,
      optional: col.optional,
      fileOffset: dataPageOffset,
      totalUncompressedSize: totalSize,
      totalCompressedSize: totalSize,
      numValues: rows.length,
      dataPageOffset,
      encodings: col.optional ? [ENC_PLAIN, ENC_RLE] : [ENC_PLAIN],
    });
  }

  // Footer
  const footer = buildFileMetadata(rows.length, schema, chunkMetas);
  parts.push(footer);

  // Footer length (4 bytes LE)
  const footerLen = footer.length;
  const footerLenBytes = new Uint8Array(4);
  footerLenBytes[0] = footerLen & 0xff;
  footerLenBytes[1] = (footerLen >> 8) & 0xff;
  footerLenBytes[2] = (footerLen >> 16) & 0xff;
  footerLenBytes[3] = (footerLen >> 24) & 0xff;
  parts.push(footerLenBytes);

  // Trailing magic
  parts.push(MAGIC);

  // Concatenate all parts
  const totalLength = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(totalLength);
  let off = 0;
  for (const p of parts) {
    result.set(p, off);
    off += p.length;
  }

  return result;
}
