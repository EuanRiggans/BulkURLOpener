import * as v from 'valibot';
import type { StorageCoordinator } from './storage/coordinator';
import type { OpeningService } from './opening/service';
import { advanceReceipt } from './opening/service';
import type { SavedListMenus } from './menus';
import {
  serviceRequestSchema,
  servicePage,
  allowedRequest,
  type ServiceRequest,
  type ServiceSender,
} from './service-protocol';
import { MigrationError, requireCondition } from '../domain/storage/errors';
import { destinationUrl } from '../domain/opening/urls';
import { WorkspaceService } from './workspace';

export interface ServicePlatform {
  targetWindow(id: number | null): Promise<number>;
  allowTransmission(): Promise<void>;
  capture(
    scope: 'currentWindow' | 'allOpenedTabs',
    windowId: number,
  ): Promise<{ urls: string[]; skipped: number }>;
  tab(id: number): Promise<{
    id: number;
    url: string;
    active: boolean;
    focused: boolean;
    incognito: boolean;
  }>;
  navigate(id: number, url: string): Promise<void>;
  deferredLock<T>(id: number, work: () => Promise<T>): Promise<T>;
  mainWindow?(targetWindow: number): Promise<void>;
}

export class SharedServices {
  private readonly workspace: WorkspaceService;
  constructor(
    readonly storage: StorageCoordinator,
    readonly opening: OpeningService,
    readonly menus: Pick<SavedListMenus, 'refresh'>,
    private readonly platform: ServicePlatform,
    private readonly identity: { id: string; root: string },
    private readonly kick: () => void,
    private readonly privateMode = false,
  ) {
    this.workspace = new WorkspaceService(storage);
  }

