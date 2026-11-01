import * as v from 'valibot';
import { requireCondition } from './storage/errors';
import {
  dataSchema,
  libraryCommandSchema,
  settingsSchema,
  type CanonicalData,
  type LibraryCommand,
} from './storage/schema';

export function applyLibraryCommand(
  input: CanonicalData,
  raw: LibraryCommand,
  operationId: string,
): CanonicalData {
  const command = v.parse(libraryCommandSchema, raw);
  const data = structuredClone(input);
  if (command.kind === 'list.create' || command.kind === 'list.update') {
    requireCondition(command.name.trim().length > 0, 'LIST_NAME_REQUIRED');
    if (command.kind === 'list.create') {
      const id = 'list-' + operationId;
      requireCondition(
        !data.lists.some((list) => list.id === id),
        'LIST_ID_EXISTS',
      );
      data.lists.push({
        id,
        legacyId: null,
        name: command.name,
        lines: command.lines,
        sources: [],
      });
    } else {
      const list = data.lists.find((list) => list.id === command.id);
      requireCondition(list, 'LIST_NOT_FOUND');
      list.name = command.name;
      list.lines = command.lines;
    }
  } else if (command.kind === 'list.delete') {
    requireCondition(
      data.lists.some((list) => list.id === command.id),
      'LIST_NOT_FOUND',
    );
    data.lists = data.lists.filter((list) => list.id !== command.id);
    if (data.settings.defaultListOpen === command.id)
      data.settings.defaultListOpen = 'current-tabs';
    if (data.settings.openOnLaunch === command.id)
      data.settings.openOnLaunch = null;
  } else if (command.kind === 'settings.update')
    data.settings = v.parse(settingsSchema, {
      ...data.settings,
      ...command.patch,
    });
  else data.draftLines = command.lines;
  const result = v.safeParse(dataSchema, data);
  requireCondition(result.success, 'INVALID_DATA_REFERENCE');
  return result.output;
}
