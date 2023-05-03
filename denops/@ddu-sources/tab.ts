import { BaseSource, Item } from "https://deno.land/x/ddu_vim@v2.5.0/types.ts";
import { ActionData } from "../@ddu-kinds/tab.ts";
import { Denops } from "https://deno.land/x/ddu_vim@v2.5.0/deps.ts";
import * as fn from "https://deno.land/x/denops_std@v4.0.0/function/mod.ts";
import { ensureArray } from "https://deno.land/x/unknownutil@v2.0.0/mod.ts";

type Params = Record<never, never>;

type TabInfo = {
  tabnr: number;
  variables: Record<string, unknown>;
  windows: number[];
};

export class Source extends BaseSource<Params> {
  kind = "tab"

  gather(args: {
    denops: Denops;
  }): ReadableStream<Item<ActionData>[]> {
    return new ReadableStream({
      async start(controller) {
        const tabinfo = ensureArray<TabInfo>(await fn.gettabinfo(args.denops));
        const items: Item<ActionData>[] = [];
        for (const tab of tabinfo) {
          items.push({
            word: `tab ${tab.tabnr}`,
            action: {
              tabnr: tab.tabnr,
            }
          })
        }
        controller.enqueue(items);
        controller.close();
      },
    });
  }

  params(): Params {
    return {};
  }
}
