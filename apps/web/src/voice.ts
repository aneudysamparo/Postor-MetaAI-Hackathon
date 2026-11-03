// Microphone -> WAV for Muse Voice Transcribe, which only accepts mono
// 16-bit PCM WAV at 16 or 24 kHz. Browsers record compressed audio
// (webm/opus or mp4), so the clip is decoded, resampled to 16 kHz mono with
// an OfflineAudioContext and written as a WAV file.

const TARGET_SAMPLE_RATE = 16_000;
const MONO = 1;
const BITS_PER_SAMPLE = 16;
const BITS_PER_BYTE = 8;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / BITS_PER_BYTE;
const WAV_HEADER_BYTES = 44;
const PCM_FORMAT = 1;
const FMT_CHUNK_BYTES = 16;
const INT16_MAX = 0x7fff;
const INT16_MIN_ABS = 0x8000;
// Byte offsets of the canonical 44-byte RIFF/WAVE header.
const WAV_LAYOUT = {
  riffTag: 0,
  riffSize: 4,
  waveTag: 8,
  fmtTag: 12,
  fmtSize: 16,
  audioFormat: 20,
  channels: 22,
  sampleRate: 24,
  byteRate: 28,
  blockAlign: 32,
  bitsPerSample: 34,
  dataTag: 36,
  dataSize: 40,
} as const;
// RIFF size counts everything after the "RIFF" tag and the size field.
const RIFF_PREAMBLE_BYTES = 8;

export interface VoiceRecorder {
  stop: () => Promise<Blob>;
  cancel: () => void;
}

export function voiceRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    navigator.mediaDevices !== undefined &&
    typeof MediaRecorder !== 'undefined'
  );
}

export async function startVoiceRecording(): Promise<VoiceRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const parts: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => parts.push(event.data));
  recorder.start();
  const release = (): void => stream.getTracks().forEach((track) => track.stop());
  return {
    stop: () =>
      new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener('stop', () => {
          release();
          const recorded = new Blob(parts, { type: recorder.mimeType });
          toWav16kMono(recorded).then(resolve, reject);
        });
        recorder.stop();
      }),
    cancel: () => {
      recorder.stop();
      release();
    },
  };
}

// Any browser-decodable audio (recording or uploaded file) -> 16 kHz mono WAV.
export async function toWav16kMono(audio: Blob): Promise<Blob> {
  const decoder = new AudioContext();
  const decoded = await decoder.decodeAudioData(await audio.arrayBuffer());
  await decoder.close();
  const frames = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
  const offline = new OfflineAudioContext(MONO, frames, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataBytes = samples.length * BYTES_PER_SAMPLE;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(buffer);
  const writeTag = (offset: number, tag: string): void => {
    for (let index = 0; index < tag.length; index += 1) {
      view.setUint8(offset + index, tag.charCodeAt(index));
    }
  };
  // RIFF/WAVE header, then the "fmt " chunk (PCM, mono, 16-bit), then data.
  writeTag(WAV_LAYOUT.riffTag, 'RIFF');
  view.setUint32(WAV_LAYOUT.riffSize, WAV_HEADER_BYTES - RIFF_PREAMBLE_BYTES + dataBytes, true);
  writeTag(WAV_LAYOUT.waveTag, 'WAVE');
  writeTag(WAV_LAYOUT.fmtTag, 'fmt ');
  view.setUint32(WAV_LAYOUT.fmtSize, FMT_CHUNK_BYTES, true);
  view.setUint16(WAV_LAYOUT.audioFormat, PCM_FORMAT, true);
  view.setUint16(WAV_LAYOUT.channels, MONO, true);
  view.setUint32(WAV_LAYOUT.sampleRate, sampleRate, true);
  view.setUint32(WAV_LAYOUT.byteRate, sampleRate * MONO * BYTES_PER_SAMPLE, true);
  view.setUint16(WAV_LAYOUT.blockAlign, MONO * BYTES_PER_SAMPLE, true);
  view.setUint16(WAV_LAYOUT.bitsPerSample, BITS_PER_SAMPLE, true);
  writeTag(WAV_LAYOUT.dataTag, 'data');
  view.setUint32(WAV_LAYOUT.dataSize, dataBytes, true);
  let offset = WAV_HEADER_BYTES;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    let scaled = clamped * INT16_MAX;
    if (clamped < 0) {
      scaled = clamped * INT16_MIN_ABS;
    }
    view.setInt16(offset, scaled, true);
    offset += BYTES_PER_SAMPLE;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
