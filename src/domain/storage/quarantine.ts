import * as v from 'valibot';
import { hashSchema, headSchema, mutationInputSchema } from './schema';

export const pendingChangesSchema = v.array(
  v.strictObject({
    stateDigest: hashSchema,
    input: v.nullable(mutationInputSchema),
  }),
);
export const quarantineSchema = v.strictObject({
  schemaVersion: v.literal(1),
  stateDigest: hashSchema,
  recordDigest: hashSchema,
  archiveDigest: hashSchema,
  expectedHead: headSchema,
  operationId: v.nullable(hashSchema),
  protectedKeys: v.array(
    v.pipe(
      v.string(),
      v.regex(
        /^buo:v2:(?:state|transfer):[a-f0-9]{64}$|^buo:v2:content:(?:list|settings|metadata):[a-f0-9]{64}$/,
      ),
    ),
  ),
  createdAt: v.pipe(v.string(), v.isoTimestamp()),
});
