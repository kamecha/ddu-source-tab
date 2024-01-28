import { BaseSource, ensureArray, ensureString, fn, Item } from "../deps.ts";
import type { Denops } from "../deps.ts";
import { ActionData } from "../@ddu-kinds/tab.ts";

type Params = {
  format: string;
};

export type TabInfo = {
  tabnr: number;
  variables: Record<string, unknown>;
  windows: number[];
};

export type WindowInfo = {
  botline: number;
  bufnr: number;
  height: number;
  loclist: number;
  quickfix: number;
  terminal: number;
  tabnr: number;
  topline: number;
  variables: Record<string, unknown>;
  width: number;
  winbar: number;
  wincol: number;
  textoff: number;
  winid: number;
  winnr: number;
  winrow: number;
};

async function getBufName(denops: Denops, tabinfo: TabInfo): Promise<string[]> {
  const bufnames: string[] = [];
  for (const winid of tabinfo.windows) {
    const wininfo = await fn.getwininfo(denops, winid) as WindowInfo[];
    if (wininfo.length === 0) continue;
    const bufname = ensureString(await fn.bufname(denops, wininfo[0].bufnr));
    bufnames.push(bufname);
  }
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
            // deprecated
            .replaceAll("%T", tabName)
            .replaceAll("%w", bufnames.join(" "));
          items.push({
            word: text,
            action: tabinfo,
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
