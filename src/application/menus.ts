import type { StorageCoordinator } from './storage/coordinator';
import { digest } from '../domain/storage/json';
import { MigrationError } from '../domain/storage/errors';

export type MenuItem = {
  id: string;
  title: string;
  parentId?: string;
  enabled?: boolean;
};
export interface MenuPort {
  clear(): Promise<void>;
  create(item: MenuItem): Promise<void>;
}
export const menuListPrefix = 'buo-list:';

export class SavedListMenus {
  private queue: Promise<unknown> = Promise.resolve();
  private signature: string | null = null;
  constructor(
    private readonly storage: StorageCoordinator,
    private readonly port: MenuPort,
  ) {}
  refresh(force = false): Promise<void> {
    const task = this.queue.then(async () => {
      let active;
      try {
        active = await this.storage.requireActiveData();
      } catch {
        await this.port.clear();
        this.signature = null;
        return;
      }
      const { lists, settings } = active.data;
      const signature = await digest({
        enabled: settings.contextMenuEnabled,
        lists: lists.map(({ id, name }) => ({ id, name })),
      });
      if (!force && signature === this.signature) return;
      try {
        await this.port.clear();
        if (settings.contextMenuEnabled) {
          await this.port.create({ id: 'buo-root', title: 'Bulk URL Opener' });
          await this.port.create({
            id: 'buo-open-lists',
            parentId: 'buo-root',
            title: 'Open Lists',
          });
          if (!lists.length)
            await this.port.create({
              id: 'buo-empty',
              parentId: 'buo-open-lists',
              title: 'No saved lists',
              enabled: false,
            });
          for (const list of lists)
            await this.port.create({
              id: menuListPrefix + list.id,
              parentId: 'buo-open-lists',
              title: list.name || '(Unnamed list)',
            });
        }
        this.signature = signature;
      } catch {
        this.signature = null;
        await this.port.clear();
        throw new MigrationError('MENU_REFRESH_FAILED');
      }
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
}
