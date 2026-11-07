import { useEffect, useRef, useState } from 'preact/hooks';
import * as v from 'valibot';
import {
  maxArchiveBytes,
  packedJsonSchema,
  prepareImportText,
  type PackedJson,
} from '../../domain/storage/archive';
export function ArchiveFileInput({
  id,
  disabled,
  ready,
  failed,
  label = 'Select the downloaded full recovery archive',
}: {
  id: string;
  disabled: boolean;
  ready: (archive: PackedJson | null) => void;
  failed: (reason: unknown) => void;
  label?: string;
}) {
  const generation = useRef(0);
  const [loading, setLoading] = useState(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  return (
    <>
      <label for={id}>{label}</label>
      <input
        id={id}
        type="file"
        accept=".json,application/json"
        disabled={disabled || loading}
        onChange={(event) => {
          const version = ++generation.current;
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = '';
          ready(null);
          setLoading(Boolean(file));
          if (file)
            void (async () => {
              if (file.size > maxArchiveBytes)
                throw new Error('RECOVERY_ARCHIVE_TOO_LARGE');
              const text = new TextDecoder('utf-8', { fatal: true }).decode(
                await file.arrayBuffer(),
              );
              const archive = v.parse(
                packedJsonSchema,
                JSON.parse(await prepareImportText(text)),
              );
              if (version === generation.current) ready(archive);
            })()
              .catch((reason) => {
                if (version === generation.current) failed(reason);
              })
              .finally(() => {
                if (version === generation.current) setLoading(false);
              });
        }}
      />
      {loading && <p role="status">Checking recovery archive…</p>}
    </>
  );
}