  async dispatch(raw: unknown, sender: ServiceSender): Promise<unknown> {
    const page = servicePage(sender, this.identity);
    requireCondition(page, 'UNAUTHORIZED_PAGE');
    const request = v.parse(serviceRequestSchema, raw);
    requireCondition(allowedRequest(page, request), 'UNAUTHORIZED_PAGE');
    requireCondition(
      Boolean(sender.tab?.incognito) === this.privateMode,
      'PRIVATE_WINDOW_UNSUPPORTED',
    );
    if (this.privateMode && request.type.startsWith('buo:service/sync.'))
      throw new MigrationError('PRIVATE_SYNC_UNAVAILABLE');
    // Action popups do not always have sender.tab. Resolve their browser
    // window before exposing editable data or accepting working-draft writes.
    if (
      page === '/popup.html' &&
      [
        'buo:service/workspace.read',
        'buo:service/draft.save',
        'buo:service/draft.freeze',
      ].includes(request.type)
    )
      await this.platform.targetWindow(
        ('windowId' in request ? request.windowId : null) ??
          sender.tab?.windowId ??
          null,
      );
    switch (request.type) {
      case 'buo:service/context.read':
        return { private: this.privateMode };
      case 'buo:service/workspace.read':
        return { ...(await this.workspace.read()), private: this.privateMode };
      case 'buo:service/draft.save':
        return this.workspace.saveDraft(request.input);
      case 'buo:service/draft.freeze':
        return this.workspace.saveDraft(request.input, true);
      case 'buo:service/appearance.read': {
        const { settings } = (await this.storage.requireActiveData()).data;
        return {
          nightMode: settings.nightMode,
          customTheme: settings.customTheme,
          buttonLook: settings.buttonLook,
        };
      }
      case 'buo:service/draft.read':
        return this.workspace.draft(request.id);
      case 'buo:service/data.recovered':
        return this.workspace.recovered();
      case 'buo:service/data.export':
        return this.workspace.export(request.legacy);
      case 'buo:service/data.preview':
        return this.workspace.preview(request.text, request.source);
      case 'buo:service/data.apply': {
        const result = await this.workspace.apply(request.input);
        await this.menus.refresh();
        return result;
      }
      case 'buo:service/snapshots.list':
        return this.workspace.snapshots();
      case 'buo:service/snapshots.capture':
        return this.workspace.captureSnapshot();
      case 'buo:service/snapshots.purge':
        return this.workspace.purgeSnapshots();
      case 'buo:service/snapshots.preview':
        return this.workspace.previewSnapshot(request.id, request.legacy);
      case 'buo:service/archives.list':
        return this.workspace.archives();
      case 'buo:service/sync.download':
        return this.workspace.previewDownload(request.legacy);
      case 'buo:service/sync.preview-upload':
        return this.workspace.previewUpload();
      case 'buo:service/sync.upload':
        await this.platform.allowTransmission();
        return this.workspace.upload(request.id);
      case 'buo:service/diagnostics':
        return this.workspace.diagnostics();
      case 'buo:service/main.open': {
        await this.storage.requireActiveData();
        const target = await this.platform.targetWindow(
          request.windowId ?? sender.tab?.windowId ?? null,
        );
        requireCondition(
          typeof this.platform.mainWindow === 'function',
          'WINDOW_OPEN_FAILED',
        );
        await this.platform.mainWindow(target);
        return true;
      }
      case 'buo:service/library.read':
        return this.storage.requireActiveData();
      case 'buo:service/library.mutate': {
        if (
          this.privateMode &&
          request.input.command.kind === 'settings.update'
        ) {
          const current = (await this.storage.requireActiveData()).data
            .settings;
          const patch = request.input.command.patch;
          requireCondition(
            (patch.openOnLaunch === undefined ||
              patch.openOnLaunch === current.openOnLaunch) &&
              (patch.contextMenuEnabled === undefined ||
                patch.contextMenuEnabled === current.contextMenuEnabled),
            'PRIVATE_PREFERENCE_UNAVAILABLE',
          );
        }
        const result = await this.storage.mutate(request.input);
        if (request.input.command.kind !== 'draft.update')
          await this.menus.refresh();
        return result;
      }
      case 'buo:service/library.pending':
        return this.storage.pendingMutations();
      case 'buo:service/library.resume': {
        const pending = (await this.storage.pendingMutations()).find(
          (change) => change.stateDigest === request.stateDigest,
        );
        requireCondition(pending, 'PENDING_CHANGE_NOT_FOUND');
        const result = await this.storage.mutate(pending.input);
        await this.menus.refresh();
        return result;
      }
      case 'buo:service/capture': {
        const active = await this.storage.requireActiveData();
        const target = await this.platform.targetWindow(
          request.windowId ?? sender.tab?.windowId ?? null,
        );
        const captured = await this.platform.capture(
          active.data.settings.currentlyOpenedTabsDisplay,
          target,
        );
        const lines: string[] = [];
        let skipped = captured.skipped;
        for (const url of captured.urls) {
          const helper = this.helper(url);
          if (helper === false) {
            skipped++;
            continue;
          }
          if (helper) {
            try {
              const view = await this.opening.get(helper.job);
              const entry = view.plan.destinations[helper.index];
              if (entry && view.plan.settings.loadOnFocus)
                lines.push(entry.url);
              else skipped++;
            } catch {
              skipped++;
            }
          } else lines.push(url);
        }
        return { lines, skipped };
      }
      case 'buo:service/open.lines':
      case 'buo:service/open.list': {
        await this.platform.allowTransmission();
        const windowId = await this.platform.targetWindow(
          request.windowId ?? sender.tab?.windowId ?? null,
        );
        const result =
          request.type === 'buo:service/open.lines'
            ? await this.opening.enqueue({
                kind: 'lines',
                id: request.id,
                lines: request.lines,
                expectedHead: request.expectedHead,
                windowId,
              })
            : await this.opening.enqueue({
                kind: 'list',
                trigger: 'saved-list',
                id: request.id,
                listId: request.listId,
                expectedHead: request.expectedHead,
                windowId,
              });
        this.kick();
        return result;
      }
      case 'buo:service/jobs.list':
        return this.opening.list();
      case 'buo:service/jobs.control': {
        const control =
          request.control.action === 'resume' ||
          request.control.action === 'retry'
            ? {
                ...request.control,
                windowId: await this.platform.targetWindow(
                  request.control.windowId ?? sender.tab?.windowId ?? null,
                ),
              }
            : request.control;
        if (['resume', 'retry', 'retry-activation'].includes(control.action))
          await this.platform.allowTransmission();
        const result = await this.opening.control(
          request.id,
          request.revision,
          control,
        );
        this.kick();
        return result;
      }
      case 'buo:service/deferred.load':
        return this.deferred(request, sender);
    }
  }

