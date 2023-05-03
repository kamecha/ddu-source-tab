import { BaseKind } from "https://deno.land/x/ddu_vim@v2.5.0/base/kind.ts";
import { ActionFlags, Actions, DduItem } from "https://deno.land/x/ddu_vim@v2.5.0/types.ts";
import { Denops } from "https://deno.land/x/denops_std@v3.9.0/mod.ts";

export interface ActionData {
  tabnr: number;
}

type Params = Record<never, never>;

export class Kind extends BaseKind<Params> {
  actions: Actions<Params> = {
    open: async (args: {
      denops: Denops;
      items: DduItem[];
    }) => {
      for (const item of args.items) {
        if (item.action) {
          const action = item.action as ActionData;
          await args.denops.cmd(`tabnext ${action.tabnr}`);
        }
      }
      return ActionFlags.None;
    },
  };
  params(): Params {
    return {};
  }
}
