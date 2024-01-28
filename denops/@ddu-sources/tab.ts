import {
  BaseSource,
  ensureArray,
  ensureNumber,
  ensureString,
  fn,
  Item,
} from "../deps.ts";
import type { Denops } from "../deps.ts";
import { ActionData } from "../@ddu-kinds/tab.ts";

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

async function getBufName(denops: Denops, tabinfo: TabInfo): Promise<string[]> {
  const winlayout = await fn.winlayout(denops, tabinfo.tabnr) as WindowLayout;
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
  await getBufName(denops, winlayout);
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
  if (
    !(
      await fn.has(denops, "nvim") &&
      await denops.eval(
        `luaeval('type(select(2, pcall(require, "tabby")))') == "table"`,
      )
    )
  ) {
    return "";
  }
  try {
    const tabPages = ensureArray<number>(
      await denops.call("ddu#source#tab#get_tabpages"),
    );
    const tabName = await denops.call(
      "ddu#source#tab#get_tab_name",
      tabPages[tabnr - 1],
    );
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
        const tabinfos = ensureArray<TabInfo>(await fn.gettabinfo(args.denops));
        const items: Item<ActionData>[] = [];
        for (const tabinfo of tabinfos) {
          // word内にtabName([Float])とかが入るとeditがうまくいかない
          const tabName = await getTabName(args.denops, tabinfo.tabnr);
          const bufnames = await getBufName(args.denops, tabinfo);
          const regexp = new RegExp("(\s|\t|\n|\v)", "g");
          const text: string = args.sourceParams.format
            .replaceAll(regexp, " ")
            .replaceAll("%n", tabinfo.tabnr.toString())
            .replaceAll("%T", tabName)
            .replaceAll("%w", bufnames.join(" "));
          items.push({
            word: text,
            action: {
              tabnr: tabinfo.tabnr,
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
