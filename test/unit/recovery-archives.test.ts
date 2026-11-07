import { describe, expect, it } from 'vitest';
import * as v from 'valibot';
import { WorkspaceService } from '../../src/application/workspace';
import { auditUpgrade } from '../../src/application/storage/upgrade-audit';
import {
  packJson,
  unpackJson,
  prepareImportText,
  maxArchiveBytes,
} from '../../src/domain/storage/archive';
import { recoveryExportSchema } from '../../src/domain/storage/schema';
import { transferRecordSchema } from '../../src/domain/workspace-schema';
import { digest } from '../../src/domain/storage/json';
import { sharedSetup, token } from './shared-support';

function encoded(bytes: Uint8Array) {
  return btoa(
    Array.from(bytes, (value) => String.fromCharCode(value)).join(''),
  );
}
async function compressed(value: BlobPart) {
  return encoded(
    new Uint8Array(
      await new Response(
        new Blob([value]).stream().pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer(),
    ),
  );
}

describe('compressed full recovery archives', () => {
  it('round-trips an archive above the old 8 MiB limit, preserves unknown originals, and imports without replaying jobs', async () => {
    const source = await sharedSetup();
    await source.storage.mutate({
      id: token(1),
      expectedHead: (await source.storage.requireActiveData()).head,
      command: {
        kind: 'list.create',
        name: 'Unicode café <list>',
        lines: [
          'https://example.test/?q=%2526&v=one,two',
          ' exact query & café ',
          '',
        ],
      },
    });
    await source.opening.enqueue({
      kind: 'lines',
      id: token(80),
      lines: ['https://pending.example.test/'],
      windowId: 1,
    });
    source.port.local['unknown-original'] =
      'Original preserved input café '.repeat(360_000);
    const raw = await source.storage.exportRecovery({
      opaque: 'unfinished original',
    });
    expect(
      new TextEncoder().encode(JSON.stringify(raw)).byteLength,
    ).toBeGreaterThan(8 * 1024 * 1024);
    const archive = await source.storage.exportArchive({
      opaque: 'unfinished original',
    });
    const decoded = v.parse(recoveryExportSchema, await unpackJson(archive));
    expect(decoded).toEqual(raw);
    expect((await auditUpgrade(archive, archive)).passed).toBe(true);
    const target = await sharedSetup();
    const workspace = new WorkspaceService(target.storage);
    const review = await workspace.preview(
      await prepareImportText(JSON.stringify(archive)),
      'file',
    );
    await workspace.apply({
      id: review.id,
      operation: token(1),
      acknowledgeReplacement: true,
      decisions: { acknowledgeIssues: false, preferences: {}, historical: {} },
    });
    expect((await target.storage.requireActiveData()).data.lists).toEqual(
      (await source.storage.requireActiveData()).data.lists,
    );
    expect(await target.opening.list()).toEqual([]);
    expect(target.browser.created).toEqual([]);
    const retained = v.parse(
      transferRecordSchema,
      target.port.local['buo:v2:transfer:' + review.id],
    );
    expect(await unpackJson(retained.raw)).toEqual(raw);
    expect(JSON.stringify(retained).length).toBeLessThan(200_000);
    for (let id = 2; id <= 4; id++) {
      const current = await target.storage.requireActiveData();
      await target.storage.mutate({
        id: token(id),
        expectedHead: current.head,
        command: {
          kind: 'settings.update',
          patch: { nightMode: current.data.settings.nightMode },
        },
      });
    }
    // Imported jobs, raw originals and other recovery data are not in the
    // active library; their original archive must outlive its fallback root.
    expect(target.port.local['buo:v2:transfer:' + review.id]).toEqual(retained);
  }, 30_000);
  it('accepts old uncompressed full-recovery and verified-backup downloads', async () => {
    const source = await sharedSetup();
    for (const raw of [
      await source.storage.exportRecovery({}),
      await source.storage.backup(source.review.backupDigest),
    ]) {
      const target = await sharedSetup();
      const workspace = new WorkspaceService(target.storage);
      const review = await workspace.preview(
        await prepareImportText(JSON.stringify(raw)),
        'file',
      );
      expect(review.portable?.lists ?? review.legacy?.lists).toEqual([]);
    }
  });
  it('detects checksum mismatch, truncation, invalid base64, unsupported codecs and invalid UTF-8', async () => {
    const packed = await packJson({ kept: 'café & exact=%2526' });
    for (const broken of [
      { ...packed, digest: token(99) },
      { ...packed, data: packed.data.slice(0, -8) },
      { ...packed, data: '%%%%' },
      { ...packed, codec: 'unknown' },
      { ...packed, data: await compressed(new Uint8Array([0xff]).buffer) },
    ])
      await expect(unpackJson(broken)).rejects.toThrow(
        'RECOVERY_ARCHIVE_INVALID',
      );
  });
  it('stops a compressed oversized archive while decoding and rejects oversized ordinary input', async () => {
    const archive = await packJson(null);
    const oversized = ' '.repeat(maxArchiveBytes + 1);
    await expect(prepareImportText(oversized)).rejects.toThrow(
      'RECOVERY_ARCHIVE_TOO_LARGE',
    );
    await expect(
      unpackJson({ ...archive, data: await compressed(oversized) }),
    ).rejects.toThrow('RECOVERY_ARCHIVE_TOO_LARGE');
  }, 30_000);
  it('verifies the original source checksum after decompression before retaining a review', async () => {
    const source = await sharedSetup();
    const raw = await source.storage.exportRecovery({});
    raw.sources.storageLocal.unknown = 'modified';
    expect(raw.digest).not.toBe(await digest(raw.sources));
    const before = structuredClone(source.port.local);
    await expect(
      new WorkspaceService(source.storage).preview(
        JSON.stringify(await packJson(raw)),
        'file',
      ),
    ).rejects.toThrow('IMPORT_INVALID');
    expect(source.port.local).toEqual(before);
  });
});
