import { BaseSource, Item } from "https://deno.land/x/ddu_vim@v2.5.0/types.ts";
import { ActionData } from "../@ddu-kinds/tab.ts";
import { Denops } from "https://deno.land/x/ddu_vim@v2.5.0/deps.ts";
import * as fn from "https://deno.land/x/denops_std@v4.0.0/function/mod.ts";
import {
  ensureArray,
  ensureNumber,
  ensureString,
} from "https://deno.land/x/unknownutil@v2.0.0/mod.ts";

type Params = {
  format: string;
};

type TabInfo = {
  tabnr: number;
  variables: Record<string, unknown>;
  windows: number[];
};

export type LeafLayout = ["leaf", number];
export type RowLayout = ["row", WindowLayout[]];
export type ColLayout = ["col", WindowLayout[]];
export type WindowLayout = LeafLayout | RowLayout | ColLayout;

async function getBufName(denps: Denops, tabnr: number): Promise<string[]> {
  const winlayout = await fn.winlayout(denps, tabnr) as WindowLayout;
  const bufnames: string[] = [];
  const getBufName = async (d: Denops, layout: WindowLayout) => {
    if (layout[0] === "leaf") {
      const winId = layout[1];
      const bufNum = ensureNumber(await fn.winbufnr(d, winId));
      const bufName = ensureString(await fn.bufname(d, bufNum));
      bufnames.push(bufName);
    } else if (layout[0] === "row" || layout[0] === "col") {
      for (const l of layout[1]) {
        await getBufName(d, l);
      }
    }
  };
  await getBufName(denps, winlayout);
  return bufnames;
}

// ↓luaでこれを書くとtabの名前が取れる
/*
lua << EOF
local tab = require('tabby.tab')
print(tab.get_name(1))
EOF
*/
async function getTabName(denops: Denops, tabnr: number): Promise<string> {
  const tabName = await denops.eval(
    `luaeval('require("tabby.tab").get_name(${tabnr})')`,
  );
  try {
    return ensureString(tabName);
  } catch (e) {
    console.log(e);
    return "";
  }
}

export class Source extends BaseSource<Params> {
  kind = "tab";

  gather(args: {
    denops: Denops;
    sourceParams: Params;
  }): ReadableStream<Item<ActionData>[]> {
    return new ReadableStream({
      async start(controller) {
        const tabinfo = ensureArray<TabInfo>(await fn.gettabinfo(args.denops));
        const items: Item<ActionData>[] = [];
        for (const tab of tabinfo) {
          // word内にtabName([Float])とかが入るとeditがうまくいかない
          const tabName = await getTabName(args.denops, tab.tabnr);
          const bufnames = await getBufName(args.denops, tab.tabnr);
          const regexp = new RegExp("(\s|\t|\n|\v)", "g");
          const text: string = args.sourceParams.format
            .replaceAll(regexp, " ")
            .replaceAll("%n", tab.tabnr.toString())
            .replaceAll("%T", tabName)
            .replaceAll("%w", bufnames.join(" "));
          items.push({
            word: text,
            action: {
              tabnr: tab.tabnr,
            },
          });
        }
        controller.enqueue(items);
        controller.close();
      },
    });
  }

  params(): Params {
    return {
      format: "tab:%n:%w",
    };
  }
}
