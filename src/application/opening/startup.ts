import * as v from 'valibot';
import type { StorageCoordinator, Exclusive } from '../storage/coordinator';
import type { OpeningService } from './service';
import { hashSchema, headSchema } from '../../domain/storage/schema';
import { targetWindowSchema } from '../../domain/opening/schema';
import { MigrationError, requireCondition } from '../../domain/storage/errors';

export const startupRecordSchema = v.strictObject({
  schemaVersion: v.literal(1),
  id: hashSchema,
  status: v.picklist(['pending', 'done']),
  windowId: targetWindowSchema,
  expectedHead: v.nullable(headSchema),
  outcome: v.nullable(v.string()),
});
export type StartupRecord = v.InferOutput<typeof startupRecordSchema>;
export interface StartupPort {
  exclusive: Exclusive;
  read(): Promise<unknown>;
  write(record: StartupRecord): Promise<void>;
  token(): string;
  normalWindow(id: number | null): Promise<number>;
}

export class StartupOpening {
  constructor(
    private readonly storage: StorageCoordinator,
    private readonly opening: OpeningService,
    private readonly port: StartupPort,
  ) {}
  event(): Promise<void> {
    return this.run(true);
  }
  recover(): Promise<void> {
    return this.run(false);
  }
  private run(create: boolean): Promise<void> {
    return this.port.exclusive(async () => {
      const value = await this.port.read();
      if (value === undefined && !create) return;
      let record: StartupRecord;
      if (value === undefined) {
        record = {
          schemaVersion: 1,
          id: this.port.token(),
          status: 'pending',
          windowId: null,
          expectedHead: null,
          outcome: null,
        };
        await this.port.write(record);
      } else {
        const parsed = v.safeParse(startupRecordSchema, value);
        requireCondition(parsed.success, 'STARTUP_SESSION_INVALID');
        record = parsed.output;
      }
      if (record.status === 'done') return;
      try {
        const active = await this.storage.requireActiveData();
        if (record.expectedHead === null) {
          record.expectedHead = active.head;
          await this.port.write(record);
        }
        if (active.data.settings.openOnLaunch === null) {
          record.status = 'done';
          record.outcome = null;
          await this.port.write(record);
          return;
        }
        if (
          active.data.settings.openOnLaunch !== null &&
          record.windowId === null
        ) {
          record.windowId = await this.port.normalWindow(null);
          await this.port.write(record);
        }
        await this.opening.enqueue({
          kind: 'startup',
          id: record.id,
          windowId: record.windowId,
          expectedHead: record.expectedHead,
        });
        record.status = 'done';
        record.outcome = null;
      } catch (error) {
        const code =
          error instanceof MigrationError ? error.code : 'STARTUP_FAILED';
        record.outcome = code;
        // Startup can precede the first normal window. Keep that request pending;
        // other failures need explicit recovery rather than a new startup job.
        if (code !== 'NO_TARGET_WINDOW') record.status = 'done';
      }
      await this.port.write(record);
    });
  }
}
