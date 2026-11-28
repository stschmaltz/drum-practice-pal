import { isUuid } from '@/lib/randomUuid';
import { EDIT_LOOP_PARAM, NEW_LOOP_PARAM } from '@/lib/routes';

/** The loop form a link to the play screen asked for: a new loop, or an edit of one. */
export type LinkedLoopForm = { kind: 'new' } | { kind: 'edit'; loopId: string };

/** What `?new=1` or `?edit=<id>` asks for; null for neither, and for an edit of no id. */
export function linkedLoopFormOf(params: URLSearchParams): LinkedLoopForm | null {
  if (params.get(NEW_LOOP_PARAM) !== null) return { kind: 'new' };
  const loopId = params.get(EDIT_LOOP_PARAM);
  return loopId !== null && isUuid(loopId) ? { kind: 'edit', loopId } : null;
}
