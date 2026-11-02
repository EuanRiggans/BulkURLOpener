import * as v from 'valibot';
import { digest } from '../../domain/storage/json';
import { requireCondition } from '../../domain/storage/errors';
import {
  backupSchema,
  storagePrefix,
  type CanonicalData,
  type Head,
} from '../../domain/storage/schema';
import {
  draftHeadSchema,
  draftRecordSchema,
  draftSaveSchema,
  snapshotSchema,
  transferRecordSchema,
  type DraftSave,
  type TransferRecord,
} from '../../domain/workspace-schema';
import { toPortable } from '../../domain/portable';
import { sameContent } from '../../domain/storage/migrate';

export interface WorkspaceIO {
  read(): Promise<Record<string, unknown>>;
  append(key: string, value: unknown): Promise<void>;
  write(key: string, value: unknown): Promise<void>;
  removeSnapshots(keys: string[]): Promise<void>;
}
function parsed<T>(schema: v.GenericSchema<T>, raw: unknown): T {
  const result = v.safeParse(schema, raw);
  requireCondition(result.success, 'WORKSPACE_INTEGRITY_FAILED');
  return result.output;
}
const draftHeadKey = storagePrefix + 'draft';
const draftKey = (hash: string) => storagePrefix + 'draft-state:' + hash;
const snapshotPrefix = storagePrefix + 'snapshot:';
export class WorkspaceStore {
  constructor(private readonly io: WorkspaceIO) {}
  async draft(fallback: string[] | null) {
    const store = await this.io.read();
    if (!Object.hasOwn(store, draftHeadKey))
      return { head: null, lines: fallback };
    const head = parsed(draftHeadSchema, store[draftHeadKey]);
    const record = head.record;
    requireCondition(
      (await digest(record)) === head.digest && !record.conflict,
      'WORKSPACE_INTEGRITY_FAILED',
    );
    return { head: head.digest, lines: record.lines };
  }
  async saveDraft(raw: DraftSave, fallback: string[] | null, freeze = false) {
    const request = v.parse(draftSaveSchema, raw);
    const current = await this.draft(fallback);
    const store = await this.io.read();
    const previous = current.head
      ? parsed(draftHeadSchema, store[draftHeadKey]).record
      : null;
    if (
      previous?.client === request.client &&
      previous.sequence === request.sequence
    )
      requireCondition(
        sameContent(previous.lines, request.lines),
        'OPERATION_ID_REUSED',
      );
    if (
      previous?.client === request.client &&
      previous.sequence >= request.sequence
    ) {
      if (freeze) await this.io.append(draftKey(current.head!), previous);
      return { saved: true, submitted: current.head!, current };
    }
    const saved =
      previous?.client === request.client || request.base === current.head;
    const record = {
      schemaVersion: 1 as const,
      previous: current.head,
      client: request.client,
      sequence: request.sequence,
      lines: request.lines,
      conflict: !saved,
    };
    const hash = await digest(record);
    if (!saved || freeze) await this.io.append(draftKey(hash), record);
    if (saved)
      await this.io.write(draftHeadKey, {
        schemaVersion: 1,
        digest: hash,
        record,
      });
    return {
      saved,
      submitted: hash,
      current: saved ? { head: hash, lines: request.lines } : current,
    };
  }
  async draftSnapshot(id: string): Promise<string[]> {
    const raw = (await this.io.read())[draftKey(id)];
    const record = parsed(draftRecordSchema, raw);
    requireCondition(
      (await digest(record)) === id,
      'WORKSPACE_INTEGRITY_FAILED',
    );
    return record.lines;
  }
  async recovered(data: CanonicalData) {
    const rows = data.recoveredInputs.map((input, index) => ({
      id: 'legacy-' + String(index),
      label:
        input.kind === 'pending-opening'
          ? 'Legacy pending opening'
          : 'Legacy new-list draft',
      lines: input.lines,
    }));
    for (const [key, raw] of Object.entries(await this.io.read()).filter(
      ([key]) => key.startsWith(storagePrefix + 'draft-state:'),
    )) {
      const record = v.safeParse(draftRecordSchema, raw);
      if (
        record.success &&
        record.output.conflict &&
        (await digest(record.output)) ===
          key.slice((storagePrefix + 'draft-state:').length)
      )
        rows.push({
          id: key.slice((storagePrefix + 'draft-state:').length),
          label: 'Draft kept after a concurrent edit',
          lines: record.output.lines,
        });
    }
    return rows;
  }
  async transfer(record: TransferRecord): Promise<string> {
    const checked = parsed(transferRecordSchema, record);
    const id = await digest(checked);
    await this.io.append(storagePrefix + 'transfer:' + id, checked);
    return id;
  }
  async readTransfer(id: string): Promise<TransferRecord> {
    const record = parsed(
      transferRecordSchema,
      (await this.io.read())[storagePrefix + 'transfer:' + id],
    );
    requireCondition(
      (await digest(record)) === id,
      'WORKSPACE_INTEGRITY_FAILED',
    );
    return record;
  }
  async snapshots() {
    const records = [];
    let damaged = 0;
    for (const [key, raw] of Object.entries(await this.io.read()).filter(
      ([key]) => key.startsWith(snapshotPrefix),
    )) {
      const record = v.safeParse(snapshotSchema, raw);
      const id = key.slice(snapshotPrefix.length);
      if (
        !record.success ||
        (await digest({
          head: record.output.head,
          data: record.output.data,
        })) !== id
      ) {
        damaged++;
        continue;
      }
      records.push({
        id,
        revision: record.output.head.revision,
        createdAt: record.output.createdAt,
        lists: record.output.data.lists.length,
      });
    }
    records.sort((a, b) => b.revision - a.revision || b.id.localeCompare(a.id));
    return { records, damaged };
  }
  async snapshot(id: string) {
    const record = parsed(
      snapshotSchema,
      (await this.io.read())[snapshotPrefix + id],
    );
    requireCondition(
      (await digest({ head: record.head, data: record.data })) === id,
      'WORKSPACE_INTEGRITY_FAILED',
    );
    return record;
  }
  async capture(head: Head, data: CanonicalData, now: string) {
    const portable = toPortable(data);
    const id = await digest({ head, data: portable });
    const existing = (await this.io.read())[snapshotPrefix + id];
    if (existing !== undefined) {
      const record = await this.snapshot(id);
      requireCondition(
        sameContent(record.data, portable),
        'WORKSPACE_INTEGRITY_FAILED',
      );
    } else
      await this.io.append(snapshotPrefix + id, {
        schemaVersion: 1,
        head,
        data: portable,
        createdAt: now,
      });
    const extra = (await this.snapshots()).records
      .slice(5)
      .map((record) => snapshotPrefix + record.id);
    if (extra.length) {
      try {
        await this.io.removeSnapshots(extra);
      } catch {
        /* Retain extra snapshots when cleanup is unavailable. */
      }
    }
    return id;
  }
  async purgeSnapshots() {
    const records = (await this.snapshots()).records;
    await this.io.removeSnapshots(
      records.map((record) => snapshotPrefix + record.id),
    );
  }
  async archives() {
    const result = new Map<
      string,
      { id: string; label: string; raw: unknown }
    >();
    const add = async (raw: unknown, label: string) => {
      if (typeof raw === 'string') {
        try {
          raw = JSON.parse(raw) as unknown;
        } catch {
          return;
        }
      }
      const id = await digest(raw);
      if (!result.has(id)) result.set(id, { id, label, raw });
    };
    for (const [key, raw] of Object.entries(await this.io.read()).filter(
      ([key]) => key.startsWith(storagePrefix + 'backup:'),
    )) {
      const backup = parsed(backupSchema, raw);
      requireCondition(
        (await digest(backup.sources)) === backup.digest &&
          key.endsWith(backup.digest),
        'WORKSPACE_INTEGRITY_FAILED',
      );
      const snapshots = backup.sources.localStorage.storage_snapshots;
      if (snapshots) {
        let value: unknown;
        try {
          value = JSON.parse(snapshots) as unknown;
        } catch {
          value = undefined;
        }
        if (
          value &&
          typeof value === 'object' &&
          'backups' in value &&
          Array.isArray(value.backups)
        )
          for (const [index, entry] of (value.backups as unknown[]).entries())
            await add(entry, 'Legacy snapshot ' + String(index + 1));
      }
      if (Object.hasOwn(backup.sources.storageSync, 'user_settings'))
        await add(
          backup.sources.storageSync.user_settings,
          'Original legacy browser sync copy',
        );
    }
    return [...result.values()];
  }
}