  // null = ordinary URL, false = own UI/nonrecoverable helper, object = helper.
  private helper(url: string): { job: string; index: number } | null | false {
    try {
      const page = new URL(url),
        root = new URL(this.identity.root);
      if (page.protocol !== root.protocol || page.host !== root.host)
        return null;
      if (page.pathname !== '/deferred.html') return false;
      const job = page.searchParams.get('job'),
        index = page.searchParams.get('index');
      if (
        !job ||
        !/^[a-f0-9]{64}$/.test(job) ||
        index === null ||
        !/^(0|[1-9]\d*)$/.test(index) ||
        !Number.isSafeInteger(Number(index))
      )
        return false;
      return { job, index: Number(index) };
    } catch {
      return null;
    }
  }
  private async deferred(
    request: Extract<ServiceRequest, { type: 'buo:service/deferred.load' }>,
    sender: ServiceSender,
  ) {
    const expected = this.helper(sender.url ?? '');
    requireCondition(
      expected &&
        expected.job === request.job &&
        expected.index === request.index &&
        sender.tab?.id !== undefined,
      'UNAUTHORIZED_PAGE',
    );
    const tabId = sender.tab.id;
    return this.platform.deferredLock(tabId, async () => {
      const tab = await this.platform.tab(tabId);
      const actual = this.helper(tab.url);
      requireCondition(
        tab.incognito === this.privateMode &&
          actual &&
          actual.job === request.job &&
          actual.index === request.index,
        'UNAUTHORIZED_PAGE',
      );
      const destination = await this.storage.withJobs(async (journal) => {
        const job = await journal.get(request.job);
        const entry = job?.plan.destinations[request.index];
        requireCondition(
          job &&
            entry &&
            job.plan.settings.loadOnFocus &&
            'url' in destinationUrl(entry.url),
          'DEFERRED_NOT_AVAILABLE',
        );
        let receipt = await journal.receipt(
          request.job,
          request.index,
          job.run.planDigest,
        );
        if (
          !receipt &&
          !job.run.inFlight &&
          job.run.cursor === request.index &&
          ['INTERRUPTED_CREATE', 'TAB_CREATE_FAILED'].includes(
            job.run.error ?? '',
          )
        ) {
          await advanceReceipt(
            journal,
            job,
            {
              schemaVersion: 1,
              jobId: request.job,
              index: request.index,
              planDigest: job.run.planDigest,
              kind: 'opened',
              tabId,
              recordedAt: Date.now(),
            },
            Date.now(),
          );
          receipt = await journal.receipt(
            request.job,
            request.index,
            job.run.planDigest,
          );
        }
        requireCondition(receipt?.kind !== 'skipped', 'DEFERRED_NOT_AVAILABLE');
        return { url: entry.url, ready: receipt !== null };
      });
      if (request.navigate && destination.ready) {
        const current = await this.platform.tab(tabId);
        const helper = this.helper(current.url);
        if (
          current.active &&
          current.focused &&
          current.incognito === this.privateMode &&
          helper &&
          helper.job === request.job &&
          helper.index === request.index
        ) {
          await this.platform.allowTransmission();
          await this.platform.navigate(tabId, destination.url);
          return { ...destination, loaded: true };
        }
      }
      return { ...destination, loaded: false };
    });
  }
}

export function createServiceListener(services: SharedServices) {
  return (
    message: unknown,
    sender: ServiceSender,
    sendResponse: (reply: unknown) => void,
  ): true | undefined => {
    if (
      typeof message !== 'object' ||
      message === null ||
      !('type' in message) ||
      typeof message.type !== 'string' ||
      !message.type.startsWith('buo:service/')
    )
      return undefined;
    void services
      .dispatch(message, sender)
      .then(
        (value) => sendResponse({ ok: true, value }),
        (error: unknown) =>
          sendResponse({
            ok: false,
            error:
              error instanceof MigrationError ? error.code : 'REQUEST_FAILED',
          }),
      )
      .catch(() => undefined);
    return true;
  };
}
