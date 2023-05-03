import { BaseSource, Item } from "https://deno.land/x/ddu_vim@v2.5.0/types.ts";
import { ActionData } from "../@ddu-kinds/tab.ts";
import { Denops } from "https://deno.land/x/ddu_vim@v2.5.0/deps.ts";
import * as fn from "https://deno.land/x/denops_std@v4.0.0/function/mod.ts";
import { ensureArray, ensureString } from "https://deno.land/x/unknownutil@v2.0.0/mod.ts";

type Params = Record<never, never>;

type TabInfo = {
  tabnr: number;
  variables: Record<string, unknown>;
  windows: number[];
};

// ↓luaでこれを書くとtabの名前が取れる
/*
lua << EOF
local tab = require('tabby.tab')
print(tab.get_name(1))
EOF
*/
async function getTabName(denops: Denops, tabnr: number): Promise<string> {
  const tabName = await fn.execute(denops, `lua print( require('tabby.tab').get_name(${tabnr}) )`);
  return ensureString(tabName);
}

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
          const tabName = await getTabName(args.denops, tab.tabnr);
          items.push({
            word: `tab ${tab.tabnr} ${tabName}`,
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
