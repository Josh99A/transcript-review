// Shared by the upload form (browser) and the upload route (server).

const BY_EXTENSION: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  aac: "audio/aac",
  m4a: "audio/mp4",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  weba: "audio/webm",
  amr: "audio/amr",
  wma: "audio/x-ms-wma",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  "3gp": "video/3gpp",
  avi: "video/x-msvideo",
};

// Odd names some systems (notably Windows) report, mapped to what browsers play.
const ALIASES: Record<string, string> = {
  "audio/x-aac": "audio/aac",
  "audio/aacp": "audio/aac",
  "audio/vnd.dlna.adts": "audio/aac",
  "audio/x-hx-aac-adts": "audio/aac",
  "audio/x-m4a": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/mp3": "audio/mpeg",
  "audio/x-wav": "audio/wav",
  "audio/wave": "audio/wav",
};

/** File picker filter: any audio/video, plus extensions some phones and Windows don't label. */
export const MEDIA_ACCEPT = "audio/*,video/*," + Object.keys(BY_EXTENSION).map((e) => "." + e).join(",");

/** The media type to store and serve for an uploaded file, or null if it isn't audio or video. */
export function mediaTypeOf(name: string, reported: string): string | null {
  const type = reported.toLowerCase();
  if (ALIASES[type]) return ALIASES[type];
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (BY_EXTENSION[ext]) return BY_EXTENSION[ext];
  return /^(audio|video)\//.test(type) ? type : null;
}

const ADTS_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** Length in seconds of a raw AAC (ADTS) file, counted frame by frame. Null if it isn't ADTS. */
export function adtsDuration(b: Uint8Array): number | null {
  let i = 0;
  // Skip an ID3 tag at the start, if any.
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
  let samples = 0;
  let rate = 0;
  while (i + 7 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xf6) !== 0xf0) break;
    rate = ADTS_RATES[(b[i + 2] >> 2) & 0x0f] ?? 0;
    const len = ((b[i + 3] & 0x03) << 11) | (b[i + 4] << 3) | (b[i + 5] >> 5);
    if (!rate || len < 7) break;
    samples += 1024 * ((b[i + 6] & 0x03) + 1);
    i += len;
  }
  return samples && rate ? samples / rate : null;
}

/** Length in seconds from an MP4/M4A/MOV file's movie header. Null if not found. */
export function mp4Duration(b: Uint8Array): number | null {
  for (let i = 4; i + 32 <= b.length; i++) {
    if (b[i] !== 0x6d || b[i + 1] !== 0x76 || b[i + 2] !== 0x68 || b[i + 3] !== 0x64) continue; // "mvhd"
    const v = new DataView(b.buffer, b.byteOffset + i + 4);
    if (v.getUint8(0) === 1) {
      const scale = v.getUint32(20);
      const dur = Number(v.getBigUint64(24));
      return scale ? dur / scale : null;
    }
    const scale = v.getUint32(12);
    return scale ? v.getUint32(16) / scale : null;
  }
  return null;
}
