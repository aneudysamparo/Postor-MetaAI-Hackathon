import { useRef, useState } from 'react';
import type { ChangeEvent, JSX } from 'react';
import { postVoiceNote } from './api';
import type { RunArtifacts } from './api';
import { Chip, Section } from './ui';
import { startVoiceRecording, toWav16kMono, voiceRecordingSupported } from './voice';
import type { VoiceRecorder } from './voice';

// "Completar pendientes por voz": the bid manager answers the draft's
// [PENDING] items by speaking. Muse Voice Transcribe writes down what was
// said and Muse Spark maps it to the pending items. Answers are shown as
// the user's declarations (never verified evidence), with the document that
// would prove each one; the generated files are not rewritten.

type Phase = 'idle' | 'recording' | 'sending';

const MS_PER_SECOND = 1000;

function collectPending(artifacts: RunArtifacts): string[] {
  const draft = artifacts.draft;
  if (draft === null) {
    return [];
  }
  const all = [...draft.pendingFields, ...draft.sections.flatMap((section) => section.pending)];
  return [...new Set(all.map((item) => item.trim()).filter((item) => item.length > 0))];
}

export function VoicePending({
  runId,
  artifacts,
  metaKey,
  onAdded,
}: {
  runId: string;
  artifacts: RunArtifacts;
  metaKey: string;
  onAdded: () => Promise<unknown>;
}): JSX.Element | null {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<VoiceRecorder | null>(null);
  const pending = collectPending(artifacts);
  if (pending.length === 0) {
    return null;
  }

  const send = async (wav: Blob): Promise<void> => {
    setPhase('sending');
    try {
      await postVoiceNote(runId, wav, metaKey);
      await onAdded();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : String(sendError));
    } finally {
      setPhase('idle');
    }
  };

  const toggleRecording = async (): Promise<void> => {
    setError(null);
    if (phase === 'recording' && recorder.current !== null) {
      const wav = await recorder.current.stop();
      recorder.current = null;
      await send(wav);
      return;
    }
    try {
      recorder.current = await startVoiceRecording();
      setPhase('recording');
    } catch {
      setError('No se pudo usar el micrófono. Puedes subir un archivo de audio.');
    }
  };

  const uploadClip = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) {
      return;
    }
    setError(null);
    try {
      await send(await toWav16kMono(file));
    } catch {
      setError('No se pudo leer ese archivo de audio.');
    }
  };

  let recordLabel = '🎙 Grabar respuesta';
  if (phase === 'recording') {
    recordLabel = '■ Detener y enviar';
  }
  if (phase === 'sending') {
    recordLabel = 'Transcribiendo…';
  }

  return (
    <Section title={`Completar pendientes por voz (${pending.length} [PENDING] en el borrador)`}>
      <p className="muted">
        Di en voz alta lo que sabes, por ejemplo: «los equipos serán Ubiquiti UniFi 6; la carta del
        distribuidor la pedimos el lunes». <b>Muse Voice Transcribe</b> lo transcribe y{' '}
        <b>Muse Spark</b> lo asigna a cada pendiente. Queda como declaración tuya, no como
        evidencia.
      </p>
      <ul className="checks">
        {pending.map((item) => (
          <li key={item}>
            <span className="chip chip-warn pending">pendiente: {item}</span>
          </li>
        ))}
      </ul>
      <p>
        {voiceRecordingSupported() && (
          <button
            type="button"
            className="btn"
            disabled={phase === 'sending'}
            onClick={() => void toggleRecording()}
          >
            {recordLabel}
          </button>
        )}{' '}
        <label className="muted">
          o sube un audio{' '}
          <input
            type="file"
            accept="audio/*"
            disabled={phase !== 'idle'}
            onChange={(event) => void uploadClip(event)}
          />
        </label>
      </p>
      {error !== null && <p className="error">{error}</p>}
      {[...artifacts.voiceNotes].reverse().map((note, noteIndex) => (
        <div key={`${noteIndex}-${note.transcript}`} className="panel">
          <p>
            <Chip tone="neutral">nota de voz</Chip>{' '}
            {note.audioDurationMs !== null && (
              <span className="muted">{Math.round(note.audioDurationMs / MS_PER_SECOND)} s · </span>
            )}
            <i>«{note.transcript}»</i>
          </p>
          <ul className="checks">
            {note.answers.map((answer) => (
              <li key={`${answer.pendingIndex}-${answer.answer}`}>
                <Chip tone="warn">declarado</Chip> <b>{answer.pending}:</b> {answer.answer}
                {answer.proofNeeded !== undefined && answer.proofNeeded !== null && (
                  <span className="muted"> · falta adjuntar: {answer.proofNeeded}</span>
                )}
              </li>
            ))}
            {note.unmatched.map((statement) => (
              <li key={statement} className="muted">
                Sin pendiente asociado: «{statement}»
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Section>
  );
}
