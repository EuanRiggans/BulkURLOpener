import * as v from 'valibot';
import { createMigrationListener } from './storage/messages';
import {
  servicePage,
  serviceRequestSchema,
  allowedRequest,
  type ServiceSender,
} from './service-protocol';
import {
  isRecoveryPage,
  requestSchema as migrationSchema,
} from './storage/protocol';
import { type SharedServices } from './services';
import { type StorageCoordinator } from './storage/coordinator';
import { extensionPages } from '../shared/extension-pages';
import { MigrationError, requireCondition } from '../domain/storage/errors';

const windowIdSchema = v.nullable(
  v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
);
const pageEnvelope = v.strictObject({
  type: v.literal('buo:page'),
  windowId: windowIdSchema,
  request: v.unknown(),
});
export type PageBackend = {
  services: SharedServices;
  storage: StorageCoordinator;
};
export interface PageRoutingPort {
  origin(
    sender: ServiceSender,
    claimed: number | null,
  ): Promise<{ windowId: number; private: boolean }>;
  backend(context: {
    windowId: number;
    private: boolean;
  }): Promise<PageBackend>;
}
export function createPageListener(
  port: PageRoutingPort,
  identity: { id: string; root: string },
) {
  return (
    raw: unknown,
    sender: ServiceSender,
    respond: (reply: unknown) => void,
  ): true | undefined => {
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('type' in raw) ||
      typeof raw.type !== 'string'
    )
      return;
    const type = raw.type;
    if (
      type !== 'buo:page' &&
      !type.startsWith('buo:service/') &&
      !type.startsWith('buo:migration/')
    )
      return;
    void (async () => {
      const page = servicePage(sender, identity);
      requireCondition(
        page && (extensionPages as readonly string[]).includes(page),
        'UNAUTHORIZED_PAGE',
      );
      const wrapped =
        raw.type === 'buo:page' ? v.parse(pageEnvelope, raw) : null;
      const request = wrapped ? wrapped.request : raw;
      const migration = Boolean(
        request &&
        typeof request === 'object' &&
        'type' in request &&
        typeof request.type === 'string' &&
        request.type.startsWith('buo:migration/'),
      );
      if (migration) {
        requireCondition(
          isRecoveryPage(sender, identity.id, identity.root),
          'UNAUTHORIZED_PAGE',
        );
        v.parse(migrationSchema, request);
      } else {
        const parsed = v.parse(serviceRequestSchema, request);
        requireCondition(allowedRequest(page, parsed), 'UNAUTHORIZED_PAGE');
      }
      const context = await port.origin(sender, wrapped?.windowId ?? null);
      const scoped: ServiceSender = {
        ...sender,
        tab: {
          ...sender.tab,
          windowId: context.windowId,
          incognito: context.private,
        },
      };
      if (
        request &&
        typeof request === 'object' &&
        'type' in request &&
        request.type === 'buo:service/context.read'
      ) {
        v.parse(
          v.strictObject({ type: v.literal('buo:service/context.read') }),
          request,
        );
        return { ok: true, value: { private: context.private } };
      }
      const backend = await port.backend(context);
      if (migration) {
        return new Promise((resolve) => {
          createMigrationListener(backend.storage, identity, context.private)(
            request,
            scoped,
            resolve,
          );
        });
      }
      return {
        ok: true,
        value: await backend.services.dispatch(request, scoped),
      };
    })()
      .then(respond, (reason: unknown) =>
        respond({
          ok: false,
          error:
            reason instanceof MigrationError ? reason.code : 'REQUEST_FAILED',
        }),
      )
      .catch(() => undefined);
    return true;
  };
}
