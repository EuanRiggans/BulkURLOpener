import * as v from 'valibot';
import {
  hashSchema,
  headSchema,
  mutationInputSchema,
} from '../domain/storage/schema';
import { controlSchema, targetWindowSchema } from '../domain/opening/schema';

const type = <A extends string>(action: A) =>
  v.literal(('buo:service/' + action) as `buo:service/${A}`);
const windowId = v.optional(targetWindowSchema, null);
export const serviceRequestSchema = v.variant('type', [
  v.strictObject({ type: type('library.read') }),
  v.strictObject({ type: type('library.mutate'), input: mutationInputSchema }),
  v.strictObject({ type: type('library.pending') }),
  v.strictObject({ type: type('library.resume'), stateDigest: hashSchema }),
  v.strictObject({ type: type('capture'), windowId }),
  v.strictObject({
    type: type('open.lines'),
    id: hashSchema,
    lines: v.array(v.string()),
    windowId,
    expectedHead: v.nullable(headSchema),
  }),
  v.strictObject({
    type: type('open.list'),
    id: hashSchema,
    listId: v.pipe(v.string(), v.regex(/^list-[a-f0-9]{64}$/)),
    windowId,
    expectedHead: v.nullable(headSchema),
  }),
  v.strictObject({ type: type('jobs.list') }),
  v.strictObject({
    type: type('jobs.control'),
    id: hashSchema,
    revision: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
    control: controlSchema,
  }),
  v.strictObject({
    type: type('deferred.load'),
    job: hashSchema,
    index: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
    navigate: v.boolean(),
  }),
]);
export type ServiceRequest = v.InferOutput<typeof serviceRequestSchema>;
export type ServiceSender = {
  id?: string;
  url?: string;
  tab?: {
    id?: number | undefined;
    windowId?: number | undefined;
    incognito?: boolean;
  };
};

export function servicePage(
  sender: ServiceSender,
  identity: { id: string; root: string },
): string | null {
  if (sender.id !== identity.id || !sender.url) return null;
  try {
    const url = new URL(sender.url),
      root = new URL(identity.root);
    if (
      !['chrome-extension:', 'moz-extension:'].includes(root.protocol) ||
      url.protocol !== root.protocol ||
      url.host !== root.host ||
      url.username ||
      url.password
    )
      return null;
    return url.pathname;
  } catch {
    return null;
  }
}
export function allowedRequest(page: string, request: ServiceRequest): boolean {
  if (request.type === 'buo:service/deferred.load')
    return page === '/deferred.html';
  if (page === '/deferred.html') return false;
  if (
    ![
      '/popup.html',
      '/options.html',
      '/new-list.html',
      '/edit-list.html',
      '/opening.html',
    ].includes(page)
  )
    return false;
  if (request.type === 'buo:service/library.mutate') {
    const kind = request.input.command.kind;
    return kind === 'list.create'
      ? page === '/new-list.html'
      : kind === 'list.update'
        ? page === '/edit-list.html'
        : kind === 'list.delete'
          ? ['/popup.html', '/options.html'].includes(page)
          : kind === 'settings.update'
            ? page === '/options.html'
            : page === '/popup.html';
  }
  if (request.type === 'buo:service/library.read') return true;
  if (
    request.type === 'buo:service/library.pending' ||
    request.type === 'buo:service/library.resume'
  )
    return page === '/options.html';
  if (request.type === 'buo:service/capture')
    return ['/popup.html', '/new-list.html', '/edit-list.html'].includes(page);
  if (
    request.type === 'buo:service/open.lines' ||
    request.type === 'buo:service/open.list'
  )
    return page === '/popup.html';
  return ['/options.html', '/opening.html'].includes(page);
}
